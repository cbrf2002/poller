import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'vitest';
import { createApp } from '../src/app';
import { pbkdf2 } from '../src/crypto';
import { MemoryBackend } from './memory-backend';

const SLUG = 'k7m2qx9fha';
const backend = new MemoryBackend();
let app: NestExpressApplication;
let server: Parameters<typeof request>[0];

/** The `name=value` part of each Set-Cookie header, ready to send back. */
function cookiesFrom(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return (raw ?? []).map(c => c.split(';')[0]).join('; ');
}

beforeAll(async () => {
  app = await createApp(backend, {
    convexUrl: 'https://example.convex.cloud',
    serverSecret: 'x'.repeat(32),
    secureCookies: true,
  });
  await app.init();
  server = app.getHttpServer();
  backend.admin = {
    adminId: 'admin1' as never,
    salt: '0011',
    iterations: 1000,
    passwordHash: await pbkdf2('correct horse battery', '0011', 1000),
  };
});

afterAll(() => app.close());

beforeEach(() => {
  backend.people.clear();
  backend.failedLogins = 0;
  backend.addSet(SLUG, {
    title: 'Lunch vote',
    description: 'Pick before noon.',
    fields: [
      {
        id: 'email',
        label: 'Work email',
        type: 'email',
        required: true,
        options: [],
      },
    ],
    questions: [
      {
        id: 'food',
        prompt: 'What should we order?',
        type: 'single',
        required: true,
        options: [
          { id: 'pizza', label: 'Pizza' },
          { id: 'sushi', label: 'Sushi' },
        ],
      },
    ],
  });
});

describe('security headers', () => {
  test('pages ship a strict policy and are never cached', async () => {
    const res = await request(server).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-security-policy']).toContain(
      "script-src 'self'"
    );
    expect(res.headers['content-security-policy']).toContain(
      "frame-ancestors 'none'"
    );
    expect(res.headers['strict-transport-security']).toContain(
      'max-age=63072000'
    );
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.text).not.toMatch(/<script>(?!\s*<\/script>)/);
  });

  test('only the landing page may be indexed', async () => {
    expect(
      (await request(server).get('/')).headers['x-robots-tag']
    ).toBeUndefined();
    expect(
      (await request(server).get(`/p/${SLUG}`)).headers['x-robots-tag']
    ).toBe('noindex, nofollow');
  });

  test('cross-site form posts are refused', async () => {
    const res = await request(server)
      .post(`/p/${SLUG}/enter`)
      .set('Origin', 'https://evil.example')
      .type('form')
      .send({ 'f.email': 'a@b.co' });
    expect(res.status).toBe(403);
    expect(backend.people.size).toBe(0);
  });
});

describe('participant flow', () => {
  test('enter, answer, then see results', async () => {
    const entered = await request(server)
      .post(`/p/${SLUG}/enter`)
      .set('Sec-Fetch-Site', 'same-origin')
      .type('form')
      .send({ 'f.email': 'ana@example.com' });
    expect(entered.status).toBe(303);
    const cookie = cookiesFrom(entered);
    expect(cookie).toMatch(/^__Host-poller_p_k7m2qx9fha=/);
    expect(entered.headers['set-cookie']![0]).toMatch(
      /HttpOnly; SameSite=Lax; Secure/
    );

    const poll = await request(server).get(`/p/${SLUG}`).set('Cookie', cookie);
    expect(poll.text).toContain('What should we order?');

    const early = await request(server)
      .get(`/p/${SLUG}/results`)
      .set('Cookie', cookie);
    expect(early.status).toBe(303);

    const submitted = await request(server)
      .post(`/p/${SLUG}/submit`)
      .set('Cookie', cookie)
      .type('form')
      .send({ 'q.food': 'sushi' });
    expect(submitted.headers.location).toBe(`/p/${SLUG}/results`);

    const results = await request(server)
      .get(`/p/${SLUG}/results.json`)
      .set('Cookie', cookie);
    expect(results.body.results[0].choices).toEqual([
      { id: 'pizza', label: 'Pizza', count: 0, percent: 0 },
      { id: 'sushi', label: 'Sushi', count: 1, percent: 100 },
    ]);
  });

  test('invalid details come back with the message and the typed value', async () => {
    const res = await request(server)
      .post(`/p/${SLUG}/enter`)
      .type('form')
      .send({ 'f.email': '<b>nope</b>' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Enter an email like name@example.com.');
    expect(res.text).toContain('value="&lt;b&gt;nope&lt;/b&gt;"');
  });

  test('results are hidden from people who have not answered', async () => {
    expect((await request(server).get(`/p/${SLUG}/results.json`)).status).toBe(
      404
    );
  });

  test('unknown and draft codes look the same', async () => {
    backend.addSet(
      'draftcode2',
      { title: 'Draft', description: '', fields: [], questions: [] },
      'draft'
    );
    expect((await request(server).get('/p/draftcode2')).status).toBe(404);
    expect((await request(server).get('/p/zzzzzzzzzz')).status).toBe(404);
  });

  test('the join form accepts a pasted link', async () => {
    const res = await request(server)
      .get('/go')
      .query({ code: ` https://poller.app/p/${SLUG.toUpperCase()} ` });
    expect(res.headers.location).toBe(`/p/${SLUG}`);
  });
});

describe('creator sign-in', () => {
  test('admin pages send signed-out visitors to sign in', async () => {
    const res = await request(server).get('/admin');
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/login');
    expect(
      (await request(server).put('/admin/api/sets/x').send({})).status
    ).toBe(401);
  });

  test('a correct password starts a session', async () => {
    const res = await request(server)
      .post('/admin/login')
      .type('form')
      .send({ email: 'host@example.com', password: 'correct horse battery' });
    expect(res.headers.location).toBe('/admin');
    const dashboard = await request(server)
      .get('/admin')
      .set('Cookie', cookiesFrom(res));
    expect(dashboard.status).toBe(200);
    expect(dashboard.text).toContain('host@example.com');
  });

  test('repeated wrong passwords lock sign-in', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await request(server)
        .post('/admin/login')
        .type('form')
        .send({ email: 'host@example.com', password: 'wrong' });
      expect(res.status).toBe(401);
    }
    const locked = await request(server)
      .post('/admin/login')
      .type('form')
      .send({ email: 'host@example.com', password: 'correct horse battery' });
    expect(locked.status).toBe(429);
    expect(locked.headers['retry-after']).toBe('60');
  });
});
