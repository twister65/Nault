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
