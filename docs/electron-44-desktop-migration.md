# Electron 44 desktop migration — Ubuntu validation

This branch updates the Electron **runtime** from 9.4.4 to **44.7.0**
(Chromium 152 / Node.js 24.21.0). The existing Angular 13, TypeScript 4.5,
Ledger packages, and electron-builder 25 are intentionally left unchanged,
so we can isolate compatibility issues before further upgrades.

## Changes in this PR

- Pin `electron` to `44.7.0` rather than the unsupported Electron 9.
- Replace the removed `webContents.on('new-window')` event with
  `setWindowOpenHandler()`. Only HTTPS external links open in the system
  browser; Electron does not create another renderer window.
- Stop generating `@ledgerhq/devices` compatibility entry points: Node.js 24
  supports the package's pattern-based exports.
- Retain `-c.npmRebuild=false` **temporarily**. Prebuilt USB/HID native modules
  still need hardware testing with the new Electron runtime.

## Updating a local checkout

```sh
cd /home/olivier/Source/Nault
git fetch origin
git switch --track origin/upgrade/electron-44-desktop

# Required: the checked-in v2 package-lock.json still describes Electron 9.
# npm install will update this lockfile locally to match package.json.
npm install
node -p "require('electron/package.json').version"  # expect 44.7.0
npm run desktop:build
npm run desktop:local
```

**Lockfile follow-up:** The `package-lock.json` has not yet been regenerated
and committed in this draft PR. Do not use `npm ci` or merge until it has been
updated using npm against the registry and checked into the PR. No lockfile
integrity hashes should be fabricated manually.

## Running the unpacked application

With an Ubuntu AppArmor profile permitting user namespaces for the specific
unpacked Nault executable, first test the fully sandboxed GPU process:

```sh
./desktop-app/build/linux-unpacked/nault --disable-setuid-sandbox
```

`--disable-setuid-sandbox` only disables Chromium's legacy SUID mechanism;
it does not request disabling the GPU sandbox. If user namespaces are fully
available, also try launching **without any Chromium flags**.

**Do not silently fall back to `--disable-gpu-sandbox` or `--no-sandbox`.**
Report startup errors instead; we want to restore process isolation.

## USB Ledger reconnect regression test (October 11, 2026)

The first Electron 44 build rendered the UI successfully but failed to connect
the Ledger Nano S Plus, displaying `Error in native callback`. The subsequent
`ELECTRON_RUN_AS_NODE=1` test confirmed that both `usb.getDeviceList()` and
`node-hid.devices()` load and enumerate devices under Electron 44 / Node 24.
This test does not prove that native hotplug callbacks work in Electron's
normal main-process runtime.

The updated code selects `@ledgerhq/hw-transport-node-hid-noevents@6.27.5`
for USB Ledger devices, opening the first matching Ledger HID device directly
instead of registering native USB attach/detach listeners. Bluetooth continues
to use the existing optional transport.

Update to the latest PR commit and rebuild:

```sh
git pull --ff-only origin upgrade/electron-44-desktop
npm install
npm run desktop:build
npm run desktop:local
./desktop-app/build/linux-unpacked/nault --disable-setuid-sandbox
```

Verify the Ledger device is unlocked, its Nano app is open, and an address can
be queried without native callback errors. Do not send funds as part of this
test. Because the no-events transport does not watch plug/unplug events,
manual **Reconnect** is expected after attaching or reattaching the device.
Please report the terminal output and UI status if connection still fails.

## Checklist

1. Confirm Electron version `44.7.0` in the packaging output.
2. Nault window opens and remains responsive without `--in-process-gpu`.
3. Ledger Nano S Plus is detected via USB and account addresses can be read.
   Verify a receiving address on the hardware screen; do not send funds.
4. The desktop IPC bridge works; `window.require` is undefined.
5. Opening an HTTPS help link uses the OS browser, not an Electron window.
6. The `nano:` deep link feature still reaches Nault.
7. Review errors in `~/.config/nault/logs/main.log` if any.

## Known limitations

- This change is **not yet tested** with the new Electron version on the
  user's Ubuntu machine. The PR should remain a draft until tested.
- `electron-builder@25.1.8`, `electron-updater@4.3.5`, native USB modules,
  and Angular 13 could require follow-up compatibility fixes.
- `webSecurity: false` still exists in the original desktop window
  configuration and needs its own security-focused PR.
- Do not consider this build ready for protecting real funds based only on
  compilation or device-detection success.
