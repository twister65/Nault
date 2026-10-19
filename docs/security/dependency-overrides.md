# Dependency security overrides

PR #10 includes Dependabot #8 and targets the protected `master` branch.
The dependency updates do not change wallet RPC, IPC or Ledger transport code.

The Angular 13 toolchain pins an obsolete Piscina release. Its override is scoped
under `@angular-devkit/build-angular` to Piscina 4.9.4, the patched 4.x release.
Angular uses the supported `run()` worker API; production renderer builds and the
full Angular test suite must pass before accepting the override.

The transitive `tar` override is 7.5.22. It requires Node >=18; CI uses Node 22.
This major upgrade affects native-module installation and Electron packaging.
Validate clean installation, tar extraction through node-gyp/@electron/rebuild/
app-builder-lib, and Linux, macOS and Windows packages before merging.
Do not remove these overrides without a fresh audit and compatibility checks.

Other scoped security fixes retain the existing major versions of cipher-base,
pbkdf2, sha.js and form-data. `@types/ws` stays at 8.5.3 for TypeScript 4.5.

On 19 October 2026, the regenerated lockfile audited at **zero critical** findings,
with 12 low, 52 moderate and 75 high findings still outstanding. This is not a
claim that all dependencies are vulnerability-free. The complete npm audit report
is uploaded by CI. Audit failures or incomplete reports block the required
`Merge gate`; high and lower findings need separate dependency modernization.
