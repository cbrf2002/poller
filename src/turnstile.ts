const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Origin of Cloudflare's challenge script and iframe, for the CSP. */
export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

/** Matches `data-action` on the widget, so a token minted elsewhere is refused. */
export const TURNSTILE_ACTION = 'enter';

interface SiteverifyResult {
  success: boolean;
  action?: string;
  hostname?: string;
  'error-codes'?: string[];
}

/**
 * Asks Cloudflare whether a widget token is genuine, unused and was issued
 * for this action. Network trouble counts as a failed check: the caller
 * asks the person to try again rather than letting the entry through.
 */
export async function verifyTurnstile(
  secret: string,
  token: string,
  ip: string
): Promise<boolean> {
  if (!token || token.length > 2048) return false;
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (ip !== 'unknown') body.append('remoteip', ip);
  try {
    const response = await fetch(SITEVERIFY, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const result = (await response.json()) as SiteverifyResult;
    // Cloudflare's always-pass test keys report no action; real keys must match.
    const actionOk = !result.action || result.action === TURNSTILE_ACTION;
    const passed = result.success === true && actionOk;
    // The codes tell a wrong secret (invalid-input-secret) apart from a
    // stale, reused or forged token; they carry nothing personal.
    if (!passed)
      console.warn('Turnstile check failed', {
        errorCodes: result['error-codes'] ?? [],
        action: result.action ?? null,
        hostname: result.hostname ?? null,
      });
    return passed;
  } catch (error) {
    console.warn('Turnstile check unreachable', String(error));
    return false;
  }
}
