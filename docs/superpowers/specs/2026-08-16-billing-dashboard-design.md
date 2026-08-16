# Desain: Dashboard Billing Operasional & Pemantauan Usage per Tenant

| | |
|---|---|
| **Tanggal** | 2026-08-16 |
| **Penulis** | Tim Netra |
| **Status** | DISETUJUI — siap masuk rencana implementasi |
| **Branch target** | branch baru dari `release/prod` |
| **Dependensi** | Sistem billing yang sudah ada (`app/api/v1/billing.py`, `app/services/billing_service.py`, `app/services/usage_snapshot.py`) |

## 1. Latar Belakang

Menu billing sudah punya tiga halaman terpisah yang berfungsi: Paket
(`PlansEditor.tsx`), Langganan (`SubscriptionsPage.tsx`), dan Faktur
(`InvoicesPage.tsx`), dinavigasi lewat `BillingTabs.tsx`. Pemisahan itu **sudah
ada** dan tidak termasuk pekerjaan ini.

Yang belum ada tiga hal:

1. **Tidak ada satu pun metrik billing di dashboard.** `SuperAdminHomePage`
   hanya menampilkan total tenant, tenant aktif, total user, dan absensi hari
   ini. Untuk tahu ada faktur yang belum dibayar, super admin harus membuka menu
   billing dan membaca tabel satu per satu.

2. **Tidak ada layar usage di level platform.** Endpoint `GET /billing/usage`
   sudah ada, tapi satu-satunya konsumen adalah `TenantBillingPage` sisi tenant
   admin yang menampilkan 5 baris terakhir milik tenantnya sendiri.

3. **Data usage tidak pernah terkumpul.**
   `app/services/usage_snapshot.py:100` mendefinisikan `record_all()` dengan
   logika lengkap dan benar, tapi fungsi itu **tidak dipanggil dari mana pun** —
   tidak ada scheduler, cron, endpoint, maupun entri di `docker-compose.yml`
   atau GitHub Actions. Tabel `usage_snapshots` kosong permanen di produksi.

Selain itu ditemukan dua cacat yang bersinggungan langsung dengan pekerjaan ini
dan diperbaiki sekalian (§6).

## 2. Tujuan & Non-Tujuan

**Tujuan.** Dashboard billing yang menjawab satu pertanyaan operasional: *siapa
yang perlu ditagih hari ini*. Plus layar pemantauan usage per tenant, dengan
pipeline pengumpulan datanya dihidupkan.

**Non-tujuan.** Metrik komersial (MRR, ARR, churn, proyeksi pertumbuhan) tidak
termasuk. Pembuatan faktur otomatis dari usage tidak termasuk. Integrasi
pembayaran tidak termasuk. Semua itu bisa menyusul di atas fondasi ini.

## 3. Model Data: Tenggat Faktur

`Invoice` saat ini punya `issued_at`, `paid_at`, dan `period_end`, tapi **tidak
punya tenggat**, dan `InvoiceStatus` hanya `draft / issued / paid / void` tanpa
`overdue`. Tanpa tenggat, dashboard hanya bisa bilang "belum dibayar" dan tidak
bisa membedakan faktur yang terbit kemarin dari yang nunggak dua bulan —
padahal justru itu inti dashboard operasional.

### 3.1 Kolom baru

```python
due_date: Mapped[datetime | None] = mapped_column(
    DateTime(timezone=True), nullable=True
)
```

Nullable disengaja: faktur `draft` memang belum punya tenggat.

### 3.2 Migration

Alembic revision baru dengan `down_revision = 'c3d4e5f6g7h8'` (head tunggal saat
ini, dipastikan lewat `alembic heads`). Isi:

1. `ADD COLUMN due_date TIMESTAMPTZ NULL` pada `invoices`
2. Backfill: `UPDATE invoices SET due_date = issued_at + INTERVAL '14 days'
   WHERE issued_at IS NOT NULL`
3. Index `ix_invoice_due_date` pada `(status, due_date)` — dipakai kueri
   agregat overdue di §4.1

`downgrade()` menghapus index lalu kolomnya.

Baris `draft` sengaja dibiarkan `NULL`, bukan diisi nilai karangan. Tenggat
palsu pada draft akan muncul sebagai tunggakan hantu di dashboard.

### 3.3 Pengisian saat faktur terbit

Konstanta `invoice_net_days: int = Field(default=14, ge=1, le=180)` ditambahkan
ke `Settings` (`app/core/config.py`), mengikuti gaya field lain di sana.

Saat status faktur berubah menjadi `issued` lewat `PATCH /billing/invoices/{id}`
dan `due_date` belum terisi, backend mengisinya `issued_at + invoice_net_days`.
Klien tetap boleh mengirim `due_date` eksplisit untuk menimpa default — negosiasi
tenggat per tenant tetap mungkin.

`InvoiceUpdate` (`app/schemas.py`) mendapat field opsional `due_date: datetime |
None`. Dict respons faktur di `billing.py` (dua tempat: `get_invoice` dan
`update_invoice`, plus baris ringkas di `list_invoices`) mendapat key `due_date`.

## 4. Backend: Endpoint Baru

### 4.1 `GET /billing/summary`

Guard `require_super_admin`, sesi `get_db_unscoped`.

Seluruh angka dihitung lewat agregasi SQL, **bukan** dengan menarik semua baris
lalu menjumlahkan di Python — jumlah faktur tumbuh seiring waktu dan tenant.

Bucket faktur, masing-masing `{count, total}`:

| Bucket | Kondisi |
|---|---|
| `unpaid` | `status = 'issued' AND paid_at IS NULL` |
| `overdue` | `status = 'issued' AND paid_at IS NULL AND due_date < now()` |
| `draft` | `status = 'draft'` |
| `paid_this_month` | `status = 'paid' AND paid_at >= awal bulan berjalan` |

**Pengelompokan mata uang.** `Invoice.currency` adalah kolom per-baris, bukan
konstanta global. Menjumlahkan `total` lintas mata uang menghasilkan angka tanpa
makna. Karena itu tiap bucket dikembalikan sebagai daftar per mata uang:

```json
"unpaid": { "count": 7, "by_currency": [{ "currency": "IDR", "total": 48200000 }] }
```

UI menampilkan tiap mata uang di baris sendiri. Untuk instalasi yang cuma pakai
IDR, hasilnya tetap satu baris — tanpa cabang khusus di kode.

Sinyal langganan:

| Field | Kondisi |
|---|---|
| `trials_ending` | `status = 'trial' AND trial_ends_at BETWEEN now() AND now() + 7 hari` |
| `past_due_count` | `status = 'past_due'` |
| `subscriptions_ending` | `status = 'active' AND ends_at BETWEEN now() AND now() + 30 hari` |
| `tenants_without_subscription` | tenant `status = 'active'`, `deleted_at IS NULL`, tanpa baris di `tenant_subscriptions` |

Ambang 7 dan 30 hari adalah konstanta modul di `billing_service`, bukan angka
tercecer di dalam kueri.

Respons dibungkus `Envelope` seperti endpoint lain. Tidak ada data → semua nol,
bukan 404.

### 4.2 `GET /billing/usage/by-tenant`

Guard `require_super_admin`, sesi `get_db_unscoped`. Query param: `page`,
`limit`, `tenant_id` opsional.

Mengembalikan satu baris per tenant berisi snapshot terakhir, dibandingkan
dengan snapshot ~7 hari sebelumnya:

```
tenant_id, tenant_name, snapshot_date,
active_users, devices, punches,
active_users_delta_7d,
plan_name, tier_max_users, over_tier (bool)
```

`over_tier` bernilai true bila `tier_max_users` tidak null dan `active_users`
melampauinya — inilah sinyal yang membuat halaman ini berguna secara komersial:
tenant yang tumbuh melewati tier-nya perlu dinaikkan paketnya.

Implementasi memakai window function (`ROW_NUMBER() OVER (PARTITION BY
tenant_id ORDER BY snapshot_date DESC)`) supaya "snapshot terakhir per tenant"
selesai dalam satu kueri, bukan N+1 per tenant.

## 5. Backend: Menghidupkan Job Snapshot

### 5.1 Penyimpangan dari pilihan awal, beserta alasannya

Saat brainstorming disepakati memakai **APScheduler**. Setelah membaca
`app/main.py:28-53`, saya mengubahnya menjadi **loop `asyncio` di dalam
lifespan**, mengikuti pola yang sudah ada di repo ini.

Alasannya: `lifespan()` sudah menjalankan `_purge_loop()` — job harian
hard-delete lewat `asyncio.create_task` + `await asyncio.sleep`, dibatalkan
rapi saat shutdown. Menambah APScheduler berarti menambah dependency ke
`pyproject.toml` untuk mengerjakan hal yang sudah bisa dilakukan pola in-repo,
dan meninggalkan dua mekanisme penjadwalan berbeda di satu aplikasi.

Inti pilihan Anda tetap dihormati: penjadwal berjalan **di dalam proses
backend**, tanpa infrastruktur baru, tanpa perubahan deployment. Yang berubah
hanya mekanismenya — lebih sedikit, bukan lebih banyak.

### 5.2 Rancangan

Fungsi `_usage_snapshot_loop()` di `app/main.py`, bersebelahan dengan
`_purge_loop()`:

- Menghitung detik menuju **00:30 UTC** berikutnya, tidur selama itu, jalan,
  lalu berulang tiap 24 jam. Ini berbeda dari `_purge_loop` yang tidur 24 jam
  lebih dulu sehingga waktu jalannya menempel pada jam startup dan bergeser tiap
  restart. Untuk snapshot harian, jam yang stabil itu penting: jam jalan yang
  bergeser membuat perbandingan antar hari tidak setara.
- Memanggil `usage_snapshot.record_all()`, lalu mencatat hasilnya
  (`processed / inserted / updated / skipped`) lewat `log.info`, **termasuk saat
  hasilnya nol** — mengikuti alasan yang sudah ditulis di komentar
  `_purge_loop`: job yang diam-diam berhenti bekerja tidak bisa dibedakan dari
  "memang tidak ada yang perlu dikerjakan" kecuali angka nolnya tercatat.
- Exception ditangkap dan dicatat lewat `log.error`; loop tetap hidup. Satu hari
  yang gagal tidak boleh mematikan snapshot selamanya.
- Task dibatalkan saat shutdown, sama seperti `purge_task`.

Setting baru `enable_scheduler: bool = Field(default=True)` di `Settings`. Test
dan CI mematikannya supaya suite tidak menyalakan task latar.

Aman untuk multi-replica: `record_usage_snapshot` idempoten per
`(tenant_id, snapshot_date)` — dijamin `UniqueConstraint uq_usage_tenant_date`
dan sudah ada tesnya (`test_usage_snapshot_idempotent`).

### 5.3 Catatan tentang backfill

Menyalakan job tidak memunculkan data historis. Halaman Usage akan kosong pada
hari pertama dan baru berisi tren setelah beberapa hari. Ini alasan pemisahan
fase di §8 — dan alasan empty state di §7.2 harus jujur menyebutkan sejak kapan
data mulai dikumpulkan.

## 6. Perbaikan Cacat yang Bersinggungan

### 6.1 `GET /billing/usage` menolak tenant admin

Endpoint dijaga `require_super_admin` (`billing.py:432`), tapi
`TenantBillingPage.tsx:230` — halaman tenant admin — memanggilnya lewat
`useUsageSnapshots`. Kartu usage di halaman itu membalas 403 untuk tenant admin
asli.

Perbaikan: guard dilonggarkan ke `require_tenant_admin`, dan principal
ditambahkan sebagai parameter. Bila principal **bukan** `platform_scope`,
`tenant_id` dipaksa ke `principal.tenant_id` dan query param `tenant_id`
diabaikan — tenant admin tidak bisa mengintip usage tenant lain dengan menebak
id. Sesi tetap `get_db_unscoped` karena super admin perlu membaca lintas tenant;
isolasinya ditegakkan oleh klausa `WHERE` eksplisit, konsisten dengan pola
`test_tenant_isolation_subscriptions`.

### 6.2 Suite test tidak bisa dijalankan

`tests/conftest.py:37` menolak `TRUNCATE` karena `DATABASE_URL` menunjuk DB dev
`netra`, dan Postgres `:5436` mati. Akibatnya `tests/test_billing.py` tidak
pernah jalan sama sekali.

Ini bukan sekadar merepotkan — ini yang meloloskan bug `Depends(get_db)` pada
lima endpoint billing (diperbaiki di commit `350c8eb`). Lima route itu tidak
pernah menerima satu request pun sejak ditulis. Membangun dashboard di atas
suite yang tidak jalan akan mengulang kesalahan yang sama dengan permukaan lebih
luas.

Perbaikan, sebagai **prasyarat** sebelum Fase 1:

1. Nyalakan Postgres test dan sediakan database `netra_test`
2. Sediakan `DATABASE_URL` khusus test yang menunjuk ke sana (mis. lewat
   `.env.test` atau variabel di perintah pytest)
3. Perbaiki `tests/test_billing.py` yang tidak pernah mengirim header
   `X-Tenant-Id`. Lima endpoint yang memakai `get_db` akan membalas 400
   ("Tenant context required") untuk super admin tanpa header itu. Ini cacat di
   test, bukan di produksi — `ui/src/api/adminApi.ts:59` sudah mengirimnya.

Sampai langkah ini beres, klaim "sudah ditest" untuk pekerjaan apa pun di
direktori ini tidak punya dasar.

## 7. Frontend

### 7.1 `BillingSummaryPage.tsx` (baru, target < 250 baris)

Route `/admin/billing` (index) dan `/admin/billing/summary`. Menjadi **tab
pertama** di `BillingTabs`, menggantikan Paket sebagai halaman default billing.

Tiga bagian:

1. **Baris kartu KPI** — Belum Dibayar, Lewat Tenggat, Draft, Trial Segera
   Habis. Memakai kelas `stat-card` yang sudah dipakai `SuperAdminHomePage`,
   bukan gaya baru.
2. **Tabel "Perlu Ditagih"** — faktur `issued` belum dibayar, diurutkan
   `due_date` menaik. Kolom: tenant, nomor faktur, jumlah, tenggat, umur
   tunggakan. Baris yang lewat tenggat diberi badge merah dengan jumlah hari
   keterlambatan. Tiap baris menaut ke fakturnya.
3. **Daftar "Perlu Perhatian"** — langganan `past_due`, trial habis < 7 hari,
   langganan berakhir < 30 hari, tenant aktif tanpa langganan. Tiap butir
   menaut ke halaman terkait.

### 7.2 `UsagePage.tsx` (baru, target < 200 baris)

Route `/admin/billing/usage`, tab terakhir.

Tabel per tenant: nama tenant, tanggal snapshot terakhir, active users, devices,
punches, delta 7 hari (panah naik/turun), paket, dan penanda bila melewati tier.
Bisa difilter per tenant dan diurutkan berdasarkan usage.

**Empty state wajib membedakan dua kondisi**, karena keduanya terlihat sama
dari sisi UI tapi artinya berlawanan:

- Belum ada snapshot sama sekali → jelaskan bahwa pengumpulan berjalan harian
  pukul 00:30 UTC dan data mulai muncul pada hari berikutnya
- Ada snapshot lama tapi tidak ada yang baru → indikasi job berhenti, tampilkan
  tanggal snapshot terakhir

Tanpa pembedaan itu, job yang mati akan terbaca sebagai "belum ada aktivitas".

### 7.3 Perubahan pada file yang sudah ada

| File | Perubahan |
|---|---|
| `BillingTabs.tsx` | Tambah tab Ringkasan (pertama) & Usage (terakhir); `isActive` disesuaikan karena default `/admin/billing` berpindah dari Paket ke Ringkasan |
| `SuperAdminDashboard.tsx` | Komponen `BillingAlertStrip` di bawah empat kartu lama: total belum dibayar, jumlah faktur, hitungan lewat tenggat & trial, menaut ke tab Ringkasan. Sembunyi saat semua nol — dashboard tidak perlu memberi tahu bahwa tidak ada masalah |
| `App.tsx` | Route `billing` (index) → `BillingSummaryPage`, `billing/summary`, `billing/usage` |
| `adminApi.ts` | `getBillingSummary`, `getUsageByTenant` + tipe responsnya; tipe `InvoiceOut` dapat `due_date` |
| `useApiQueries.ts` | `useBillingSummary`, `useUsageByTenant`; `queryKeys.billing` diperluas untuk `'summary'` dan `'usage-by-tenant'` |
| `locales/en.json`, `locales/id.json` | Key baru untuk kedua halaman; keduanya harus lengkap — key yang hanya ada di satu bahasa akan tampil sebagai string mentah |

Catatan ukuran: `PlansEditor.tsx` sudah 445 baris, mepet batas 500 di
`CLAUDE.md`. Pekerjaan ini tidak menambah apa pun ke file itu.

## 8. Urutan Pengerjaan

**Prasyarat** — §6.2: hidupkan DB test, perbaiki `test_billing.py`. Tanpa ini
tidak ada verifikasi yang bermakna untuk fase berikutnya.

**Fase 1 — Dashboard operasional.** Migration `due_date`, pengisian saat terbit,
`GET /billing/summary`, `BillingSummaryPage`, `BillingAlertStrip`, tab
Ringkasan. Datanya sudah ada, jadi begitu di-merge langsung berguna.

**Fase 2 — Usage.** Perbaikan guard §6.1, loop snapshot di lifespan,
`GET /billing/usage/by-tenant`, `UsagePage`, tab Usage.

Pemisahan ini disengaja: layar usage baru berisi setelah job berjalan beberapa
hari. Mengirimkannya bersama Fase 1 akan menampilkan halaman kosong yang
terlihat seperti kerusakan.

## 9. Rencana Pengujian

**Backend** (`tests/test_billing.py` dan berkas baru bila melewati 500 baris):

- Bucket agregat `/billing/summary`: faktur di tiap status masuk ke bucket yang
  benar; `overdue` hanya mencakup yang `due_date`-nya sudah lewat; draft tanpa
  `due_date` tidak pernah terhitung overdue
- Pengelompokan mata uang: faktur IDR dan non-IDR tidak dijumlahkan jadi satu
- `paid_this_month` tidak mencakup bulan sebelumnya
- `tenants_without_subscription` mengabaikan tenant yang `deleted_at`-nya terisi
- Pengisian `due_date` otomatis saat status berubah ke `issued`, dan `due_date`
  eksplisit dari klien tidak ditimpa
- `/billing/usage/by-tenant`: satu baris per tenant, yang terambil adalah
  snapshot terbaru, `over_tier` benar di batas tier (tepat di `max_users` bukan
  over; satu di atasnya baru over)
- §6.1: tenant admin hanya menerima usage tenantnya sendiri, dan `tenant_id`
  di query param diabaikan untuk non-platform principal
- Guard peran untuk kedua endpoint baru

**Frontend**: tidak ada test otomatis, karena **`ui/` belum punya infrastruktur
test sama sekali** — nol berkas test dan tidak ada runner (`vitest`/`jest`)
maupun script `test` di `ui/package.json`. Seluruh cakupan test proyek ini ada
di backend.

Konsekuensinya, dua hal berikut hanya bisa diverifikasi manual terhadap aplikasi
yang berjalan, dan harus benar-benar dijalankan sebelum pekerjaan diklaim
selesai:

- Empty state Usage §7.2 pada kedua kondisi (belum ada snapshot; snapshot basi)
- `BillingAlertStrip` muncul saat ada angka bukan nol dan menghilang saat semua nol

Memasang runner test frontend adalah keputusan tersendiri di luar cakupan
dokumen ini. Selama belum ada, logika yang layak diuji sebaiknya ditaruh di
backend (§4.1 dan §4.2 sudah mengikuti prinsip ini: UI hanya menggambar angka
yang sudah dihitung server, tidak menghitung sendiri).

**Migration**: `upgrade()` lalu `downgrade()` pada DB berisi data, memastikan
backfill mengisi hanya baris yang `issued_at`-nya terisi.

## 10. Risiko

| Risiko | Penanganan |
|---|---|
| Backfill `due_date` menghasilkan tunggakan hantu pada faktur lama yang sudah lunas | Bucket `overdue` mensyaratkan `status = 'issued'`, jadi faktur `paid` tidak pernah masuk hitungan berapa pun `due_date`-nya |
| Loop snapshot jalan dobel saat backend di-scale | Idempoten per `(tenant_id, snapshot_date)`, dijamin unique constraint dan sudah ada tesnya |
| Halaman Usage kosong dikira rusak | Empty state §7.2 membedakan "belum mulai" dari "job berhenti" |
| Agregasi summary melambat seiring pertumbuhan faktur | Semua bucket satu kueri agregat; index `(status, due_date)` menopang jalur overdue |
