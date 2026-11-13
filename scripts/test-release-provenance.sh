#!/usr/bin/env bash
# Offline regression tests for the release provenance gate (no GitHub access).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/assets" "$tmp/bin"

for suffix in exe dmg zip AppImage deb rpm pkg.tar.zst; do
  count=1
  if [[ "$suffix" == dmg || "$suffix" == zip ]]; then count=2; fi
  for ((i=1; i<=count; i++)); do printf 'fixture\n' > "$tmp/assets/pkg-$i.$suffix"; done
done
cat > "$tmp/bin/gh" <<'MOCK'
#!/usr/bin/env bash
[[ "$1" == attestation && "$2" == verify ]] || exit 1
[[ " $* " == *' --repo twister65/Nault '* ]] || exit 1
[[ " $* " == *' --signer-workflow twister65/Nault/.github/workflows/electron_hash.yml '* ]] || exit 1
[[ " $* " == *' --source-ref refs/tags/v9.9.9 '* ]] || exit 1
[[ " $* " == *' --source-digest aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa '* ]] || exit 1
[[ "${MOCK_FAIL_ATTESTATION:-}" != 1 ]] || exit 1
printf '%s\n' "$3" >> "$MOCK_LOG"
MOCK
chmod +x "$tmp/bin/gh"
export PATH="$tmp/bin:$PATH"
export GH_TOKEN=test-token GITHUB_REPOSITORY=twister65/Nault
export GITHUB_REF=refs/tags/v9.9.9 GITHUB_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
export MOCK_LOG="$tmp/log"

bash -n "$root/verify-release-provenance.sh"
bash "$root/verify-release-provenance.sh" "$tmp/assets" >/dev/null
[[ "$(wc -l < "$MOCK_LOG")" -eq 9 ]]

rm "$tmp/assets/pkg-1.exe"
if bash "$root/verify-release-provenance.sh" "$tmp/assets" >/dev/null 2>&1; then
  echo 'FAIL: missing installer was accepted' >&2
  exit 1
fi
printf 'fixture\n' > "$tmp/assets/pkg-1.exe"

if MOCK_FAIL_ATTESTATION=1 bash "$root/verify-release-provenance.sh" "$tmp/assets" >/dev/null 2>&1; then
  echo 'FAIL: invalid attestation was accepted' >&2
  exit 1
fi

GITHUB_REF=refs/heads/master
if bash "$root/verify-release-provenance.sh" "$tmp/assets" >/dev/null 2>&1; then
  echo 'FAIL: a non-release ref was accepted' >&2
  exit 1
fi

echo 'PASS: provenance gate, 9 artifact checks, missing/invalid/non-tag rejection'
