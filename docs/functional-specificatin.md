# Functional Specification: Free Document Signer

## 1. Purpose
A free web tool where anyone can sign a PDF or DOCX document without paying for online signing services.

## 2. Scope
- **In scope:** Upload a document, add a signature (drawn or image), place and resize it, save and download as PDF or DOCX.

## 3. Users
Anyone. No registration or login required.

## 4. Functional Requirements

### 4.1 Upload
- FR-1: Upload `.pdf` or `.docx` via button or drag-and-drop.
- FR-2: Reject other file types with a clear message.
- FR-3: Max file size: 20 MB.

### 4.2 Preview
- FR-4: Show all pages in a scrollable viewer.
- FR-5: Zoom and page navigation.

### 4.3 Create Signature
- FR-6: **Draw** with mouse, touch, or stylus. Clear and redo supported.
- FR-7: **Upload** a PNG/JPG signature image.
- FR-8: Auto-remove white background from uploaded image.

### 4.4 Place and Resize
- FR-9: Drag the signature to any position on any page.
- FR-10: Resize with corner handles, keeping aspect ratio.
- FR-11: Move or delete a placed signature.
- FR-12: Multiple signatures allowed.

### 4.5 Save and Export
- FR-13: **Save** the signed document.
- FR-14: Choose output format: **PDF** or **DOCX**.
- FR-15: Signature appears at the same position and size as placed.
- FR-16: Original content stays unchanged.

## 5. Format Handling
| Input | Output PDF | Output DOCX |
|---|---|---|
| PDF | Signature embedded in PDF | PDF converted to DOCX, then signature added (layout may vary slightly) |
| DOCX | DOCX converted to PDF, then signature added | Signature inserted as a floating image at the placed position |

## 6. Non-Functional Requirements
- **Free:** Open-source libraries only.
- **Privacy:** No account, no stored files. Documents are processed in the browser or deleted from the server right after download.
- **Compatibility:** Latest Chrome, Edge, Firefox, Safari; desktop and mobile.
- **Speed:** Open a 20-page file in under 3 seconds; export in under 5 seconds.

## 7. User Flow
1. Upload document
2. Draw or upload signature
3. Drag to position and resize
4. Save, choose PDF or DOCX, download

## 8. Suggested Tech Stack
| Need | Tool |
|---|---|
| PDF display | PDF.js |
| PDF editing/export | pdf-lib |
| DOCX editing/export | docx / JSZip (insert image in XML) |
| DOCX ↔ PDF conversion | LibreOffice (server-side, headless) |
| Signature drawing | signature_pad |
| Drag/resize | interact.js |

## 9. Acceptance Criteria
- No signup or login needed at any step.
- A user can sign a PDF or DOCX and download it as PDF or DOCX.
- Signature position and size in the output match the preview.
- Both drawn and image signatures work.