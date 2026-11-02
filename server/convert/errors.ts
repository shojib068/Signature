export type ServerErrorCode =
  | 'NO_FILE'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_TYPE'
  | 'CONVERSION_FAILED'
  | 'CONVERSION_TIMEOUT'
  | 'CONVERTER_UNAVAILABLE'
  | 'SERVER_BUSY';

const STATUS: Record<ServerErrorCode, number> = {
  NO_FILE: 400,
  FILE_TOO_LARGE: 413,
  UNSUPPORTED_TYPE: 415,
  CONVERSION_FAILED: 422,
  CONVERTER_UNAVAILABLE: 503,
  SERVER_BUSY: 503,
  CONVERSION_TIMEOUT: 504,
};

const MESSAGES: Record<ServerErrorCode, string> = {
  NO_FILE: 'No file was sent.',
  FILE_TOO_LARGE: 'The file is larger than 20 MB.',
  UNSUPPORTED_TYPE: 'The file type does not match this conversion.',
  CONVERSION_FAILED: 'The document could not be converted.',
  CONVERSION_TIMEOUT: 'The conversion took too long.',
  CONVERTER_UNAVAILABLE: 'Document conversion is not available on this server.',
  SERVER_BUSY: 'The converter is busy. Try again in a few seconds.',
};

export class ConvertError extends Error {
  readonly code: ServerErrorCode;
  readonly status: number;

  constructor(code: ServerErrorCode) {
    super(MESSAGES[code]);
    this.name = 'ConvertError';
    this.code = code;
    this.status = STATUS[code];
  }

  toJSON() {
    return { code: this.code, message: this.message };
  }
}
