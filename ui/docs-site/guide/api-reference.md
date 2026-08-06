# Integration API Reference

The official reference for the Netra Integration API — the surface your own
application calls to pull attendance data and sync your roster. Hand this page
to your developers.

- **Base URL:** `https://api-netra.flowbiz.id/api/v1`
- Every endpoint below is prefixed with `/integration`.
- All data is **automatically scoped to your organization** — you can never see
  or touch another tenant's data.

## Authentication

Every request must carry your API key, either header works:

```
X-API-Key: ntr_live_xxxxxxxxxxxxxxxxxxxx
```
```
Authorization: Bearer ntr_live_xxxxxxxxxxxxxxxxxxxx
```

::: warning Keep the key on your server
The API key is **server-to-server only**. Keep it on your backend and expose
thin proxy routes to your frontend — never ship the key to a browser. If it
leaks, Reset or Revoke it from the **Integration & API** menu in your Netra
admin dashboard.
:::

Create and manage keys under **Integration & API** in the admin dashboard. Each
key is granted one or more **scopes**:

| Scope | Grants |
|-------|--------|
| `attendance:read` | Read attendance records & reports |
| `users:read` | Read the user list + enrolled status |
| `users:write` | Create/update users via sync (upsert by `external_id`) |
| `embed:enroll` | Mint embed sessions for face enrollment |

A request whose key lacks the required scope is rejected with `403`.

## Response format

Every response — success or error — uses the same envelope:

```json
{ "data": ..., "error": null }
```

On error, `data` is `null` and `error` carries a message:

```json
{ "data": null, "error": "API key missing required scope: users:write" }
```

Lists are paginated inside `data`:

```json
{ "data": { "items": [ ... ], "total": 128, "page": 1, "limit": 50, "pages": 3 }, "error": null }
```

## Errors

| Status | Meaning |
|--------|---------|
| `401` | Missing / invalid / revoked / expired API key |
| `403` | Key is valid but lacks the required scope (or origin not allowed, for embed) |
| `422` | Invalid request (bad date format, empty batch, over the 500 limit, etc.) |

---

## GET /integration/attendance

Paginated attendance records, newest first. Scope: `attendance:read`.

**Query parameters**

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `page` | int | `1` | Page number (≥ 1) |
| `limit` | int | `50` | Items per page (1–1000) |
| `user_id` | string | — | Filter to one user |
| `from` | date | — | `YYYY-MM-DD`, inclusive |
| `to` | date | — | `YYYY-MM-DD`, inclusive |

```bash
curl -H "X-API-Key: ntr_live_xxxxx" \
  "https://api-netra.flowbiz.id/api/v1/integration/attendance?from=2026-06-01&to=2026-06-30&page=1&limit=50"
```

**Response**

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

Today's roster: every active user with their status for a given day. Scope:
`attendance:read`.

**Query parameters**

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `date` | date | yes | `YYYY-MM-DD` |

```bash
curl -H "X-API-Key: ntr_live_xxxxx" \
  "https://api-netra.flowbiz.id/api/v1/integration/attendance/daily-status?date=2026-06-25"
```

**Response** — `data` is a flat array (not paginated):

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

`status` is one of `absent`, `present`, `late`, `checked_out`.

---

## GET /integration/users

Paginated end-users with their enrolled flag. Scope: `users:read`.

**Query parameters**

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `page` | int | `1` | Page number (≥ 1) |
| `limit` | int | `50` | Items per page (1–1000) |

```bash
curl -H "X-API-Key: ntr_live_xxxxx" \
  "https://api-netra.flowbiz.id/api/v1/integration/users?page=1&limit=50"
```

**Response**

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

Push your employee roster **into** Netra so records exist before anyone enrolls.
Scope: `users:write`.

Keyed by your own `external_id`, so the call is **idempotent** — an existing
`external_id` is updated (its `full_name` refreshed), never duplicated. You can
safely replay your full roster any time. A previously removed employee who is
re-sent is reactivated. Users created here later merge with face enrollment on
the same `external_id`, and appear in the **Manage Users** menu of your admin
dashboard.

**Request body** — one object, or an array for bulk sync (**max 500 per
request**):

| Field | Type | Notes |
|-------|------|-------|
| `external_id` | string | Required, 1–255 chars. Your own stable ID. |
| `full_name` | string | Required, 1–255 chars. |

```bash
curl -X POST "https://api-netra.flowbiz.id/api/v1/integration/users" \
  -H "X-API-Key: ntr_live_xxxxx" -H "Content-Type: application/json" \
  -d '[{"external_id":"EMP-001","full_name":"Budi Santoso"},
       {"external_id":"EMP-002","full_name":"Siti Aminah"}]'
```

**Response** — confirms exactly what happened. Each row carries a `created`
flag (`true` = newly inserted, `false` = matched & updated), plus a batch
`summary`:

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

Read `summary` to report the result back to your users, e.g. *"2 received —
1 new, 1 updated."*

::: tip Duplicates within one batch
If the same `external_id` appears twice in a single request, the last occurrence
wins and it counts once. So `created + updated` reflects unique users, and may be
less than `received`.
:::

---

## POST /integration/embed-sessions

Mint a one-time, origin-locked URL that renders Netra's face-enrollment page
inside an `<iframe>` in your app. Scope: `embed:enroll`.

**Request body**

| Field | Type | Notes |
|-------|------|-------|
| `external_id` | string | Required, 1–255 chars. |
| `full_name` | string | Optional, ≤ 255 chars. |
| `return_origin` | string | Required. Must be on this key's embed allowlist. |
| `is_minor` | bool | Default `false`. |

```bash
curl -X POST "https://api-netra.flowbiz.id/api/v1/integration/embed-sessions" \
  -H "X-API-Key: ntr_live_xxxxx" -H "Content-Type: application/json" \
  -d '{"external_id":"EMP-001","full_name":"Budi","return_origin":"https://app.yours.com","is_minor":false}'
```

**Response** (`201 Created`) — the token lives inside `url`; it is single-use and
expires in ~15 minutes:

```json
{
  "data": {
    "token": "…",
    "url": "https://app.yours.com/embed/enroll?token=…",
    "expires_at": "2026-07-20T09:15:00Z"
  },
  "error": null
}
```

If `return_origin` is not on the key's allowlist, the call returns `403`. Add
your origin via **Manage Origins** on the key card first. See the
[Integration guide](/guide/integration) for the iframe + `postMessage` flow.
