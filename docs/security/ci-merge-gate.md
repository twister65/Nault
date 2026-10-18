# CI/security gate (separate from runtime RPC and IPC)

This change modifies workflows and test infrastructure only. It is stacked on
`fix/vulnerabilities`; review the diff against that branch, not master.

## Required checks to configure on master

A workflow failure alone does **not** protect a branch. In Settings → Rules →
Rulesets, create an active branch ruleset for `refs/heads/master`, without bypass:

- Require a pull request and resolved review conversations.
- Require branches up to date before merging.
- Require `Merge gate` (tests, renderer/Electron compilation, lint, both CodeQL
  categories and the published-results check).
- Require `Package (ubuntu-24.04)`, `Package (macos-15-intel)`,
  `Package (windows-2022)` and Docker's `build_and_push` if desktop packaging and
  container delivery are part of the release acceptance criteria.
- Block force pushes and deletion.

The connector cannot administer these settings. This file is a checklist, not
proof that protection is active. Verify the actual settings before merging.

## Code scanning evidence

`check-code-scanning.cjs` reads GitHub's published analyses and open alerts for
`GITHUB_REF`. Both CodeQL categories must have a successful analysis at
`GITHUB_SHA`. Every open CodeQL alert blocks the security gate; nothing is
silently dismissed or excluded. HTTP failures, missing access and malformed
responses fail closed. The JSON artifact records alert IDs, rules, severity,
source locations and GitHub URLs, not source snippets or credentials.

The pipeline's analysis completion is distinct from the security gate. Existing
findings may keep the gate red; fixes to RPC/IPC belong in their own changes.

## Angular scope

CI runs `src/test.ts`, the entire Jasmine suite, rather than only `test-rpc.ts`.
Generated constructor smoke tests now use the real application's DI declarations,
HTTP testing and router testing modules. They intentionally test construction;
starting all lifecycle hooks without inputs previously caused uncontrolled
network requests and unrelated errors. Hardware capability probing and WASM
loading are isolated. No `NO_ERRORS_SCHEMA`, ignored failures or disabled specs
are added. Explicit server-setting and network behavior regressions exercise
validation, recovery, subscriptions and stale state separately.

Desktop packaging uses supported runners and produces CI artifacts. Only a tag
can create/update a **draft** release. No retired upload-release-asset action is
used; the supported GitHub CLI uploads artifacts without renaming files referenced
by updater metadata. Windows failures are no longer marked experimental.
