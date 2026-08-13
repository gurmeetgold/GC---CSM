import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createServer } from './http';
import { resolveServerConfig } from './config';

/**
 * Integration test: boots the real Express app (mock config) on an ephemeral port and
 * exercises the HTTP surface the browser uses. No mocking of the app, no credentials.
 */
describe('HTTP server (mock config)', () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    const app = createServer(resolveServerConfig({}), { corsOrigin: '*' });
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    base = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('GET /api/health reports the live implementations', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, dataSource: 'mock', answerEngine: 'mock' });
  });

  it('GET /api/accounts returns the evaluated book', async () => {
    const res = await fetch(`${base}/api/accounts`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accounts).toHaveLength(25);
    expect(body.sourceName).toBe('mock');
    expect(typeof body.now).toBe('string');
  });

  it('POST /api/ask answers a question', async () => {
    const res = await fetch(`${base}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'which accounts are at risk?' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kind).toBe('list');
    expect(body.accounts.length).toBeGreaterThan(0);
  });

  it('sets permissive CORS headers for the dev frontend', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
});
