import { SLUG_ALPHABET, SLUG_LENGTH } from './model';

function randomFrom(alphabet: string, length: number): string {
  // Rejection sampling keeps every character equally likely.
  const limit = 256 - (256 % alphabet.length);
  let out = '';
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const byte of bytes) {
      if (byte < limit) out += alphabet[byte % alphabet.length];
      if (out.length === length) break;
    }
  }
  return out;
}

export function newSlug(): string {
  return randomFrom(SLUG_ALPHABET, SLUG_LENGTH);
}

export function newItemId(): string {
  return randomFrom('abcdefghijklmnopqrstuvwxyz0123456789', 10);
}
