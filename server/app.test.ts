import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import type { Converter } from './convert/libreoffice.ts';

const PDF = Buffer.from('%PDF-1.7\n%fake');
const DOCX = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]);

let server: Server | null = null;
afterEach(() => new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve())));

async function start(converter: Converter, opts: { maxJobs?: number; maxWaiting?: number } = {}) {
  const app = createApp({ converter, distDir: null, log: () => undefined, ...opts });
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return (path: string, init?: RequestInit) => fetch(`http://127.0.0.1:${port}${path}`, init);
}

const echo: Converter = { available: true, convert: async (input) => Buffer.concat([Buffer.from('OUT:'), input]) };
const post = (body: Buffer | Uint8Array) => ({ method: 'POST', body: new Uint8Array(body), headers: { 'Content-Type': 'application/octet-stream' } });

describe('conversion API', () => {
  it('reports health and whether conversion is available', async () => {
    const req = await start({ ...echo, available: false });
    const res = await req('/api/health');
    expect(await res.json()).toEqual({ ok: true, converter: false });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('converts in both directions with the right content type', async () => {
    const req = await start(echo);
    const toPdf = await req('/api/convert/docx-to-pdf', post(DOCX));
    expect(toPdf.status).toBe(200);
    expect(toPdf.headers.get('content-type')).toContain('application/pdf');
    expect(Buffer.from(await toPdf.arrayBuffer()).subarray(0, 4).toString()).toBe('OUT:');

    const toDocx = await req('/api/convert/pdf-to-docx', post(PDF));
    expect(toDocx.headers.get('content-type')).toContain('wordprocessingml');
  });

  it('400 NO_FILE without a body', async () => {
    const req = await start(echo);
    const res = await req('/api/convert/docx-to-pdf', { method: 'POST' });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'NO_FILE' });
  });

  it('415 when the bytes do not match the endpoint', async () => {
    const req = await start(echo);
    const res = await req('/api/convert/docx-to-pdf', post(PDF));
    expect(res.status).toBe(415);
    expect(await res.json()).toMatchObject({ code: 'UNSUPPORTED_TYPE' });
  });

  it('413 over 20 MB', async () => {
    const req = await start(echo);
    const big = Buffer.alloc(20 * 1024 * 1024 + 1);
    PDF.copy(big);
    const res = await req('/api/convert/pdf-to-docx', post(big));
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ code: 'FILE_TOO_LARGE' });
  });

  it('503 SERVER_BUSY with Retry-After when the queue is full', async () => {
    let release!: () => void;
    const slow: Converter = { available: true, convert: () => new Promise((r) => (release = () => r(Buffer.from('x')))) };
    const req = await start(slow, { maxJobs: 1, maxWaiting: 0 });
    const first = req('/api/convert/pdf-to-docx', post(PDF));
    await new Promise((r) => setTimeout(r, 50));
    const second = await req('/api/convert/pdf-to-docx', post(PDF));
    expect(second.status).toBe(503);
    expect(second.headers.get('retry-after')).toBe('5');
    release();
    expect((await first).status).toBe(200);
  });

  it('503 CONVERTER_UNAVAILABLE when LibreOffice is missing', async () => {
    const req = await start({ ...echo, available: false });
    const res = await req('/api/convert/pdf-to-docx', post(PDF));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'CONVERTER_UNAVAILABLE' });
  });

  it('maps converter failures to their codes', async () => {
    const { ConvertError } = await import('./convert/errors.ts');
    const req = await start({ available: true, convert: () => Promise.reject(new ConvertError('CONVERSION_TIMEOUT')) });
    const res = await req('/api/convert/pdf-to-docx', post(PDF));
    expect(res.status).toBe(504);
  });

  it('sends security headers', async () => {
    const req = await start(echo);
    const res = await req('/api/health');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('x-powered-by')).toBeNull();
  });
});
