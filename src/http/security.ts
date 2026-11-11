import type { NextFunction, Request, Response } from 'express';

/**
 * No inline script or style anywhere: every script and stylesheet is a file
 * under /assets. The client builds DOM nodes rather than HTML strings, so
 * Trusted Types can be required outright.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "require-trusted-types-for 'script'",
  "trusted-types 'none'",
  'upgrade-insecure-requests',
].join('; ');

export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Origin-Agent-Cluster': '?1',
  'Permissions-Policy':
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), browsing-topics=()',
};

/** Paths search engines may index; everything else is per-person or private. */
const INDEXABLE = new Set(['/']);

export function securityHeaders(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS))
    res.setHeader(name, value);
  // Pages carry personal answers or admin data: never store them in caches.
  res.setHeader('Cache-Control', 'no-store');
  if (!INDEXABLE.has(req.path))
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF defence on top of SameSite cookies: a state-changing request from a
 * browser must come from this origin. Browsers send `Sec-Fetch-Site` (or at
 * least `Origin`) on such requests; clients that send neither aren't
 * browsers and carry no ambient cookies to abuse.
 */
export function sameOriginOnly(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!UNSAFE_METHODS.has(req.method)) return next();

  const site = req.get('sec-fetch-site');
  const origin = req.get('origin');
  let allowed = true;
  if (site) allowed = site === 'same-origin';
  else if (origin) {
    try {
      allowed = new URL(origin).host === req.get('host');
    } catch {
      allowed = false;
    }
  }

  if (allowed) return next();
  res
    .status(403)
    .type('text/plain')
    .send('Cross-site requests are not accepted.');
}

/** The caller's address as Cloudflare reports it. */
export function clientIp(req: Request): string {
  return req.get('cf-connecting-ip') ?? req.socket.remoteAddress ?? 'unknown';
}
