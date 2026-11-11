export interface AppConfig {
  convexUrl: string;
  serverSecret: string;
  /** False only for plain-HTTP local development outside localhost. */
  secureCookies: boolean;
  /** Cloudflare Turnstile on the entry form; null turns the check off. */
  turnstile: { siteKey: string; secretKey: string } | null;
}

/** Injection token for `AppConfig`. */
export const APP_CONFIG = Symbol('AppConfig');

export function configFromEnv(env: Record<string, unknown>): AppConfig {
  const convexUrl = env.CONVEX_URL;
  const serverSecret = env.POLLER_SERVER_SECRET;
  if (typeof convexUrl !== 'string' || !convexUrl.startsWith('https://')) {
    throw new Error(
      'CONVEX_URL must be set to the deployment URL (https://…convex.cloud).'
    );
  }
  if (typeof serverSecret !== 'string' || serverSecret.length < 32) {
    throw new Error(
      'POLLER_SERVER_SECRET must be set (at least 32 characters).'
    );
  }
  const siteKey = env.TURNSTILE_SITE_KEY;
  const secretKey = env.TURNSTILE_SECRET_KEY;
  const hasSite = typeof siteKey === 'string' && siteKey.length > 0;
  const hasSecret = typeof secretKey === 'string' && secretKey.length > 0;
  // Half a configuration would silently drop the check (or block everyone),
  // so refuse to start instead.
  if (hasSite !== hasSecret) {
    throw new Error(
      'Set both TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY, or neither.'
    );
  }
  return {
    convexUrl,
    serverSecret,
    secureCookies: env.INSECURE_COOKIES !== 'true',
    turnstile:
      hasSite && hasSecret
        ? { siteKey: siteKey as string, secretKey: secretKey as string }
        : null,
  };
}
