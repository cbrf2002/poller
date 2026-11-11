export function readCookie(
  header: string | undefined,
  name: string
): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

export interface CookieOptions {
  maxAge: number;
  secure: boolean;
  sameSite: 'Strict' | 'Lax';
}

/**
 * HttpOnly, path-wide cookie. Secure cookies get the `__Host-` prefix, which
 * pins them to this exact host.
 */
export function cookieName(base: string, secure: boolean): string {
  return secure ? `__Host-${base}` : base;
}

export function serializeCookie(
  name: string,
  value: string,
  options: CookieOptions
): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${options.maxAge}`,
    'HttpOnly',
    `SameSite=${options.sameSite}`,
    ...(options.secure ? ['Secure'] : []),
  ].join('; ');
}
