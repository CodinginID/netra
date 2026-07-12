# Arsitektur & alur

Halaman ini menunjukkan cara kerja Netra dari ujung ke ujung, supaya Anda
bisa membayangkan sistemnya sebelum menyentuh apa pun.

## Gambaran sistem

<div class="arch-diagram">
<svg viewBox="0 0 760 640" role="img" aria-label="Diagram arsitektur sistem Netra" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="arr-id" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
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
    .ln { stroke: var(--vp-c-text-3); stroke-width: 1.4; fill: none; marker-end: url(#arr-id); }
    .ln-dash { stroke: var(--vp-c-brand-1); stroke-width: 1.4; stroke-dasharray: 6 5; fill: none; marker-end: url(#arr-id); }
  </style>

  <rect class="box" x="10" y="16" width="232" height="84"/>
  <text class="t" x="26" y="48">Dashboard admin</text>
  <text class="d" x="26" y="72">aplikasi web, login per peran</text>

  <rect class="box" x="264" y="16" width="232" height="84"/>
  <text class="t" x="280" y="48">Kiosk / kamera</text>
  <text class="d" x="280" y="72">absensi di pintu masuk</text>

  <rect class="box" x="518" y="16" width="232" height="84"/>
  <text class="t" x="534" y="48">Aplikasi Anda (embed)</text>
  <text class="d" x="534" y="72">enrollment mandiri via iframe</text>

  <path class="ln" d="M 126 100 C 126 130, 260 130, 300 148"/>
  <path class="ln" d="M 380 100 L 380 144"/>
  <path class="ln" d="M 634 100 C 634 130, 500 130, 460 148"/>

  <rect class="box" x="190" y="150" width="380" height="82"/>
  <text class="t" x="210" y="182">Gerbang akses</text>
  <text class="d" x="210" y="206">sajikan app &amp; docs · security header · cek origin embed</text>

  <path class="ln" d="M 380 232 L 380 274"/>
  <text class="lbl" x="396" y="258">request aman · realtime</text>

  <rect class="box-brand" x="30" y="278" width="700" height="196"/>
  <text class="t" x="50" y="310">Backend aplikasi</text>

  <rect class="chip" x="50" y="326" width="320" height="60"/>
  <text class="d" x="66" y="350" style="font-weight:600; fill:var(--vp-c-text-1)">API inti</text>
  <text class="d" x="66" y="372">pengguna · perangkat · jadwal · laporan</text>

  <rect class="chip" x="390" y="326" width="320" height="60"/>
  <text class="d" x="406" y="350" style="font-weight:600; fill:var(--vp-c-text-1)">Event realtime</text>
  <text class="d" x="406" y="372">dorong absensi ke dashboard</text>

  <rect class="chip" x="50" y="398" width="320" height="60"/>
  <text class="d" x="66" y="422" style="font-weight:600; fill:var(--vp-c-text-1)">Pencocokan wajah</text>
  <text class="d" x="66" y="444">wajah → tanda tangan, dicocokkan per tenant</text>

  <rect class="chip" x="390" y="398" width="320" height="60"/>
  <text class="d" x="406" y="422" style="font-weight:600; fill:var(--vp-c-text-1)">Cek liveness</text>
  <text class="d" x="406" y="444">tolak foto &amp; tayangan layar</text>

  <path class="ln" d="M 210 474 L 210 516"/>
  <path class="ln" d="M 550 474 L 550 516"/>

  <rect class="box" x="60" y="520" width="300" height="96"/>
  <text class="t" x="76" y="552">Penyimpanan data</text>
  <text class="d" x="76" y="576">terisolasi per organisasi:</text>
  <text class="d" x="76" y="596">orang · jadwal · absensi</text>

  <rect class="box" x="400" y="520" width="300" height="96"/>
  <text class="t" x="416" y="552">Sistem Anda</text>
  <text class="d" x="416" y="576">webhook memberi tahu backend Anda</text>
  <text class="d" x="416" y="596">setiap kali absensi tercatat</text>

  <path class="ln-dash" d="M 730 356 C 752 340, 752 60, 750 58"/>
  <text class="lbl" x="580" y="130">pembaruan langsung</text>
</svg>
</div>

## Komponen

Tiap service punya satu tugas — tanpa perlu tahu detail implementasinya:

| Service | Tugasnya |
|---|---|
| **Dashboard admin** | Tempat admin dan supervisor mengelola orang, perangkat, jadwal, dan memantau absensi secara langsung. |
| **Kiosk** | Berjalan di pintu masuk; mengenali wajah dan mencatat absensi tanpa login pengguna. |
| **Gerbang akses** | Pintu depan tunggal: menyajikan aplikasi dan dokumentasi ini, memasang security header, dan menentukan origin mana yang boleh meng-embed halaman enrollment. |
| **API inti** | Logika bisnis: login dan peran, pengguna, perangkat, jadwal, absensi, laporan. |
| **Pencocokan wajah** | Mengubah gambar wajah menjadi tanda tangan numerik dan membandingkannya dengan tanda tangan terdaftar milik organisasi — dijalankan di luar jalur request utama supaya API tetap cepat. |
| **Cek liveness** | Menolak foto cetak dan tayangan layar sebelum pencocokan apa pun terjadi. |
| **Event realtime** | Mengalirkan setiap event absensi ke dashboard begitu terjadi. |
| **Penyimpanan data** | Satu database, terisolasi keras per organisasi: orang, jadwal, tanda tangan wajah, riwayat absensi. |

## Alur 1 — pengenalan → absensi

<div class="arch-flow">
  <div class="arch-step"><b>Frame kamera</b>Kiosk menangkap frame dan mengirimnya dengan token perangkat.</div>
  <div class="arch-step"><b>Auth + liveness</b>Backend memvalidasi token perangkat dan menolak foto/tayangan ulang.</div>
  <div class="arch-step"><b>Tanda tangan</b>Wajah diubah menjadi tanda tangan numerik, di luar jalur request utama.</div>
  <div class="arch-step"><b>Pencocokan</b>Tanda tangan dibandingkan dengan orang terdaftar milik organisasi.</div>
  <div class="arch-step"><b>Pencatatan</b>Event absensi disimpan, dicocokkan dengan jadwal karyawan.</div>
  <div class="arch-step"><b>Notifikasi</b>Dashboard ter-update realtime; webhook menembak ke sistem Anda.</div>
</div>

Dari ujung ke ujung prosesnya **di bawah satu detik** per frame.

## Alur 2 — enrollment

<div class="arch-flow">
  <div class="arch-step"><b>Mulai</b>Admin memulai enrollment — atau aplikasi Anda membuka halaman embed dengan token sekali pakai.</div>
  <div class="arch-step"><b>Pose terpandu</b>UI memandu karyawan: pose depan, kiri, dan kanan.</div>
  <div class="arch-step"><b>Penyimpanan</b>Tiap pose menjadi tanda tangan wajah yang disimpan di bawah organisasi Anda.</div>
  <div class="arch-step"><b>Siap</b>Karyawan ditandai <i>Terdaftar</i> dan langsung dikenali kamera.</div>
</div>

## Multi-tenancy & keamanan

- **Isolasi tenant yang keras** — setiap request berjalan dalam konteks satu
  organisasi, ditegakkan di lapisan data; satu organisasi tidak akan pernah
  bisa membaca data organisasi lain, bahkan lewat bug aplikasi.
- **Tiga jenis token** — token login pengguna (dashboard, per peran), token
  perangkat (kiosk), dan embed token sekali pakai (enrollment mandiri di
  aplikasi Anda, terkunci ke origin Anda).
- **Deteksi liveness** — pengenalan menolak foto cetak dan tayangan layar
  sebelum pencocokan apa pun terjadi.

Lihat [Integrasi](/id/guide/integration) untuk cara menyambungkan sistem Anda.
