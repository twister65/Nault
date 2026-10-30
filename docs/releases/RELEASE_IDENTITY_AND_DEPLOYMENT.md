# Nault release identity and deployment procedure

## Objective

Keep the independently maintained Nault fork's **desktop applications** and **Apache-hosted PWA** on the same identified release. Each build exposes both its **version** (from `package.json`) and **full Git commit** (embedded by the Angular build) in **About Nault**.

The release version and commit are separate fields for a reason: multiple commits may carry the same unreleased version, and a PWA's service-worker cache can outlive a deployment. A version match by itself does **not** prove that desktop and PWA are identical.

## Version source of truth

- `package.json.version` is the only source of the Nault app version; `package-lock.json.version` and `package-lock.json.packages[""].version` must match.
- `scripts/build-with-revision.cjs` injects `__NAULT_BUILD_VERSION__` and `__NAULT_BUILD_COMMIT__` into both production-PWA and Electron-renderer JavaScript. No runtime network lookup or independently cached metadata file is required.
- The Electron Builder version, NSIS update metadata and PWA About panel must all derive from the **same release commit**.
- The tagged release must be `vX.Y.Z` and point to a commit whose package and lockfile versions are `X.Y.Z`. The tag-triggered packaging workflow already verifies those versions.
- Build artifacts are identified by both **version and commit**. For desktop, inspect the About panel in the installed app; for the PWA, inspect the About panel on the deployed HTTPS origin.

## Planned v1.18.6 release gate

**Do not tag, publish, merge or deploy v1.18.6 until the functional validation is explicitly accepted.**

1. Complete Angular 22 patch validation and all GitHub checks, including CodeQL, lint, security, Karma/Jasmine, RPC, PoW and Electron packaging. Correct failures on isolated branches and rerun the affected checks.
2. Confirm functional tests on desktop and PWA, including the Ledger Nano S Plus USB, Nano X USB/Bluetooth, transaction rejection, reconnect/cancel flow, account balance refresh, QR v2 import/export, offline-online PWA recovery and browser PoW. Use non-sensitive test fixtures and never log recovery seeds.
3. Synchronize and merge the approved Angular/identity changes into `master` with green CI.
4. After final acceptance, bump **both** `package.json` and `package-lock.json` to `1.18.6`, prepare English release notes, and review the exact commit.
5. Tag that immutable commit `v1.18.6` and let the existing tag-triggered Electron workflow package Windows, Linux and macOS for that tag. Verify the artifacts, release metadata, update feed, names, signatures/checksums as applicable, then publish only after final approval.
6. On Ubuntu-Salon, use the release-aware script from ChatGPT Library **Server**:
   `~/bin/deploy-nault-master.sh --tag v1.18.6`.
   The script fetches the named tag directly from the remote, checks `package.json.version` against the tag, builds it in a clean Git worktree, validates HTTPS/PWA files, and swaps the Apache `current` link atomically. It does **not** overwrite locally modified source files.
7. Confirm the installed desktop and production PWA both show **Version 1.18.6** and the **same commit SHA**. Exercise the PWA update on the live origin and verify offline/online recovery.
8. Record the Apache publication under a directory named `v1.18.6-<short-SHA>-<UTC-timestamp>-<process-id>` beneath `/var/www/nault-angular22/releases/`. Retain the previous release for an explicit rollback. No Apache configuration, RPC/WS/PoW proxy, ModSecurity or TLS change is part of a static PWA release.

## Future maintenance deployments

When deploying a newer master commit without changing the package version, the About panel will show the **same version** but a **different commit**. That is a maintenance build, not the official tagged desktop release. Prefer deploying a release tag when exact Desktop/PWA parity is required.

`--list` displays historic Apache release directories, including the version and short SHA in releases created with the updated script. Existing pre-change directories retain their older SHA-and-timestamp naming; they must not be renamed retroactively.

## Rollback

Use `~/bin/deploy-nault-master.sh --list`, then pass an exact directory basename to `--rollback`. The script keeps previous releases and checks the served `ngsw.json`. Check browser PWA caches after rollback: installed clients may temporarily retain a different build.
