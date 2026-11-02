# Technical Specification: Free Document Signer

Implements: [`functional-specificatin.md`](./functional-specificatin.md) (FR-1 … FR-16, §5, §6).
Stack and project rules: [`CLAUDE.md`](../CLAUDE.md).

---

## 1. Overview

A single-page web app that lets anyone sign a PDF or DOCX in the browser and download it as PDF or DOCX. The conversion server is only used for PDF ↔ DOCX conversion, which needs LibreOffice. Every other step runs in the browser: parsing, rendering, drawing, background removal, placement, PDF stamping, and DOCX image insertion.

### 1.1 Core design decisions

| # | Decision | Reason |
|---|---|---|
| D1 | **PDF is the internal working format.** Every document is previewed and edited as a PDF. | One viewer (PDF.js) and one coordinate system serve both input types. |
| D2 | **Placements are stored in PDF points** (1/72 inch), at scale 1, relative to the page, with a top-left origin. | Zoom and screen DPI never affect the stored values, so the output matches the preview (FR-15). |
| D3 | **The original bytes are never modified in place.** Export always writes a new file. | FR-16: original content stays unchanged. |
| D4 | **The server is stateless and stores nothing.** Files live in RAM plus a per-job temp dir that is deleted in `finally`. | Privacy NFR. |
| D5 | **PDF → DOCX output stamps first, then converts.** | The signature reaches the DOCX as an ordinary image, so no second coordinate mapping is needed. |

---

## 2. Architecture

```
┌──────────────────────────── Browser (React SPA) ────────────────────────────┐
│                                                                             │
│  upload ──► viewer (PDF.js, worker) ──► placement (interact.js overlays)    │
│                 ▲                              ▲                            │
│                 │ previewPdf                   │ Signature PNGs             │
│                 │                       signature (signature_pad, canvas)   │
│                 │                                                           │
│  export: pdf-lib stamping  |  JSZip DOCX anchor insertion  |  download      │
└────────┬─────────────────────────────────────────────────────┬──────────────┘
         │ DOCX in (preview)                                    │ signed PDF (DOCX out)
         ▼                                                      ▼
┌──────────────────── Conversion server (Node + Express) ─────────────────────┐
│  POST /api/convert/docx-to-pdf     POST /api/convert/pdf-to-docx            │
│  multer (memory, 20 MB) → mkdtemp → soffice --headless → stream → rm -rf    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Load flow

| Input | Steps |
|---|---|
| PDF | Validate → `originalBytes` = file → `previewPdf` = same bytes → render. No network call. |
| DOCX | Validate → POST to `/api/convert/docx-to-pdf` → server returns a PDF that contains paragraph bookmarks (§6.4) → client builds `paragraphPageMap` → render. `originalBytes` keeps the untouched DOCX. |

### 2.2 Export flow (FR-13, FR-14, §5)

| Input → Output | Where | Steps |
|---|---|---|
| PDF → PDF | Browser | `stampPdf(originalBytes, placements)` → download. |
| DOCX → PDF | Browser | `stampPdf(stripHelperDests(previewPdf), placements)` → download. |
| PDF → DOCX | Browser + server | `stampPdf(originalBytes)` → POST the signed PDF to `/api/convert/pdf-to-docx` → download the DOCX. Layout may vary (allowed by §5). |
| DOCX → DOCX | Browser | `insertDocxAnchors(originalBytes, placements, paragraphPageMap)` → download. |

---

## 3. Project Structure

Feature-first, as set out in CLAUDE.md. Features may import other features only through their `index.ts`.

```
src/
  app/
    App.tsx                  # shell: upload screen ↔ editor screen
    state.ts                 # AppState, actions, reducer (useReducer + context)
  features/
    upload/
      components/UploadDropzone.tsx
      services/validateFile.ts
      services/loadDocument.ts      # PDF direct / DOCX via server
      index.ts
    viewer/
      components/DocumentViewer.tsx, PageView.tsx, ViewerToolbar.tsx
      hooks/usePdfDocument.ts, useVisiblePage.ts
      services/pdfjs.ts             # worker setup, getDocument wrapper
      services/paragraphPageMap.ts  # build map from named destinations
      index.ts
    signature/
      components/SignatureDialog.tsx, DrawPad.tsx, ImageUpload.tsx, SignatureTray.tsx
      services/removeWhiteBackground.ts
      services/trimCanvas.ts
      index.ts
    placement/
      components/PlacementLayer.tsx, PlacedSignature.tsx
      hooks/useInteract.ts
      services/geometry.ts          # px ↔ pt, clamping, default size
      index.ts
    export/
      components/SaveDialog.tsx
      services/stampPdf.ts
      services/insertDocxAnchors.ts
      services/stripHelperDests.ts
      services/download.ts
      index.ts
  shared/
    api/convertClient.ts            # fetch wrapper, error mapping
    errors.ts                       # AppError + user messages
    types.ts                        # Placement, Signature, LoadedDocument
    units.ts                        # PT_TO_EMU, TWIP_TO_PT
server/
  index.ts                          # express app, static SPA, security headers
  convert/
    routes.ts
    libreoffice.ts                  # runSoffice(), per-job profile, timeout
    queue.ts                        # concurrency limiter
    docxBookmarks.ts                # inject sigp_{n} bookmarks
    errors.ts
```

---

## 4. Data Model

```ts
// shared/types.ts
export type DocKind = 'pdf' | 'docx';

export interface LoadedDocument {
  kind: DocKind;
  fileName: string;                 // original name, used for the output name
  originalBytes: Uint8Array;        // never mutated (FR-16)
  previewPdf: Uint8Array;           // = originalBytes for PDF input
  pageSizes: PageSize[];            // in points, at scale 1, after /Rotate
  paragraphPageMap?: number[];      // DOCX only: paragraphIndex → pageIndex
}

export interface PageSize { width: number; height: number; rotation: 0 | 90 | 180 | 270 }

export interface Signature {
  id: string;                       // crypto.randomUUID()
  source: 'draw' | 'image';
  png: Uint8Array;                  // transparent background, trimmed
  naturalWidth: number;             // px, sets the aspect ratio
  naturalHeight: number;
}

export interface Placement {
  id: string;
  signatureId: string;
  pageIndex: number;                // 0-based
  x: number; y: number;             // pt, top-left of the box, relative to page view box
  width: number; height: number;    // pt; width/height == natural aspect (FR-10)
}
```

```ts
// app/state.ts
interface AppState {
  doc: LoadedDocument | null;
  signatures: Signature[];          // a library; each one can be placed many times (FR-12)
  placements: Placement[];
  selectedPlacementId: string | null;
  zoom: number;                     // 0.5 – 3.0, display only
  status: 'idle' | 'loading' | 'exporting';
  error: AppError | null;
}

type Action =
  | { type: 'DOC_LOADED'; doc: LoadedDocument }
  | { type: 'RESET' }
  | { type: 'SIGNATURE_ADDED'; signature: Signature }
  | { type: 'SIGNATURE_REMOVED'; id: string }        // also removes its placements
  | { type: 'PLACEMENT_ADDED'; placement: Placement }
  | { type: 'PLACEMENT_UPDATED'; id: string; patch: Partial<Placement> }
  | { type: 'PLACEMENT_REMOVED'; id: string }
  | { type: 'SELECT'; id: string | null }
  | { type: 'ZOOM'; zoom: number }
  | { type: 'STATUS'; status: AppState['status'] }
  | { type: 'ERROR'; error: AppError | null };
```

Nothing is written to `localStorage`, IndexedDB, or cookies (privacy NFR).

---

## 5. Feature Specifications

### 5.1 `upload` (FR-1, FR-2, FR-3)

- `UploadDropzone` provides a button (`<input type="file" accept=".pdf,.docx">`) and a drag-and-drop zone that handles `dragover` and `drop` and takes the first file only.
- `validateFile(file): Promise<DocKind>` makes these checks in order and stops at the first failure:
  1. `file.size > 20 * 1024 * 1024` → `FILE_TOO_LARGE`.
  2. Read the first 8 bytes. `%PDF-` → `pdf`. `PK\x03\x04` → candidate DOCX. Anything else → `UNSUPPORTED_TYPE`. The extension and MIME type are not trusted, because browsers report DOCX MIME inconsistently.
  3. DOCX candidate: open it with JSZip. `word/document.xml` must exist, otherwise → `UNSUPPORTED_TYPE` (this rejects .xlsx, .pptx, and zip files).
- `loadDocument(file, kind): Promise<LoadedDocument>`:
  - PDF: open with PDF.js. A password or encryption causes `ENCRYPTED_PDF`. A parse failure causes `CORRUPT_FILE`.
  - DOCX: call `convertClient.docxToPdf(file)`, then `buildParagraphPageMap(pdf)` (§6.4).

### 5.2 `viewer` (FR-4, FR-5)

- PDF.js (`pdfjs-dist`) runs with its worker (`GlobalWorkerOptions.workerSrc` points to the bundled worker URL through Vite's `?url` import).
- `DocumentViewer` renders a vertical scroll list of `PageView`s. Each one is a placeholder sized from `page.getViewport({ scale: zoom })`.
- **Lazy rendering:** an `IntersectionObserver` with `rootMargin: '100% 0px'` renders a page when it gets close to the viewport and releases its canvas when it is more than 5 pages away. The canvas backing size is `viewport × devicePixelRatio`, capped at 4096 px per side for Safari's memory limit.
- **Zoom:** steps 50 / 75 / 100 / 125 / 150 / 200 / 300 %, plus "Fit width". Ctrl or ⌘ + wheel and pinch also zoom. The scroll position is kept relative to the current page.
- **Page navigation:** prev/next buttons and a "page N of M" input. `useVisiblePage` reports which page holds most of the viewport.
- Each `PageView` hosts that page's `PlacementLayer` as an absolutely positioned overlay of the same size.

### 5.3 `signature` (FR-6, FR-7, FR-8)

**Draw (FR-6)**
- `signature_pad` on a canvas. Pointer events cover mouse, touch, and stylus. The canvas has `touch-action: none`.
- **Undo (redo of a stroke):** `pad.fromData(pad.toData().slice(0, -1))`. **Clear:** `pad.clear()`.
- Window resize: save `toData()`, resize the canvas to `clientSize × devicePixelRatio`, then `fromData()`.
- **Use signature:** render to an offscreen canvas at 3× ratio, run `trimCanvas` to crop to the ink bounding box with 4 px padding, then export a PNG.
- Pen color: black by default. Blue is optional.

**Upload image (FR-7, FR-8)**
- Accept `image/png` and `image/jpeg`, up to 5 MB. Check the magic bytes (PNG `89 50 4E 47`, JPEG `FF D8 FF`).
- Decode with `createImageBitmap`, then call `removeWhiteBackground(imageData)`:
  - Luminance `L = 0.299R + 0.587G + 0.114B`.
  - `L ≥ 235` → alpha 0. `200 < L < 235` → alpha scaled linearly from 0 to the original alpha (soft edge, no halo). `L ≤ 200` → unchanged.
  - This is a pure function on `ImageData` and is unit-tested.
- Then `trimCanvas`, downscale to at most 1200 px wide, and export a PNG.
- Show a before/after preview on a checkerboard background, with a "Keep original background" toggle.

**Tray:** `SignatureTray` lists the signatures created in this session. Clicking one places it (§5.4).

### 5.4 `placement` (FR-9, FR-10, FR-11, FR-12)

- **Add:** when a signature is clicked in the tray, a `Placement` is created on the current visible page, centered, with `width = 150 pt` and `height = 150 × naturalHeight / naturalWidth`, then clamped to the page. The same signature can be placed any number of times (FR-12).
- **Render:** `PlacedSignature` is an absolutely positioned `<img>`, at `left = x·zoom`, `top = y·zoom`, `width = width·zoom`, `height = height·zoom`.
- **Drag (FR-9, FR-11):** interact.js `draggable` with `modifiers.restrictRect({ restriction: 'parent' })`. During the drag, only a CSS transform is applied. On `end`, the pixel delta is converted to points (`Δpt = Δpx / zoom`) and `PLACEMENT_UPDATED` is dispatched.
  - **Cross-page move:** on `end`, if the pointer is over another `PageView` (`document.elementsFromPoint`), set `pageIndex` to that page and recompute `x`/`y` in that page's coordinates.
- **Resize (FR-10):** interact.js `resizable` on the four corners only, with `modifiers.aspectRatio({ ratio: 'preserve' })`, `restrictEdges` to the parent, and `restrictSize({ min: { width: 20·zoom } })`.
- **Select / delete (FR-11):** clicking selects a placement, which shows its handles and a × button. The × button or `Delete`/`Backspace` removes it. Arrow keys nudge by 1 pt, or 10 pt with Shift. Escape deselects.
- `geometry.ts` holds pure, tested functions: `pxToPt`, `ptToPx`, `clampToPage(placement, pageSize)`, `defaultPlacement(sig, page, pageSize)`.

### 5.5 `export` (FR-13, FR-14, FR-15, FR-16)

`SaveDialog` asks for the format (PDF or DOCX, defaulting to the input format) and then runs the matching path from §2.2. The output name is `<originalBase>-signed.<ext>`. `download.ts` uses `URL.createObjectURL(blob)` and a temporary `<a download>`, then revokes the URL after 10 s. If there are no placements, the user is asked to confirm before saving an unsigned copy.

**`stampPdf(bytes, placements, signatures): Promise<Uint8Array>`**
1. `PDFDocument.load(bytes)`. An encrypted PDF throws `ENCRYPTED_PDF`. `ignoreEncryption` is never used, because it produces broken output.
2. Embed each distinct signature once with `embedPng` and reuse it across placements.
3. For each placement, compute the anchor and rotation (§6.2) and call `page.drawImage(img, { x, y, width, height, rotate: degrees(r) })`.
4. `save()`. Existing page content streams stay as they are (FR-16). New content is appended as an extra content stream.

**`stripHelperDests(pdfBytes)`** (DOCX input only) deletes the `sigp_*` entries from the catalog `/Dests` and `/Names → /Dests`, so the helper bookmarks never reach the user.

**`insertDocxAnchors(docxBytes, placements, signatures, paragraphPageMap)`** (DOCX → DOCX). Uses JSZip and the browser's `DOMParser`/`XMLSerializer`.
1. Add each signature PNG as `word/media/signature_<n>.png`.
2. In `word/_rels/document.xml.rels`, add `<Relationship Id="rIdSig<n>" Type="…/image" Target="media/signature_<n>.png"/>`, using an Id that does not clash with existing ones.
3. In `[Content_Types].xml`, add `<Default Extension="png" ContentType="image/png"/>` if it is missing.
4. In `word/document.xml`, for each placement:
   - Find the target paragraph: `paragraphIndex = first i where paragraphPageMap[i] === pageIndex`. If there is none (one paragraph spans the whole page), use the last paragraph that starts on an earlier page and set a warning (§11).
   - Append a new run `<w:r><w:drawing><wp:anchor …/></w:drawing></w:r>` to that paragraph. The anchor XML is in §6.3.
   - `wp:docPr/@id` = max of the existing ids + 1.
   - Add any missing namespace declarations (`wp`, `a`, `pic`, `r`) to the root element.
5. Re-zip with `compression: 'DEFLATE'`. All other parts are copied byte for byte (FR-16).

---

## 6. Coordinate Conversion

### 6.1 Systems

| System | Origin | Unit | Used by |
|---|---|---|---|
| Screen | top-left of the page canvas | CSS px | interact.js |
| **Stored (`Placement`)** | top-left of the page view box | pt | state |
| PDF user space | bottom-left of the MediaBox (can be offset) | pt | pdf-lib |
| DOCX | top-left of the page | EMU (1 pt = 12 700 EMU) | `wp:anchor` |

`pt = px / zoom` and `px = pt × zoom`.

### 6.2 Stored → PDF user space (pdf-lib)

Use a PDF.js viewport at `scale: 1`, which already accounts for the CropBox offset and `/Rotate`:

```ts
const vp = page.getViewport({ scale: 1 });
// The image's visual bottom-left corner becomes its local origin in pdf-lib.
const [ax, ay] = vp.convertToPdfPoint(p.x, p.y + p.height);
page.drawImage(img, { x: ax, y: ay, width: p.width, height: p.height, rotate: degrees(rotation) });
// rotation = the page's /Rotate (0/90/180/270), so the signature appears upright when the page is viewed.
```

`stampPdf` runs in the export path, so the viewport math is wrapped in a pure `toPdfSpace(placement, viewBox, rotation)` function. It can then be tested without PDF.js.

**Rotation 0 shortcut:** `pdfX = viewBox.x0 + x`, `pdfY = viewBox.y1 − (y + height)`.

**Worked example (A4, 595.28 × 841.89 pt, no rotation):** a placement with `x=400, y=700, w=150, h=50` gives `pdfX = 400` and `pdfY = 841.89 − 750 = 91.89`. In the viewer at 150 % zoom, the same box is at `left=600px, top=1050px, 225×75 px`.

### 6.3 Stored → DOCX (`wp:anchor`)

```xml
<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="251659264"
           behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">
  <wp:simplePos x="0" y="0"/>
  <wp:positionH relativeFrom="page"><wp:posOffset>{x·12700}</wp:posOffset></wp:positionH>
  <wp:positionV relativeFrom="page"><wp:posOffset>{y·12700}</wp:posOffset></wp:positionV>
  <wp:extent cx="{w·12700}" cy="{h·12700}"/>
  <wp:effectExtent l="0" t="0" r="0" b="0"/>
  <wp:wrapNone/>
  <wp:docPr id="{id}" name="Signature {n}"/>
  <wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>
  <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
    <pic:pic>
      <pic:nvPicPr><pic:cNvPr id="0" name="signature_{n}.png"/><pic:cNvPicPr/></pic:nvPicPr>
      <pic:blipFill><a:blip r:embed="rIdSig{n}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
      <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{w·12700}" cy="{h·12700}"/></a:xfrm>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
    </pic:pic>
  </a:graphicData></a:graphic>
</wp:anchor>
```

All EMU values are rounded to integers. **Page-size check:** LibreOffice keeps the DOCX page size, but if the preview page width differs from the section's `w:pgSz/@w:w ÷ 20` by more than 1 pt, `x`/`y`/`w`/`h` are scaled by the ratio and a dev-console warning is logged.

### 6.4 DOCX paragraph → page mapping

A floating image's page is decided by the paragraph it is anchored in, so the client has to know which paragraph starts on each page.

1. **Server (`docxBookmarks.ts`).** On the temp copy only, insert `<w:bookmarkStart w:id="{base+n}" w:name="sigp_{n}"/><w:bookmarkEnd w:id="{base+n}"/>` as the first content (after `w:pPr`) of every **top-level** `w:body/w:p`, where `n` = the paragraph's index among top-level body paragraphs. `base` is the max existing bookmark id + 1. Parsing uses `@xmldom/xmldom` (*needs approval, §14*).
2. **Server.** Convert with `ExportBookmarksToPDFDestination=true` (§7.2), which turns every Writer bookmark into a PDF named destination.
3. **Client (`buildParagraphPageMap`).** `pdf.getDestinations()` → for each `sigp_{n}`, `pdf.getPageIndex(dest[0])` → `map[n] = pageIndex`.
4. **Client (export).** `insertDocxAnchors` indexes `w:body/w:p` in the **original** DOCX the same way. The structure is identical apart from the bookmarks, so the indexes line up.

Paragraphs inside tables are not used as anchors. Word lays out floating images inside table cells relative to the cell, which would break page-relative positioning.

---

## 7. Conversion Server

### 7.1 API

| Endpoint | Request | Success | Notes |
|---|---|---|---|
| `POST /api/convert/docx-to-pdf` | `multipart/form-data`, field `file` (DOCX) | `200 application/pdf` | The PDF includes `sigp_*` named destinations. |
| `POST /api/convert/pdf-to-docx` | `multipart/form-data`, field `file` (PDF) | `200 application/vnd.openxmlformats-officedocument.wordprocessingml.document` | |
| `GET /api/health` | none | `200 {"ok":true}` | Checks that `soffice` is on the PATH at startup. |

Error body: `{ "code": string, "message": string }`.

| Status | `code` | When |
|---|---|---|
| 400 | `NO_FILE` | Missing `file` field |
| 413 | `FILE_TOO_LARGE` | > 20 MB (multer `LIMIT_FILE_SIZE`) |
| 415 | `UNSUPPORTED_TYPE` | Magic bytes don't match the endpoint |
| 422 | `CONVERSION_FAILED` | soffice exit ≠ 0 or no output file |
| 503 | `SERVER_BUSY` | Queue full; sent with `Retry-After: 5` |
| 504 | `CONVERSION_TIMEOUT` | Job took > 30 s |

### 7.2 LibreOffice invocation

```
soffice --headless --norestore --nolockcheck \
  -env:UserInstallation=file://<jobDir>/profile \
  [--infilter=writer_pdf_import]  \
  --convert-to <target> --outdir <jobDir>/out <jobDir>/in.<ext>
```

| Direction | `<target>` |
|---|---|
| DOCX → PDF | `pdf:writer_pdf_Export:{"ExportBookmarksToPDFDestination":{"type":"boolean","value":"true"},"ExportBookmarks":{"type":"boolean","value":"false"}}` (LibreOffice ≥ 7.4 JSON filter options) |
| PDF → DOCX | `docx:"MS Word 2007 XML"` with `--infilter=writer_pdf_import` |

- Spawned with `child_process.execFile` (no shell) and `timeout: 30_000`, `killSignal: 'SIGKILL'`.
- **Per-job profile:** this lets parallel jobs run safely. To avoid the 1–2 s cost of building a profile on every job, a profile template is built once at startup and copied into each job dir with `fs.cp`.

### 7.3 Request lifecycle (privacy)

```
multer.memoryStorage({ limits: { fileSize: 20 MB, files: 1 } })
  → check magic bytes
  → queue.run(async () => {
       const dir = await fs.mkdtemp(os.tmpdir() + '/sign-');
       try   { write input → (inject bookmarks) → soffice → read output → res.send(buffer) }
       finally { await fs.rm(dir, { recursive: true, force: true }) }
     })
```

- **Queue:** at most `MAX_JOBS` running (default 2) and at most 10 waiting. Beyond that the server returns `503`.
- **Logging:** only method, path, status, duration, and byte size. File names and file contents are never logged.
- On startup, the server deletes any leftover `sign-*` dirs, for example after a crash.

### 7.4 HTTP hardening

- Same-origin deployment, so CORS is not enabled.
- Headers set by hand (no new dependency): `Content-Security-Policy: default-src 'self'; img-src 'self' blob: data:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store` on `/api/*`.
- No analytics, fonts, or scripts from third-party origins.

---

## 8. Error Handling

`shared/errors.ts` defines `AppError { code, userMessage }`. The UI shows `userMessage` in a dismissible banner and never shows stack traces.

| Code | User message |
|---|---|
| `UNSUPPORTED_TYPE` | "Only PDF and Word (.docx) files are supported." |
| `FILE_TOO_LARGE` | "This file is larger than 20 MB. Please choose a smaller file." |
| `CORRUPT_FILE` | "We couldn't read this file. It may be damaged." |
| `ENCRYPTED_PDF` | "This PDF is password-protected. Remove the password and try again." |
| `BAD_SIGNATURE_IMAGE` | "Please upload a PNG or JPG image under 5 MB." |
| `CONVERSION_FAILED` | "We couldn't convert this document. Try saving it in the original format instead." |
| `CONVERSION_TIMEOUT` | "Conversion took too long. Try a smaller document." |
| `SERVER_BUSY` | "The converter is busy. Please try again in a few seconds." |
| `NETWORK` | "Couldn't reach the converter. Check your connection and try again." |
| `EXPORT_FAILED` | "Saving failed. Your document was not changed. Please try again." |

Warnings, which are non-blocking: `DOCX_ANCHOR_FALLBACK` ("A signature on page N may shift slightly in Word because that page has no paragraph start.").

---

## 9. Performance (NFR: open in < 3 s, export in < 5 s)

| Budget | Measure |
|---|---|
| Open a 20-page PDF in < 3 s | The PDF.js worker parses off the main thread. Only the visible pages and their neighbours render. Placeholders are sized from page sizes, which are read once and are cheap. |
| Open a 20-page DOCX in < 3 s | A warm profile template (§7.2) keeps LibreOffice at about 1–1.5 s, and only the first pages are rendered. If this is still too slow, a persistent LibreOffice listener (`unoserver`) is an option that *needs approval*. |
| Export PDF in < 5 s | pdf-lib embeds each PNG once, and signature PNGs are ≤ 1200 px wide. |
| Export DOCX→DOCX in < 5 s | One DOM parse of `document.xml` plus a JSZip re-zip. |
| Export PDF→DOCX in < 5 s | Bounded by LibreOffice. A progress indicator is shown for the whole job. |
| Bundle | pdf-lib and JSZip are lazy-loaded (`import()`) when the user saves. |

Measured with `performance.mark` in dev, plus a Vitest benchmark on 20-page fixtures.

---

## 10. Browser Compatibility

Targets: the latest Chrome, Edge, Firefox, and Safari (desktop, iOS, and Android).

- Pointer Events for the pad and interact.js. `touch-action: none` on the pad and placed signatures, so dragging doesn't scroll the page.
- Safari: canvas size is capped (§5.2) and off-screen page canvases are released.
- iOS Safari ignores `<a download>` for some blob types. The fallback opens the blob URL in a new tab.
- No APIs newer than ES2020 without a fallback. `createImageBitmap` has a fallback to `<img>` + canvas.
- The layout works down to 360 px wide. On mobile the signature tray is a bottom sheet.

---

## 11. Known Limitations and Risks

| Item | Impact | Mitigation |
|---|---|---|
| PDF → DOCX fidelity | LibreOffice's PDF import produces text frames, so layout can differ (allowed by §5). | Show a notice in the save dialog when PDF input → DOCX output is selected. |
| Missing fonts on the server | DOCX→PDF pagination can differ from Word, which shifts the page map. | Install metric-compatible fonts (§12). |
| A page with no paragraph start | The DOCX anchor falls back to an earlier paragraph. | `DOCX_ANCHOR_FALLBACK` warning. |
| Signatures on table-only pages | No top-level paragraph exists on the page. | Same fallback and warning. |
| Encrypted PDFs | Not supported. | Clear error message. |
| PDFs with existing digital signatures | pdf-lib does a full rewrite, which invalidates them. | Warn when the AcroForm `/SigFlags` are set. |
| Bookmark → named destination export | Depends on the LibreOffice version and filter option. | **Spike first** (§13, step 1). Pin the LibreOffice version in Docker. |

---

## 12. Build and Deployment

- **Scripts** (see CLAUDE.md §6): `dev` (Vite with an `/api` proxy to `:3001`), `server` (`tsx watch server/index.ts`), `build` (`vite build` + `tsc -p server`), `lint`, `typecheck`, `test`.
- **Single container:** Express serves `dist/` and `/api`.

```dockerfile
FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-writer libreoffice-draw \
      fonts-liberation fonts-dejavu fonts-crosextra-carlito fonts-crosextra-caladea \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY dist ./dist
COPY server-dist ./server-dist
ENV NODE_ENV=production PORT=3001 MAX_JOBS=2
USER node
CMD ["node", "server-dist/index.js"]
```

Carlito and Caladea are metric-compatible stand-ins for Calibri and Cambria, the Word defaults, and are needed for faithful pagination. `libreoffice-draw` is needed for `writer_pdf_import`.

---

## 13. Implementation Order

1. **Spike (½ day):** prove that the bookmark → named destination → PDF.js `getPageIndex` chain works (§6.4), and that a `relativeFrom="page"` anchor lands correctly in Word and LibreOffice.
2. `shared/` types, units, and errors. `upload` with validation (PDF only).
3. `viewer`: rendering, zoom, page navigation.
4. `signature`: draw, then image upload with background removal.
5. `placement`: add, drag, resize, delete, cross-page moves.
6. `export`: PDF → PDF.
7. Server: DOCX → PDF with bookmarks. `paragraphPageMap`. DOCX → PDF export.
8. `export`: DOCX → DOCX anchors.
9. Server: PDF → DOCX.
10. Hardening: errors, headers, queue, performance pass, cross-browser QA.

---

## 14. Dependencies

| Package | Use | Status |
|---|---|---|
| react, react-dom, vite, typescript | App | In CLAUDE.md |
| pdfjs-dist | Viewer, named destinations | In CLAUDE.md |
| pdf-lib | PDF stamping | In CLAUDE.md |
| jszip | DOCX read/write (client and server) | In CLAUDE.md |
| signature_pad | Drawing | In CLAUDE.md |
| interactjs | Drag/resize | In CLAUDE.md |
| express, multer | Server, uploads | Express is in CLAUDE.md. multer **needs approval** |
| vitest | Tests | In CLAUDE.md |
| @xmldom/xmldom | XML DOM on Node for bookmark injection | **Needs approval** |
| tsx (dev) | Run the TS server in dev | **Needs approval** |
| supertest (dev) | Server endpoint tests | **Needs approval** |
| LibreOffice (system) | Conversion | In CLAUDE.md |

The `docx` npm package is not needed. JSZip plus direct XML editing covers the inserts and leaves the rest of the document untouched.

---

## 15. Testing Strategy

Fixtures are generated in the tests (pdf-lib builds PDFs and JSZip builds minimal DOCX files). No real signatures or personal documents are committed.

| Level | What | Tool |
|---|---|---|
| Unit | `validateFile` (magic bytes, size, zip without `word/document.xml`) | Vitest |
| Unit | `geometry.ts`: px↔pt at several zooms, clamping, aspect ratio preserved | Vitest |
| Unit | `toPdfSpace` for rotation 0/90/180/270 and an offset CropBox | Vitest |
| Unit | `removeWhiteBackground`: white→alpha 0, black unchanged, ramp values | Vitest + `ImageData` polyfill |
| Unit | `insertDocxAnchors`: rels, content types, unique ids, EMU math, namespaces, other parts byte-identical | Vitest |
| Unit | `docxBookmarks`: one bookmark per top-level paragraph, ids don't collide | Vitest (server) |
| Round-trip | Stamp → re-load with pdf-lib → check the image XObject position from the content stream, within ±1 pt (FR-15). Original content stream bytes unchanged (FR-16) | Vitest |
| Round-trip | DOCX → DOCX → re-open with JSZip → check `posOffset`/`extent` | Vitest |
| Integration | Both endpoints: success, 413, 415, timeout. Temp dir is empty after each request | Vitest + supertest (skipped if `soffice` is missing) |
| Manual | Functional spec §9 acceptance criteria on Chrome, Edge, Firefox, Safari, iOS Safari, Android Chrome. Open DOCX output in MS Word and LibreOffice | Checklist |

---

## 16. Requirement Traceability

| Req | Implementation | Verified by |
|---|---|---|
| FR-1 | `upload/UploadDropzone` (button + drop) | Manual, component test |
| FR-2 | `upload/validateFile` → `UNSUPPORTED_TYPE` | Unit |
| FR-3 | `validateFile` + multer limit → `FILE_TOO_LARGE` | Unit, integration |
| FR-4 | `viewer/DocumentViewer` lazy page list | Manual, perf benchmark |
| FR-5 | `viewer/ViewerToolbar`, `useVisiblePage` | Manual |
| FR-6 | `signature/DrawPad` (signature_pad, undo, clear) | Manual |
| FR-7 | `signature/ImageUpload` | Unit (magic bytes), manual |
| FR-8 | `signature/removeWhiteBackground` | Unit |
| FR-9 | `placement/PlacedSignature` draggable, cross-page move | Unit (geometry), manual |
| FR-10 | interact.js `aspectRatio` modifier | Unit (geometry), manual |
| FR-11 | Move, × button, Delete key | Manual |
| FR-12 | `placements[]` that reference `signatures[]` | Unit (reducer) |
| FR-13 | `export/SaveDialog`, `download.ts` | Manual |
| FR-14 | Export matrix in §2.2 | Round-trip, integration |
| FR-15 | Stored points + §6 conversions | Round-trip (±1 pt) |
| FR-16 | Append-only stamping, untouched DOCX parts | Round-trip (byte compare) |
| NFR Free | Open-source dependencies only (§14) | Review |
| NFR Privacy | In-browser by default, memory uploads, temp dir `rm` in `finally`, no logging or storage | Integration (empty temp dir), review |
| NFR Compatibility | §10 | Manual matrix |
| NFR Speed | §9 | Benchmarks |
