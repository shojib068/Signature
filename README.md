# Free Document Signer

Sign a PDF or Word (.docx) document on your own computer, for free. Draw your signature or upload a photo of it, drag it where it belongs, resize it, and download the signed file as PDF or Word.

**Try it now: https://shojib068.github.io/Signature/** (signs PDFs in your browser. For Word files, run it on your laptop as described below.)

- No account, no sign-up, no watermark, no fees.
- **PDFs never leave your computer.** They are signed inside your browser.
- Word files are converted by a small server that runs on your own laptop, and each file is deleted as soon as the conversion is done. Nothing is stored, logged or tracked.
- Several signatures per document, on any page.
- Uploaded signature photos have their white paper background removed automatically.

---

## Use it on your laptop for free

There are two ways to run it. Both are free and work on Windows, macOS and Linux.

| | A. Docker (recommended) | B. Node.js only |
|---|---|---|
| Sign PDFs | Yes | Yes |
| Sign Word (.docx) files | Yes, nothing else to install | Only if you also install LibreOffice |
| What you install | Docker Desktop | Node.js |
| Download size | About 1 GB the first time | About 200 MB |

### Step 1: Get the code

Choose one:

- **With Git:** open a terminal and run
  ```sh
  git clone https://github.com/shojib068/Signature.git
  cd Signature
  ```
- **Without Git:** on the GitHub page, click the green **Code** button, then **Download ZIP**. Unzip it, then open a terminal in the unzipped `Signature` folder.

  How to open a terminal in a folder:
  - **Windows:** open the folder in File Explorer, click the address bar, type `cmd` and press Enter.
  - **macOS:** right-click the folder in Finder, then **Services → New Terminal at Folder**.
  - **Linux:** right-click inside the folder, then **Open in Terminal**.

### Step 2A: Run with Docker (PDF and Word)

1. Install **Docker Desktop**, which is free for personal use: https://www.docker.com/products/docker-desktop/
2. Open Docker Desktop and wait until it says it is running.
3. In the terminal, inside the `Signature` folder, run:
   ```sh
   docker compose up -d --build
   ```
   The first time takes about 5–10 minutes while it downloads what it needs. Later starts take a few seconds.
4. Open **http://localhost:3001** in your browser.

To stop it:
```sh
docker compose down
```
To start it again later, run `docker compose up -d` in the same folder.

### Step 2B: Run with Node.js only (lighter)

1. Install **Node.js 22 or newer** (the LTS version is fine): https://nodejs.org/
2. In the terminal, inside the `Signature` folder, run these one at a time:
   ```sh
   npm install
   npm run build
   npm start
   ```
3. Open **http://localhost:3001** in your browser.
4. To stop it, press `Ctrl + C` in the terminal. To start it again later, run only `npm start`.

PDFs work straight away. To also sign **Word** files, install LibreOffice (free), then restart with `npm start`:

- **macOS:** `brew install --cask libreoffice`, or download it from https://www.libreoffice.org/download/
- **Windows:** install it from https://www.libreoffice.org/download/. If Word files still show as unavailable, tell the app where LibreOffice is:
  ```bat
  set SOFFICE_PATH=C:\Program Files\LibreOffice\program\soffice.exe
  npm start
  ```
- **Ubuntu / Debian:** `sudo apt install libreoffice-writer libreoffice-draw`

When the server starts, it prints a line saying whether Word conversion is on.

---

## How to sign a document

1. **Open your document.** Drop a PDF or Word file onto the page, or click **Choose a file** (up to 20 MB).
2. **Make your signature.** Draw it with a mouse, finger or stylus, or upload a photo of your signature on white paper. It goes onto the page you're looking at.
3. **Place it.** Drag it anywhere, even onto another page. Pull a corner to resize it. Click it and press `Delete` to remove it, or use the arrow keys to nudge it. To add it again, click it in **Your signatures**.
4. **Save.** Click **Save**, choose **PDF** or **Word (.docx)**, and the signed file downloads. Your original file is never changed.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `port is already allocated` or `EADDRINUSE` | Port 3001 is already in use. For Node, start on another port: `PORT=4000 npm start` (Windows: `set PORT=4000` then `npm start`) and open http://localhost:4000. For Docker, change `"3001:3001"` to `"4000:3001"` in `docker-compose.yml`. |
| "Word conversion isn't available" | LibreOffice isn't installed or wasn't found. Use Docker, or install LibreOffice as described in Step 2B. |
| `Cannot connect to the Docker daemon` | Docker Desktop isn't running. Open it and wait until it's ready. |
| The first Docker start seems stuck | It's downloading LibreOffice (about 1 GB). Give it a few minutes. |
| `npm` or `node` is not recognised | Node.js isn't installed, or the terminal was opened before you installed it. Close and reopen the terminal. |
| "This PDF is password-protected" | Remove the password in your PDF reader first, then try again. |

---

## Hosting it online

Use the same Docker setup on any server. The container serves the website and the converter on port 3001.

```sh
docker compose up -d --build
# or
docker build -t free-document-signer .
docker run -d -p 3001:3001 --read-only --tmpfs /tmp:size=512m -e HOME=/tmp free-document-signer
```

It runs on any host that accepts a Dockerfile: a VPS, Fly.io, Render, Railway, Google Cloud Run, and others. Notes:

- **HTTPS:** put it behind your platform's TLS or a reverse proxy (Caddy, nginx).
- **Upload size:** if a proxy sits in front, allow request bodies of at least 21 MB (nginx: `client_max_body_size 21m;`).
- **Memory:** about 300–500 MB per running conversion. `MAX_JOBS` (default 2) limits how many run at once.
- **Health check:** `GET /api/health` returns `{"ok":true,"converter":true}`.

| Env var | Default | Meaning |
|---|---|---|
| `PORT` | `3001` | Listen port |
| `MAX_JOBS` | `2` | Conversions that run at the same time |
| `SOFFICE_PATH` | auto | Path to LibreOffice's `soffice` if it isn't found automatically |

**Static hosting (PDF only):** `npm run build` writes a static site to `dist/` that any static host can serve (Netlify, Vercel, GitHub Pages). Without the server, the app turns Word support off on its own and PDF signing still works fully. Add the security headers from `server/app.ts` to your host's configuration.

---

## Development

```sh
npm install
npm run server   # API on :3001, restarts when you edit server files
npm run dev      # app on http://localhost:5173 with live reload
```

```sh
npm run lint
npm run typecheck
npm test                       # LibreOffice tests are skipped if it isn't installed
docker build --target test .   # full suite, with real LibreOffice
```

Project layout: features live in `src/features/` (`upload`, `viewer`, `signature`, `placement`, `export`), shared code in `src/shared/`, and the conversion server in `server/`. Requirements and design are in [`docs/functional-specificatin.md`](docs/functional-specificatin.md) and [`docs/technical-specification.md`](docs/technical-specification.md).

Built with React, Vite, PDF.js, pdf-lib, JSZip, signature_pad, interact.js, Express and LibreOffice. All of them are free and open source.

## License

[MIT](LICENSE): free to use, change and share.
