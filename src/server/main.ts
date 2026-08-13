import path from 'node:path';
import { createServer } from './http';
import { resolveServerConfig, assertLiveConfig } from './config';

/**
 * Backend entry point. Reads config from the environment (secrets), validates that
 * any selected live mode has its credentials, and starts the HTTP host.
 *
 * Run with:  npm run server            (mock, no credentials)
 *            DATA_SOURCE=live ANSWER_ENGINE=claude ... npm run server   (live)
 */
const cfg = resolveServerConfig(process.env);
assertLiveConfig(cfg);

const port = Number(process.env.PORT ?? 8787);
const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5173';
const staticDir = process.env.SERVE_STATIC ? path.resolve('dist') : undefined;

const app = createServer(cfg, { corsOrigin, staticDir });

app.listen(port, () => {
  // Log the selected implementations, never secrets.
  console.log(
    `[cs-copilot] server on :${port} · data=${cfg.dataSource} · answers=${cfg.answerEngine}` +
      (staticDir ? ` · serving SPA from ${staticDir}` : ''),
  );
});
