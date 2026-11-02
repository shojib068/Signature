import express, { type NextFunction, type Request, type Response } from 'express';
import { join } from 'node:path';
import type { Converter } from './convert/libreoffice.ts';
import { JobQueue } from './convert/queue.ts';
import { convertErrorHandler, convertRouter } from './convert/routes.ts';

export interface AppOptions {
  converter: Converter;
  /** Built SPA to serve, or null when the frontend is hosted elsewhere (or in dev). */
  distDir: string | null;
  maxJobs?: number;
  maxWaiting?: number;
  log?: (line: string) => void;
}

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

export function createApp({ converter, distDir, maxJobs = 2, maxWaiting = 10, log = console.log }: AppOptions) {
  const app = express();
  app.disable('x-powered-by');

  app.use(securityHeaders);
  app.use(requestLog(log));

  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, converter: converter.available });
  });
  app.use('/api/convert', convertRouter(converter, new JobQueue(maxJobs, maxWaiting)));
  app.use('/api', (_req, res) => res.status(404).json({ code: 'NOT_FOUND', message: 'Not found.' }));
  app.use('/api', convertErrorHandler);

  if (distDir) {
    app.use(
      express.static(distDir, {
        index: false,
        cacheControl: false,
        setHeaders(res, path) {
          // Vite fingerprints everything under /assets, so it can be cached forever.
          if (path.startsWith(join(distDir, 'assets'))) res.set('Cache-Control', 'public, max-age=31536000, immutable');
          else res.set('Cache-Control', 'no-cache');
        },
      }),
    );
    app.get('/{*path}', (_req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(join(distDir, 'index.html'));
    });
  }

  return app;
}

function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.set({
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  });
  next();
}

/** Method, path, status, duration and size only. Never file names or contents. */
function requestLog(log: (line: string) => void) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith('/api/convert')) return next();
    const started = performance.now();
    res.on('finish', () => {
      const ms = Math.round(performance.now() - started);
      const inBytes = req.headers['content-length'] ?? '0';
      const outBytes = res.getHeader('content-length') ?? '0';
      log(`${req.method} ${req.path} ${res.statusCode} ${ms}ms in=${inBytes}B out=${outBytes}B`);
    });
    next();
  };
}
