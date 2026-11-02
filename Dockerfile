# syntax=docker/dockerfile:1

# ---- LibreOffice runtime base (pinned by the Debian release: bookworm ships LibreOffice 7.4) ----
FROM node:24-bookworm-slim AS lo-base
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libreoffice-writer-nogui libreoffice-draw-nogui \
      fonts-liberation fonts-dejavu fonts-crosextra-carlito fonts-crosextra-caladea \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- Dependencies and build ----
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Tests against a real LibreOffice: docker build --target test . ----
FROM lo-base AS test
COPY --from=build /app /app
RUN npm run lint && npm run typecheck && npm test

# ---- Production image ----
FROM lo-base AS runtime
ENV NODE_ENV=production PORT=3001 MAX_JOBS=2
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/server-dist ./server-dist
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server-dist/index.js"]
