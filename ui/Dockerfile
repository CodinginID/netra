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

# ── Stage 2: serve static with nginx ──────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# SPA-aware config (history fallback, caching, security headers)
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

# nginx runs in the foreground by default via its base image CMD.
