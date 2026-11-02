# CLAUDE.md

Guidance for Claude Code when working on **Free Document Signer**: a no-login web tool to sign PDF/DOCX files (draw or image signature, place, resize, export as PDF or DOCX).

Source of truth for requirements: `@docs/functional-specification.md`. Read it before starting any task.

## 1. Read First
1. `@docs/functional-specification.md`: what to build.
2. `.claude/` folder: project-specific setup. Read what exists before acting:
   - `.claude/settings.json`: allowed tools and permissions. Respect them.
   - `.claude/commands/`: reusable slash commands. Use them instead of reinventing steps.
   - `.claude/.agents/`: sub-agent definitions. Delegate to them when the task matches.
3. The target feature's folder (`src/features/<name>/`) before editing it.

If `.claude/` or any file above is missing, say so and continue with this file. Do not invent its contents.

## 2. Tech Stack
- React + TypeScript + Vite (frontend)
- PDF.js (view), pdf-lib (PDF export), docx/JSZip (DOCX export)
- signature_pad (draw), interact.js (drag/resize)
- Node + Express with LibreOffice headless (PDF ↔ DOCX conversion only)
- Vitest (tests)

## 3. Architecture: Feature-First
Group code by feature, not by file type. Each feature owns its UI, logic, types, and tests.

```
src/
  features/
    upload/          # file picker, validation
    viewer/          # page rendering, zoom
    signature/       # draw pad, image upload, background removal
    placement/       # drag, resize, move, delete
    export/          # save, PDF/DOCX output
  shared/            # generic UI, utils, types used by 2+ features
  app/               # app shell, routing, global state wiring
server/
  convert/           # LibreOffice conversion endpoint
```

Each feature folder:
```
features/<name>/
  components/
  hooks/
  services/    # pure logic, no React
  types.ts
  index.ts     # the only public entry point
  *.test.ts
```

### Rules
- Import another feature only through its `index.ts`. Never reach into its internals.
- Features must not form circular dependencies. `app/` composes features; features do not import `app/`.
- Code used by two or more features moves to `shared/`. Code used by one stays in that feature.
- Keep logic in `services/` (pure functions) so it is testable without the UI.

## 4. Do
- Keep changes small and scoped to one feature when possible.
- Match placement and size exactly: store signature coordinates in PDF units (points) relative to the page, not screen pixels.
- Process files in the browser by default. Use the server only for PDF ↔ DOCX conversion.
- Validate file type and size (20 MB max) on upload.
- Write or update tests for any logic change, especially coordinate conversion and export.
- Handle errors with clear, user-friendly messages.
- Ask before adding a new dependency. Prefer free, open-source, well-maintained packages.
- Run `npm run lint`, `npm run typecheck`, and `npm test` before finishing a task.

## 5. Don't
- Don't add signup, login, accounts, or any user tracking.
- Don't store uploaded files. Delete server-side temp files immediately after conversion or download.
- Don't send documents to third-party services or paid APIs.
- Don't log document contents or signature images.
- Don't put cross-feature logic in a random feature or in `app/`; use `shared/`.
- Don't use `any` in TypeScript without a comment explaining why.
- Don't edit `.claude/settings.json`, lockfiles, or config files unless the task requires it.
- Don't rewrite or reformat unrelated code.
- Don't commit secrets, `.env` files, or sample documents containing real signatures.

## 6. Commands
```
npm install        # install dependencies
npm run dev        # start frontend dev server
npm run server     # start conversion server
npm run build      # production build
npm run lint       # lint
npm run typecheck  # type check
npm test           # run tests
```

## 7. Conventions
- Components: `PascalCase.tsx`. Hooks: `useThing.ts`. Services and utils: `camelCase.ts`.
- Named exports; default exports only for pages.
- Small functions, early returns, no deep nesting.
- Comments explain why, not what.
- Commit messages: `feat(signature): add image background removal`, `fix(export): correct Y-axis offset`.

## 8. Definition of Done
- Meets the relevant requirement IDs in `functional-specification.md` (e.g., FR-9, FR-10).
- Signature in the exported file matches the preview position and size.
- Lint, typecheck, and tests pass.
- No new login, storage, or tracking behavior introduced.
- Brief summary given: what changed, which files, anything left open.

## 9. When Unsure
Ask a short question rather than guess, especially for: new dependencies, changes to the architecture, or anything touching file storage or privacy.