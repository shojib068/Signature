import { cpSync, createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// PDF.js needs its CMaps, standard fonts and wasm decoders served from our own
// origin (no third-party CDNs, per the privacy NFR). This copies them into the
// build and serves them straight from node_modules during dev.
const PDFJS_DIRS = ['cmaps', 'standard_fonts', 'wasm', 'iccs'];
const PDFJS_ROOT = resolve('node_modules/pdfjs-dist');

function pdfjsAssets(): Plugin {
  let outDir = 'dist';
  return {
    name: 'pdfjs-assets',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use('/pdfjs', (req, res, next) => {
        const rel = normalize(decodeURIComponent((req.url ?? '').split('?')[0]));
        const file = join(PDFJS_ROOT, rel);
        if (!file.startsWith(PDFJS_ROOT) || !existsSync(file) || !statSync(file).isFile()) return next();
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      for (const dir of PDFJS_DIRS) {
        cpSync(join(PDFJS_ROOT, dir), join(outDir, 'pdfjs', dir), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), pdfjsAssets()],
  server: {
    proxy: { '/api': 'http://localhost:3001' },
  },
  build: {
    target: 'es2020',
    sourcemap: false,
  },
});
