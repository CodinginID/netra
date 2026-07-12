# What is Netra

Netra is a **touchless attendance platform** based on face recognition.
Cameras stream footage to the Netra backend, which identifies enrolled faces
in real time and records attendance events automatically — no cards, no
fingerprints, no queues.

## How it works

1. **Enroll faces** — an admin registers each employee's face with guided poses.
2. **Cameras recognize** — kiosks or area cameras detect and match faces in real time.
3. **Attendance is recorded** — events appear on the dashboard instantly, matched
   against the employee's work schedule.

## Key concepts

| Term | Meaning |
|---|---|
| **Tenant** | Your organization's isolated space. Data is never shared between tenants. |
| **Enrollment** | The one-time process of registering an employee's face. |
| **Kiosk** | A device (tablet/screen) at an entrance running the attendance page. |
| **Schedule** | Working hours assigned to employees; lateness is computed against it. |

::: tip Data isolation
Every tenant's data is hard-isolated at the data layer. Users in one
organization can never see another organization's data.
:::

## Where to next

- [Sign in & user roles](/guide/sign-in-roles) — access the dashboard
- [Face enrollment](/guide/enrollment) — register your first employees
- [Devices & kiosk](/guide/devices-kiosk) — put a kiosk at the entrance
