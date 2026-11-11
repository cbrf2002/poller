export interface AppConfig {
  convexUrl: string;
  serverSecret: string;
  /** False only for plain-HTTP local development outside localhost. */
  secureCookies: boolean;
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
  return {
    convexUrl,
    serverSecret,
    secureCookies: env.INSECURE_COOKIES !== 'true',
  };
}
