# Desktop IPC isolation — validation checklist

This change is deliberately limited to isolating the renderer's Electron IPC.
It does **not** upgrade Electron, change Ledger USB transports, alter the GPU
launch flags, or enable `webSecurity`.

## What changed

- The Angular renderer runs with `nodeIntegration: false` and `contextIsolation: true`.
- `desktop-app/src/preload.ts` exposes only `window.naultDesktop.on()` and
  `window.naultDesktop.send()` through Electron `contextBridge`.
- Incoming IPC is allowlisted to `ledger` and `deeplink`.
- Outgoing IPC is allowlisted to `ledger` and `deeplink-ready`.
- The native `IpcRendererEvent` is not exposed to the web page. A `null` placeholder
  preserves the existing `(event, data)` listener signature.

## Local build and validation (Ubuntu)

```sh
git fetch origin
git switch --track origin/security/desktop-isolated-ledger-ipc
npm install
npm run desktop:build
npm run desktop:local
```

To test on an Ubuntu machine where the existing, narrowly scoped AppArmor
policy permits unprivileged user namespaces for the unpacked Nault executable:

```sh
./desktop-app/build/linux-unpacked/nault \
  --disable-setuid-sandbox \
  --disable-gpu-sandbox
```

Those flags are **not a security recommendation**: `--disable-gpu-sandbox` weakens
Chromium's GPU isolation. Use only for diagnosing this legacy Electron 9 build.

Functional checks:
1. Open Nault normally; the Angular interface should appear.
2. With a Ledger Nano S Plus connected, confirm device detection and read an address.
   If available, compare it with the address verified on the hardware device.
3. Verify deeplinks still reach Angular (e.g. an ordinary `nano:` address link).
4. In renderer developer tools, `typeof window.require` should be `"undefined"`.
   `window.naultDesktop.send('unapproved')` should return `false`.

**Remaining risk:** the app still uses Electron 9.4.4 and has
`webSecurity: false`. The `new-window` handler is also a legacy Electron API.
These are intentionally left to subsequent PRs, each with its own validation.
Do not treat this build as hardened for real funds.
