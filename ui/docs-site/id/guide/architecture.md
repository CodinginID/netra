# Arsitektur & alur

Halaman ini menunjukkan cara kerja Netra dari ujung ke ujung, supaya Anda
bisa membayangkan sistemnya sebelum menyentuh apa pun.

## Gambaran sistem

<div class="arch-diagram">
<svg viewBox="0 0 960 420" role="img" aria-label="Diagram arsitektur sistem Netra" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="arr-id" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--vp-c-text-3)"/>
    </marker>
  </defs>
  <style>
    .box { fill: var(--vp-c-bg-soft); stroke: var(--vp-c-divider); rx: 10; }
    .box-brand { fill: var(--vp-c-brand-soft); stroke: var(--vp-c-brand-1); rx: 10; }
    .t { fill: var(--vp-c-text-1); font: 600 13px inherit; }
    .d { fill: var(--vp-c-text-2); font: 11px inherit; }
    .lbl { fill: var(--vp-c-text-3); font: 10px inherit; }
    .ln { stroke: var(--vp-c-text-3); stroke-width: 1.2; fill: none; marker-end: url(#arr-id); }
    .ln-dash { stroke: var(--vp-c-brand-1); stroke-width: 1.2; stroke-dasharray: 5 4; fill: none; marker-end: url(#arr-id); }
  </style>

  <rect class="box" x="16" y="30" width="180" height="66"/>
  <text class="t" x="30" y="56">Dashboard admin</text>
  <text class="d" x="30" y="74">React SPA · login JWT</text>

  <rect class="box" x="16" y="140" width="180" height="66"/>
  <text class="t" x="30" y="166">Kiosk / kamera</text>
  <text class="d" x="30" y="184">token perangkat · /attendance</text>

  <rect class="box" x="16" y="250" width="180" height="66"/>
  <text class="t" x="30" y="276">Aplikasi Anda (iframe)</text>
  <text class="d" x="30" y="294">embed token sekali pakai</text>

  <rect class="box" x="286" y="130" width="160" height="96"/>
  <text class="t" x="300" y="156">nginx</text>
  <text class="d" x="300" y="174">sajikan SPA + /docs</text>
  <text class="d" x="300" y="190">security header, CSP</text>
  <text class="d" x="300" y="206">cek frame-origin</text>

  <rect class="box-brand" x="536" y="46" width="220" height="270"/>
  <text class="t" x="552" y="74">Backend FastAPI</text>
  <rect class="box" x="552" y="90" width="188" height="44"/>
  <text class="d" x="564" y="108">REST API · /api/v1</text>
  <text class="lbl" x="564" y="124">auth, users, devices, reports…</text>
  <rect class="box" x="552" y="144" width="188" height="44"/>
  <text class="d" x="564" y="162">WebSocket · /ws</text>
  <text class="lbl" x="564" y="178">event realtime ke dashboard</text>
  <rect class="box" x="552" y="198" width="188" height="44"/>
  <text class="d" x="564" y="216">Mesin wajah (InsightFace)</text>
  <text class="lbl" x="564" y="232">embedding, di luar event loop</text>
  <rect class="box" x="552" y="252" width="188" height="44"/>
  <text class="d" x="564" y="270">Cek liveness</text>
  <text class="lbl" x="564" y="286">tolak foto & rekaman ulang</text>

  <rect class="box" x="816" y="106" width="130" height="120"/>
  <text class="t" x="830" y="132">PostgreSQL</text>
  <text class="d" x="830" y="152">Row-Level Security</text>
  <text class="lbl" x="830" y="170">users · jadwal</text>
  <text class="lbl" x="830" y="186">embedding wajah</text>
  <text class="lbl" x="830" y="202">event absensi</text>

  <rect class="box" x="816" y="270" width="130" height="60"/>
  <text class="t" x="830" y="294">Sistem Anda</text>
  <text class="d" x="830" y="312">webhook</text>

  <path class="ln" d="M 196 63 C 240 63, 250 160, 286 166"/>
  <path class="ln" d="M 196 173 L 286 177"/>
  <path class="ln" d="M 196 283 C 240 283, 250 200, 286 194"/>
  <path class="ln" d="M 446 178 L 536 180"/>
  <text class="lbl" x="458" y="168">HTTPS · WSS</text>
  <path class="ln" d="M 756 166 L 816 166"/>
  <path class="ln" d="M 756 290 L 816 298"/>
  <path class="ln-dash" d="M 646 46 C 646 -6, 180 -14, 108 30"/>
  <text class="lbl" x="320" y="16">pembaruan langsung (WebSocket)</text>
</svg>
</div>

## Komponen

| Komponen | Peran |
|---|---|
| **React SPA** | Landing, login, dan dashboard per peran. Bicara ke backend lewat `/api/v1` dan mendengarkan `/ws`. |
| **nginx** | Menyajikan build SPA dan dokumentasi ini (`/docs/`), memasang security header, dan menegakkan frame origin per token untuk embed. |
| **Backend FastAPI** | Semua logika bisnis: auth (JWT + peran), pengguna, perangkat, jadwal, absensi, laporan, webhook. |
| **Mesin wajah** | Embedding InsightFace dihitung di thread pool, sehingga pengenalan tidak pernah memblokir event loop API. |
| **PostgreSQL + RLS** | Satu database, terisolasi keras per tenant dengan Row-Level Security. Embedding wajah disimpan sebagai vektor per tenant. |
| **WebSocket** | Mendorong event absensi ke dashboard begitu terjadi. |

## Alur 1 — pengenalan → absensi

<div class="arch-flow">
  <div class="arch-step"><b>Frame kamera</b>Kiosk menangkap frame dan mengirimnya dengan token perangkat.</div>
  <div class="arch-step"><b>Auth + liveness</b>Backend memvalidasi token perangkat dan menolak foto/rekaman ulang.</div>
  <div class="arch-step"><b>Embedding</b>Mesin wajah menghitung vektor di thread pool.</div>
  <div class="arch-step"><b>Pencocokan</b>Vektor dibandingkan dengan embedding terdaftar milik tenant.</div>
  <div class="arch-step"><b>Pencatatan</b>Event absensi disimpan, dicocokkan dengan jadwal karyawan.</div>
  <div class="arch-step"><b>Notifikasi</b>Dashboard ter-update lewat WebSocket; webhook menembak ke sistem Anda.</div>
</div>

Dari ujung ke ujung prosesnya **di bawah satu detik** per frame.

## Alur 2 — enrollment

<div class="arch-flow">
  <div class="arch-step"><b>Mulai</b>Admin memulai enrollment — atau aplikasi Anda membuka halaman embed dengan token sekali pakai.</div>
  <div class="arch-step"><b>Pose terpandu</b>UI memandu karyawan: pose depan, kiri, dan kanan.</div>
  <div class="arch-step"><b>Penyimpanan</b>Tiap pose menjadi vektor embedding yang disimpan di bawah tenant.</div>
  <div class="arch-step"><b>Siap</b>Karyawan ditandai <i>Terdaftar</i> dan langsung dikenali kamera.</div>
</div>

## Multi-tenancy & keamanan

- **Row-Level Security** — setiap query berjalan dalam konteks tenant; satu
  organisasi tidak akan pernah bisa membaca baris milik organisasi lain,
  bahkan lewat bug di kode aplikasi.
- **Tiga jenis token** — JWT pengguna (dashboard, per peran), token perangkat
  (kiosk), dan embed token sekali pakai (enrollment mandiri di aplikasi Anda,
  terkunci frame-origin via CSP).
- **Deteksi liveness** — pengenalan menolak foto cetak dan tayangan layar
  sebelum pencocokan apa pun terjadi.

Lihat [Integrasi](/id/guide/integration) untuk cara menyambungkan sistem Anda.
