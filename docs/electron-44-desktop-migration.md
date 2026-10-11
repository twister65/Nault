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

## USB Ledger regression and worker-thread design (October 11, 2026)

The Electron 44 application started and rendered correctly, but its old USB
Ledger transport raised `Error in native callback`. Instrumentation
confirmed that HID opening and the first APDU write succeeded; the failure
occurred after registering the native asynchronous `device.read(callback)`.

The user validated a bounded `device.readTimeout(100)` replacement: the
Ledger connected and Nault successfully read account 0. That initial
diagnostic solution executed synchronous reads on Electron's main thread.

The **next unvalidated iteration** moves all USB HID access into a dedicated
Node.js `worker_threads` worker:

- `lib/ledger-hid-worker.ts` owns the no-events Ledger HID transport,
  including device enumeration, APDU exchange, and bounded synchronous reads.
  No HID handle is shared between threads.
- `lib/ledger-hid-worker-transport.ts` provides a Transport-compatible
  asynchronous proxy for Nault. APDUs and results cross the local worker
  message channel without logging their contents.
- The worker serializes exchanges, times out individual HID reads after 30
  seconds, and releases its device handle on normal shutdown. The proxy
  rejects pending calls if the worker exits unexpectedly.
- The existing Nano app and cryptographic signing routines remain unchanged.
  Bluetooth continues to use its existing optional transport.
- USB hotplug events are not monitored: manual **Reconnect** is required
  after unplugging or replugging a Ledger.

This is still **draft code requiring hardware testing**. Native add-on
compatibility with the Electron worker-thread runtime and worker cleanup
must both be confirmed before merge.

## Test the worker version

```sh
cd /home/olivier/Source/Nault
git pull --ff-only origin upgrade/electron-44-desktop
npm run desktop:build
npm run desktop:local
./desktop-app/build/linux-unpacked/nault --disable-setuid-sandbox \
  2>&1 | tee /tmp/nault-ledger-worker.log
```

With the Nano app open on the unlocked Ledger Nano S Plus, select **Reconnect**.
Look for `Opening USB HID worker transport`,
`USB HID worker ready`, and `Nano address request resolved`.

Check that the account address matches the hardware display. Then test
unplugging/replugging and **Reconnect**, and check that the Nault UI stays
responsive during a request. Do not send funds as part of this test. If
the worker crashes or packaging fails, preserve the terminal errors for
review; the previously successful main-thread readTimeout experiment remains
available in Git history at commit `f42c810`.

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

- The earlier main-thread readTimeout build was tested successfully on the
  user's Ubuntu machine. The new worker-thread version remains untested and
  this PR must stay in draft until validated.
- `electron-builder@25.1.8`, `electron-updater@4.3.5`, native USB modules,
  and Angular 13 could require follow-up compatibility fixes.
- `webSecurity: false` still exists in the original desktop window
  configuration and needs its own security-focused PR.
- Do not consider this build ready for protecting real funds based only on
  compilation or device-detection success.
