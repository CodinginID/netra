# Integrasi

Netra bisa disambungkan ke sistem yang sudah Anda pakai.

## Enrollment tertanam (embed)

Biarkan karyawan mendaftarkan wajah dari dalam portal HR **Anda**:

1. Backend Anda meminta **embed token sekali pakai** ke API Netra untuk
   karyawan tertentu.
2. Aplikasi Anda membuka halaman enrollment Netra di dalam iframe dengan
   token tersebut.
3. Token hanya berlaku sekali dan terkunci ke origin — frame hanya tampil di
   origin yang Anda daftarkan.

## Akses API

REST API Netra mencakup pengguna, enrollment, perangkat, jadwal, dan event
absensi. Hubungi administrator platform Anda untuk kredensial API dan
referensi endpoint.

::: tip Webhook & realtime
Event absensi didorong lewat WebSocket ke dashboard. Untuk kebutuhan
notifikasi server-ke-server, hubungi kami soal opsi webhook.
:::
