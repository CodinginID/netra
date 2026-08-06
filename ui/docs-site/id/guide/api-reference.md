# Referensi API Integrasi

Referensi resmi untuk Integration API Netra — permukaan yang dipanggil aplikasi
Anda sendiri untuk menarik data absensi dan menyinkronkan roster. Berikan
halaman ini ke developer Anda.

- **Base URL:** `https://api-netra.flowbiz.id/api/v1`
- Semua endpoint di bawah diawali `/integration`.
- Semua data **otomatis terikat ke organisasi Anda** — Anda tidak akan pernah
  melihat atau menyentuh data tenant lain.

## Autentikasi

Setiap permintaan harus membawa API key Anda, salah satu header berikut:

```
X-API-Key: ntr_live_xxxxxxxxxxxxxxxxxxxx
```
```
Authorization: Bearer ntr_live_xxxxxxxxxxxxxxxxxxxx
```

::: warning Simpan key di server Anda
API key bersifat **server-to-server**. Simpan di backend Anda dan sediakan route
proxy tipis untuk frontend — jangan pernah kirim key ke browser. Bila bocor,
Reset atau Cabut dari menu **Integrasi & API** di dashboard admin Netra.
:::

Buat & kelola key di menu **Integrasi & API** pada dashboard admin. Setiap key
diberi satu atau lebih **scope**:

| Scope | Memberi akses |
|-------|---------------|
| `attendance:read` | Baca catatan & laporan kehadiran |
| `users:read` | Baca daftar pengguna + status enrolled |
| `users:write` | Buat/perbarui pengguna via sinkronisasi (upsert by `external_id`) |
| `embed:enroll` | Mint sesi embed untuk enrollment wajah |

Permintaan dengan key yang tidak punya scope yang diperlukan ditolak `403`.

## Format respons

Setiap respons — sukses maupun error — memakai envelope yang sama:

```json
{ "data": ..., "error": null }
```

Saat error, `data` bernilai `null` dan `error` berisi pesan:

```json
{ "data": null, "error": "API key missing required scope: users:write" }
```

Daftar (list) dipaginasi di dalam `data`:

```json
{ "data": { "items": [ ... ], "total": 128, "page": 1, "limit": 50, "pages": 3 }, "error": null }
```

## Error

| Status | Arti |
|--------|------|
| `401` | API key hilang / salah / dicabut / kedaluwarsa |
| `403` | Key valid tapi tidak punya scope yang diperlukan (atau origin tidak diizinkan, untuk embed) |
| `422` | Permintaan tidak valid (format tanggal salah, batch kosong, melebihi batas 500, dll.) |

---

## GET /integration/attendance

Catatan kehadiran (paginated), terbaru dulu. Scope: `attendance:read`.

**Parameter query**

| Param | Tipe | Default | Catatan |
|-------|------|---------|---------|
| `page` | int | `1` | Nomor halaman (≥ 1) |
| `limit` | int | `50` | Item per halaman (1–1000) |
| `user_id` | string | — | Filter ke satu pengguna |
| `from` | date | — | `YYYY-MM-DD`, inklusif |
| `to` | date | — | `YYYY-MM-DD`, inklusif |

```bash
curl -H "X-API-Key: ntr_live_xxxxx" \
  "https://api-netra.flowbiz.id/api/v1/integration/attendance?from=2026-06-01&to=2026-06-30&page=1&limit=50"
```

**Respons**

```json
{
  "data": {
    "items": [
      { "id": "…", "user_id": "…", "type": "check_in", "status": "on_time",
        "occurred_at": "2026-06-25T08:01:12+07:00", "liveness_score": 0.99,
        "device_id": "…",
        "location": { "lat": -6.2, "lng": 106.8, "outside_geofence": false } }
    ],
    "total": 1, "page": 1, "limit": 50, "pages": 1
  },
  "error": null
}
```

---

## GET /integration/attendance/daily-status

Roster harian: setiap pengguna aktif dengan statusnya pada satu hari. Scope:
`attendance:read`.

**Parameter query**

| Param | Tipe | Wajib | Catatan |
|-------|------|-------|---------|
| `date` | date | ya | `YYYY-MM-DD` |

```bash
curl -H "X-API-Key: ntr_live_xxxxx" \
  "https://api-netra.flowbiz.id/api/v1/integration/attendance/daily-status?date=2026-06-25"
```

**Respons** — `data` berupa array datar (tidak dipaginasi):

```json
{
  "data": [
    { "user_id": "…", "full_name": "Budi Santoso", "external_id": "EMP-001",
      "status": "present", "check_in_at": "2026-06-25T08:01:12+07:00",
      "check_out_at": null }
  ],
  "error": null
}
```

`status` bernilai salah satu dari `absent`, `present`, `late`, `checked_out`.

---

## GET /integration/users

Daftar pengguna (paginated) beserta flag enrolled. Scope: `users:read`.

**Parameter query**

| Param | Tipe | Default | Catatan |
|-------|------|---------|---------|
| `page` | int | `1` | Nomor halaman (≥ 1) |
| `limit` | int | `50` | Item per halaman (1–1000) |

```bash
curl -H "X-API-Key: ntr_live_xxxxx" \
  "https://api-netra.flowbiz.id/api/v1/integration/users?page=1&limit=50"
```

**Respons**

```json
{
  "data": {
    "items": [
      { "id": "usr_…", "full_name": "Budi Santoso", "external_id": "EMP-001",
        "enrolled": true, "is_active": true, "created_at": "2026-06-01T09:00:00Z" }
    ],
    "total": 1, "page": 1, "limit": 50, "pages": 1
  },
  "error": null
}
```

---

## POST /integration/users

Dorong daftar karyawan Anda **ke dalam** Netra agar datanya sudah ada sebelum
ada yang enroll. Scope: `users:write`.

Dikunci dengan `external_id` milik Anda, jadi panggilan ini **idempotent** —
`external_id` yang sudah ada akan diperbarui (`full_name`-nya disegarkan), bukan
diduplikasi. Anda aman mengirim ulang seluruh roster kapan saja. Karyawan yang
sempat dihapus lalu dikirim ulang akan diaktifkan kembali. Pengguna yang dibuat
di sini nanti menyatu dengan enrollment wajah pada `external_id` yang sama, dan
muncul di menu **Kelola Pengguna** pada dashboard admin Anda.

**Body permintaan** — satu objek, atau array untuk sync massal (**maks 500 per
permintaan**):

| Field | Tipe | Catatan |
|-------|------|---------|
| `external_id` | string | Wajib, 1–255 karakter. ID stabil milik Anda. |
| `full_name` | string | Wajib, 1–255 karakter. |

```bash
curl -X POST "https://api-netra.flowbiz.id/api/v1/integration/users" \
  -H "X-API-Key: ntr_live_xxxxx" -H "Content-Type: application/json" \
  -d '[{"external_id":"EMP-001","full_name":"Budi Santoso"},
       {"external_id":"EMP-002","full_name":"Siti Aminah"}]'
```

**Respons** — memastikan persis apa yang terjadi. Setiap baris membawa flag
`created` (`true` = baru dibuat, `false` = cocok & diperbarui), plus `summary`
untuk keseluruhan batch:

```json
{
  "data": {
    "items": [
      { "id": "usr_…", "full_name": "Budi Santoso", "external_id": "EMP-001",
        "enrolled": false, "is_active": true, "created_at": "2026-07-20T09:00:00Z",
        "created": true }
    ],
    "summary": { "received": 2, "created": 1, "updated": 1 }
  },
  "error": null
}
```

Baca `summary` untuk melapor balik ke pengguna Anda, mis. *"2 diterima —
1 baru, 1 diperbarui."*

::: tip Duplikat dalam satu batch
Bila `external_id` yang sama muncul dua kali dalam satu permintaan, yang terakhir
menang dan dihitung sekali. Jadi `created + updated` mencerminkan pengguna unik,
dan bisa lebih kecil dari `received`.
:::

---

## POST /integration/embed-sessions

Mint URL sekali-pakai yang terkunci origin, untuk menampilkan halaman enrollment
wajah Netra di dalam `<iframe>` pada aplikasi Anda. Scope: `embed:enroll`.

**Body permintaan**

| Field | Tipe | Catatan |
|-------|------|---------|
| `external_id` | string | Wajib, 1–255 karakter. |
| `full_name` | string | Opsional, ≤ 255 karakter. |
| `return_origin` | string | Wajib. Harus terdaftar di allowlist embed key ini. |
| `is_minor` | bool | Default `false`. |

```bash
curl -X POST "https://api-netra.flowbiz.id/api/v1/integration/embed-sessions" \
  -H "X-API-Key: ntr_live_xxxxx" -H "Content-Type: application/json" \
  -d '{"external_id":"EMP-001","full_name":"Budi","return_origin":"https://app.anda.id","is_minor":false}'
```

**Respons** (`201 Created`) — token ada di dalam `url`; sekali pakai dan
kedaluwarsa dalam ~15 menit:

```json
{
  "data": {
    "token": "…",
    "url": "https://app.anda.id/embed/enroll?token=…",
    "expires_at": "2026-07-20T09:15:00Z"
  },
  "error": null
}
```

Bila `return_origin` tidak ada di allowlist key, panggilan mengembalikan `403`.
Tambahkan origin Anda lewat **Kelola Origin** di kartu key dulu. Lihat
[panduan Integrasi](/id/guide/integration) untuk alur iframe + `postMessage`.
