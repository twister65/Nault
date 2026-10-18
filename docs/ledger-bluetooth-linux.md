# Ledger Web Bluetooth in Nault Desktop

Desktop Bluetooth now uses `@ledgerhq/hw-transport-web-ble` in the sandboxed
renderer, with Chromium / BlueZ handling Bluetooth on Linux. USB continues to
use the existing native HID worker. Noble, bluetooth-hci-socket and NAN are no
longer dependencies, and no Bluetooth native rebuild is needed.

## Update and launch

Close Nault. If a capability was previously added to Electron, remove it first:

```sh
getcap node_modules/electron/dist/electron
# Only if the preceding command reports capabilities:
sudo setcap -r node_modules/electron/dist/electron
```

Then run each step, stopping on any failure:

```sh
git pull --ff-only
npm ci --legacy-peer-deps --include=optional --foreground-scripts
NODE_OPTIONS=--openssl-legacy-provider npm run desktop:build
node scripts/test-ledger-bluetooth.js
env -u NODE_OPTIONS npm run desktop:dev
```

Do not run Nault as root, grant capabilities to Electron, or disable its sandbox.
The Linux Bluetooth service / adapter must be enabled and accessible to your
logged-in desktop session. This integration does not change system permissions.

## Connect

1. Disconnect the Ledger USB cable, unlock the Nano X, enable Bluetooth, and
   open the Nano application. Close other applications using that Ledger.
2. In Nault, follow **Settings → Configure new wallet → Use Ledger -> Connect via Bluetooth**.
   This is the entry point used for the Nano X manual connection test.
   For an existing Bluetooth wallet, click **Reconnect**; selection is
   intentionally not launched in the background.
3. Select your Ledger in Nault's native dialog. Use **Refresh** if the initial
   list is empty. No device is selected automatically. Device names are labels,
   not a guarantee of identity; verify addresses on the Ledger display.
4. When a pairing code is shown, confirm only if it matches the Ledger screen.
   Cancel if it differs. PIN-entry pairing modes are rejected; this integration
   supports confirmation and numeric comparison used by Nano X.
5. Verify the account address on the Ledger. Test rejection and approval of a
   small transaction, receipt, representative change, disconnect and reconnect.
   Re-test USB independently.

## Reconnect after a disconnection

Keep the Nano X charged and close to the Bluetooth adapter. After a radio
disconnection, unlock it, open Nano, and click **Reconnect** in the wallet widget.
Select the device again; restarting Nault should not be necessary.

To validate recovery, disconnect while Nault is idle, reconnect, then repeat
while an address verification or signing request is pending. The interrupted
request must fail instead of remaining pending, and a new connection must work
in the same application session. Check the account history before repeating an
interrupted send; reconnection never automatically retries a transaction.

The renderer owns each GATT notification session: disconnect rejects pending
exchanges, removes listeners, and prevents old status checks from resetting a
new connection. Cleanup does not call `stopNotifications` on a disconnected
server. Ledger's transport still handles APDU framing and exchange locking.

## Chromium notification recovery after an MTU timeout

On some Linux Chromium/BlueZ reconnects, `startNotifications()` resolves
and a Ledger MTU reply appears in `btmon`, yet
`characteristicvaluechanged` never fires in the renderer. This is a
notification-delivery failure, not proof that the Ledger failed to respond.

After a reported `MTU negotiation timed out` failure, the Ledger wallet
widget offers **Reset Bluetooth session**. Use it only when disconnected.
It reloads Nault's renderer (a fresh Web Bluetooth page context), **without
restarting the Electron process**, then you can click **Reconnect** and
reselect the Ledger. This is a manual, experimental recovery path, not an
automatic reconnect or a bypass of MTU/APDU validation. Unsaved form fields
will be lost; check account history before retrying any interrupted send.
This does not change or delete the wallet seed on the Ledger.

If resetting the renderer still fails, restart Nault normally. The issue
may also be in Chromium's native Bluetooth stack and not only in the page
context. USB remains a supported fallback.

## Design and tests

Ledger's existing Web BLE transport filters devices by Ledger service UUIDs.
The main process controls selection and pairing, bound to the trusted wallet
window. Pairing also checks the initiating main frame and selected device ID.
Cancellation, navigation, renderer exit and timeouts reject pending requests.
Node integration stays disabled; context isolation and the renderer sandbox stay
enabled. No new renderer-to-main IPC surface is added for Bluetooth.

Address, block-cache and signing requests use the same selected transport.
Native USB status messages are ignored while using Bluetooth. Disconnect clears
transport state and reconnection requires a user action. Native BLE IPC is
explicitly rejected, without loading Noble.

Run `npm run test:ledger-bluetooth` for hardware-free regression tests. These
exercise selection, pairing, cancellation, timeouts, trust checks and renderer
routing using mocked hardware. Actual Nano X / BlueZ validation remains manual.
