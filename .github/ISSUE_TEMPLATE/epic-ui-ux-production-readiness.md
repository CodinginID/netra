# Epic: UI/UX Production Readiness — Onboarding, A11y, Undo/Recovery, WebSocket Real-Time

## Context

Netra akan launch dengan **1000+ user aktif per hari** (peak morning 07:00-09:00 dan evening 16:00-18:00) dan akan terus grow. Saat ini UI/UX masih perlu beberapa improvement agar production-ready untuk scale tersebut.

### Scale Math — Why WebSocket, Not Polling

| Scenario | Polling (current) | WebSocket (target) |
|----------|-------------------|-------------------|
| Dashboard users | 1000 × 1 req/60s = **1000 req/min** | 1000 koneksi, **0 req/min** idle |
| Notification bell | 1000 × 1 req/60s = **1000 req/min** | Server push **hanya saat ada event** |
| Kiosk auto-scan | 50 × 24 req/min = **1200 req/min** | Tetap polling (harus kirim gambar) |
| DB query overhead | ~2200 queries/min (most return unchanged data) | ~5-10 queries/min (only on actual events) |

**Kesimpulan:** Polling tidak sustainable untuk 1000+ concurrent users. WebSocket harus diimplementasikan sekarang (pre-launch) karena migration cost akan jauh lebih tinggi setelah user base besar.

---

## Phase 1: Accessibility (A11y) — Foundation

**Priority:** P0 — Harus selesai sebelum launch. Legal requirement (WCAG 2.1 AA) + UX dasar.

### Tasks

- [ ] **1.1** Audit semua icon buttons: tambah `aria-label` di setiap `<button>` yang cuma punya icon (lucide-react icons)
- [ ] **1.2** Focus states: tambahkan `outline: 2px solid var(--color-brand); outline-offset: 2px` di semua interactive elements
- [ ] **1.3** Keyboard navigation: pastikan semua modal bisa di-close dengan `Escape`, focus trap di modal, tab order logis
- [ ] **1.4** Color contrast: audit WCAG AA (4.5:1) untuk teal `#0d9488` on white, sidebar text on navy
- [ ] **1.5** Screen reader: tambah `role`, `aria-live` di toast notifications, stat cards, dan result overlays di kiosk
- [ ] **1.6** Skip navigation link: "Skip to main content" untuk keyboard users
- [ ] **1.7** Form labels: pastikan semua `<input>` punya `<label>` yang ter-asosiasi (bukan cuma placeholder)

**Files affected:** `ui/src/styles/global.css`, semua `ui/src/pages/`, `ui/src/components/`, `ui/src/components/Toast.tsx`

---

## Phase 2: Onboarding Flow — Guided Setup

**Priority:** P0 — Tenant baru harus bisa setup sendiri tanpa bantuan admin/sales.

### Tasks

- [ ] **2.1** Buat `OnboardingWizard` component (5 steps):
  1. **Welcome** — "Selamat datang di Netra!" + brief product tour
  2. **Buat Schedule pertama** — Default shift (08:00-17:00, grace 15 min)
  3. **Daftar Device pertama** — Generate device token + QR code untuk kiosk
  4. **Invite Users** — Upload CSV atau input manual (min 1 user untuk test)
  5. **Test Attendance** — Simulasi scan wajah pertama, confirm everything works
- [ ] **2.2** Onboarding state tracking: field `onboarding_completed_at` di Tenant model
- [ ] **2.3** Onboarding banner di dashboard: muncul kalau `onboarding_completed_at` null, bisa di-dismiss
- [ ] **2.4** Tooltip/hotspot tour: overlay highlight di sidebar, stat cards, enrollment page
- [ ] **2.5** Empty state illustrations: custom SVG untuk "Belum ada data" di setiap halaman (users, attendance, devices, schedules)

**Files affected:** `ui/src/components/OnboardingWizard.tsx`, `ui/src/styles/onboarding.css`, `backend/app/models.py` (tenant field), `backend/app/schemas.py`

---

## Phase 3: Undo / Delete Recovery

**Priority:** P1 — Mencegah accidental data loss, especially penting untuk multi-tenant admin.

### Tasks

- [ ] **3.1** Soft delete di backend: tambah `deleted_at` column di User, Device, Schedule, Tenant models
- [ ] **3.2** Filter `deleted_at IS NULL` di semua list queries (auto-filter via SQLAlchemy event listener atau custom query method)
- [ ] **3.3** Confirmation modal untuk semua delete actions: "Yakin hapus X? Data bisa di-restore dalam 30 hari."
- [ ] **3.4** Undo toast pattern: setelah delete, toast muncul "X dihapus — [Undo]" selama 5 detik
- [ ] **3.5** Trash/recycle bin page: `/tenant/trash` — list soft-deleted items dengan restore/permanent delete
- [ ] **3.6** Auto-purge: Alembic migration atau cron job untuk hard delete items > 30 hari

**Files affected:** `backend/app/models.py`, `backend/app/api/v1/users.py`, `backend/app/api/v1/devices.py` (new router), `backend/app/api/v1/schedules.py`, `backend/app/api/v1/tenants.py` (new router), `ui/src/pages/tenant-admin/TrashPage.tsx`, `ui/src/api/adminApi.ts`

---

## Phase 4: General UI Improvements

**Priority:** P1 — Membuat aplikasi terasa "polished" dan comparable dengan benchmark internasional.

### Tasks

- [ ] **4.1** Pagination di semua data tables: server-side pagination (`?page=1&limit=20`) di backend, pagination controls di frontend
- [ ] **4.2** Sorting di data tables: clickable column headers, sort indicator (↑↓)
- [ ] **4.3** Stat card trend indicators: tambah arrow (↑↓) + % change vs yesterday/last-week di semua stat cards
- [ ] **4.4** Search di data tables: server-side search (bukan client-side filter) untuk datasets besar
- [ ] **4.5** Sticky header di data tables: `position: sticky; top: 0` untuk scrollable tables
- [ ] **4.6** Loading state consistency:統一 kan loading pattern di semua pages (skeleton vs spinner — pilih satu)
- [ ] **4.7** Error boundary: React Error Boundary di level page, fallback UI yang actionable
- [ ] **4.8** Kiosk auto-scan configurable: setting interval (1-5s) di tenant config, default 3s
- [ ] **4.9** Notification bell: tambah "Mark all as read", dropdown scrollable (max 20 items)
- [ ] **4.10** CSV export: tambah progress indicator untuk large exports, bukan cuma blob download

**Files affected:** Hampir semua page files, `backend/app/api/v1/attendance.py`, `backend/app/api/v1/users.py`, `ui/src/styles/global.css`

---

## Phase 5: WebSocket Real-Time Engine

**Priority:** P0 — Fundamental architecture change, harus selesai sebelum launch.

### Architecture

```
┌─────────────┐      WebSocket       ┌─────────────────────┐
│  Frontend    │◄────────────────────►│  FastAPI Backend     │
│  (1000 conn) │   ws://host/ws      │  WebSocketManager    │
│              │                      │  - connection pool   │
│  - Dashboard │◄── PUSH ──────────── │  - tenant channels  │
│  - NotifBell │◄── PUSH ──────────── │  - device channels  │
│  - KioskPage │                     │                      │
└─────────────┘                      └──────────┬───────────┘
                                                │
                                    ┌───────────▼───────────┐
                                    │  Event Bus (Redis)     │
                                    │  - pub/sub for scale   │
                                    │  - multi-instance sync │
                                    └───────────────────────┘
```

### Tasks

- [ ] **5.1** Tambah `websockets` dependency di `pyproject.toml`
- [ ] **5.2** Buat `WebSocketManager` class:
  - Track connections per `tenant_id` (channel: `tenant:{id}`)
  - Track connections per `device_id` (channel: `device:{id}`)
  - Track connections per `user_id` (channel: `user:{id}`)
  - Handle disconnect + auto-reconnect dengan exponential backoff
- [ ] **5.3** Buat `/ws` WebSocket endpoint di FastAPI:
  - Authenticate via JWT query param: `ws://host/ws?token=xxx`
  - Subscribe ke channel berdasarkan role (super_admin subscribe semua tenant, tenant_admin subscribe tenant sendiri)
  - Heartbeat ping/pong setiap 30s untuk detect dead connections
- [ ] **5.4** Integrasikan event publishing di existing services:
  - `attendance_service.record()` → publish `attendance.recorded` event
  - `attendance_service.record()` → publish `attendance.late` event (kalau status = late)
  - Device revoke → publish `device.revoked` event (kiosk langsung tahu)
- [ ] **5.5** Frontend: buat `useWebSocket()` hook:
  - Connect on mount, disconnect on unmount
  - Auto-reconnect dengan backoff (1s, 2s, 4s, 8s, max 30s)
  - Event handler registry: `on('attendance.recorded', handler)`
  - Fallback ke polling kalau WebSocket tidak support (old browser)
- [ ] **5.6** Ganti notification bell polling → WebSocket:
  - Subscribe ke `tenant:{id}` channel
  - On `attendance.late` event → increment badge count, push ke dropdown
  - On `attendance.recorded` event → refresh stats kalau perlu
- [ ] **5.7** Ganti dashboard stats polling → WebSocket:
  - On `attendance.recorded` event → update stat cards tanpa full page refresh
  - On `attendance.late` event → update "Terlambat" count
- [ ] **5.8** Redis pub/sub untuk multi-instance (optional, untuk scale > 1 server):
  - Tambah Redis dependency
  - `WebSocketManager` publish ke Redis → semua instance forward ke local connections
  - Atau pakai Redis Streams sebagai event log
- [ ] **5.9** Kiosk real-time sync (bonus):
  - Subscribe ke `device:{id}` channel
  - Admin bisa remote-lock/restart kiosk dari dashboard
  - Kiosk terima config update tanpa reload

### WebSocket Event Schema

```typescript
// Event yang di-push dari server ke client
interface WSEvent {
  type: 'attendance.recorded' | 'attendance.late' | 'device.revoked' | 'user.enrolled' | 'config.updated';
  tenant_id: string;
  timestamp: string;  // ISO 8601
  data: Record<string, unknown>;
}

// Contoh: attendance.recorded
{
  "type": "attendance.recorded",
  "tenant_id": "abc-123",
  "timestamp": "2026-06-23T08:15:30Z",
  "data": {
    "user_id": "user-456",
    "full_name": "Budi Santoso",
    "att_type": "check_in",
    "status": "on_time",
    "occurred_at": "2026-06-23T08:15:30Z"
  }
}

// Contoh: attendance.late
{
  "type": "attendance.late",
  "tenant_id": "abc-123",
  "timestamp": "2026-06-23T08:20:00Z",
  "data": {
    "user_id": "user-789",
    "full_name": "Siti Aminah",
    "occurred_at": "2026-06-23T08:20:00Z",
    "late_minutes": 20
  }
}
```

### Frontend Fallback Strategy

```
WebSocket available? → Connect ws://, use for real-time
                         ↓ (connection fails)
                    SSE available? → Connect /events, use for server-push
                                       ↓ (SSE fails)
                                  Polling (current behavior) — degraded mode
```

**Files affected:** `backend/app/websocket.py` (new), `backend/app/api/ws.py` (new router), `backend/app/services/attendance_service.py` (add publish), `backend/app/services/device_service.py` (add publish), `ui/src/hooks/useWebSocket.ts` (new), `ui/src/components/NotificationBell.tsx` (replace polling), `ui/src/pages/tenant-admin/TenantAdminDashboard.tsx` (replace polling), `ui/src/api/kioskApi.ts` (add device channel)

### Acceptance Criteria

1. **Dashboard stats update dalam <1 detik** setelah attendance record dibuat (tanpa page refresh)
2. **Notification bell badge update real-time** saat ada late check-in baru
3. **Device revoke langsung terasa** di kiosk (kiosk stop scanning dalam 2 detik setelah revoke)
4. **No regression di polling fallback** — kalau WebSocket down, app tetap jalan dengan polling
5. **Load test:** 1000 concurrent WebSocket connections, server memory <500MB, CPU <30%

---

## Phase 6: Kiosk UI Polish

**Priority:** P1 — Kiosk adalah primary user-facing touchpoint.

### Tasks

- [ ] **6.1** Countdown timer visual di kiosk: "Scan berikutnya dalam 3s" — progress bar animasi
- [ ] **6.2** Face detection feedback: kalau tidak ada wajah terdeteksi, tampilkan "Posisikan wajah di area oval"
- [ ] **6.3** Offline mode: kalau backend down, kiosk tampilkan "Sedang maintenance" dengan retry button
- [ ] **6.4** Volume control untuk voice guide: mute/unmute di kiosk settings
- [ ] **6.5** Multi-language support di kiosk: toggle Bahasa Indonesia / English
- [ ] **6.6** Kiosk lock screen: setelah idle 5 menit, tampilkan "Tap untuk mulai" (mencegah unauthorized access ke settings)

**Files affected:** `ui/src/pages/kiosk/KioskPage.tsx`, `ui/src/styles/kiosk.css`

---

## Phase 7: Performance Optimization

**Priority:** P1 — Untuk 1000+ users, performance adalah UX.

### Tasks

- [ ] **7.1** React Query / TanStack Query: migrasi dari manual fetch ke React Query untuk automatic caching, deduplication, background refetch
- [ ] **7.2** Code splitting: lazy load routes yang tidak critical (`/admin/tenants`, `/tenant/users`, dll)
- [ ] **7.3** Image optimization: kiosk frame capture kirim dalam resolusi optimal (bukan full HD), compress sebelum upload
- [ ] **7.4** CSS bundle: audit dan minify CSS, hapus unused styles
- [ ] **7.5** Service Worker caching: cache static assets + API responses (stale-while-revalidate)
- [ ] **7.6** Debounce search inputs: 300ms delay sebelum API call
- [ ] **7.7** Virtual scroll untuk data tables besar (>100 rows): `react-window` atau `@tanstack/react-virtual`

**Files affected:** `ui/package.json` (new deps), `ui/src/api/` (all files), `ui/src/App.tsx`, `ui/src/pages/`

---

## Implementation Order

```
Phase 1 (A11y)          → 2-3 hari   → Quick win, must-have
Phase 2 (Onboarding)     → 3-4 hari   → Must-have untuk self-service
Phase 3 (Undo/Recovery)  → 2-3 hari   → Data safety
Phase 5 (WebSocket)      → 5-7 hari   → Foundation untuk scale ← CRITICAL
Phase 4 (UI Polish)      → 3-4 hari   → Bisa paralel dengan Phase 5
Phase 6 (Kiosk Polish)   → 2-3 hari   → Bisa paralel
Phase 7 (Performance)    → 3-4 hari   → React Query migration paling berat
```

**Total estimate:** 3-4 minggu untuk semua phases.

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Time-to-first-value (tenant baru) | ~30 min (manual setup) | <5 min (guided onboarding) |
| Dashboard data freshness | Up to 60s delay | <1s (WebSocket) |
| Notification latency | Up to 60s delay | <1s (WebSocket) |
| Accidental data loss incidents | N/A (no undo) | 0 (soft delete + undo) |
| Lighthouse Accessibility | Not tested | ≥90 |
| Kiosk scan success rate | Unknown | ≥95% (better feedback) |
| API req/min at 1000 users | ~2200 (polling) | <200 (WebSocket + caching) |
