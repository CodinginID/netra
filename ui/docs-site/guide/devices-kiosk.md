# Devices & kiosk

A **kiosk** is a tablet or screen at the entrance that recognizes faces and
records attendance. A tenant can run many kiosks — each device has its own
token.

## Register a device

1. Open **Devices** in the sidebar and click **Add Device**.
2. Name the device (e.g. *Lobby-1*) and click **Register**.
3. Copy the **device token** that appears and enter it on the kiosk.

Repeat for every additional kiosk.

## Set up the kiosk

1. On the kiosk device, open the app's **/attendance** page.
2. Enter the device token when prompted. The token authenticates the device —
   no user login is needed.
3. Allow camera access. The kiosk is now live and greets recognized employees
   with their name and check-in time.

## Manage devices

The **⋮** menu on each device card has:

- **View Token** — show the device's token again if it was lost, without
  changing it. Every view is recorded in the audit log.
- **Reset Token** — issue a new token; the old one stops working at once. On a
  revoked device this is **Restore Token**, which also reactivates it.
- **Revoke** — disable the token; the device stays in the list.
- **Delete** — remove the device from the list and stop its token at once. It
  can be restored from **Trash** within 30 days.

::: tip Older devices
Devices registered before **View Token** existed need one **Reset Token**.
After that their token can be viewed at any time.
:::

::: warning Keep tokens secret
Anyone holding a device token can act as that kiosk, and tenant admins can view
tokens at any time. Revoke or delete a device if it is lost or replaced.
:::
