import express, { type Request, type Response, type NextFunction } from 'express';
import { ConvertError } from './errors.ts';
import type { Converter, Direction } from './libreoffice.ts';
import { JobQueue } from './queue.ts';

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const MAGIC: Record<Direction, Buffer> = {
  'docx-to-pdf': Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  'pdf-to-docx': Buffer.from('%PDF-', 'latin1'),
};

const OUTPUT_TYPE: Record<Direction, string> = {
  'docx-to-pdf': 'application/pdf',
  'pdf-to-docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export function convertRouter(converter: Converter, queue: JobQueue) {
  const router = express.Router();
  // The body is the file itself. It stays in memory and is never written anywhere
  // except the per-job temp dir, which is deleted before the response finishes.
  const body = express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES });

  for (const direction of Object.keys(MAGIC) as Direction[]) {
    router.post(`/${direction}`, body, async (req: Request, res: Response) => {
      const input: unknown = req.body;
      if (!Buffer.isBuffer(input) || input.length === 0) throw new ConvertError('NO_FILE');
      if (!input.subarray(0, MAGIC[direction].length).equals(MAGIC[direction])) throw new ConvertError('UNSUPPORTED_TYPE');
      if (!converter.available) throw new ConvertError('CONVERTER_UNAVAILABLE');

      const output = await queue.run(() => converter.convert(input, direction));
      res.type(OUTPUT_TYPE[direction]).send(output);
    });
  }

  return router;
}

export function convertErrorHandler(error: unknown, _req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(error);

  let converted: ConvertError;
  if (error instanceof ConvertError) converted = error;
  else if ((error as { type?: string } | null)?.type === 'entity.too.large') converted = new ConvertError('FILE_TOO_LARGE');
  else converted = new ConvertError('CONVERSION_FAILED');

  if (converted.code === 'SERVER_BUSY') res.set('Retry-After', '5');
  res.status(converted.status).json(converted.toJSON());
}
