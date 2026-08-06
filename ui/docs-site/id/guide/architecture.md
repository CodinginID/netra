# Arsitektur & alur

Halaman ini menunjukkan cara kerja Netra dari ujung ke ujung, supaya Anda
bisa membayangkan sistemnya sebelum menyentuh apa pun.

## Gambaran sistem

<div class="arch-diagram">
<svg viewBox="0 0 760 640" role="img" aria-label="Diagram arsitektur sistem Netra" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="arr-id" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" class="amark"/>
    </marker>
  </defs>

  <rect class="abox" rx="12" x="10" y="16" width="232" height="84"/>
  <text class="at" x="26" y="48">Dashboard admin</text>
  <text class="ad" x="26" y="72">aplikasi web, login per peran</text>

  <rect class="abox" rx="12" x="264" y="16" width="232" height="84"/>
  <text class="at" x="280" y="48">Kiosk / kamera</text>
  <text class="ad" x="280" y="72">absensi di pintu masuk</text>

  <rect class="abox" rx="12" x="518" y="16" width="232" height="84"/>
  <text class="at" x="534" y="48">Aplikasi Anda (embed)</text>
  <text class="ad" x="534" y="72">enrollment mandiri via iframe</text>

  <path class="aln" marker-end="url(#arr-id)" d="M 126 100 C 126 130, 260 130, 300 148"/>
  <path class="aln" marker-end="url(#arr-id)" d="M 380 100 L 380 144"/>
  <path class="aln" marker-end="url(#arr-id)" d="M 634 100 C 634 130, 500 130, 460 148"/>

  <rect class="abox" rx="12" x="190" y="150" width="380" height="82"/>
  <text class="at" x="210" y="182">Gerbang akses</text>
  <text class="ad" x="210" y="206">sajikan app &amp; docs · security header · cek origin embed</text>

  <path class="aln" marker-end="url(#arr-id)" d="M 380 232 L 380 274"/>
  <text class="albl" x="396" y="258">request aman · realtime</text>

  <rect class="abox-brand" rx="12" x="30" y="278" width="700" height="196"/>
  <text class="at" x="50" y="310">Backend aplikasi</text>

  <rect class="achip" rx="10" x="50" y="326" width="320" height="60"/>
  <text class="ad ad-strong" x="66" y="350">API inti</text>
  <text class="ad" x="66" y="372">pengguna · perangkat · jadwal · laporan</text>

  <rect class="achip" rx="10" x="390" y="326" width="320" height="60"/>
  <text class="ad ad-strong" x="406" y="350">Event realtime</text>
  <text class="ad" x="406" y="372">dorong absensi ke dashboard</text>

  <rect class="achip" rx="10" x="50" y="398" width="320" height="60"/>
  <text class="ad ad-strong" x="66" y="422">Pencocokan wajah</text>
  <text class="ad" x="66" y="444">wajah → tanda tangan, dicocokkan per tenant</text>

  <rect class="achip" rx="10" x="390" y="398" width="320" height="60"/>
  <text class="ad ad-strong" x="406" y="422">Cek liveness</text>
  <text class="ad" x="406" y="444">tolak foto &amp; tayangan layar</text>

  <path class="aln" marker-end="url(#arr-id)" d="M 210 474 L 210 516"/>
  <path class="aln" marker-end="url(#arr-id)" d="M 550 474 L 550 516"/>

  <rect class="abox" rx="12" x="60" y="520" width="300" height="96"/>
  <text class="at" x="76" y="552">Penyimpanan data</text>
  <text class="ad" x="76" y="576">terisolasi per organisasi:</text>
  <text class="ad" x="76" y="596">orang · jadwal · absensi</text>

  <rect class="abox" rx="12" x="400" y="520" width="300" height="96"/>
  <text class="at" x="416" y="552">Sistem Anda</text>
  <text class="ad" x="416" y="576">webhook memberi tahu backend Anda</text>
  <text class="ad" x="416" y="596">setiap kali absensi tercatat</text>

  <path class="aln-dash" marker-end="url(#arr-id)" d="M 730 356 C 752 340, 752 60, 750 58"/>
  <text class="albl" x="580" y="130">pembaruan langsung</text>
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
