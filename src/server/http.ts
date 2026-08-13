import express, { type Express, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { BookService } from './service';
import type { ServerConfig } from './config';

/**
 * The thin backend host. Exposes the evaluated book and the ask endpoint over HTTP
 * so the browser can render live data. It holds the secrets; the browser never does.
 *
 * The same server works in mock mode (no credentials) — handy for testing the
 * backend wiring end-to-end without any vendor connection.
 */

export interface HttpServerOptions {
  /** Allowed CORS origin for the dev frontend (e.g. http://localhost:5173). */
  corsOrigin?: string;
  /** Optional path to the built SPA (dist) to serve as static files. */
  staticDir?: string;
}

export function createServer(cfg: ServerConfig, opts: HttpServerOptions = {}): Express {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  // Minimal CORS for local dev (frontend and backend on different ports).
  app.use((req, res, next) => {
    const origin = opts.corsOrigin ?? '*';
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  const service = new BookService(cfg);

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, ...service.describe() });
  });

  app.get('/api/accounts', async (_req: Request, res: Response) => {
    try {
      res.json(await service.getBook());
    } catch (err) {
      res.status(502).json({ error: 'Failed to load the book', detail: String(err) });
    }
  });

  app.post('/api/ask', async (req: Request, res: Response) => {
    const question = typeof req.body?.question === 'string' ? req.body.question : '';
    try {
      res.json(await service.ask(question));
    } catch (err) {
      res.status(502).json({ error: 'Failed to answer', detail: String(err) });
    }
  });

  // Optionally serve the built SPA so one process hosts everything.
  if (opts.staticDir && existsSync(opts.staticDir)) {
    app.use(express.static(opts.staticDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile('index.html', { root: opts.staticDir });
    });
  }

  return app;
}
