# Devices & kiosk

A **kiosk** is a tablet or screen at an entrance that recognizes faces and
records attendance.

## Register a device

1. Open **Devices** in the sidebar and click **Add Device**.
2. Name the device (e.g. *Lobby-1*) and create it.
3. Copy the generated **device token** — you'll need it once on the kiosk.

## Set up the kiosk

1. On the kiosk device, open the app's **/attendance** page.
2. Enter the device token when prompted. The token authenticates the device —
   no user login needed.
3. Allow camera access. The kiosk is now live and will greet recognized
   employees with their name and check-in time.

::: warning Keep tokens secret
Anyone with a device token can act as that kiosk. Revoke a token from the
Devices page if a device is lost or replaced.
:::
