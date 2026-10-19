# Nault 1.18.3 — twister65 fork

This is an independently maintained **twister65/Nault** release based on Nault v1.18.3. It is **not** an official release of [Nault/Nault](https://github.com/Nault/Nault).

## Changes

- Upgrade the desktop runtime to **Electron 44.7.0** and isolate privileged desktop IPC behind a preload bridge ([#2](https://github.com/twister65/Nault/pull/2), [#3](https://github.com/twister65/Nault/pull/3)).
- Support **Ledger Nano X via Web Bluetooth** in the desktop renderer and on **Android Chrome**, with explicit selection, reconnect handling, and safer GATT/notification lifecycle ([#7](https://github.com/twister65/Nault/pull/7), [#11](https://github.com/twister65/Nault/pull/11), [#14](https://github.com/twister65/Nault/pull/14)).
- Improve Nano v28.2 and RsNano V3.1 RPC compatibility, including JSON block processing and pending/receivable fallback ([#5](https://github.com/twister65/Nault/pull/5)).
- Add an optional **Twister32 RsNano** server with HTTPS RPC and WSS WebSocket; use its dedicated `/pow` endpoint with **External – Selected Server** ([#14](https://github.com/twister65/Nault/pull/14), [#16](https://github.com/twister65/Nault/pull/16)).
- Strengthen regression tests, published CodeQL gating, dependency audits, server endpoint validation, and CI packaging on Linux, Windows, and macOS ([#6](https://github.com/twister65/Nault/pull/6), [#9](https://github.com/twister65/Nault/pull/9), [#10](https://github.com/twister65/Nault/pull/10)).
- Adjust PWA navigation to prefer the network while preserving the offline app shell ([#15](https://github.com/twister65/Nault/pull/15)).

## 🐛 Bug Fixes

- Repair native USB reconnection after Bluetooth selection, without accidentally treating a deliberate transport switch as a device failure ([#11](https://github.com/twister65/Nault/pull/11)).
- Harden Nano block hash validation, guard against prototype mutation, and sanitize UIkit HTML fragments with DOMPurify ([#12](https://github.com/twister65/Nault/pull/12), [#13](https://github.com/twister65/Nault/pull/13)).
- Restore **Twister32 selected-server PoW** by routing `work_generate` to `https://twister32.changeip.net/pow`, instead of the account RPC proxy ([#16](https://github.com/twister65/Nault/pull/16)).

## Validation & Known Limitations

- **Validated on real hardware:** Ledger Nano X Web Bluetooth on Android smartphone and tablet, with tablet reconnect; USB / Bluetooth flows on the tested Linux and Windows environments; Twister32 selected-server PoW.
- **Automated builds:** Linux, Windows, and macOS Intel runners. **macOS Ledger hardware was not tested.** The packages are **unsigned and not notarized**; do not treat them as official upstream binaries.
- **Known issue:** An intermittent HTTP **504** can still be shown by the Angular 13 service worker for navigations such as `/accounts`, despite the PWA navigation adjustment. The root cause is under investigation.
- **Not included:** The experimental `feature/webhid` branch and upstream [Nault/Nault #672](https://github.com/Nault/Nault/pull/672) have not been merged upstream.
- Angular 13 remains in this release; Angular modernization is planned for a separate branch. No protocol or wallet security certification is implied by automated checks.

## Contributors

This release incorporates upstream Nault and Nano community work, plus development and testing on the **twister65** fork. See the linked pull requests for detailed authorship.

## Checksum Validation

Use the accompanying per-platform `checksums-1.18.3-*.txt` or `SHA256SUMS` files, which contain SHA-256 checksums of the **exact uploaded** installer files.

**PowerShell (Windows):**
```powershell
Get-FileHash -Algorithm SHA256 '.\Nault-Setup-1.18.3-Windows.exe'
```

**Bash (Linux/macOS):**
```bash
sha256sum Nault-1.18.3-Linux.AppImage
shasum -a 256 Nault-1.18.3-Mac.dmg
```

Compare the printed value with the corresponding downloaded checksum file.

Source snapshot: [`62f6f79a3e37d024893c16a9804a71e8fa18405c`](https://github.com/twister65/Nault/commit/62f6f79a3e37d024893c16a9804a71e8fa18405c).
