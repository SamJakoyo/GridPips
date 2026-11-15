import type { IncomingMessage, ServerResponse } from 'node:http';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const mod = await import('../server/app.ts');
    return mod.app(req as never, res as never);
  } catch (err) {
    console.error('Fatal API handler error:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          error: err instanceof Error ? err.message : 'Internal server initialization error.',
        })
      );
    }
  }
}
