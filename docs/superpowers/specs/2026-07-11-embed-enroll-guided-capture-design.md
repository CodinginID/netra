# Embed Enrollment — Guided Face Capture Design

## Problem

The chromeless embed enrollment page (`/embed/enroll?token=...`, [EmbedEnrollPage.tsx](../../../ui/src/pages/embed/EmbedEnrollPage.tsx)) shows a raw camera feed and a single "Ambil & Daftarkan" button with no live guidance. A user landing in this iframe has no indication of what to do, how to position their face, or that anything is happening — unlike the kiosk self-enrollment flow ([SelfEnrollPage.tsx](../../../ui/src/pages/kiosk/SelfEnrollPage.tsx)), which has a live face-detection overlay, an animated oval guide, and per-angle instructions with a countdown.

## Goal

Bring the embed enrollment camera step to the same guided-capture experience as the kiosk self-enroll flow: live face-detection overlay, animated oval guide, and clear per-step instructions — while keeping the embed page's existing chromeless/light card shell (it must remain embeddable inside any tenant's page).

## Scope

- Only `ui/src/pages/embed/EmbedEnrollPage.tsx` and a new hook `ui/src/hooks/useGuidedCapture.ts`.
- Reuses existing, working pieces: `useFaceDetection` hook, `kiosk.css` / `selfenroll.css` classes.
- No backend changes — `POST /embed/enroll` already accepts 1–3 images (see [embed.py](../../../backend/app/api/v1/embed.py)).
- `SelfEnrollPage.tsx` / kiosk flow is NOT touched or refactored — it already works; this task doesn't share the new hook with it, to avoid regression risk on an unrelated working page.
- No i18n migration — the embed page has no `useI18n` usage today; new copy is hardcoded Indonesian strings matching the file's existing convention.
- No new automated frontend tests — this is a visual/interactive camera flow, best verified manually via the dev server.

## Current behavior (baseline)

Phase machine: `loading → invalid → consent → camera → submitting → success → error`.

`camera` phase today: plain `<video>` element, manual capture button, single image submitted.

## New behavior

The `consent`, `submitting`, `success`, `error`, `invalid`, `loading` phases are unchanged. The `camera` phase becomes a guided 3-angle sequence:

1. **Front** (3s countdown) → **Left** (4s) → **Right** (4s) — each phase shows:
   - Live face-detection overlay (bounding box + corner brackets), via the existing `useFaceDetection` hook, drawn over the video.
   - An animated oval HUD guide (shown when no face detected — same as kiosk), reusing `.kiosk-hud` / `.kiosk-hud-svg` markup.
   - A bottom gradient overlay with the step label ("Hadapkan wajah lurus ke kamera", "Putar wajah ke kiri", "Putar wajah ke kanan"), a directional arrow for left/right, a countdown progress bar, and step number (`1/3`, `2/3`, `3/3`) — reusing `.selfenroll-phase-overlay`, `.selfenroll-phase-label`, `.selfenroll-arrow`, `.selfenroll-countdown-*`, `.selfenroll-phase-num` classes from `selfenroll.css`.
   - Phase progress dots above the video (`.selfenroll-phase-dots`).
2. **Preview**: after all 3 frames are captured, show 3 thumbnails (front/left/right) with **Ulangi** (retake, restarts the sequence) and **Lanjut** (proceeds to submit) actions — reusing `.selfenroll-previews` / `.selfenroll-preview-thumb` and `.kiosk-actions` / `.kiosk-btn` classes.
3. On **Lanjut**, `submit()` runs exactly as today (POST to `/embed/enroll` with `X-Embed-Token`), except `images` now contains all 3 captured blobs instead of 1.

The countdown / auto-advance timer is NOT gated on `hasFace` — it runs on a fixed schedule regardless of detection state, identical to `SelfEnrollPage`'s `runCaptureSequence`. Face detection is a visual affordance only; if the MediaPipe model fails to load (e.g. CDN unreachable), the sequence still proceeds without the overlay — enrollment is never blocked by it.

The video capture frame is mirrored the same way `SelfEnrollPage.captureFrame` does (`ctx.scale(-1, 1)` before draw), for consistency with the CSS-mirrored `<video>` preview.

Visual theme: the surrounding card/page stays in its current light theme (white card, gray page background) — only the camera box and its overlays use the dark kiosk styling (video boxes are inherently dark regardless of page theme).

## New hook: `useGuidedCapture`

Encapsulates the state machine that today lives inline in `SelfEnrollPage` (`capturePhase`, `countdown`, `capturedBlobs`, `previewUrls`, `runCaptureSequence`, `retake`), parameterized by phase config (labels/hints/durations/arrows) and a `captureFrame` callback (video/canvas refs passed in). Used only by `EmbedEnrollPage` — kept as a standalone hook (not wired into `SelfEnrollPage`) to avoid touching a working, unrelated page.

## Error handling

- Camera permission denied / unavailable: unchanged, existing `catch` block sets `phase: 'error'`.
- Face-detector load failure: silently degrades (existing behavior in `useFaceDetection` — logs a warning, `detectorReady` stays false, overlay just doesn't draw).
- Submit failure (4xx/5xx from `/embed/enroll`): unchanged — shows `error` phase with server message, `notifyParent` still fires `enroll:error`.

## Testing / verification

Manual: start the UI dev server, open `/embed/enroll?token=<valid embed session token>`, and walk through consent → front/left/right guided capture → preview/retake → submit → success, confirming:
- Oval guide animates presence/absence of a detected face.
- Countdown bar and step text update each phase.
- Retake restarts the 3-angle sequence cleanly (no stale timers/blobs).
- Submitted `images` array contains all 3 captured frames server-side (or check network tab).

No automated frontend test is added for this camera UI, matching the lack of existing coverage for `SelfEnrollPage`'s equivalent flow.
