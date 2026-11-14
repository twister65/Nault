# Verifiable GitHub Actions build provenance

The [Electron App Release workflow](../../.github/workflows/electron_hash.yml) issues GitHub **SLSA v1 build provenance attestations** (Sigstore-signed, bound to SHA-256) for the **nine native desktop release binaries** built from a `v*` tag:

| Platform | Attested release assets |
| --- | --- |
| Windows x64 | 1 NSIS `.exe` installer |
| macOS Intel and Apple Silicon | 2 `.dmg` installers and 2 `.zip` update archives |
| Linux x64 | 1 `.AppImage`, 1 `.deb`, 1 `.rpm`, 1 `.pkg.tar.zst` |

Each attestation is created **on the original OS build runner**, after packaging and local updater checks, before upload. The matrix `release` job has only `contents: read`, `id-token: write` and `attestations: write`; the publishing job alone has `contents: write`. PR builds produce preview packages but do **not** generate public attestations or publish a release.

The `release-preview` assembly job downloads and groups the packages without modifying the binaries. The [provenance gate](../../scripts/verify-release-provenance.sh) requires **exactly nine** nonempty release binaries and verifies every one against GitHub's attestation service, enforcing the repository, the signer workflow, the **exact tag ref** and **exact source commit SHA**. The gate runs after assembly and **again on the publication runner**, independently of the release's SHA-256 checksum verification. A missing, modified or unsigned binary blocks publication. There is no automatic downgrade to checksum-only publication.

## Verify a downloaded release artifact

Install a recent [GitHub CLI](https://cli.github.com/) version. Use **gh 2.102.0 or later** to avoid the historical case-insensitive `--source-ref` verification issue (see [GHSA-4mq3-hpgx-9cx8](https://github.com/cli/cli/security/advisories/GHSA-4mq3-hpgx-9cx8)). Download a binary **from a release produced after this gate was merged**, then run (replace the filename and tag with the actual release values):

```bash
gh attestation verify ./Nault-Linux-Portable-VERSION.AppImage \
  --repo twister65/Nault \
  --signer-workflow twister65/Nault/.github/workflows/electron_hash.yml \
  --source-ref refs/tags/vVERSION
```

For tighter binding, add `--source-digest FULL_RELEASE_COMMIT_SHA`, where the SHA is the resolved commit of the release tag. Check the release's `SHA256SUMS` separately:

```bash
sha256sum --check SHA256SUMS
```

For macOS, Windows and other Linux packages, use the corresponding downloaded file with the same `gh attestation verify` command. `gh attestation verify` checks the file's digest and Sigstore-backed workflow identity; filenames alone are insufficient. The GitHub release must remain available for lookup when using online verification. The run's attestation summary is available from GitHub Actions.

## Scope and limitations

- These attestations **prove the origin and integrity of each attested file**, not that its source code is safe or that the build is reproducible.
- Provenance does **not** replace macOS/Windows code signing or macOS notarization, and does not confirm Ledger hardware behavior or real installer usability.
- `SHA256SUMS`, updater `.yml` manifests and `.blockmap` files retain existing checksum/update-feed validation; the provenance gate targets the nine **binaries** listed above. The separately built Apache PWA and Docker test image are not covered by this desktop workflow.
- Existing releases are **not retroactively attested**. Do not label earlier release artifacts as having this protection.
- Any GitHub authentication/attestation service failure prevents **new** tagged release publication until the failure is resolved. Do not bypass the gate.

Reference: [GitHub artifact attestation documentation](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations) and [GitHub CLI verification reference](https://cli.github.com/manual/gh_attestation_verify).
