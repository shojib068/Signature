const TAIL_BYTES = 64 * 1024;
const HEAD_BYTES = 8 * 1024;
const MARKER = '/Encrypt';

/**
 * Cheap check for an /Encrypt entry in the trailer. The trailer (or xref stream dict) is
 * uncompressed and sits at the end of the file, or at the start of a linearized file.
 */
export function looksEncrypted(bytes: Uint8Array): boolean {
  const decoder = new TextDecoder('latin1');
  const tail = decoder.decode(bytes.subarray(Math.max(0, bytes.length - TAIL_BYTES)));
  if (/\/Encrypt\s*(\d+\s+\d+\s+R|<<)/.test(tail)) return true;
  const head = decoder.decode(bytes.subarray(0, HEAD_BYTES));
  return head.includes(MARKER) && /\/Encrypt\s*(\d+\s+\d+\s+R|<<)/.test(head);
}
