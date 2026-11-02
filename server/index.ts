import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.ts';
import { createLibreOfficeConverter, removeLeftoverJobDirs } from './convert/libreoffice.ts';

const port = Number(process.env.PORT ?? 3001);
const maxJobs = Number(process.env.MAX_JOBS ?? 2);
const here = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(here, '..', 'dist');

await removeLeftoverJobDirs();
const converter = await createLibreOfficeConverter();
if (!converter.available) {
  console.warn('LibreOffice (soffice) not found: Word conversion is disabled. PDF signing still works.');
}

const app = createApp({ converter, distDir: existsSync(resolve(distDir, 'index.html')) ? distDir : null, maxJobs });
const server = app.listen(port, () => console.log(`Listening on http://localhost:${port}`));

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
