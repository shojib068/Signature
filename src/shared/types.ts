export type DocKind = 'pdf' | 'docx';

export interface PageSize {
  /** Points, at scale 1, after /Rotate has been applied. */
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
}

export interface LoadedDocument {
  kind: DocKind;
  /** Original name, used to build the output name. */
  fileName: string;
  /** Never mutated (FR-16). */
  originalBytes: Uint8Array;
  /** Equals originalBytes for PDF input; the converted PDF for DOCX input. */
  previewPdf: Uint8Array;
  pageSizes: PageSize[];
  /** DOCX only: top-level paragraph index → 0-based page index. */
  paragraphPageMap?: number[];
}

export interface Signature {
  id: string;
  source: 'draw' | 'image';
  /** Transparent background, trimmed to the ink. */
  png: Uint8Array;
  /** Blob URL of `png`, for display only. Revoked when the signature is removed. */
  previewUrl: string;
  /** px; together they set the aspect ratio. */
  naturalWidth: number;
  naturalHeight: number;
}

export interface Placement {
  id: string;
  signatureId: string;
  /** 0-based. */
  pageIndex: number;
  /** pt, top-left of the box, relative to the page view box (top-left origin). */
  x: number;
  y: number;
  /** pt; width / height always equals the signature's natural aspect (FR-10). */
  width: number;
  height: number;
}

export type ExportFormat = DocKind;
