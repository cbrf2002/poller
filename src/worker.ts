import 'reflect-metadata';
import { handleAsNodeRequest } from 'cloudflare:node';
import { createApp } from './app';
import { ConvexBackend } from './backend/convex-backend';
import { configFromEnv } from './config';

// Nest listens on an in-isolate port; Workers routes each request to it.
const PORT = 8080;
let ready: Promise<unknown> | undefined;

function start(env: Env): Promise<unknown> {
  const config = configFromEnv(env as unknown as Record<string, unknown>);
  return createApp(new ConvexBackend(config), config).then(app =>
    app.listen(PORT)
  );
}

export default {
  async fetch(request, env, ctx) {
    ready ??= start(env).catch(error => {
      ready = undefined;
      throw error;
    });
    await ready;
    return handleAsNodeRequest(PORT, request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
