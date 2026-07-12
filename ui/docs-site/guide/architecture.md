# Architecture & flow

This page shows how Netra works end to end, so you can picture the system
before touching anything.

## System overview

<div class="arch-diagram">
<svg viewBox="0 0 760 640" role="img" aria-label="Netra system architecture diagram" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--vp-c-text-3)"/>
    </marker>
  </defs>
  <style>
    .box { fill: var(--vp-c-bg-soft); stroke: var(--vp-c-divider); rx: 12; }
    .box-brand { fill: var(--vp-c-brand-soft); stroke: var(--vp-c-brand-1); rx: 12; }
    .chip { fill: var(--vp-c-bg); stroke: var(--vp-c-divider); rx: 10; }
    .t { fill: var(--vp-c-text-1); font: 600 15px inherit; }
    .d { fill: var(--vp-c-text-2); font: 12.5px inherit; }
    .lbl { fill: var(--vp-c-text-3); font: 12px inherit; }
    .ln { stroke: var(--vp-c-text-3); stroke-width: 1.4; fill: none; marker-end: url(#arr); }
    .ln-dash { stroke: var(--vp-c-brand-1); stroke-width: 1.4; stroke-dasharray: 6 5; fill: none; marker-end: url(#arr); }
  </style>

  <!-- row 1: clients -->
  <rect class="box" x="10" y="16" width="232" height="84"/>
  <text class="t" x="26" y="48">Admin dashboard</text>
  <text class="d" x="26" y="72">web app, sign-in per role</text>

  <rect class="box" x="264" y="16" width="232" height="84"/>
  <text class="t" x="280" y="48">Kiosk / camera</text>
  <text class="d" x="280" y="72">attendance at the entrance</text>

  <rect class="box" x="518" y="16" width="232" height="84"/>
  <text class="t" x="534" y="48">Your app (embed)</text>
  <text class="d" x="534" y="72">self-enrollment via iframe</text>

  <!-- arrows to gateway -->
  <path class="ln" d="M 126 100 C 126 130, 260 130, 300 148"/>
  <path class="ln" d="M 380 100 L 380 144"/>
  <path class="ln" d="M 634 100 C 634 130, 500 130, 460 148"/>

  <!-- row 2: gateway -->
  <rect class="box" x="190" y="150" width="380" height="82"/>
  <text class="t" x="210" y="182">Access gateway</text>
  <text class="d" x="210" y="206">serves app &amp; docs · security headers · embed origin check</text>

  <path class="ln" d="M 380 232 L 380 274"/>
  <text class="lbl" x="396" y="258">secure requests · realtime</text>

  <!-- row 3: backend -->
  <rect class="box-brand" x="30" y="278" width="700" height="196"/>
  <text class="t" x="50" y="310">Application backend</text>

  <rect class="chip" x="50" y="326" width="320" height="60"/>
  <text class="d" x="66" y="350" style="font-weight:600; fill:var(--vp-c-text-1)">Core API</text>
  <text class="d" x="66" y="372">users · devices · schedules · reports</text>

  <rect class="chip" x="390" y="326" width="320" height="60"/>
  <text class="d" x="406" y="350" style="font-weight:600; fill:var(--vp-c-text-1)">Realtime events</text>
  <text class="d" x="406" y="372">pushes attendance to the dashboard</text>

  <rect class="chip" x="50" y="398" width="320" height="60"/>
  <text class="d" x="66" y="422" style="font-weight:600; fill:var(--vp-c-text-1)">Face matching</text>
  <text class="d" x="66" y="444">face → signature, matched per tenant</text>

  <rect class="chip" x="390" y="398" width="320" height="60"/>
  <text class="d" x="406" y="422" style="font-weight:600; fill:var(--vp-c-text-1)">Liveness check</text>
  <text class="d" x="406" y="444">rejects photos &amp; screen replays</text>

  <!-- arrows to row 4 -->
  <path class="ln" d="M 210 474 L 210 516"/>
  <path class="ln" d="M 550 474 L 550 516"/>

  <!-- row 4: data & external -->
  <rect class="box" x="60" y="520" width="300" height="96"/>
  <text class="t" x="76" y="552">Data store</text>
  <text class="d" x="76" y="576">isolated per organization:</text>
  <text class="d" x="76" y="596">people · schedules · attendance</text>

  <rect class="box" x="400" y="520" width="300" height="96"/>
  <text class="t" x="416" y="552">Your systems</text>
  <text class="d" x="416" y="576">webhooks notify your backend</text>
  <text class="d" x="416" y="596">whenever attendance is recorded</text>

  <!-- realtime back to dashboard -->
  <path class="ln-dash" d="M 730 356 C 752 340, 752 60, 750 58"/>
  <text class="lbl" x="562" y="130" transform="rotate(0)">live updates</text>
</svg>
</div>

## Components

Each service has one job — no implementation details needed to use them:

| Service | What it does |
|---|---|
| **Admin dashboard** | Where admins and supervisors manage people, devices, schedules, and watch attendance live. |
| **Kiosk** | Runs at the entrance; recognizes faces and records attendance without any user login. |
| **Access gateway** | The single front door: serves the app and these docs, applies security headers, and decides which origin may embed the enrollment page. |
| **Core API** | Business logic: sign-in and roles, users, devices, schedules, attendance, reports. |
| **Face matching** | Turns a face image into a numeric signature and compares it against the organization's enrolled signatures — kept off the main request path so the API stays fast. |
| **Liveness check** | Rejects printed photos and screen replays before any matching happens. |
| **Realtime events** | Streams every attendance event to the dashboard the moment it happens. |
| **Data store** | One database, hard-isolated per organization: people, schedules, face signatures, attendance history. |

## Flow 1 — recognition → attendance

<div class="arch-flow">
  <div class="arch-step"><b>Camera frame</b>The kiosk captures a frame and sends it with its device token.</div>
  <div class="arch-step"><b>Auth + liveness</b>The backend validates the device token and rejects photos/replays.</div>
  <div class="arch-step"><b>Signature</b>The face is converted into a numeric signature, off the main request path.</div>
  <div class="arch-step"><b>Match</b>The signature is compared against the organization's enrolled people.</div>
  <div class="arch-step"><b>Record</b>An attendance event is stored, matched to the employee's schedule.</div>
  <div class="arch-step"><b>Notify</b>The dashboard updates in realtime; webhooks fire to your systems.</div>
</div>

End to end this takes **under a second** per frame.

## Flow 2 — enrollment

<div class="arch-flow">
  <div class="arch-step"><b>Start</b>An admin starts enrollment — or your app opens the embed page with a one-time token.</div>
  <div class="arch-step"><b>Guided poses</b>The UI walks the employee through front, left, and right poses.</div>
  <div class="arch-step"><b>Store</b>Each pose becomes a face signature stored under your organization.</div>
  <div class="arch-step"><b>Ready</b>The employee is marked <i>Enrolled</i> and cameras recognize them immediately.</div>
</div>

## Multi-tenancy & security

- **Hard tenant isolation** — every request runs inside one organization's
  context, enforced at the data layer; one organization can never read
  another's data, even through an application bug.
- **Three token types** — user sign-in tokens (dashboard, role-based),
  device tokens (kiosks), and single-use embed tokens (self-enrollment
  inside your app, locked to your origin).
- **Liveness detection** — recognition rejects printed photos and screen
  replays before any matching happens.

See [Integration](/guide/integration) for how to plug your own systems in.
