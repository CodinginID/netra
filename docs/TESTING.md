# Panduan Testing End-to-End — netra

Panduan praktis untuk menguji netra (SaaS absensi face-recognition multi-tenant)
dari nol sampai alur lengkap: onboarding tenant → enrollment wajah → absensi
kiosk → laporan → webhook.

> **TL;DR cepat:** jalankan Postgres + backend (`FACE_ENGINE=fake`), seed super
> admin, buka Swagger di `http://localhost:8000/docs`, lalu ikuti
> [Alur Happy Path](#3-alur-happy-path-via-swaggercurl).

---

## Daftar Isi
1. [Prasyarat & Setup](#1-prasyarat--setup)
2. [Tes Otomatis (pytest)](#2-tes-otomatis-pytest)
3. [Alur Happy Path (via Swagger/curl)](#3-alur-happy-path-via-swaggercurl)
4. [Penting: cara kerja FakeFaceEngine saat testing](#4-penting-cara-kerja-fakefaceengine-saat-testing)
5. [Testing lewat UI (PWA)](#5-testing-lewat-ui-pwa)
6. [Skenario negatif / keamanan yang wajib dicoba](#6-skenario-negatif--keamanan-yang-wajib-dicoba)
7. [Testing recognition NYATA (InsightFace)](#7-testing-recognition-nyata-insightface)
8. [Laporan & ekspor](#8-laporan--ekspor)
9. [Webhook](#9-webhook)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Prasyarat & Setup

**Butuh:** Docker, [uv](https://docs.astral.sh/uv/), Node.js 20+.

### 1.1 Database (Postgres + pgvector)
```bash
cd <repo-root>
docker compose up -d postgres          # Postgres 16 + pgvector di host port 5436
docker ps --filter name=netra-postgres # pastikan "healthy"
```

### 1.2 Backend
```bash
cd backend
uv sync                                 # install dependency (engine = fake, tanpa ML)
uv run alembic upgrade head             # buat skema + role netra_app + RLS

# seed super admin platform (sekali saja)
uv run python -m scripts.seed_superadmin --username owner --password ownerpass123

uv run uvicorn app.main:app --reload    # http://localhost:8000  (docs: /docs)
```
> `FACE_ENGINE` default = `fake` → tidak perlu model ML untuk menguji seluruh alur.
> DB app pakai role **non-superuser** `netra_app` supaya RLS benar-benar aktif.

Cek hidup: `curl http://localhost:8000/api/v1/health` → `{"status":"ok","checks":{"database":"up"}}`

### 1.3 Frontend (opsional, untuk tes UI)
```bash
cd ui
npm install
npm run dev                             # http://localhost:5173
```
> ⚠️ **CORS:** UI dev jalan di **port 5173**, tapi default backend hanya mengizinkan
> `3000` & `7002`. Tambahkan origin UI ke `backend/.env`:
> ```
> CORS_ORIGINS=["http://localhost:5173"]
> ```
> lalu restart uvicorn. (Tanpa ini, panggilan browser ke API akan diblok CORS.)

---

## 2. Tes Otomatis (pytest)

Semua jalur inti sudah ada tes-nya (pakai FakeFaceEngine, butuh Postgres hidup):
```bash
cd backend
uv run pytest                  # 32 tes: auth, RLS, recognition, attendance, dst.
uv run pytest -v               # detail per-tes
uv run pytest tests/test_recognition.py   # satu file
uv run ruff check . && uv run black --check . && uv run mypy app   # lint/format/types
```
Cakupan: isolasi RLS antar-tenant, enroll (butuh consent), identify 1:N,
status absensi (telat/pulang-cepat/libur), geofence, liveness anti-spoof,
device token, laporan, webhook, enkripsi `external_id`.

---

## 3. Alur Happy Path (via Swagger/curl)

Buka **`http://localhost:8000/docs`** (interaktif) atau pakai curl di bawah.
Set dulu base URL:
```bash
API=http://localhost:8000/api/v1
```

### Langkah 1 — Login Super Admin
```bash
curl -s $API/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"owner","password":"ownerpass123"}'
# → simpan access_token
OWNER=<access_token>
```

### Langkah 2 — Super Admin buat Tenant (sekaligus admin pertamanya)
```bash
curl -s $API/tenants -H "Authorization: Bearer $OWNER" -H 'Content-Type: application/json' \
  -d '{"name":"SD Maju","slug":"sd-maju","admin_username":"adminsekolah",
       "admin_password":"adminpass123","admin_full_name":"Admin Sekolah"}'
```

### Langkah 3 — Login sebagai Tenant Admin
```bash
curl -s $API/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"adminsekolah","password":"adminpass123","tenant_slug":"sd-maju"}'
ADMIN=<access_token>
```

### Langkah 4 — Buat user (karyawan/siswa)
```bash
curl -s $API/users -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d '{"full_name":"Alice","role":"end_user","username":"alice","external_id":"NIS-1001"}'
# → simpan "id" sebagai USER_ID
USER_ID=<id>
```

### Langkah 5 — Catat consent biometrik (WAJIB sebelum enroll, UU PDP)
```bash
curl -s $API/consents -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d "{\"user_id\":\"$USER_ID\",\"granted\":true}"
```

### Langkah 6 — Enroll wajah
Siapkan satu file gambar, mis. `alice.jpg` (untuk FakeFaceEngine, isi gambar
bebas — yang penting **byte-nya sama** saat absensi nanti):
```bash
curl -s $API/enrollment -H "Authorization: Bearer $ADMIN" \
  -F "user_id=$USER_ID" -F "image=@alice.jpg"
# → {"data":{"user_id":...,"embedding_id":...,"enrolled":true}}
```

### Langkah 7 — Buat jadwal default (aturan absensi)
```bash
curl -s $API/schedules -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d '{"name":"Reguler","rules":{"workday_start":"08:00","workday_end":"16:00"},
       "grace_minutes":0,"is_default":true}'
```

### Langkah 8 — Daftarkan device kiosk (token tampil SEKALI)
```bash
curl -s $API/devices -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d '{"name":"Kiosk Lobby"}'
# → simpan "token" (hanya muncul sekarang!)
DEVICE=<token>
```

### Langkah 9 — Absen check-in via kiosk (pakai device token, BUKAN bearer user)
```bash
curl -s $API/attendance/checkin -H "X-Device-Token: $DEVICE" \
  -F "image=@alice.jpg" \
  -F "occurred_at=2026-06-14T09:00:00+00:00"
# → {"data":{"full_name":"Alice","similarity":1.0,
#            "attendance":{"status":"late","type":"check_in",...}}}
```
> Check-in 09:00 dengan jadwal mulai 08:00 → status **late**. Coba `07:30` → `on_time`.

### Langkah 10 — Check-out
```bash
curl -s $API/attendance/checkout -H "X-Device-Token: $DEVICE" \
  -F "image=@alice.jpg" -F "occurred_at=2026-06-14T12:00:00+00:00"
# → status "early_leave" (sebelum 16:00)
```

### Langkah 11 — Lihat rekap (staff)
```bash
curl -s $API/attendance -H "Authorization: Bearer $ADMIN"
curl -s "$API/reports/attendance/daily?date=2026-06-14" -H "Authorization: Bearer $ADMIN"
```

---

## 4. Penting: cara kerja FakeFaceEngine saat testing

Dengan `FACE_ENGINE=fake` (default), embedding dihitung **deterministik dari byte
gambar**:

- **Byte gambar SAMA → embedding sama → MATCH.** Jadi enroll `alice.jpg` lalu
  check-in dengan **file `alice.jpg` yang sama persis** → dikenali (similarity 1.0).
- **Byte beda → tidak match (404).** File berbeda, atau **frame webcam** (selalu
  beda tiap jepret), tidak akan dikenali.

➡️ **Konsekuensi untuk tes UI Kiosk:** kamera menghasilkan frame berbeda tiap
kali, jadi dengan engine `fake` check-in via webcam akan sering **404 "Wajah tidak
dikenali"** — itu **normal**. Untuk pengenalan wajah sungguhan via kamera, pakai
[InsightFace](#7-testing-recognition-nyata-insightface). Untuk menguji *alur*-nya
dengan `fake`, gunakan fitur **upload file** dan pakai file yang sama untuk
enroll & check-in.

Marker khusus engine fake:
- Gambar yang byte-nya mengandung teks `SPOOF` → skor liveness rendah → ditolak
  422 (untuk menguji anti-spoofing).

---

## 5. Testing lewat UI (PWA)

1. Jalankan backend (+ set `CORS_ORIGINS` seperti §1.3) dan `npm run dev`.
2. **Login** di `http://localhost:5173/login`
   - Super admin: `owner` / `ownerpass123` (kosongkan tenant slug).
   - Tenant admin: `adminsekolah` / `adminpass123`, tenant slug `sd-maju`.
3. **Enrollment** (`/tenant/enrollment`): pilih user → ambil foto webcam / upload →
   submit. Jika user belum consent → muncul error 403.
4. **Kiosk** (`/kiosk`, halaman publik): tempel **device token** (dari Langkah 8) →
   tombol Check In / Check Out.
   - Dengan engine `fake`: gunakan tombol upload file & file yang sama dgn enroll.
   - Dengan InsightFace: webcam akan mengenali wajah asli.

---

## 6. Skenario negatif / keamanan yang wajib dicoba

| Skenario | Cara | Hasil diharapkan |
|---|---|---|
| Enroll tanpa consent | skip Langkah 5 | `403` consent required |
| Wajah tak dikenal | check-in pakai gambar lain | `404` Face not recognized |
| Anti-spoofing | check-in gambar berisi byte `SPOOF` | `422` liveness failed |
| Isolasi tenant (RLS) | enroll di tenant A, check-in via kiosk tenant B pakai gambar A | `404` (tidak bocor lintas tenant) |
| Geofence | jadwal default `geofence:{lat,lng,radius_m:100}`; check-in tanpa `lat/lng` | `422` location required; jauh → `422` outside geofence; dekat → `200` |
| Libur | `rules.holidays:["2026-06-17"]`; check-in 09:00 tgl itu | status `on_time` (tanpa penalti telat) |
| Tenant disuspend | super admin `POST /tenants/{id}/suspend`, lalu login user tenant | `401` Tenant is suspended |
| RBAC | end_user coba `PUT /tenants/me/config` | `403` |
| Token device dicabut | `POST /devices/{id}/revoke`, lalu check-in | `401` invalid/revoked |

Contoh geofence:
```bash
curl -s $API/schedules -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d '{"name":"Kantor","rules":{},"geofence":{"lat":-6.2,"lng":106.8,"radius_m":100},"is_default":true}'
# jauh → 422
curl -s $API/attendance/checkin -H "X-Device-Token: $DEVICE" -F "image=@alice.jpg" -F "lat=0" -F "lng=0"
# dekat → 200
curl -s $API/attendance/checkin -H "X-Device-Token: $DEVICE" -F "image=@alice.jpg" -F "lat=-6.2001" -F "lng=106.8"
```

---

## 7. Testing recognition NYATA (InsightFace)

Untuk pengenalan wajah sungguhan (model ArcFace `buffalo_s`, CPU/ONNX Runtime):

```bash
cd backend
uv sync --extra recognition        # install onnxruntime, opencv, insightface, dll.

# Smoke test cepat (pakai gambar wajah bawaan InsightFace, tanpa foto eksternal):
uv run --extra recognition python scripts/smoke_insightface.py
# → "SMOKE OK", embedding 512-d, self-similarity 1.0000

# Jalankan backend dengan engine nyata:
FACE_ENGINE=insightface uv run --extra recognition uvicorn app.main:app --reload
```
Dengan ini, enroll + check-in via **webcam/foto wajah berbeda dari orang yang sama**
akan tetap match (berbasis fitur wajah, bukan byte). Atur ambang per-tenant via
`PUT /tenants/me/config` field `recognition.match_threshold` (0–1).

Verifikasi adapter manual dengan dua foto:
```bash
FACE_ENGINE=insightface uv run --extra recognition python scripts/verify_recognition.py \
  --gallery foto_alice_1.jpg --probe foto_alice_2.jpg --probe foto_bob.jpg
```
> Catatan: `--extra recognition` cukup berat (download model + dependency). Pertama
> kali bisa lama.

---

## 8. Laporan & ekspor
```bash
# Rekap harian / bulanan (JSON)
curl -s "$API/reports/attendance/daily?date=2026-06-14"  -H "Authorization: Bearer $ADMIN"
curl -s "$API/reports/attendance/monthly?month=2026-06"  -H "Authorization: Bearer $ADMIN"

# Ekspor CSV / Excel
curl -s "$API/reports/attendance/export?from=2026-06-01&to=2026-06-30&format=csv"  \
  -H "Authorization: Bearer $ADMIN" -o rekap.csv
curl -s "$API/reports/attendance/export?from=2026-06-01&to=2026-06-30&format=xlsx" \
  -H "Authorization: Bearer $ADMIN" -o rekap.xlsx
```

---

## 9. Webhook
```bash
# Daftar webhook (secret tampil sekali)
curl -s $API/webhooks -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d '{"url":"https://webhook.site/<id-anda>","events":["attendance.check_in","attendance.check_out"]}'
```
Pakai endpoint penerima (mis. https://webhook.site) lalu lakukan check-in →
payload `{"event":"attendance.check_in","data":{...}}` terkirim dengan header
`X-Netra-Signature: sha256=<hmac>`. Verifikasi HMAC-SHA256 body memakai secret.

---

## 10. Troubleshooting

| Gejala | Penyebab / solusi |
|---|---|
| `health` `checks.database:"down"` / connection refused | Postgres belum jalan: `docker compose up -d postgres` |
| Browser: CORS error dari UI | Tambah `CORS_ORIGINS=["http://localhost:5173"]` di `backend/.env`, restart |
| Check-in via webcam selalu 404 | Normal untuk `FACE_ENGINE=fake` (byte beda). Pakai upload file sama, atau InsightFace |
| `401` saat tes endpoint super admin | Belum seed super admin, atau token kedaluwarsa — login ulang |
| Migrasi gagal `permission denied` / `CREATE ROLE` | Alembic harus jalan sebagai superuser; pastikan `DATABASE_ADMIN_URL` di `.env` |
| `ModuleNotFoundError: cv2` saat InsightFace | Jalankan dengan `uv run --extra recognition ...` (extra tidak persisten antar perintah) |
| Tes pytest gagal koneksi | Postgres mati, atau port 5436 dipakai proses lain |

---

### Ringkasan endpoint
`/api/v1` — `auth/login`, `health`, `tenants` (+`/me`,`/me/config`,`/{id}/suspend|activate|config`),
`users`, `consents`, `devices` (+`/{id}/revoke`), `schedules`, `enrollment`,
`attendance/checkin|checkout` + `GET /attendance`, `reports/attendance/daily|monthly|export`,
`webhooks`. Dokumentasi interaktif lengkap: **`/docs`**.
