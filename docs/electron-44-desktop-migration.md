# Electron 44 desktop migration — Ubuntu validation

PR #3 (merged October 11, 2026) upgraded the Electron **runtime** from 9.4.4 to **44.7.0**
(Chromium 152 / Node.js 24.21.0). Angular 13, TypeScript 4.5 and
electron-builder 25 were kept for compatibility; USB Ledger support now uses
the no-events HID transport, isolated in a worker thread.

## Changes delivered in PR #3

- Pin `electron` to `44.7.0` rather than the unsupported Electron 9.
- Replace the removed `webContents.on('new-window')` event with
  `setWindowOpenHandler()`. Only HTTPS external links open in the system
  browser; Electron does not create another renderer window.
- Stop generating `@ledgerhq/devices` compatibility entry points: Node.js 24
  supports the package's pattern-based exports.
- Retain `-c.npmRebuild=false` for the initial packaging strategy.
  The native USB/HID worker was tested on Ubuntu with the Nano S Plus;
  other platforms and native-module upgrades need separate validation.

## Updating a local checkout

```sh
cd /home/olivier/Source/Nault
git switch master
git pull --ff-only origin master
npm install
node -p "require('electron/package.json').version"  # expect 44.7.0
npm run desktop:build
npm run desktop:local
```

**Lockfile status:** PR #3 includes the npm-generated `package-lock.json`.
Both `package.json` and the committed lockfile pin Electron `44.7.0` and
`@ledgerhq/hw-transport-node-hid-noevents` `6.27.5`.

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

The merged implementation moves all USB HID access into a dedicated
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

The user reviewed, compiled, and tested the worker implementation on Ubuntu.
The subsequent `webSecurity` hardening was also tested before PR #3 was
merged. This confirms the reported Ubuntu setup, not every OS or wallet flow.

## Reproduce the Ubuntu worker test

```sh
cd /home/olivier/Source/Nault
git switch master
git pull --ff-only origin master
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

## Security hardening: webSecurity and Chromium device permissions

The Electron 44 migration now enables `webSecurity: true` and explicitly
keeps the renderer sandbox enabled. The local document is restricted to
the bundled `dist/index.html`: attempts to navigate any frame to another
file or a remote website are rejected. The existing external HTTPS-link
handler still opens links in the operating-system browser.

The main process also validates that any `ledger` IPC request comes from
the exact top-level local wallet document belonging to Nault's main window
before running address, cache, or signing commands. This complements the
context-isolated preload IPC bridge, but never replaces transaction
confirmation on the Ledger screen.

The current Electron Ledger transport uses a **native HID worker**, not
Chromium WebHID. Accordingly, this PR denies Chromium HID device selection
and device permissions by default. General browser permissions are limited
to a small set used by the local wallet (media access and sanitized clipboard
operations), not granted to remote documents. A subsequent standalone WebHID
PR should introduce a secure custom app origin, explicit user-driven HID
selection, and Ledger vendor-ID restrictions before enabling WebHID at all.

### Security regression test for future changes

```sh
cd /home/olivier/Source/Nault
git switch master
git pull --ff-only origin master
npm run desktop:build
npm run desktop:local
./desktop-app/build/linux-unpacked/nault --disable-setuid-sandbox \
  2>&1 | tee /tmp/nault-security.log
```

For future releases or other machines, verify the following:

1. The application renders normally, including translations and local
   asset loading; inspect DevTools for blocked `file://` requests.
2. A configured Nano RPC node can still return balances and history.
   `webSecurity: true` enforces CORS for `file://` to HTTP(S) requests,
   so some remote and custom nodes may reject the opaque `Origin: null`.
   This is **not** a reason to re-disable `webSecurity`.
3. WebSocket connections, refreshes, clipboard usage, QR scanning (if used),
   deep links, and external HTTPS links remain functional.
4. Unlock the Nano S Plus, open the Nano app, and use **Reconnect**.
   Confirm the native worker connects and the address matches the hardware
   display. Test disconnecting/reconnecting. Do not send funds for this test.
5. Confirm no GPU sandbox override is required and report any renderer or
   CORS errors verbatim. Do not fall back to `--no-sandbox` or
   `--disable-gpu-sandbox`.

The lockfile was committed before PR #3 merged. The user reported a working
Ubuntu build and Ledger connection after these security changes. Other operating
systems and full transaction-signing workflows are not yet covered by that
validation.

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

- **WebHID is not enabled in the Electron desktop app.** USB Ledger access
  currently uses a native HID worker with bounded `readTimeout(100)` calls.
  Chromium HID device permission requests remain denied. A separate PR will
  evaluate WebHID and narrowly scoped device permissions.
- **USB reconnection is manual.** The native worker does not monitor HID
  hotplug events; unplugging or replugging the Ledger requires **Reconnect**.
  Bluetooth behavior has not received equivalent regression coverage.
- **Ubuntu testing is not cross-platform certification.** The maintainer
  compiled and tested the application and Nano S Plus connection on Ubuntu
  after the Electron 44 and `webSecurity: true` changes. Windows/macOS,
  installer/updater behavior, and complete on-device transaction-signing
  workflows still need dedicated tests. No CI check runs were recorded for
  the merged PR.
- **Some configured Nano RPC services may require CORS support.** The desktop
  renderer still loads from `file://`; with `webSecurity: true`, custom
  HTTP(S) backends might reject requests with an opaque origin. Keep web
  security enabled rather than relaxing it to accommodate such servers.
- **The desktop technology stack still contains older components.**
  `electron-builder@25.1.8`, `electron-updater@4.3.5`, Angular 13, and
  native USB/HID dependencies need maintenance and broader compatibility
  testing.
- **Further security hardening remains.** A strict Content Security Policy,
  fuller IPC payload validation, and a trusted app origin deserve separate
  review. The maintainer's packet-capture inspection did not identify Nano
  RPC calls among plaintext HTTP requests, but it is not a comprehensive
  security audit. Continue verifying every transaction on the Ledger display
  and do not treat basic device connectivity as proof of fund safety.
