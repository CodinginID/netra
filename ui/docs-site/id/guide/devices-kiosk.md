# Perangkat & kiosk

**Kiosk** adalah tablet atau layar di pintu masuk yang mengenali wajah dan
mencatat kehadiran. Satu tenant bisa punya banyak kiosk — setiap perangkat
punya token sendiri.

## Daftarkan perangkat

1. Buka **Perangkat** di sidebar dan klik **Tambah Perangkat**.
2. Beri nama perangkat (mis. *Lobby-1*) lalu klik **Daftarkan**.
3. Salin **token perangkat** yang muncul dan pasang di kiosk.

Ulangi langkah ini untuk setiap kiosk tambahan.

## Siapkan kiosk

1. Di perangkat kiosk, buka halaman **/attendance** aplikasi.
2. Masukkan token perangkat saat diminta. Token mengautentikasi perangkat —
   tidak perlu login pengguna.
3. Izinkan akses kamera. Kiosk kini aktif dan akan menyapa karyawan yang
   dikenali dengan nama dan jam masuknya.

## Kelola perangkat

Menu **⋮** di setiap kartu perangkat berisi:

- **Lihat Token** — tampilkan lagi token perangkat bila lupa, tanpa
  menggantinya. Setiap kali dilihat, tercatat di log audit.
- **Reset Token** — buat token baru; token lama langsung tidak berlaku. Untuk
  perangkat yang sudah dicabut, pilihan ini bernama **Pulihkan Token** dan
  sekaligus mengaktifkannya kembali.
- **Cabut** — matikan token; perangkat tetap ada di daftar.
- **Hapus** — keluarkan perangkat dari daftar dan tokennya langsung tidak
  berlaku. Bisa dipulihkan dari **Tempat Sampah** dalam 30 hari.

::: tip Perangkat lama
Perangkat yang didaftarkan sebelum fitur **Lihat Token** ada perlu di-**Reset
Token** sekali. Setelah itu tokennya bisa dilihat kapan saja.
:::

::: warning Jaga kerahasiaan token
Siapa pun yang memegang token perangkat bisa bertindak sebagai kiosk itu, dan
admin tenant bisa melihat token kapan saja. Cabut atau hapus perangkat bila
hilang atau diganti.
:::
