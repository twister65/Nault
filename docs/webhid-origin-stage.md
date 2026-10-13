## Current stage — native transport exclusion (2026-10-13)

This section supersedes earlier instructions that native Connect/Reconnect
remains usable while both experimental flags are enabled.

With **both** `NAULT_TEST_APP_ORIGIN=1` and `NAULT_TEST_WEBHID=1`, Electron
main now rejects every native Ledger IPC command for the entire process
lifetime, including Bluetooth. It does not construct the native Ledger
service or start its polling. Reconnect returns `not-connected` with an
explicit explanation; account, cache and signing requests return matching
errors so renderer callers are not left waiting. Sender checks still apply.
With either flag absent, the existing native path is unchanged.

This makes transport exclusion independent of UI state or a user's ability
to avoid the normal Reconnect button. It does not enable WebHID signing or
DMK. Close the experimental process and restart without the WebHID flag to
test the native transport, using the appropriate separate profile.

### Next hardware tests (results pending)

Rebuild using the command sequence below and start a fresh isolated profile.
Close other applications that can hold the Ledger. Never import a seed.

1. Repeat the four numbered diagnostic buttons. Account 0 must still match
   the device display. Repeat the address read to check release/reopening.
2. Try normal Connect/Reconnect in this experimental process. It must fail
   with `Native Ledger transport is disabled in the WebHID test profile.`
   The WebHID buttons must still work afterwards. There must be no native
   worker initialization or native polling in the logs.
3. Cancel the Electron device-consent dialog. No address or successful
   open result should appear. Retry selection and the four steps.
4. If the Nano app offers an address rejection action, reject the display
   request, record the visible error, then retry. Do not approve a signature.
5. Unplug the Ledger while idle, retry the open/read test and record the
   error. Reconnect, unlock, open Nano and repeat selection, enumeration,
   open/close and address read. Repeat unplugging during an address request;
   if the UI stays busy, record the elapsed time and restart the isolated
   process. Do not claim bounded recovery until tested on hardware.
6. Test with Ledger locked and with the Nano app closed; record the errors,
   then unlock/open Nano and repeat the numbered steps.
7. Exit the process. Start a fresh profile with the flags and verify access
   again requires selection/consent. Separately restart without the WebHID
   flag and verify the existing native address-read flow still works.

Report each result as PASS / FAIL / NOT TESTED, the OS, Nano app version,
step and visible error (no address, serial, APDU or seed). These checks are
read-only. Hardware signing, cache authorization, transaction construction,
RPC and DMK remain separate unvalidated milestones. The successful hardware
result from October 11 below applies only to that earlier four-step run.

Automated coverage: `npm run desktop:test-origin` includes mocked IPC tests
for native exclusion, matching error replies, untrusted senders and normal
native dispatch. These tests cannot establish physical USB recovery.

---

## Hardware validation recorded — 2026-10-11

**Reported successful by the maintainer on an actual Ledger Nano S Plus**
with the Nano application open, using Nault Desktop/Electron 44 on Linux
and the experimental secure `nault-app://wallet` origin. This is a
manual hardware result, not an automated CI test or DMK test.

The four built-in test-panel stages completed successfully:

1. Device chooser/consent: exactly one permitted Nano S Plus selected.
2. `navigator.hid.getDevices()`: selected Ledger visible after consent.
3. `HIDDevice.open()` / `close()`: succeeded without an APDU.
4. `hw-app-nano.getAddress("44'/165'/0'", true)`: returned a `nano_`
   address identical to the one displayed and verified on the physical
   Ledger. The read-only WebHID transport was subsequently closed by code.

The user-supplied main-process logs corroborate origin/frame checks,
chooser count and explicit selection of a Nano S Plus. They do not
themselves print an address or APDU; the successful address comparison
is confirmed by the user's direct report. The logs show
`frameAllowed`, `originAllowed`, and `securityOriginAllowed` as
`true`; the selected device matched Ledger VID and allowed S Plus PID.

**Validated scope:** chooser, access grant, HID connection lifecycle,
read-only Nano APDU address derivation, physical display confirmation.

**Still unvalidated:** DMK session/transport integration, robust native
transport exclusion, signing and cache-block authorization, transaction
construction, Nano RPC sync, Ledger Wallet coin-module integration.
Do not present this manual test as production security certification.


## Resolution: Electron 44 default HID grants (2026-10-11)

**This section supersedes all earlier device-permission-handler debugging
suggestions in this document.** The earlier experiment installed
`setDevicePermissionHandler` and tried to correlate the selected
`deviceId` with `details.device.deviceId`. Hardware diagnostics proved:

- Chooser: Nano S Plus selected, `deviceIdPresent: true`.
- Later permission check for **the same VID/PID**: `deviceIdPresent: false`.
- The custom handler consequently returned `false`, so
  `navigator.hid.getDevices()` returned zero devices.

Electron 44 documents that **if `setDevicePermissionHandler` is
not installed**, permissions granted through `requestDevice()`
are used by default and held in memory by Electron/Chromium.
See https://www.electronjs.org/docs/latest/api/session#sessetdevicepermissionhandlerhandler

The custom device handler, custom device-ID set and revoke listener have
therefore been removed. They are **not** replaced by a VID/PID blanket
allowlist. The existing `setPermissionRequestHandler`,
`setPermissionCheckHandler`, trusted main-frame/origin checks,
`select-hid-device` strict Nano S Plus selection, single candidate
requirement and explicit Electron consent dialog are all retained.
The approved chooser callback registers only the selected device.

Retest with a fresh isolated `TEST_PROFILE`. Use the in-app numbered
buttons in order:
1. Select: `Selected: 1 / Nano S Plus: 1`.
2. Enumerate: `Authorized Nano S Plus: 1`.
3. Open and close without APDU: `OPEN / CLOSE: OK`.
4. Only then read Nano account-0 address on-device.

If step 2 remains zero, capture the visible result plus only the
permission-check/selection/consent lines in `main.log`.
`device-permission-check` lines are no longer emitted; that is expected.
Do not attempt to fix by broadening origin checks or enabling all Ledger
devices. Do not perform signing or transfers.

# Experimental secure desktop origin — WebHID stage 1

The `feature/webhid` branch introduces an opt-in local origin at
`nault-app://wallet/index.html`. **This does not enable WebHID.** Electron's
HID permission handlers still deny all HID devices; native HID remains
the Ledger desktop transport. The IPC allowlist, sandbox, context isolation,
navigation restrictions and `webSecurity: true` are unchanged.

## Wallet data safety

Existing wallets (including encrypted seed data), app settings, address books
and work-cache records are stored in `localStorage`. Web storage belongs to
an origin, so `nault-app://wallet` cannot see the existing `file://` entries.
This is **not** a data migration. The default remains `file://` until a safe
migration has been designed and reviewed.

**Use a brand-new Electron test profile. Do not import your real seed or
delete your current Nault profile.**

## Compile, test, and launch (Ubuntu/Linux/Chromebook)

```sh
cd /home/olivier/Source/Nault
git fetch origin
git switch feature/webhid
git pull --ff-only origin feature/webhid
npm install
npm run desktop:test-origin
npm run desktop:build
npm run desktop:local

TEST_PROFILE="$(mktemp -d)"
chmod 700 "$TEST_PROFILE"
NAULT_TEST_APP_ORIGIN=1 ./desktop-app/build/linux-unpacked/nault \
  --user-data-dir="$TEST_PROFILE" --disable-setuid-sandbox
```

Use only the narrowly scoped sandbox switch required by your Linux setup;
never add `--no-sandbox` or `--disable-gpu-sandbox`.

## Validation checklist

1. Angular loads; `location.protocol` is `nault-app:` and
   `location.hostname` is `wallet`. Hash routes (e.g. `#/accounts`) work.
2. JS, CSS, fonts, translations, QR/PoW assets and WebSockets load correctly.
   Check DevTools Network and Console for failed custom-protocol resources.
3. `typeof window.require` is `'undefined'`, and
   `window.naultDesktop.send('not-allowed')` returns `false`.
4. Navigation away from the index page remains blocked. External HTTPS
   links open through the regular system browser.
5. Chromium HID device permissions are still denied at this stage.
6. With Nano app open, connect Nano S Plus via the **existing native worker**;
   read account 0 and verify the address on the Ledger display. Do not send funds.
7. Test any custom Nano RPC server: `nault-app://wallet` changes the
   request's Origin and may require appropriate server-side CORS support.
   Do not weaken `webSecurity`.
8. Exit. Launch Nault normally without `NAULT_TEST_APP_ORIGIN` and using
   the old profile; confirm existing wallet/settings remain accessible.

## Security boundaries and limitations

`nault-app` is registered as `standard`, `secure` and fetch/CORS-capable,
but does not bypass CSP or enable service workers. Only regular files in
the app's packaged `dist` directory may be served, including realpath
checks for symlinks. Ledger IPC is available only to the configured exact
index URL (hash routes permitted).

The changes are not yet runtime-validated on Ubuntu or Chromebook. The
next stages are WebHID permissioning, explicit transport choice, disconnect
handling, and hardware signing tests after the local origin is confirmed.

## Stage 2 — opt-in HID permission discovery (not the transport yet)

Stage 2 adds experimental HID permission handlers **only** when both
`NAULT_TEST_APP_ORIGIN=1` and `NAULT_TEST_WEBHID=1` are set.
The default Electron installation continues to deny all WebHID requests.
LedgerService still uses the pre-existing native HID worker: do not click
Nault's Reconnect button while testing Chromium HID permissions, as the
two implementations must not hold the same hardware concurrently.

- Accept permission requests exclusively from the application's exact
  top-level `nault-app://wallet/index.html` document.
- Permit only VID `0x2c97` and Nano S Plus normal IDs
  `0x0050` or `0x5000..0x501f`; never bootloader `0x0005`.
- Refuse zero or multiple matching Ledger devices rather than guessing.
- Require a native Electron confirmation dialog for the one matched Ledger.
- Track only the selected Chromium `deviceId` in RAM; don't persist it.
- Block and revoke all other HID device access.

### Check permission selection without exchanging APDUs

Launch with a fresh test profile and both environment variables:

```sh
TEST_PROFILE="$(mktemp -d)"
NAULT_TEST_APP_ORIGIN=1 NAULT_TEST_WEBHID=1 \
 ./desktop-app/build/linux-unpacked/nault \
 --user-data-dir="$TEST_PROFILE" --disable-setuid-sandbox
```

Open DevTools and paste the following snippet. It adds a temporary test button
to the rendered page; the HID request is triggered from a real button click,
not directly from the console. Do not invoke Nault's native Ledger Reconnect
at the same time.

```js
const btn = document.createElement('button');
btn.textContent = 'WebHID permission test (Nano S Plus)';
btn.style.cssText = 'position:fixed;top:10px;right:10px;z-index:99999';
btn.onclick = async () => {
  try {
    const devices = await navigator.hid.requestDevice({
      filters: [{ vendorId: 0x2c97 }]
    });
    console.log('Selected device count:', devices.length);
    console.log('Product IDs:', devices.map(d => d.productId.toString(16)));
  } catch (e) {
    console.error('WebHID selection failed:', e.name, e.message);
  }
};
document.body.appendChild(btn);
```

Click the button. Expect an Electron confirmation for one Nano S Plus,
then one device to be returned on acceptance and none on cancellation. No
`device.open()` or APDU operation is performed in this stage. Please report
any permission errors and the product ID shown, but not wallet addresses,
seeds or Ledger serial numbers.

**Requires compilation and real Electron 44 regression testing.**

## Stage 2 bugfix — permission checks silently cancelled

The initial Stage 2 used `new URL(APP_WALLET_URL).origin` inside the Node.js
Electron main process. Node returns `"null"` for `nault-app://wallet` because
it does not know Electron's custom Chromium origin registration. Consequently
the exact-origin permission check denied WebHID before device selection.
The fix uses the explicit `APP_WALLET_ORIGIN` constant from `wallet-origin.ts`.

**Rerun `npm run desktop:test-origin`, `npm run desktop:build` and
`npm run desktop:local`**, then repeat the permission-only test with
both opt-in flags enabled. The main-process terminal / Electron log includes
non-sensitive diagnostic entries:

- `[Nault WebHID] permission-check:` shows three decision booleans.
- `[Nault WebHID] permission-request:` shows whether the frame was accepted.
- `[Nault WebHID] select-hid-device:` shows whether the frame is trusted
  and how many device entries Chromium offered.
- `[Nault WebHID] Nano S Plus candidate count:` reports the matches.

No serial numbers, APDUs, account addresses, seeds or Chromium device IDs are logged.
If no dialog appears, report these entries instead of guessing why.

## Permission-check diagnostics — strict origin serialization

If the console shows `frameAllowed: true` but both origin comparisons are
false, a Chromium/Electron origin serialization mismatch is possible.
The origin policy now accepts only the two exact literals
`nault-app://wallet` and `nault-app://wallet/` (a trailing slash).
It **continues to reject** `null`, missing, unrelated, and path-bearing
origins; it never skips the trusted main-frame check.

The `permission-check` log adds `requestingOriginForm` and
`securityOriginForm`, reporting only `exact`, `trailing-slash`,
`opaque-null`, `missing`, or `different`. No raw URLs are logged.
If either remains denied, send these two forms plus the boolean checks.

## Stage 3 — read-only Nano account-0 WebHID probe

With WebHID device selection and Electron consent working, the
**Configure Wallet** screen now contains a separate experimental button
when the secure custom origin and WebHID opt-in are both active.
The flag is a frozen, read-only preload value; HID permission decisions
are still enforced independently by Electron main.

This diagnostic uses the existing `@ledgerhq/hw-transport-webhid` with
`hw-app-nano.getAddress("44'/165'/0'", true)` to read the account-0 address
and ask for on-device display. It does not import wallet state, sign or
broadcast, cache blocks, call Nano RPC, or touch the existing native worker.
It closes the HID connection in `finally` after the one read.

This is a **LedgerJS compatibility probe, not a Ledger Live DMK integration**.
Ledger Live's DMK WebHID transport and the future native Nano (XNO) coin module
remain separate milestones. Do not attempt native `Connect`/`Reconnect`
while a WebHID probe runs. Use a distinct temporary Electron profile and
avoid real funds.

Build and launch:

```sh
git pull --ff-only origin feature/webhid
npm run desktop:test-origin
npm run desktop:build
npm run desktop:local
TEST_PROFILE="$(mktemp -d)"
NAULT_TEST_APP_ORIGIN=1 NAULT_TEST_WEBHID=1 \
  ./desktop-app/build/linux-unpacked/nault \
  --user-data-dir="$TEST_PROFILE" --disable-setuid-sandbox
```

Open **Configure Wallet**. With the Nano app unlocked, click
**Read account 0 via WebHID** and approve only the device access / account
display requests you recognize. The Nano account is presented transiently in
the page, not logged, stored or imported. Compare it against the address
shown on the device. Close the experiment before testing native HID.

If the button is not visible, check that both opt-in variables reached the
Electron preload and that `location.protocol === 'nault-app:'`.
If an error occurs, report the *error message only*, without sharing any
private key, seed or serial number.

**Updated 2026-10-11:** Compiled and tested on Linux by the maintainer with a real Nano S Plus; read-only account-0 address confirmed against the hardware display. See the hardware-validation section above. This does not validate DMK or signing.


## Stage 3 HID grant diagnostics — `getDevices()` unexpectedly empty

Historical failure analysis (now fixed): the former custom
`setDevicePermissionHandler` overrode default grants and rejected
a consented device because the later callback lacked a `deviceId`.
The custom handler has been removed; Electron now tracks the selected
device automatically.

Logs contain `[Nault WebHID] consent recorded for selected Ledger:`
with safe device-shape booleans (no IDs or serials). The removed
`device-permission-check` callback no longer produces diagnostics.

Use the same *running* Electron instance to run `requestDevice()`,
accept consent, and then `getDevices()`. A new `mktemp -d` profile or
restarted Electron window should not inherit the prior in-memory grant.

These were diagnostic categories for the **removed** handler and are
not expected in new logs. If step 2 still fails, share the chooser
and main-frame permission-check logs, not hardware identifiers.

Diagnostics only; no changes to the HID allowlist or permission decisions.


## Diagnosing post-consent `eligibleLedger: false` safely

Some permission checks occur for unrelated USB HID devices (keyboards/FIDO).
A post-consent `eligibleLedger: false` alone does **not** prove that the
just-selected Nano S Plus was rejected; compare the new sanitized fields
`vendorMatchesLedger`, `productMatchesNanoSPlus`,
`deviceIdPresent`, `interfaceGuidPresent` in both
`consent recorded` and `device-permission-check` entries. The
checks will not expose raw IDs, names or serial numbers.

- `vendorMatchesLedger: false` means that permission check concerned
  a different vendor, so do not interpret it as a Ledger failure.
- Vendor and product both true but `deviceIdPresent: false` means
  Chromium/Electron did not provide the ID that the current exact grant
  policy requires at that stage. Keep denying until identity can
  safely be correlated.
- Both true with an ID present, but `selectedIdMatched: false`:
  investigate deviceId stability across the chooser and permission check.
- `granted: true` and `getDevices() > 0`, but opening fails:
  investigate interface contention/hidraw, not permissions.

Electron now supplies the chooser-based in-memory device grants.
The updater and native Ledger IPC retain explicit rejection handlers.
If Node still emits an unhandled rejection, capture its first stack
trace without exposing wallet or device secrets.


## Built-in WebHID diagnostic panel — ordered manual test plan

An opt-in WebHID test panel now appears at the top of **Configure Wallet**,
not in DevTools. Both `NAULT_TEST_APP_ORIGIN=1` and
`NAULT_TEST_WEBHID=1` are required, and only the app-local
`nault-app://wallet/index.html` origin is accepted. A frozen preload
flag merely shows the panel; Electron main still enforces all permissions.

### Prerequisites / checklist

- [ ] On `feature/webhid`, run `npm run desktop:test-origin`,
      `npm run desktop:build` and `npm run desktop:local`.
- [ ] Close Ledger Wallet / Ledger Live, other Nault windows, and other apps
      connected to the physical Ledger; unplug/replug if necessary.
- [ ] Unlock the Ledger Nano S Plus, open the **Nano** app, and keep it
      connected over USB.
- [ ] Start Nault with a *new, isolated test profile* and the two opt-in
      flags. Avoid real funds and do not use normal native Connect/Reconnect.
- [ ] Navigate to **Configure Wallet**; check the panel reports
      `Secure origin: YES`, `WebHID API: YES`,
      `Native Ledger: not-connected`.

### Four separate user-click tests

- [ ] **1. Select / authorize Nano S Plus**: click the actual button;
      it calls `navigator.hid.requestDevice({ filters: [{ vendorId: 0x2c97 }] })`
      directly within the user gesture. Approve the Electron confirmation.
      Expected: `Selection: Selected: 1 / Nano S Plus: 1`.
      This step does **not** call `getDevices`, `open`, or any APDU.
- [ ] **2. Check authorized devices**: click the next button in the **same
      running Electron session**. It calls `navigator.hid.getDevices()`.
      Expected: `Permission: Authorized Nano S Plus: 1`.
      If 0, **stop** and inspect the main-process HID selection and
      main-frame permission-check logs.
- [ ] **3. Open / close (no APDU)**: click the third button, which
      rechecks the granted Nano S Plus and calls only `device.open()`
      followed by `device.close()` in a `finally`.
      Expected: `Device: OPEN / CLOSE: OK (no APDU sent)`.
      If it fails, **stop** and report the on-screen error; do not
      attempt the address test.
- [ ] **4. Read account 0 via WebHID**: enabled only after step 3
      succeeds in this component instance. It uses the existing
      LedgerJS `hw-app-nano.getAddress("44'/165'/0'", true)`.
      Approve the address display on the Ledger and verify that the
      `nano_` address matches on-screen, without posting the full
      address publicly. It closes the HID transport afterwards.
- [ ] Close the test Electron app. The in-memory HID grants must not
      be assumed to persist between windows/runs.

### Reproducible command sequence

```sh
git checkout feature/webhid
git pull --ff-only origin feature/webhid
npm run desktop:test-origin
npm run desktop:build
npm run desktop:local

TEST_PROFILE="$(mktemp -d)"
echo "Diagnostic logs: $TEST_PROFILE/logs/main.log"
NAULT_TEST_APP_ORIGIN=1 NAULT_TEST_WEBHID=1 \
  ./desktop-app/build/linux-unpacked/nault \
    --user-data-dir="$TEST_PROFILE" --disable-setuid-sandbox
```

In another terminal while Nault is still running:

```sh
grep -A 12 -E 'consent recorded|permission-check|device-permission-check|select-hid-device' \
  "$TEST_PROFILE/logs/main.log" | tail -150
```

### How to report results / stop conditions

Provide: `Secure origin`, `WebHID API`, `Native Ledger`, and
the displayed `Selection`, `Permission`, `Device` results, plus
the error message if any. Also include post-consent sanitized
`consent recorded` and `device-permission-check` fields, especially
`vendorMatchesLedger`, `productMatchesNanoSPlus`,
`deviceIdPresent`, `interfaceGuidPresent`,
`selectedIdMatched`, `selectedDeviceCount`, `granted`.

Do not share seed phrases, private keys, raw HID IDs, serial numbers, APDUs,
or the full Nano address. `Chooser dialog is not displaying a FIDO HID
device` may occur for the separate protected interface; it is not
proof that the Ledger APDU interface cannot operate.

All steps are manual and read-only. The built-in panel does not add
automatic connection, background HID polling, wallet import,
transaction signing, or permission-policy changes.
