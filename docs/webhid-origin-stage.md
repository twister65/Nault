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

**Not yet compiled or hardware-tested in this branch.**
