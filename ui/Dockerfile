# ── Stage 1: build the SPA ────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps first (cached layer). package-lock.json present → npm ci.
COPY package.json package-lock.json* ./
RUN npm ci

# Vite inlines env vars at BUILD time, so the API base must be provided here.
# Override per environment:  docker build --build-arg VITE_API_BASE_URL=...
ARG VITE_API_BASE_URL=https://api-netra.flowbiz.id/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY . .
RUN npm run build   # tsc && vite build -> /app/dist

# ── Stage 1b: build the docs site (VitePress → /docs/) ────────────────────────
FROM node:20-alpine AS docs-builder

WORKDIR /docs-site

COPY docs-site/package.json docs-site/package-lock.json ./
RUN npm ci

COPY docs-site/ .
RUN npm run docs:build   # vitepress build -> .vitepress/dist

# ── Stage 2: serve static with nginx ──────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# Templated (history fallback, caching, security headers, per-session embed
# CSP). The base image's docker-entrypoint.d/20-envsubst-on-templates.sh runs
# `envsubst` on every *.template file here using only real env var names, so
# nginx's own $variables (e.g. $uri, $arg_token) pass through untouched —
# only ${EMBED_BACKEND_ORIGIN} below gets substituted.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Where the embed page's reverse proxy should look up token → return_origin
# (see nginx.conf.template's /internal/embed-frame-origin). This is only a
# same-network fallback (backend listens on 5170); every deployment should set
# EMBED_BACKEND_ORIGIN via its .env / container environment — split deploys
# with the public API URL (e.g. https://api-netra.flowbiz.id). Read at
# container start (envsubst), so changing it needs no image rebuild.
ENV EMBED_BACKEND_ORIGIN=http://backend:5170

COPY --from=builder /app/dist /usr/share/nginx/html
COPY --from=docs-builder /docs-site/.vitepress/dist /usr/share/nginx/html/docs

EXPOSE 80

# nginx runs in the foreground by default via its base image CMD.
