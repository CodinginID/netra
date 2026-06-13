# netra — UI

Progressive Web App frontend for the netra multi-tenant face-recognition attendance platform.

## Stack

- **Vite** + **React 18** + **TypeScript**
- **vite-plugin-pwa** — PWA manifest, service worker, installable
- **React Router v6** — client-side routing with nested layouts
- **Zustand** — auth state with localStorage persistence

## Getting Started

```bash
cp .env.example .env        # set VITE_API_BASE_URL if needed
npm install
npm run dev                 # http://localhost:5173
```

## Build

```bash
npm run build
npm run preview
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8000/api/v1` | Backend API base URL |

## Project Structure

```
src/
  api/          HTTP helpers (authApi)
  components/   Shared UI (DashboardLayout)
  pages/
    auth/       LoginPage
    tenant-admin/  TenantAdminDashboard, UsersPage, DevicesPage, SchedulesPage, AttendancePage
    super-admin/   SuperAdminDashboard, TenantsPage
  router/       ProtectedRoute (role-based guards)
  store/        authStore (Zustand, persisted)
  styles/       global.css, auth.css, layout.css
  types/        auth types, Role enum
```

## Roles

| Role | Access |
|---|---|
| `super_admin` | `/admin/*` |
| `tenant_admin` | `/tenant/*` |
| `supervisor` | `/tenant/*` |
| `end_user` | (Phase 2) |
| `kiosk` | (Phase 2) |
