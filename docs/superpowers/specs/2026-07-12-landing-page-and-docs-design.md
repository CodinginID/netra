# Landing Page & Public Documentation — Design

**Date:** 2026-07-12
**Status:** Approved (visual direction validated via artifact mockup, revision 3)

## Goal

Give Netra a public face: a futuristic landing page at `/` and a bilingual
user-guide documentation site at `/docs`, without touching the existing
login flow or dashboards.

## Decisions

| Topic | Decision |
|---|---|
| Landing placement | Route `/` inside the existing React SPA |
| Docs | VitePress static site, served by nginx at `/docs/` |
| CTA | Single primary action: "Schedule a Demo" (B2B, no self-signup). Navbar holds only "Sign in" + language switch |
| Language | Bilingual EN/ID via existing `i18nStore` + `locales/*.json`; landing defaults to **English** on first visit (no persisted locale) |
| Visual direction | Dark futuristic, single-theme by design: ~600-particle rotating 3D head with biometric scan sweep (vanilla canvas 2D, no new deps), glass/bento tiles with 3D hover tilt, terminal-style live feed strip. App & docs remain theme-aware |
| Login page | Add a prominent, glowing "Documentation" button linking to `/docs/` |

## Components

- `ui/src/pages/landing/LandingPage.tsx` — nav, hero, stats, bento features,
  how-it-works, live-feed strip, CTA band, footer. All copy via `landing.*`
  i18n keys.
- `ui/src/pages/landing/FaceOrb.tsx` — canvas particle head. Pauses when tab
  hidden; renders a single static frame under `prefers-reduced-motion`.
- `ui/src/styles/landing.css` — self-contained dark palette (landing-scoped
  `--lp-*` vars), does not alter the app design system.
- `ui/src/pages/RootRedirect.tsx` — authenticated users still bounce to their
  dashboard; unauthenticated visitors now see `LandingPage` instead of
  redirecting to `/login`.
- `ui/docs-site/` — VitePress project; root locale EN (`/docs/guide/…`),
  Indonesian mirror at `/docs/id/guide/…`. Sidebar mirrors the app menu.
- `ui/nginx.conf.template` — `location /docs/` static serving.
- `ui/Dockerfile` — extra build stage for the docs site, output copied to
  `/usr/share/nginx/html/docs`.

## Error handling / edge cases

- Reduced motion → static orb frame, no tilt, no float animations.
- Tab hidden → orb rAF loop stops (visibilitychange).
- Landing never blocks auth: `/login`, `/attendance` (kiosk), `/embed/*`
  routes unchanged.
- Docs 404s fall back to VitePress' own 404 page, not the SPA.

## Testing

- `npm run build` (tsc + vite) must pass.
- Docs: `vitepress build` must pass.
- Manual: `/` shows landing (logged out), redirects to dashboard (logged in);
  EN/ID toggle switches copy and persists; `/docs/` serves EN, `/docs/id/` ID;
  login page shows the docs button.
