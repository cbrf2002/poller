import rateLimiter from '@convex-dev/rate-limiter/convex.config.js';
import { defineApp } from 'convex/server';
import { v } from 'convex/values';

const app = defineApp({
  env: {
    // Shared with the worker. Every public function checks it, so only the
    // worker can call this deployment.
    POLLER_SERVER_SECRET: v.optional(v.string()),
  },
});

app.use(rateLimiter);

export default app;
