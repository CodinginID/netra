# Integration

Netra can plug into your existing systems.

## Embedded enrollment

Let employees enroll their face from inside **your** HR portal:

1. Your backend requests a **one-time embed token** from the Netra API for a
   specific employee.
2. Your app opens the Netra enrollment page inside an iframe with that token.
3. The token is single-use and origin-locked — the frame only renders on the
   origin you registered.

## API access

The Netra REST API covers users, enrollment, devices, schedules, and
attendance events. See the full **[API reference](/guide/api-reference)** for
every endpoint, its parameters, and response shapes. Contact your platform
administrator for API credentials.

::: tip Webhooks & realtime
Attendance events are pushed over WebSocket to the dashboard. For
server-to-server notification needs, talk to us about webhook options.
:::
