# Architecture & flow

This page shows how Netra works end to end, so you can picture the system
before touching anything.

## System overview

<div class="arch-diagram">
<svg viewBox="0 0 960 420" role="img" aria-label="Netra system architecture diagram" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--vp-c-text-3)"/>
    </marker>
  </defs>
  <style>
    .box { fill: var(--vp-c-bg-soft); stroke: var(--vp-c-divider); rx: 10; }
    .box-brand { fill: var(--vp-c-brand-soft); stroke: var(--vp-c-brand-1); rx: 10; }
    .t { fill: var(--vp-c-text-1); font: 600 13px inherit; }
    .d { fill: var(--vp-c-text-2); font: 11px inherit; }
    .lbl { fill: var(--vp-c-text-3); font: 10px inherit; }
    .ln { stroke: var(--vp-c-text-3); stroke-width: 1.2; fill: none; marker-end: url(#arr); }
    .ln-dash { stroke: var(--vp-c-brand-1); stroke-width: 1.2; stroke-dasharray: 5 4; fill: none; marker-end: url(#arr); }
  </style>

  <!-- clients -->
  <rect class="box" x="16" y="30" width="180" height="66"/>
  <text class="t" x="30" y="56">Admin dashboard</text>
  <text class="d" x="30" y="74">React SPA · JWT login</text>

  <rect class="box" x="16" y="140" width="180" height="66"/>
  <text class="t" x="30" y="166">Kiosk / camera</text>
  <text class="d" x="30" y="184">device token · /attendance</text>

  <rect class="box" x="16" y="250" width="180" height="66"/>
  <text class="t" x="30" y="276">Your app (iframe)</text>
  <text class="d" x="30" y="294">one-time embed token</text>

  <!-- nginx -->
  <rect class="box" x="286" y="130" width="160" height="96"/>
  <text class="t" x="300" y="156">nginx</text>
  <text class="d" x="300" y="174">serves SPA + /docs</text>
  <text class="d" x="300" y="190">security headers, CSP</text>
  <text class="d" x="300" y="206">frame-origin check</text>

  <!-- backend -->
  <rect class="box-brand" x="536" y="46" width="220" height="270"/>
  <text class="t" x="552" y="74">FastAPI backend</text>
  <rect class="box" x="552" y="90" width="188" height="44"/>
  <text class="d" x="564" y="108">REST API · /api/v1</text>
  <text class="lbl" x="564" y="124">auth, users, devices, reports…</text>
  <rect class="box" x="552" y="144" width="188" height="44"/>
  <text class="d" x="564" y="162">WebSocket · /ws</text>
  <text class="lbl" x="564" y="178">realtime events to dashboard</text>
  <rect class="box" x="552" y="198" width="188" height="44"/>
  <text class="d" x="564" y="216">Face engine (InsightFace)</text>
  <text class="lbl" x="564" y="232">embeddings, off the event loop</text>
  <rect class="box" x="552" y="252" width="188" height="44"/>
  <text class="d" x="564" y="270">Liveness check</text>
  <text class="lbl" x="564" y="286">rejects photos & replays</text>

  <!-- db -->
  <rect class="box" x="816" y="106" width="130" height="120"/>
  <text class="t" x="830" y="132">PostgreSQL</text>
  <text class="d" x="830" y="152">Row-Level Security</text>
  <text class="lbl" x="830" y="170">users · schedules</text>
  <text class="lbl" x="830" y="186">face embeddings</text>
  <text class="lbl" x="830" y="202">attendance events</text>

  <!-- webhooks -->
  <rect class="box" x="816" y="270" width="130" height="60"/>
  <text class="t" x="830" y="294">Your systems</text>
  <text class="d" x="830" y="312">webhooks</text>

  <!-- arrows -->
  <path class="ln" d="M 196 63 C 240 63, 250 160, 286 166"/>
  <path class="ln" d="M 196 173 L 286 177"/>
  <path class="ln" d="M 196 283 C 240 283, 250 200, 286 194"/>
  <path class="ln" d="M 446 178 L 536 180"/>
  <text class="lbl" x="458" y="168">HTTPS · WSS</text>
  <path class="ln" d="M 756 166 L 816 166"/>
  <path class="ln" d="M 756 290 L 816 298"/>
  <path class="ln-dash" d="M 646 46 C 646 -6, 180 -14, 108 30"/>
  <text class="lbl" x="320" y="16">live updates (WebSocket)</text>
</svg>
</div>

## Components

| Component | Role |
|---|---|
| **React SPA** | Landing, login, and the role-based dashboards. Talks to the backend via `/api/v1` and listens on `/ws`. |
| **nginx** | Serves the SPA build and these docs (`/docs/`), sets security headers, and enforces the per-token frame origin for embeds. |
| **FastAPI backend** | All business logic: auth (JWT + roles), users, devices, schedules, attendance, reports, webhooks. |
| **Face engine** | InsightFace embeddings computed in a worker thread pool, so recognition never blocks the API event loop. |
| **PostgreSQL + RLS** | One database, hard-isolated per tenant with Row-Level Security. Face embeddings are stored as vectors per tenant. |
| **WebSocket** | Pushes attendance events to the dashboard the moment they happen. |

## Flow 1 — recognition → attendance

<div class="arch-flow">
  <div class="arch-step"><b>Camera frame</b>The kiosk captures a frame and sends it with its device token.</div>
  <div class="arch-step"><b>Auth + liveness</b>The backend validates the device token and rejects photos/replays.</div>
  <div class="arch-step"><b>Embedding</b>The face engine computes a vector in the thread pool.</div>
  <div class="arch-step"><b>Match</b>The vector is compared against the tenant's enrolled embeddings.</div>
  <div class="arch-step"><b>Record</b>An attendance event is stored, matched to the employee's schedule.</div>
  <div class="arch-step"><b>Notify</b>The dashboard updates over WebSocket; webhooks fire to your systems.</div>
</div>

End to end this takes **under a second** per frame.

## Flow 2 — enrollment

<div class="arch-flow">
  <div class="arch-step"><b>Start</b>An admin starts enrollment — or your app opens the embed page with a one-time token.</div>
  <div class="arch-step"><b>Guided poses</b>The UI walks the employee through front, left, and right poses.</div>
  <div class="arch-step"><b>Store</b>Each pose becomes an embedding vector stored under the tenant.</div>
  <div class="arch-step"><b>Ready</b>The employee is marked <i>Enrolled</i> and cameras recognize them immediately.</div>
</div>

## Multi-tenancy & security

- **Row-Level Security** — every query runs inside a tenant context; one
  organization can never read another's rows, even through a bug in
  application code.
- **Three token types** — user JWTs (dashboard, role-based), device tokens
  (kiosks), and single-use embed tokens (self-enrollment inside your app,
  frame-origin locked via CSP).
- **Liveness detection** — recognition rejects printed photos and screen
  replays before any matching happens.

See [Integration](/guide/integration) for how to plug your own systems in.
