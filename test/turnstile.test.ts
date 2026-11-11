import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import { createApp } from '../src/app';
import { configFromEnv } from '../src/config';
import { MemoryBackend } from './memory-backend';

const SLUG = 'k7m2qx9fha';
const backend = new MemoryBackend();
let app: NestExpressApplication;
let server: Parameters<typeof request>[0];

/** Stands in for Cloudflare's siteverify endpoint. */
function siteverifyReplies(result: Record<string, unknown>) {
  const fetchMock = vi.fn(async () => Response.json(result));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeAll(async () => {
  app = await createApp(backend, {
    convexUrl: 'https://example.convex.cloud',
    serverSecret: 'x'.repeat(32),
    secureCookies: true,
    turnstile: { siteKey: 'site-key', secretKey: 'secret-key' },
  });
  await app.init();
  server = app.getHttpServer();
  backend.addSet(SLUG, {
    title: 'Lunch vote',
    description: '',
    fields: [],
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

afterEach(() => {
  vi.unstubAllGlobals();
  backend.people.clear();
});
afterAll(() => app.close());

describe('Turnstile on the entry form', () => {
  test('only the entry page lets the challenge script and iframe load', async () => {
    const entry = await request(server).get(`/p/${SLUG}`);
    expect(entry.headers['content-security-policy']).toContain(
      "script-src 'self' https://challenges.cloudflare.com"
    );
    expect(entry.headers['content-security-policy']).toContain(
      'frame-src https://challenges.cloudflare.com'
    );
    expect(entry.text).toContain('data-turnstile="site-key"');

    const home = await request(server).get('/');
    expect(home.headers['content-security-policy']).not.toContain(
      'challenges.cloudflare.com'
    );
  });

  test('a missing token never reaches Cloudflare or the backend', async () => {
    const fetchMock = siteverifyReplies({ success: true });
    const res = await request(server)
      .post(`/p/${SLUG}/enter`)
      .type('form')
      .send({});
    expect(res.status).toBe(422);
    expect(res.text).toContain('The quick check didn’t go through');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(backend.people.size).toBe(0);
  });

  test('a rejected token keeps the person out', async () => {
    siteverifyReplies({
      success: false,
      'error-codes': ['invalid-input-response'],
    });
    const res = await request(server)
      .post(`/p/${SLUG}/enter`)
      .type('form')
      .send({ 'cf-turnstile-response': 'forged' });
    expect(res.status).toBe(422);
    expect(backend.people.size).toBe(0);
  });

  test('a token issued for another action is refused', async () => {
    siteverifyReplies({ success: true, action: 'login' });
    const res = await request(server)
      .post(`/p/${SLUG}/enter`)
      .type('form')
      .send({ 'cf-turnstile-response': 'token' });
    expect(res.status).toBe(422);
  });

  test('a valid token is checked with the secret and lets the person in', async () => {
    const fetchMock = siteverifyReplies({ success: true, action: 'enter' });
    const res = await request(server)
      .post(`/p/${SLUG}/enter`)
      .type('form')
      .send({ 'cf-turnstile-response': 'good-token' });
    expect(res.status).toBe(303);
    expect(backend.people.size).toBe(1);
    const sent = (
      fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    )[1].body as FormData;
    expect(sent.get('secret')).toBe('secret-key');
    expect(sent.get('response')).toBe('good-token');
  });

  test('Cloudflare being unreachable fails closed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('offline')))
    );
    const res = await request(server)
      .post(`/p/${SLUG}/enter`)
      .type('form')
      .send({ 'cf-turnstile-response': 'token' });
    expect(res.status).toBe(422);
    expect(backend.people.size).toBe(0);
  });
});

test('half a Turnstile configuration refuses to start', () => {
  expect(() =>
    configFromEnv({
      CONVEX_URL: 'https://example.convex.cloud',
      POLLER_SERVER_SECRET: 'x'.repeat(32),
      TURNSTILE_SITE_KEY: 'site-key',
    })
  ).toThrow('TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY');
});
