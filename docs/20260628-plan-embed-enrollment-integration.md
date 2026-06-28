# Plan: Embed Enrollment Integration (Netra-in-Client-App)

| | |
|---|---|
| **Tanggal** | 2026-06-28 |
| **Penulis** | Tim Netra |
| **Status** | DRAFT — menunggu review |
| **Branch target** | `feat/phase-implementation-websocket` (atau branch baru `feat/embed-enrollment`) |
| **Dependensi** | Fitur API Key per-tenant (sudah ada: `app/api/v1/api_keys.py`, `app/api/v1/integration.py`) |

---

## 1. TL;DR

Tenant punya aplikasi sendiri (web/mobile). Mereka ingin **fungsi enrollment wajah netra tampil di dalam aplikasi mereka**, tanpa membangun ulang kamera/AI/liveness.

Solusi: **embed**. Aplikasi client menampilkan halaman enrollment netra di dalam `<iframe>` (web) atau `WebView` (mobile), diberi **token sesi sekali-pakai** yang di-mint oleh backend client lewat API key. Semua logika wajah tetap di netra. Setelah selesai, halaman netra melapor balik ke aplikasi induk via `postMessage`.

Effort developer client: **1 panggilan backend (mint token) + 1 iframe**. Sisanya milik kita.

Pola analoginya: **Midtrans Snap** untuk pembayaran, tapi untuk rekam wajah.

---

## 2. Latar Belakang & Motivasi

- Integrasi yang sudah ada (`/integration/attendance*`) bersifat **read-only / pull**: aplikasi client menarik data kehadiran. Lihat [integration.py](../backend/app/api/v1/integration.py).
- Permintaan baru: integrasi **write + UI** — enrollment dilakukan dari dalam aplikasi client.
- Membangun capture wajah sendiri (Cara "headless API") menuntut client membuat UI kamera + integrasi AI + liveness. Kualitas capture menentukan akurasi pengenalan secara langsung, sehingga menyerahkan ke client = akurasi tidak konsisten + beban support tinggi.
- **Keputusan arah**: embed UI netra (Cara A), bukan headless API write. Kerumitan tetap di kita, client cukup "tiket + kotak".

### Non-tujuan (Non-Goals)

- Bukan SDK/Web Component native (npm package) di fase ini — cukup iframe/WebView. Web Component dipertimbangkan sebagai ekstensi masa depan (§16).
- Bukan embed untuk **kiosk absensi** di fase ini (pola sama, menyusul — §16).
- Bukan headless enrollment API (client bikin kamera sendiri). Ditolak secara sadar (§2).
- Tidak mengubah engine pengenalan/liveness yang ada.

---

## 3. Glosarium

| Istilah | Arti |
|---|---|
| **Embed session token** | Token opaque sekali-pakai, umur pendek, mengikat 1 tenant + 1 calon-user + 1 tujuan (enroll). |
| **Mint** | Backend client meminta token embed ke netra (pakai API key). |
| **Chromeless page** | Halaman netra tanpa sidebar/topbar/login — hanya konten enrollment, untuk ditempel di iframe. |
| **frame-ancestors** | Direktif CSP yang menentukan domain mana yang boleh menampilkan halaman kita di iframe. |
| **postMessage** | Mekanisme web standar untuk iframe berkomunikasi dengan halaman induk. |
| **external_id** | ID unik user di sisi tenant (NIS/NIK/NIP). Sudah dipakai di model `User`. |

---

## 4. User Stories

1. **Sebagai developer aplikasi sekolah**, saya mau menampilkan layar "Daftar Wajah" netra di app saya dengan menempel 1 iframe, supaya siswa bisa enroll tanpa pindah aplikasi.
2. **Sebagai siswa**, saya buka app sekolah, klik "Rekam Wajah", muncul kamera, selesai dalam beberapa detik, tanpa instalasi/akun terpisah.
3. **Sebagai admin tenant**, saya mau membatasi domain mana yang boleh menampilkan embed netra (keamanan), dan mencabutnya bila perlu.
4. **Sebagai netra**, saya mau setiap sesi embed tercatat (audit), sekali-pakai, dan kedaluwarsa cepat.

---

## 5. Arsitektur Tingkat Tinggi

```
┌─────────────────────────── APLIKASI CLIENT ───────────────────────────┐
│                                                                        │
│  [Frontend client]                         [Backend client]            │
│       │                                          │                     │
│       │ 1. user klik "Rekam Wajah"               │                     │
│       │─────────────── minta sesi ──────────────▶│                     │
│       │                                          │ 2. POST /integration/embed-sessions
│       │                                          │    Header: X-API-Key (scope embed:enroll)
│       │                                          │    Body: { external_id, full_name, return_origin }
│       │                                          │─────────────────────────────────▶ NETRA API
│       │                                          │◀──── { url, token, expires_at } ──┤
│       │◀───────────── url embed ─────────────────│                     │            │
│       │                                                               │            │
│       │ 3. render <iframe src=url allow="camera">                     │            │
│       ▼                                                               │            │
│  ┌──────────────────────── IFRAME (NETRA) ────────────────────────┐  │            │
│  │  /embed/enroll?token=...                                        │  │            │
│  │  - validasi token (get_embed_principal)                         │──┼────────────▶ NETRA API
│  │  - (opsional) consent checkbox                                  │  │  4. POST /embed/enroll
│  │  - kamera + multi-angle + liveness                              │  │     (auth: embed token)
│  │  - POST hasil ke /embed/enroll                                  │◀─┼──── 200 OK ─┤
│  │  - postMessage({status:"success",...}) ke induk ───────────────┼─▶│ 5. callback │
│  └────────────────────────────────────────────────────────────────┘  │            │
└────────────────────────────────────────────────────────────────────────────────────┘
```

### Sequence singkat

1. Frontend client minta sesi ke backend-nya sendiri.
2. Backend client mint token ke netra pakai API key (scope `embed:enroll`).
3. Frontend client tampilkan `url` di iframe `allow="camera"`.
4. Halaman netra di iframe: validasi token → consent → capture → `POST /embed/enroll` (auth token embed).
5. Sukses → `postMessage` ke induk → app client lanjut.

---

## 6. Desain Detail

### 6.1 Data Model — tabel `embed_sessions`

Token **table-backed + opaque** (bukan JWT self-signed) supaya dapat: sekali-pakai, revocation, audit, dan tidak bisa dipalsukan tanpa akses DB. Pola sama persis dengan device token / API key (simpan **hash**, plaintext hanya di URL).

`app/models.py`:

```python
class EmbedSessionStatus(str, enum.Enum):
    pending = "pending"     # sudah di-mint, belum dipakai
    consumed = "consumed"   # enrollment sukses, token mati
    expired = "expired"     # lewat exp (di-set lazy saat dicek) — opsional, exp dicek via expires_at

class EmbedPurpose(str, enum.Enum):
    enroll = "enroll"
    # kiosk = "kiosk"   # fase berikutnya

class EmbedSession(Base, TimestampMixin):
    __tablename__ = "embed_sessions"
    __table_args__ = (Index("ix_embed_tenant", "tenant_id"),)

    id: Mapped[str]                 # uuid
    tenant_id: Mapped[str]          # FK tenants, RLS
    token_hash: Mapped[str]         # sha256(token), unik (indexed)
    purpose: Mapped[EmbedPurpose]   # enroll
    external_id: Mapped[str | None] # NIS/NIK target (untuk resolve/provision user)
    full_name: Mapped[str | None]   # untuk auto-provision user bila belum ada
    user_id: Mapped[str | None]     # FK users (diisi bila user sudah ada / setelah provision)
    return_origin: Mapped[str]      # origin app client (untuk frame-ancestors + postMessage targetOrigin)
    status: Mapped[EmbedSessionStatus]
    expires_at: Mapped[datetime]    # mint + EMBED_TTL (default 15 menit)
    consumed_at: Mapped[datetime | None]
    # created_at, updated_at dari TimestampMixin
```

- Tambahkan `"embed_sessions"` ke `TENANT_SCOPED_TABLES` di [models.py](../backend/app/models.py).
- Index unik di `token_hash` untuk lookup cepat pada jalur embed yang belum-terotentikasi.

### 6.2 Scope baru pada API key

`app/schemas.py` — `API_SCOPES`:

```python
API_SCOPES = {
    "attendance:read": "Baca catatan & laporan kehadiran",
    "embed:enroll": "Mint sesi embed untuk enrollment wajah",
}
```

Hanya API key dengan scope `embed:enroll` yang boleh memanggil mint endpoint.

### 6.3 Helper keamanan

`app/core/security.py` (pola sama dengan device/api-key):

```python
EMBED_TOKEN_PREFIX = "ntr_embed_"
def generate_embed_token() -> str: return f"{EMBED_TOKEN_PREFIX}{secrets.token_urlsafe(32)}"
def hash_embed_token(t: str) -> str: return sha256 hex
```

### 6.4 Endpoint Mint — `POST /integration/embed-sessions`

- **Auth**: API key, `Depends(require_scope("embed:enroll"))` (sudah ada `require_scope` di [deps.py](../backend/app/api/deps.py)).
- **Router**: tambahkan ke [integration.py](../backend/app/api/v1/integration.py).
- **Request**:
  ```json
  {
    "external_id": "NIS123",
    "full_name": "Budi Santoso",     // opsional, untuk auto-provision
    "return_origin": "https://app.sekolah.id",
    "purpose": "enroll"               // default "enroll"
  }
  ```
- **Validasi**:
  - `return_origin` **wajib** dan harus cocok dengan allowlist tenant (`tenant.config.embed.allowed_origins`). Bila tidak cocok → 403. (Mencegah pihak lain menempel embed kita.)
  - `external_id` wajib untuk purpose `enroll`.
- **Aksi**: buat baris `EmbedSession` (status pending, expires_at = now + EMBED_TTL), simpan `token_hash`.
- **Response** (token plaintext sekali, di dalam url):
  ```json
  {
    "data": {
      "token": "ntr_embed_xxxxx",
      "url": "https://netra.app/embed/enroll?token=ntr_embed_xxxxx",
      "expires_at": "2026-06-28T10:15:00Z"
    },
    "error": null
  }
  ```
- **Audit**: `embed.session_minted` (actor = api key id, detail = external_id, purpose).

### 6.5 Auth dependency — `get_embed_principal`

`app/api/deps.py` (mirip `get_device_principal`/`get_api_principal`):

```python
@dataclass
class EmbedPrincipal:
    session_id: str
    tenant_id: str
    purpose: str
    external_id: str | None
    user_id: str | None
    return_origin: str

async def get_embed_principal(token: str (query/header)) -> EmbedPrincipal:
    # lookup by hash_embed_token(token) di session UNSCOPED
    # tolak bila: tidak ada / status != pending / expires_at < now
    # set tenant context, return principal
```

- Token diterima via query string (`?token=`) karena halaman dibuka oleh browser di iframe. Untuk panggilan `POST /embed/enroll`, token dikirim via header `X-Embed-Token` (lebih aman daripada query untuk request data).
- `get_embed_db`: session terikat tenant (RLS) untuk embed principal.

### 6.6 Endpoint Enrollment Embed — `POST /embed/enroll`

- **Router baru**: `app/api/v1/embed.py`, prefix `/embed`.
- **Auth**: `Depends(get_embed_principal)` (token embed, BUKAN JWT/API key).
- **Request**: multipart — `images: list[UploadFile]` (1–3 angle), `consent: bool`.
- **Alur**:
  1. Pastikan `purpose == "enroll"`.
  2. **Resolve / provision user**:
     - Cari `User` by `(tenant_id, external_id)`.
     - Bila tidak ada dan `full_name` tersedia → buat `end_user` baru (provision). Bila tidak ada dan tanpa nama → 422.
     - (Keputusan provisioning lihat §18 Q3.)
  3. **Consent**: bila `consent != true` → 403. Catat consent (pakai consent service / tabel `consents`). Enrollment memang menuntut consent (lihat `recognition_service.ConsentRequiredError` di [enrollment.py](../backend/app/api/v1/enrollment.py)).
  4. Panggil `recognition_service.enroll_multi(session, tenant_id, user_id, image_bytes)` (reuse).
  5. Tandai `EmbedSession.status = consumed`, `consumed_at = now` (sekali-pakai).
  6. Audit `face.enrolled_embed`. Broadcast WS `user.enrolled` (best-effort, seperti endpoint lain).
- **Response**: `EnrollmentResult` (user_id, embedding_id, enrolled).
- **Error mapping**: samakan dengan endpoint enrollment yang ada (422 no-face, 403 consent, 404 user).

### 6.7 Frontend — halaman chromeless `/embed/enroll`

- **Route baru** di [App.tsx](../ui/src/App.tsx) **di luar** ProtectedRoute/DashboardLayout (publik, tanpa login):
  ```tsx
  <Route path="/embed/enroll" element={<ErrorBoundary><EmbedEnrollPage /></ErrorBoundary>} />
  ```
- **Komponen baru** `ui/src/pages/embed/EmbedEnrollPage.tsx`:
  - Baca `token` dari query.
  - Tanpa sidebar/topbar — hanya kartu capture (reuse komponen kamera dari `SelfEnrollPage.tsx`).
  - Tampilkan **consent checkbox** + ringkasan persetujuan biometrik sebelum capture.
  - Capture multi-angle → `POST /embed/enroll` dengan header `X-Embed-Token`.
  - State: loading / kamera / sukses / gagal / token-invalid / token-expired.
  - Saat sukses/gagal → `postMessage` ke induk (lihat §6.8).
- **Theming**: dukung query `?accent=%23RRGGBB` (opsional) untuk menyamakan warna brand. Default tema netra. (Lihat §6.9.)
- **API base**: panggil same-origin (`/api/v1/embed/enroll`) supaya tidak ada masalah CORS dalam iframe.

### 6.8 Protokol postMessage

Halaman embed mengirim ke `window.parent` dengan `targetOrigin = return_origin` (BUKAN `"*"`). `return_origin` ditanam ke halaman lewat token/sesi (di-fetch saat init, atau di-render server-side ke `window.__EMBED__`).

Event:
```ts
// sukses
{ source: "netra", type: "enroll:success", user_id, external_id }
// gagal
{ source: "netra", type: "enroll:error", code, message }
// user menutup / batal
{ source: "netra", type: "enroll:cancel" }
// tinggi konten berubah (opsional, untuk auto-resize iframe)
{ source: "netra", type: "resize", height }
```

Dokumentasikan di panduan integrasi (§11) agar developer client tahu cara `addEventListener('message', ...)` + verifikasi `event.origin === "https://netra.app"`.

### 6.9 Branding / Theming (opsional, bisa fase 2)

- Param `accent` untuk warna utama.
- Logo tenant bisa diambil dari `tenant.config` bila ingin lebih menyatu. Default: minimal, netral.

---

## 7. Keamanan (kritis — fokus review)

| Risiko | Mitigasi |
|---|---|
| Pihak lain menempel embed kita | `Content-Security-Policy: frame-ancestors <allowed_origins tenant>` di response route `/embed/*`. Tanpa allowlist match → tidak bisa di-iframe. |
| Token dicuri / replay | Token **sekali-pakai** (status consumed) + **umur pendek** (EMBED_TTL 15 menit) + disimpan sebagai hash. |
| Token via URL bocor di log/history | Untuk panggilan data (`POST /embed/enroll`) pakai header `X-Embed-Token`, bukan query. URL iframe tetap query (tak terhindar), karena itu umur token pendek + single-use. |
| `postMessage` ke origin salah | `targetOrigin` = `return_origin` yang sudah divalidasi terhadap allowlist saat mint. |
| Clickjacking balik | Halaman embed hanya boleh dari origin allowlist (frame-ancestors). |
| Enrollment tanpa izin | Consent wajib (`consent=true`) sebelum simpan embedding; dicatat. |
| Kamera | Wajib HTTPS; iframe wajib `allow="camera"`; di WebView wajib izin kamera OS. |
| Lintas-tenant | Token mengikat `tenant_id`; semua query embed RLS-scoped via `get_embed_db`. |
| Abuse mint | Rate-limit endpoint mint per API key (reuse pola rate-limit yang ada bila memungkinkan). |

**Catatan X-Frame-Options**: jika app meng-set `X-Frame-Options: DENY/SAMEORIGIN` global, route `/embed/*` harus dikecualikan (X-Frame-Options tidak mendukung allowlist multi-origin; gunakan CSP `frame-ancestors` saja untuk route ini).

---

## 8. Konfigurasi & Setting Tenant

- `tenant.config.embed.allowed_origins: string[]` — daftar origin yang boleh menempel embed + jadi target postMessage. Dikelola tenant-admin di halaman **Integrasi & API** (tambah/hapus origin).
- Setting global (env): `EMBED_TTL_MINUTES` (default 15), `EMBED_BASE_URL` (untuk membentuk `url` saat mint; default = host publik netra).

UI: di [IntegrationPage.tsx](../ui/src/pages/tenant-admin/IntegrationPage.tsx) tambahkan section "Embed" untuk mengelola `allowed_origins` + tampilkan panduan embed (snippet iframe).

---

## 9. Migrasi

`alembic/versions/<rev>_embed_sessions.py` (pola sama dengan migrasi `api_keys`):
- Buat tabel `embed_sessions` + enum `embed_session_status`, `embed_purpose`.
- Index `ix_embed_tenant`, unik `ix_embed_token_hash`.
- RLS: `ENABLE/FORCE ROW LEVEL SECURITY` + policy `tenant_isolation` (sama persis dengan `api_keys`).
- `GRANT SELECT, INSERT, UPDATE, DELETE ON embed_sessions TO netra_app`.
- `down_revision` = head saat ini (cek dengan `alembic heads`).

---

## 10. Kontrak API (ringkas, untuk dokumentasi)

| Method | Path | Auth | Scope | Fungsi |
|---|---|---|---|---|
| POST | `/integration/embed-sessions` | API key | `embed:enroll` | Mint token embed |
| GET | `/embed/enroll` (HTML) | Embed token (query) | — | Halaman capture (chromeless) |
| POST | `/embed/enroll` | Embed token (header) | — | Submit foto → enroll |

---

## 11. Panduan Integrasi untuk Client (akan ditaruh di dashboard)

**Langkah 1 — Backend client mint token:**
```bash
curl -X POST https://netra.app/api/v1/integration/embed-sessions \
  -H "X-API-Key: ntr_live_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{"external_id":"NIS123","full_name":"Budi","return_origin":"https://app.sekolah.id"}'
# → { "data": { "url": "https://netra.app/embed/enroll?token=...", "expires_at": "..." } }
```

**Langkah 2 — Frontend client tampilkan iframe:**
```html
<iframe id="netra-enroll"
        src="https://netra.app/embed/enroll?token=ntr_embed_xxxxx"
        allow="camera"
        style="width:100%;height:600px;border:0;border-radius:12px"></iframe>

<script>
  window.addEventListener('message', (e) => {
    if (e.origin !== 'https://netra.app') return;       // wajib verifikasi origin
    const msg = e.data;
    if (msg.source !== 'netra') return;
    if (msg.type === 'enroll:success') {
      // tutup iframe, tampilkan "berhasil", simpan msg.user_id
    } else if (msg.type === 'enroll:error') {
      // tampilkan pesan error
    }
  });
</script>
```

**Mobile native**: ganti iframe dengan WebView, beri izin kamera, dengarkan callback via JS bridge (Android `addJavascriptInterface` / iOS `WKScriptMessageHandler`).

---

## 12. Rencana Test

### Unit
- `security`: generate/hash embed token; round-trip.
- `embed_session_service`: create / lookup-by-hash / consume / reject-expired / reject-consumed.
- Validasi `return_origin` terhadap allowlist (cocok, tidak cocok, kosong).

### Integration (httpx + DB test)
- Mint: API key dengan scope → 200; tanpa scope → 403; origin tidak di allowlist → 403.
- `get_embed_principal`: token valid → principal; expired → 401; consumed → 401; palsu → 401.
- `POST /embed/enroll`: token valid + consent + foto → 201 + user ter-enroll; tanpa consent → 403; token consumed setelah sukses (panggil 2x → kedua 401).
- Provisioning: external_id baru + full_name → user dibuat; tanpa nama → 422.
- RLS: token tenant A tidak bisa menyentuh data tenant B.

### E2E / manual
- Halaman `/embed/enroll` dibuka dalam iframe dari origin allowlist → kamera jalan, capture, sukses, postMessage diterima induk.
- Dari origin TIDAK di allowlist → iframe diblok (frame-ancestors).
- Token kedaluwarsa → halaman tampilkan "sesi kedaluwarsa".

### Keamanan
- Coba replay token → ditolak.
- Coba `postMessage` bocor ke origin lain → tidak terjadi (targetOrigin spesifik).
- Pastikan `X-Embed-Token` tidak ter-log di akses log (atau di-redact).

> Catatan: **jangan jalankan pytest terhadap dev DB**. Gunakan `netra_test` atau set `NETRA_ALLOW_TEST_DB_WIPE=1` (guard ada di `tests/conftest.py`).

---

## 13. Observability & Audit

- Audit actions: `embed.session_minted`, `face.enrolled_embed`, `embed.session_expired` (opsional).
- Log terstruktur: mint (tenant, external_id), consume (session_id), penolakan (alasan).
- Metrik (opsional): jumlah sesi mint vs consumed (conversion), rata-rata waktu mint→consume.

---

## 14. Rollout

- Fitur baru, aditif — tidak mengubah perilaku lama. Aman di-deploy bertahap.
- Migrasi DB dijalankan dari host: `cd backend && .venv/bin/alembic upgrade head`.
- (Opsional) feature flag per-tenant: `tenant.config.embed.enabled` untuk membuka akses bertahap.
- Backend hot-reload menangkap kode baru; tidak perlu rebuild image (kecuali dependensi).

---

## 15. Rincian Tugas (Checklist)

**Backend**
- [ ] Model `EmbedSession` + enum + `TENANT_SCOPED_TABLES`
- [ ] Helper `generate_embed_token` / `hash_embed_token` di `security.py`
- [ ] Scope `embed:enroll` di `API_SCOPES`
- [ ] Schemas: `EmbedSessionCreate`, `EmbedSessionMinted`, request enroll
- [ ] Migrasi `embed_sessions` + RLS + grant
- [ ] `embed_session_service.py` (create/lookup/consume/expire + validasi origin)
- [ ] `deps.py`: `EmbedPrincipal`, `get_embed_principal`, `get_embed_db`
- [ ] `integration.py`: `POST /integration/embed-sessions`
- [ ] `embed.py`: `POST /embed/enroll` + (server-side render token context bila perlu)
- [ ] Middleware/response header CSP `frame-ancestors` untuk route `/embed/*`
- [ ] Provisioning user dari external_id + consent wiring
- [ ] Audit + WS broadcast
- [ ] Register router di `app/api/v1/__init__.py`

**Frontend**
- [ ] `EmbedEnrollPage.tsx` (chromeless, consent, capture, postMessage)
- [ ] Route `/embed/enroll` di `App.tsx` (publik)
- [ ] Reuse komponen kamera dari `SelfEnrollPage.tsx`
- [ ] Section "Embed" di `IntegrationPage.tsx` (kelola allowed_origins + panduan iframe)
- [ ] State error: token invalid/expired/consumed, kamera ditolak

**Verifikasi**
- [ ] Unit + integration test (lihat §12)
- [ ] Smoke test live (mint → buka iframe lokal → enroll → callback)
- [ ] `tsc --noEmit` bersih, backend import bersih

---

## 16. Ekstensi Masa Depan

- **Embed kiosk absensi** (pola token sama, purpose `kiosk`).
- **Web Component / JS SDK** (`<netra-enroll>`): mounting lebih mulus tanpa iframe, auto-resize, theming penuh.
- **Mobile SDK** (wrapper WebView siap pakai untuk Android/iOS).
- **Webhook** `enrollment.completed` agar backend client tahu hasil tanpa bergantung pada postMessage frontend.

---

## 17. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Kamera di iframe diblok browser/OS | enrollment gagal | wajib HTTPS + `allow="camera"`; dokumentasikan; fallback buka tab baru bila iframe gagal |
| Akurasi pengenalan rendah (engine `buffalo_s`) | hasil enroll kurang akurat | di luar scope plan ini; capture quality di kita sudah membantu; pertimbangkan upgrade engine terpisah |
| Client salah set return_origin | embed/postMessage gagal | pesan error jelas + validasi saat mint |
| Token bocor di URL | penyalahgunaan | single-use + TTL pendek + scope |
| Beragam perilaku WebView mobile | inkonsistensi | uji di Android/iOS; sediakan panduan izin kamera |

---

## 18. Keputusan yang Perlu Dikonfirmasi (Review)

1. **Token mekanisme**: table-backed opaque token (rekomendasi, ada audit + single-use + revoke) vs JWT self-signed (stateless, tanpa tabel). → **Rekomendasi: table-backed.**
2. **Target app client**: web, mobile native, atau dua-duanya? Menentukan prioritas iframe vs WebView + contoh kode.
3. **Provisioning user**: embed boleh **auto-create** end_user dari `external_id`+`full_name` (mulus) ATAU wajib user sudah ada lebih dulu (lebih ketat)? → **Rekomendasi: auto-create di belakang scope, dengan `full_name` wajib bila user belum ada.**
4. **Consent**: cukup checkbox di halaman embed, atau perlu teks persetujuan khusus dari tenant (per-tenant consent copy)?
5. **TTL token**: default 15 menit cukup?
6. **Branding**: perlu theming (accent/logo) di fase 1 atau cukup tampilan default netra?
7. **allowed_origins**: dikelola tenant-admin sendiri di dashboard, atau di-set super-admin saat onboarding?

---

## 19. Estimasi Kasar

| Bagian | Estimasi |
|---|---|
| Backend (model, migrasi, service, deps, 2 endpoint, CSP) | 1.5–2 hari |
| Frontend (embed page + capture reuse + integrasi panduan) | 1–1.5 hari |
| Test + smoke + hardening keamanan | 1 hari |
| **Total** | **~3.5–4.5 hari** |

---

*Akhir dokumen. Mohon review bagian §7 (Keamanan) dan §18 (Keputusan) lebih dulu — keduanya menentukan implementasi.*
