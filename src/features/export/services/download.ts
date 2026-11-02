import { baseName } from '../../../shared/bytes';
import type { ExportFormat } from '../../../shared/types';

export const MIME: Record<ExportFormat, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export function outputFileName(originalName: string, format: ExportFormat): string {
  return `${baseName(originalName)}-signed.${format}`;
}

/** Saves through a temporary link. Where `download` isn't honoured (older iOS), opens the file instead. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  if ('download' in link) {
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } else {
    window.open(url, '_blank', 'noopener');
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
