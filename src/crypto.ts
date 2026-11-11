const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
}

/** 256 random bits, base64url. */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Workers cap PBKDF2 at 100,000 iterations, so that is what admin passwords
 * use. `scripts/create-admin.mjs` derives hashes with the same parameters.
 */
export const PBKDF2_ITERATIONS = 100_000;

export async function pbkdf2(
  password: string,
  saltHex: string,
  iterations: number
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const salt = new Uint8Array(
    saltHex.match(/.{2}/g)?.map(h => parseInt(h, 16)) ?? []
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations: Math.min(iterations, PBKDF2_ITERATIONS),
    },
    key,
    256
  );
  return toHex(bits);
}
