import { AppError, isErrorCode } from '../errors';
import { toArrayBuffer } from '../bytes';

type Direction = 'docx-to-pdf' | 'pdf-to-docx';

const CONTENT_TYPE: Record<Direction, string> = {
  'docx-to-pdf': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'pdf-to-docx': 'application/pdf',
};

async function convert(direction: Direction, bytes: Uint8Array): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetch(`/api/convert/${direction}`, {
      method: 'POST',
      headers: { 'Content-Type': CONTENT_TYPE[direction] },
      body: toArrayBuffer(bytes),
    });
  } catch (error) {
    throw new AppError('NETWORK', error);
  }

  if (response.ok) return new Uint8Array(await response.arrayBuffer());
  throw new AppError(await errorCodeFrom(response));
}

async function errorCodeFrom(response: Response) {
  try {
    const body: unknown = await response.json();
    const code = (body as { code?: unknown }).code;
    if (isErrorCode(code)) return code;
  } catch {
    // Non-JSON body: a proxy or static host answered instead of our server.
  }
  if (response.status === 404 || response.status === 405) return 'CONVERTER_UNAVAILABLE';
  if (response.status === 413) return 'FILE_TOO_LARGE';
  if (response.status === 503) return 'SERVER_BUSY';
  return 'CONVERSION_FAILED';
}

export const docxToPdf = (bytes: Uint8Array) => convert('docx-to-pdf', bytes);
export const pdfToDocx = (bytes: Uint8Array) => convert('pdf-to-docx', bytes);

/** True when a conversion server with LibreOffice is reachable. A static-only deployment returns false. */
export async function isConverterAvailable(): Promise<boolean> {
  try {
    const response = await fetch('/api/health', { cache: 'no-store' });
    if (!response.ok) return false;
    const body = (await response.json()) as { converter?: unknown };
    return body.converter === true;
  } catch {
    return false;
  }
}
