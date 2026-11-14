#!/usr/bin/env bash
# Fail closed unless every distributable desktop binary has SLSA provenance
# from the tag commit and the dedicated GitHub Actions release workflow.
set -euo pipefail

if [[ "$#" -ne 1 || ! -d "$1" ]]; then
  echo 'Usage: verify-release-provenance.sh RELEASE_ASSET_DIRECTORY' >&2
  exit 2
fi
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${GITHUB_REF:?GITHUB_REF is required}"
: "${GITHUB_SHA:?GITHUB_SHA is required}"
: "${GH_TOKEN:?GH_TOKEN is required}"
if [[ "$GITHUB_REF" != refs/tags/v* ]]; then
  echo 'Build provenance verification is only supported for version tags' >&2
  exit 2
fi

assets="$1"
signer="$GITHUB_REPOSITORY/.github/workflows/electron_hash.yml"
shopt -s nullglob
verified=0

verify_format() {
  local suffix="$1" expected="$2" package
  local matches=( "$assets"/*"$suffix" )
  if [[ "${#matches[@]}" -ne "$expected" ]]; then
    echo "Expected $expected $suffix asset(s), found ${#matches[@]}" >&2
    exit 1
  fi
  for package in "${matches[@]}"; do
    [[ -s "$package" ]] || { echo "Missing/empty release binary: $package" >&2; exit 1; }
    if ! gh attestation verify "$package" \
      --repo "$GITHUB_REPOSITORY" \
      --signer-workflow "$signer" \
      --source-ref "$GITHUB_REF" \
      --source-digest "$GITHUB_SHA" >/dev/null; then
      echo "No valid SLSA build attestation for $package" >&2
      exit 1
    fi
    echo "PASS: provenance $(basename "$package")"
    verified=$((verified + 1))
  done
}

verify_format .exe 1
verify_format .dmg 2
verify_format .zip 2
verify_format .AppImage 1
verify_format .deb 1
verify_format .rpm 1
verify_format .pkg.tar.zst 1
[[ "$verified" -eq 9 ]] || { echo "Unexpected number of release binaries: $verified" >&2; exit 1; }
echo 'PASS: 9/9 desktop installers and update ZIPs have verified SLSA provenance'
