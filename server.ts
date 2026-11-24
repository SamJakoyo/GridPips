import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { app } from './server/app.ts';
import { runCloudAutoTradePass } from './server/autoTradeEngine.ts';
import { isMt5ApiConfigured } from './server/mt5Api.ts';

const PORT = 3000;

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(path.resolve(process.cwd(), 'dist'));

  if (!isProd) {
    app.use(express.static(path.resolve(process.cwd(), 'public')));
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PipGrid server running on http://0.0.0.0:${PORT}`);
  });

  // Cloud Auto-Trade background scheduler (non-serverless Node runtime)
  if (!process.env.VERCEL) {
    const runScheduledScan = () => {
      if (!isMt5ApiConfigured()) return;
      void runCloudAutoTradePass().catch((err) => {
        console.warn('Cloud Auto-Trade scheduled tick warning:', err instanceof Error ? err.message : String(err));
      });
    };
    setTimeout(runScheduledScan, 30_000);
    setInterval(runScheduledScan, 5 * 60 * 1000);
  }
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
