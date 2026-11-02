import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ConvertError } from './errors.ts';

export type Direction = 'docx-to-pdf' | 'pdf-to-docx';

export interface Converter {
  readonly available: boolean;
  convert(input: Buffer, direction: Direction): Promise<Buffer>;
}

/** Per-request temp dirs start with this; leftovers are removed on startup. */
export const JOB_DIR_PREFIX = 'sign-';
const TIMEOUT_MS = 30_000;

const TARGETS: Record<Direction, { inExt: string; outExt: string; args: string[] }> = {
  'docx-to-pdf': {
    inExt: 'docx',
    outExt: 'pdf',
    // Bookmarks become named destinations, which give the client its paragraph → page map.
    // Outline bookmarks are left out so the user's PDF gets no extra sidebar entries.
    args: [
      '--convert-to',
      'pdf:writer_pdf_Export:{"ExportBookmarksToPDFDestination":{"type":"boolean","value":"true"},"ExportBookmarks":{"type":"boolean","value":"false"}}',
    ],
  },
  'pdf-to-docx': {
    inExt: 'pdf',
    outExt: 'docx',
    args: ['--infilter=writer_pdf_import', '--convert-to', 'docx:MS Word 2007 XML'],
  },
};

const CANDIDATES = [
  process.env.SOFFICE_PATH,
  'soffice',
  'libreoffice',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
].filter((c): c is string => Boolean(c));

function run(file: string, args: string[], timeout: number): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout, killSignal: 'SIGKILL', windowsHide: true }, (error) => {
      if (!error) return resolve();
      reject(error);
    });
  });
}

export async function findSoffice(): Promise<string | null> {
  for (const candidate of CANDIDATES) {
    try {
      await run(candidate, ['--version'], 20_000);
      return candidate;
    } catch {
      // Try the next location.
    }
  }
  return null;
}

/** Deletes job dirs left behind by a crash. */
export async function removeLeftoverJobDirs(base = tmpdir()): Promise<void> {
  const entries = await readdir(base, { withFileTypes: true }).catch(() => []);
  await Promise.all(
    entries
      .filter((e) => e.isDirectory() && e.name.startsWith(JOB_DIR_PREFIX))
      .map((e) => rm(join(base, e.name), { recursive: true, force: true })),
  );
}

/**
 * Builds a LibreOffice user profile once, so each job can copy it instead of paying
 * 1–2 s to create a fresh one. Each job still gets its own copy, so jobs can run in parallel.
 */
async function buildProfileTemplate(soffice: string): Promise<string | null> {
  const dir = await mkdtemp(join(tmpdir(), 'docsigner-profile-'));
  const profile = join(dir, 'profile');
  try {
    await run(soffice, [`-env:UserInstallation=${pathToFileURL(profile).href}`, '--headless', '--norestore', '--terminate_after_init'], 60_000);
    await readdir(profile);
    return profile;
  } catch {
    await rm(dir, { recursive: true, force: true });
    return null;
  }
}

export async function createLibreOfficeConverter(): Promise<Converter> {
  const soffice = await findSoffice();
  if (!soffice) return { available: false, convert: () => Promise.reject(new ConvertError('CONVERTER_UNAVAILABLE')) };
  const template = await buildProfileTemplate(soffice);

  return {
    available: true,
    async convert(input, direction) {
      const target = TARGETS[direction];
      const dir = await mkdtemp(join(tmpdir(), JOB_DIR_PREFIX));
      try {
        const inFile = join(dir, `in.${target.inExt}`);
        const outDir = join(dir, 'out');
        const profile = join(dir, 'profile');
        await Promise.all([writeFile(inFile, input), mkdir(outDir)]);
        if (template) await cp(template, profile, { recursive: true });

        try {
          await run(
            soffice,
            [
              '--headless',
              '--norestore',
              '--nolockcheck',
              `-env:UserInstallation=${pathToFileURL(profile).href}`,
              ...target.args,
              '--outdir',
              outDir,
              inFile,
            ],
            TIMEOUT_MS,
          );
        } catch (error) {
          const killed = (error as { killed?: boolean; signal?: string }).killed;
          throw new ConvertError(killed ? 'CONVERSION_TIMEOUT' : 'CONVERSION_FAILED');
        }

        try {
          return await readFile(join(outDir, `in.${target.outExt}`));
        } catch {
          throw new ConvertError('CONVERSION_FAILED');
        }
      } finally {
        // Privacy: nothing about the document outlives the request.
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}
