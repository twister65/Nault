# Linux desktop build with Ledger Nano S Plus (Electron 9)

The current desktop app uses Electron 9.4.4 (Node 12.14.1). With current Ledger dependencies, this legacy runtime cannot resolve the wildcard subpath `exports` of `@ledgerhq/devices@7.0.2`. In addition, loading the optional Bluetooth transport eagerly requires a native Bluetooth module even when a USB-only Ledger is connected.

## Build

Use a clean local checkout of this branch and install dependencies normally. For an existing checkout that already has `node_modules`, run `npm install --ignore-scripts` only if reinstalling native dependencies is necessary; this does not rebuild native modules and might require rebuilding them separately.

```sh
npm install
npm run desktop:build
npm run desktop:local
```

`desktop:local` now creates compatibility entry points under the installed `node_modules/@ledgerhq/devices` package and passes `-c.npmRebuild=false` to electron-builder. Generated entry points are not checked into Git and may be recreated after `npm install`. Note: skipping native rebuild is a local build workaround and must **not** be assumed to work on every Electron/OS/architecture combination. The resulting AppImage still needs runtime tests with real hardware.

## Diagnostic launch on Ubuntu (not a security recommendation)

On the tested Ubuntu system, an AppArmor rule permitted user namespace sandboxing for the unpacked executable. Electron 9's GPU subprocess failed with its GPU sandbox enabled; the following diagnostic launch restored UI responsiveness:

```sh
./desktop-app/build/linux-unpacked/nault --disable-setuid-sandbox --disable-gpu-sandbox
```

**Security warning:** `--disable-gpu-sandbox` reduces Chromium's process isolation. The old Electron 9 runtime is unsupported and the packaged app still has additional security concerns (including `nodeIntegration: true` and `webSecurity: false`). Do not consider this build hardened for protecting assets. Do not enable `--no-sandbox` globally. A modernization and security review should be handled separately.

The workaround has been reported to launch Nault and detect a Ledger Nano S Plus in one local environment; this branch has not been validated with automated CI or tested for real-money transactions.
