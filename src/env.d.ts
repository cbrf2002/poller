interface Env {
  CONVEX_URL: string;
  POLLER_SERVER_SECRET: string;
  INSECURE_COOKIES?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  ASSETS: Fetcher;
}
