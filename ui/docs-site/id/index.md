# Apa itu Netra

Netra adalah **platform absensi tanpa sentuh** berbasis pengenalan wajah.
Kamera mengalirkan video ke backend Netra, yang mengenali wajah terdaftar
secara real-time dan mencatat kehadiran otomatis — tanpa kartu, tanpa sidik
jari, tanpa antre.

## Cara kerjanya

1. **Daftarkan wajah** — admin mendaftarkan wajah tiap karyawan dengan panduan pose.
2. **Kamera mengenali** — kiosk atau kamera area mendeteksi dan mencocokkan wajah secara real-time.
3. **Kehadiran tercatat** — absensi masuk ke dashboard seketika, dicocokkan dengan
   jadwal kerja karyawan.

## Konsep penting

| Istilah | Arti |
|---|---|
| **Tenant** | Ruang terisolasi milik organisasi Anda. Data tidak pernah dibagi antar tenant. |
| **Enrollment** | Proses satu kali mendaftarkan wajah karyawan. |
| **Kiosk** | Perangkat (tablet/layar) di pintu masuk yang menjalankan halaman absensi. |
| **Jadwal** | Jam kerja yang ditetapkan ke karyawan; keterlambatan dihitung dari sini. |

::: tip Isolasi data
Data tiap tenant diisolasi dengan Row-Level Security PostgreSQL. Pengguna di
satu organisasi tidak akan pernah bisa melihat data organisasi lain.
:::

## Selanjutnya

- [Masuk & peran pengguna](/id/guide/sign-in-roles) — akses dashboard
- [Enrollment wajah](/id/guide/enrollment) — daftarkan karyawan pertama Anda
- [Perangkat & kiosk](/id/guide/devices-kiosk) — pasang kiosk di pintu masuk
