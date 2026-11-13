import { afterEach, expect, test, vi } from 'vitest';
import { ConvexBackend } from '../src/backend/convex-backend';

afterEach(() => vi.unstubAllGlobals());

test('overlapping writes do not wait on another Worker request', async () => {
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>(resolve => {
    releaseFirst = resolve;
  });
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { path: string };
    if (body.path === 'admins:loginAllowed') {
      await firstGate;
      return Response.json({
        status: 'success',
        value: { ok: true, retryAfter: 0 },
      });
    }
    return Response.json({ status: 'success', value: null });
  });
  vi.stubGlobal('fetch', fetchMock);
  const backend = new ConvexBackend({
    convexUrl: 'https://example.convex.cloud',
    serverSecret: 'x'.repeat(32),
    secureCookies: true,
    turnstile: null,
  });

  const first = backend.loginAllowed('first-request');
  const second = backend.recordFailedLogin('second-request');
  try {
    // The second request must finish while the first fetch is still pending.
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await second;
  } finally {
    releaseFirst();
    await Promise.all([first, second]);
  }
  expect(await first).toEqual({ ok: true, retryAfter: 0 });
});
