# 🚀 Feature Roadmap — Functional Capabilities Beyond MVP

## 🎯 Goal

Track the next wave of **functional** features for Netra (multi-tenant face-recognition attendance) beyond the current MVP. The MVP covers: email/JWT auth, kiosk device-token attendance, face enrollment (consent/UU PDP), schedule-window validation, dedup, geofence flagging + location capture, daily status roster, reports/exports, soft-delete/trash, onboarding, webhooks, realtime (WebSocket).

This issue is the umbrella tracker; each phase can be split into its own issue when picked up.

---

## 🔴 Phase 1 — Core Reliability (do first)

- [ ] **1.1** Recognition accuracy: upgrade `buffalo_s → buffalo_l` (detector `det_10g` + ResNet50 `w600k_r50`), retune `MATCH_THRESHOLD`, add quality gate (min det score / min face size). *Blocker: current same-person similarity ~0.05.*
- [ ] **1.2** Manual attendance correction / override (admin) — fix missed scans, on-duty-outside, wrong matches.
- [ ] **1.3** Leave / permission management (Izin / Sakit / Cuti / Dinas Luar) — new status so "Belum Hadir" ≠ "Izin"; reflected in roster + reports.
- [ ] **1.4** Fix test isolation flakiness (shared async engine across files) + reportlab in image (rebuild) + ensure CI green.

## 🟠 Phase 2 — Attendance & Scheduling Depth

- [ ] **2.1** Per-group schedules — assign schedules to class/department/shift group (not one tenant default).
- [ ] **2.2** Holiday calendar UI (rules already support `holidays`).
- [ ] **2.3** Geofence config UI in Schedule form (set center lat/lng + radius_m) — backend flag already implemented.
- [ ] **2.4** Multi-session / per-subject attendance (session schedule type exists; needs UI + flow).
- [ ] **2.5** Kiosk offline mode — queue punches when offline, sync on reconnect.

## 🟡 Phase 3 — Notifications & Communication

- [ ] **3.1** Outbound notifications (WhatsApp / Email / SMS) to parents/guardians/HR on late/absent.
- [ ] **3.2** Notification preferences per tenant (channels, thresholds, quiet hours).
- [ ] **3.3** Daily/period digest to homeroom teacher / manager.

## 📊 Phase 4 — Reporting & Analytics

- [ ] **4.1** Analytics dashboard — attendance trend (line), status breakdown (donut), peak hours, % present per group.
- [ ] **4.2** Per-user history + attendance percentage (for report cards / performance).
- [ ] **4.3** Scheduled/automated reports emailed to admins.
- [ ] **4.4** Audit log viewer UI (table `audit_logs` is populated; UI is a placeholder).

## 🔌 Phase 5 — Integration (client data linkage)

- [ ] **5.1** API key management + webhook management UI (let client apps pull attendance; `external_id` is the join key).
- [ ] **5.2** Bulk import (CSV/Excel) of users + external_id (validate dropdown/flow).
- [ ] **5.3** Push-back sync of attendance results to client SIS/HRIS (scheduled).
- [ ] **5.4** SSO / OIDC staff login (Google Workspace / Microsoft) — SSO model scaffold exists.

## 🧠 Phase 6 — Biometric & Kiosk

- [ ] **6.1** Re-enrollment workflow (faces drift over time — glasses, growth).
- [ ] **6.2** Quality gate + multi-face rejection before embedding.
- [ ] **6.3** Self-attendance via phone (selfie + geofence, per-user device token) — no physical kiosk.

## 🔐 Phase 7 — Security & Compliance (UU PDP)

- [ ] **7.1** Consent management + right-to-erasure (revoke consent, delete biometrics on request).
- [ ] **7.2** Data retention / auto-purge of old embeddings & images (partial purge exists for soft-delete).
- [ ] **7.3** 2FA for admin accounts.

## 🏢 Phase 8 — SaaS Platform (super admin)

- [ ] **8.1** Billing / subscription (per user/tenant quotas, plan limits).
- [ ] **8.2** Per-tenant usage metrics (scans, storage, active users).
- [ ] **8.3** White-label branding per tenant (tenant config space already exists).

---

## ✅ Recommended order

1. **Phase 1.1 (recognition accuracy)** — core product blocker; everything else sits on this.
2. **Phase 1.2 + 1.3 (manual correction + leave/permission)** — makes attendance data correct & complete (distinguish alpa vs izin).
3. **Phase 3.1 (outbound notifications)** — highest perceived value for schools.

## 📝 Notes

- Geolocation requires HTTPS in production (works on localhost dev).
- Recognition similarity issue is the current hard blocker — see Phase 1.1.
- Related UI/UX track: `.github/ISSUES/ui-ux-redesign-10-10.md`.
