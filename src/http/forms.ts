import type { Request } from 'express';
import { ITEM_ID_PATTERN } from '../../shared/model';
import { otherKey } from '../../shared/validate';
import type { FormInput } from '../backend/backend';

/**
 * Picks `<prefix><id>` keys out of a urlencoded body (e.g. `q.ab12` → `ab12`),
 * dropping anything that isn't a known id shape or a string value.
 */
export function prefixedInput(body: unknown, prefix: string): FormInput {
  const input: FormInput = {};
  if (typeof body !== 'object' || body === null) return input;
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (!key.startsWith(prefix)) continue;
    const id = key.slice(prefix.length);
    if (!ITEM_ID_PATTERN.test(id)) continue;
    if (typeof value === 'string') input[id] = value;
    else if (Array.isArray(value)) {
      input[id] = value
        .filter((v): v is string => typeof v === 'string')
        .slice(0, 25);
    }
  }
  return input;
}

/**
 * Answers from the poll form: `q.<id>` holds the pick(s) and `o.<id>` the
 * "Other" write-in, which validation reads under `otherKey(id)`.
 */
export function answerInput(body: unknown): FormInput {
  const input = prefixedInput(body, 'q.');
  for (const [id, value] of Object.entries(prefixedInput(body, 'o.'))) {
    if (typeof value === 'string') input[otherKey(id)] = value;
  }
  return input;
}

export function bodyString(body: unknown, key: string): string {
  if (typeof body !== 'object' || body === null) return '';
  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

/** The site origin for links shown to people (always https off localhost). */
export function publicOrigin(req: Request): string {
  const host = req.get('host') ?? 'localhost';
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  return `${local ? 'http' : 'https'}://${host}`;
}
