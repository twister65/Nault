# Angular modernization plan (experimental)

## Frozen baseline

- Source: [twister65/Nault v1.18.3](https://github.com/twister65/Nault/releases/tag/v1.18.3), `62f6f79a3e37d024893c16a9804a71e8fa18405c`.
- Published fork release **must not be modified**, and production `master` remains unchanged until each migration is fully reviewed.
- Baseline: Angular 13, Angular CLI 13, TypeScript 4.5, RxJS 6, Webpack browser builder, worker-loader PoW, Protractor, Angular Service Worker 13; Desktop Electron 44.
- Goal: Angular 22 with compatible TypeScript/Node.js, but **one supported major at a time** using Angular migration schematics.
- Angular 14 transition requires Node 16.10+ and TypeScript 4.6.2–4.8.x. Angular 22 requires Node >=22.22.3 within its supported ranges and TypeScript 6.0.x.
- [Official version matrix](https://angular.dev/reference/versions) · [Official upgrade guide](https://angular.dev/update-guide)

## Migration gates (each major)

1. Migrate Angular core, CLI, build tools, compiler, localize and service-worker **together**; synchronize TypeScript and Angular ESLint.
2. Preserve Webpack compatibility for `worker-loader` until PoW worker replacement is verified; do not silently adopt the application/esbuild builder.
3. Resolve breaking changes in Angular templates, decorators, HTTP, zones, and deprecated dependencies. Retire Protractor only with a working replacement.
4. Run `npm ci --legacy-peer-deps` from the **committed lockfile**, TypeScript/Electron compile, production Web build, service-worker manifest, full Angular unit suite, RPC/PoW tests, Ledger transports and CodeQL.
5. Test Ledger Nano S Plus USB / Nano X Bluetooth on supported real devices, server selection and custom PoW, and PWA offline shell; evaluate existing synthetic HTTP 504 independently.
6. Move to the next major only after the previous major is buildable, testable and reviewed. Do **not** auto-merge or deploy experimental branches.

## Initial automated attempt: Angular 13 -> 14

The dedicated workflow in `upgrade/angular-14` runs the official `ng update` migrator under Node 16, commits only the migration outputs to that branch, then attempts the production Angular build. Build failure is **expected to require investigation**, not permission to skip tests or change the release tag.

## Target roadmap

`13 → 14 → 15 → 16 → 17 → 18 → 19 → 20 → 21 → 22`

At the final major, upgrade the CI and workstation Node runtime within Angular 22 compatibility limits and replace deprecated CLI builders and test infrastructure through reviewed follow-up changes.

## Known unrelated issue

The intermittent navigation HTTP 504 from Angular 13 service worker on the protected Vercel origin has not been diagnosed sufficiently. **Do not claim an Angular upgrade fixes it** without a controlled before/after test.
