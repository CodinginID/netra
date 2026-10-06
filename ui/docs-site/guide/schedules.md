# Work schedules

A schedule decides whether a scan is **on time**, **late**, or an **early
leave**. Everyone's attendance is evaluated against the **default schedule** —
other schedules are kept but have no effect until one is made the default.

## Create a schedule

1. Open **Schedules** in the sidebar and click **Add Schedule**.
2. Enter a name and pick a type: **Daily shift** or **Session / period**.
3. Set the days and hours (see below), then the late tolerance.
4. Turn on **Make default** if this schedule should be the one in use. The
   first schedule you create is always the default.
5. Click **Save schedule**.

## Daily shift

Each day has its own start and end time. Switch a day off to make it a **day
off**.

- **Mon – Fri**, **Mon – Sat** and **Every day** set the working days in one
  click.
- **Copy the first day's hours to all working days** makes every day match.
- Each day's duration and the weekly total are calculated for you.

Example: Monday–Thursday 08:00–17:00, Friday 08:00–11:30, weekend off.

::: warning No overnight shifts
The end time must be after the start time on the same day. Shifts that cross
midnight are not supported yet.
:::

## Session / period

Suited to schools and campuses: a day is made of several sessions. Check-in is
judged against the first session, check-out against the last.

1. Choose the **active days** (or use a quick button).
2. Leave **Same sessions every day** on if every day uses the same sessions,
   and fill in the list.
3. If some day differs (e.g. a shorter Friday), turn that switch off. A tab per
   day appears so you can set each day's sessions, and **Copy … sessions to all
   active days** helps you duplicate them.

## Late tolerance

A check-in after the start time **plus the tolerance** is marked **late**. With
a 08:00 start and 15 minutes' tolerance, 08:15 is still on time and 08:16 is
late.

## Days off

Scans on a day that is switched off are never marked late or an early leave,
and the check-in window does not apply.

## Managing schedules

Use the **All / Shift / Session** filter above the list. The **⋮** menu on each
card has **Edit**, **Make default** and **Delete**. Deleted schedules can be
restored from **Trash** within 30 days. The default can't be switched off in
the form — make another schedule the default to replace it. Deleting the
default makes the newest remaining schedule the default.
