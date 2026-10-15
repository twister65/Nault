# Ledger Bluetooth on Linux / Electron 44

`@abandonware/bluetooth-hci-socket` uses NAN and is tied to the runtime ABI.
An addon installed by Node 22 (ABI 127) cannot be loaded by Electron 44.7.0
(ABI 149). NAN 2.22.2 also fails against Electron's V8 15.2 headers at
`v8::External::Value()`. This branch pins NAN 2.29.0 and provides an explicit
Electron rebuild, without changing Ledger or Noble versions.

## Install, build, run

Run as your ordinary user from the repository directory:

```sh
npm ci --legacy-peer-deps --include=optional --foreground-scripts
NODE_OPTIONS=--openssl-legacy-provider npm run desktop:build
npm run desktop:rebuild-bluetooth
node scripts/test-ledger-bluetooth.js
env -u NODE_OPTIONS npm run desktop:dev
```

Stop if any command fails. Repeat `desktop:rebuild-bluetooth` after each
`npm ci` or Electron version change. It uses the installed Electron version,
supplies the variables required by the addon's `binding.gyp`, copies the
result to the path loaded by Noble, and verifies loading in Electron itself.
Success must include:

```
PASS: Bluetooth binding loaded in Electron 44.7.0 (ABI 149)
```

The check loads the native binding without creating a Bluetooth socket or
scanning. It does not validate adapter permissions, pairing, or a Ledger
transaction. No root execution or capability changes are part of this command.

## Verification, 2026-10-15

- Reproduced the NAN 2.22.2 `External::Value()` failure with the exact official
  Electron 44.7.0 headers.
- Built and linked the real bluetooth-hci-socket 0.5.3-8 addon with NAN 2.29.0.
- Ran the repository rebuild command with downloaded Electron 44.7.0 headers;
  `node-gyp` completed successfully.
- Loaded the resulting `lib/binding/bluetooth_hci_socket.node` in Electron
  44.7.0 (V8 15.2.124.28, ABI 149); verified the BluetoothHciSocket export.
- Electron TypeScript compilation and all four mock BLE regression tests passed.
- Lockfile validation passed. Ledger 6.27.5 / Noble 1.9.2-15 remain unchanged.
- The old C++ source still emits compiler warnings; build success is not a
  complete audit of that dependency. Actual Nano X Bluetooth testing is pending.
