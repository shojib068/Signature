export type ErrorCode =
  | 'UNSUPPORTED_TYPE'
  | 'FILE_TOO_LARGE'
  | 'CORRUPT_FILE'
  | 'ENCRYPTED_PDF'
  | 'BAD_SIGNATURE_IMAGE'
  | 'CONVERSION_FAILED'
  | 'CONVERSION_TIMEOUT'
  | 'CONVERTER_UNAVAILABLE'
  | 'SERVER_BUSY'
  | 'NETWORK'
  | 'EXPORT_FAILED';

export const USER_MESSAGES: Record<ErrorCode, string> = {
  UNSUPPORTED_TYPE: 'Only PDF and Word (.docx) files are supported.',
  FILE_TOO_LARGE: 'This file is larger than 20 MB. Please choose a smaller file.',
  CORRUPT_FILE: "We couldn't read this file. It may be damaged.",
  ENCRYPTED_PDF: 'This PDF is password-protected. Remove the password and try again.',
  BAD_SIGNATURE_IMAGE: 'Please upload a PNG or JPG image under 5 MB.',
  CONVERSION_FAILED: "We couldn't convert this document. Try saving it in the original format instead.",
  CONVERSION_TIMEOUT: 'Conversion took too long. Try a smaller document.',
  CONVERTER_UNAVAILABLE:
    "Word conversion isn't available on this site right now. PDF files still work fully in your browser.",
  SERVER_BUSY: 'The converter is busy. Please try again in a few seconds.',
  NETWORK: "Couldn't reach the converter. Check your connection and try again.",
  EXPORT_FAILED: 'Saving failed. Your document was not changed. Please try again.',
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly userMessage: string;

  constructor(code: ErrorCode, cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = 'AppError';
    this.code = code;
    this.userMessage = USER_MESSAGES[code];
  }
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && value in USER_MESSAGES;
}

/** Keeps known AppErrors and wraps anything else in `fallback`, so the UI never shows raw errors. */
export function toAppError(error: unknown, fallback: ErrorCode): AppError {
  if (error instanceof AppError) return error;
  return new AppError(fallback, error);
}

export interface AppWarning {
  code: 'DOCX_ANCHOR_FALLBACK' | 'DIGITAL_SIGNATURE' | 'PAGE_SIZE_MISMATCH';
  message: string;
}
