# Angular modernization after v1.18.3

Baseline: published [v1.18.3](https://github.com/twister65/Nault/releases/tag/v1.18.3) at `62f6f79a3e37d024893c16a9804a71e8fa18405c`.

## Safety boundaries

- Keep `master` and the published `v1.18.3` tag unchanged.
- Make one supported Angular major upgrade per commit or reviewable milestone.
- Do not publish or deploy the migration before all regression tests, CodeQL and wallet hardware tests.
- Keep Nault's independent Electron main process, USB HID, Android Web Bluetooth, RPC whitelists, nano transaction signing, and PoW interfaces stable.
- Do not silently regenerate lockfiles without verifying transitive dependencies. Use `npm ci --legacy-peer-deps` on the unchanged baseline and `npm install --package-lock-only` / `npm ci` with pinned versions during each migration.
- Do not treat a green Electron/macOS build as proof that macOS Ledger BLE works on physical hardware.
- Do not use an Angular upgrade as an unverified fix for the existing synthetic 504 during `/accounts` navigations.

## Verified baseline

- Angular core/router/service-worker `^13.1.1`
- Angular CLI `^13.1.2`, build-angular `^13.3.11`, angular-eslint `13.2.1`
- TypeScript `~4.5.4`
- RxJS `^6.5.5`, Zone.js `~0.11.4`, Transloco `^3.1.1`
- Karma and Protractor 7 tests (deprecated E2E tooling)
- `worker-loader` integration used by CPU PoW
- Electron 44.7.0; separated desktop and Web configurations
- Production Angular service worker has `navigationRequestStrategy: "freshness"` but still intermittently logs synthetic 504 after failed fetch

## Migration checklist

1. Record baseline CI from v1.18.3 and keep installer artifacts and SHA-256 checksums available.
2. Pin a compatible Node.js runtime and select a supported Angular migration version *after checking the official Angular compatibility table and update guide*.
3. Upgrade Angular 13 → 14 using Angular migrations, TypeScript/RxJS/Zone peer dependency constraints, then compile and run focused and full tests.
4. Repeat one supported Angular major at a time. After each, update package-lock, run production and desktop builds, Angular unit tests, IPC/USB/BLE/RPC/PoW regression tests, lint, and dependency audit.
5. Replace deprecated Protractor with a supported e2e runner in its own commit; preserve end-to-end test coverage.
6. Update `worker-loader`/webpack integration or migrate to a supported worker bundling mechanism without changing the CPU PoW message contract.
7. Review newer Angular service-worker registration and asset caching; verify offline shell, freshness, authenticated navigations, and Web Bluetooth secure context.
8. Validate production Vercel static artifact with the GitHub Actions `gh-pages` build, not a second independently built bundle.
9. Perform manual checks: ChromeOS Ledger Nano S Plus USB; Android Ledger Nano X Bluetooth creation/reconnect/send/receive; RsNano `process` JSON and work-generation `/pow`; WebSocket recovery.
10. Open a dedicated migration PR and keep it draft until every gate passes. Record untested physical platforms.

## Definition of done

- The migration's final Angular version is officially supported.
- Dependency lockfile and CI builds are reproducible.
- Browser tests, package builds and targeted wallet hardware regressions pass.
- Existing wallet state is preserved; no seed or private key is transmitted during testing.
- macOS hardware testing remains explicitly unverified unless a real device is tested.
- `master`, `v1.18.3`, and Vercel production remain unchanged until explicit authorization to publish.
