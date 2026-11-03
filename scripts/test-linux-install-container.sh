#!/usr/bin/env bash
# Install the real generated package in a disposable Linux container.
# No graphical desktop, wallet configuration, Ledger or Bluetooth is used.
set -Eeuo pipefail

: "${DISTRO:?Specify distro}"
: "${EXPECTED_VERSION:?Specify release version}"
test -d /packages
case "$DISTRO" in
  ubuntu|debian) pattern='*.deb' ;;
  fedora|opensuse) pattern='*.rpm' ;;
  arch) pattern='*.pkg.tar.zst' ;;
  *) echo "Unknown distribution: $DISTRO" >&2; exit 2 ;;
esac

# Minimal distro images (notably Leap) need not ship findutils.
shopt -s nullglob
case "$DISTRO" in
  ubuntu|debian) matches=(/packages/*.deb) ;;
  fedora|opensuse) matches=(/packages/*.rpm) ;;
  arch) matches=(/packages/*.pkg.tar.zst) ;;
esac
if [[ "${#matches[@]}" -ne 1 ]]; then
  echo "Expected one $pattern file; got ${#matches[@]}" >&2
  exit 1
fi
package="${matches[0]}"
echo "Testing $(basename "$package") on $DISTRO"
cat /etc/os-release

case "$DISTRO" in
  ubuntu|debian)
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -o Acquire::Retries=3
    apt-get install -y --no-install-recommends desktop-file-utils "$package"
    installed="$(dpkg-query --showformat='${Version}' --show nault)"
    ;;
  fedora)
    dnf install -y desktop-file-utils "$package"
    installed="$(rpm -q --queryformat '%{VERSION}' nault)"
    ;;
  opensuse)
    zypper --non-interactive refresh
    zypper --non-interactive --no-gpg-checks install --no-recommends desktop-file-utils "$package"
    installed="$(rpm -q --queryformat '%{VERSION}' nault)"
    ;;
  arch)
    pacman -Syu --noconfirm --needed desktop-file-utils
    pacman -U --noconfirm "$package"
    installed="$(pacman -Q nault | awk '{print $2}')"
    ;;
esac

if [[ "$installed" != "$EXPECTED_VERSION" && "$installed" != "$EXPECTED_VERSION"-* ]]; then
  echo "Wrong installed version: $installed (expected $EXPECTED_VERSION)" >&2
  exit 1
fi
echo "Installed version: $installed"

desktop=/usr/share/applications/cc.nault.desktop
test -s "$desktop"
desktop-file-validate "$desktop"
grep -qx 'Name=Nault' "$desktop"
grep -Eq '^Exec=.*nault([[:space:]]|$)' "$desktop"
grep -Eq '^Icon=[^[:space:]]+' "$desktop"
grep -Eq '^Categories=.*Office' "$desktop"

exec_line="$(sed -n 's/^Exec=//p' "$desktop" | head -n 1)"
launcher="${exec_line%% *}"
if [[ "$launcher" = /* ]]; then
  test -x "$launcher"
else
  launcher="$(command -v "$launcher")"
  test -x "$launcher"
fi
echo "Desktop executable: $launcher"

icons=(/usr/share/icons/hicolor/*/apps/*nault*.png)
test "${#icons[@]}" -gt 0
icon="${icons[0]}"
test -s "$icon"
echo "Installed icon: $icon"

ldd "$launcher" > /tmp/nault-ldd.txt
cat /tmp/nault-ldd.txt
if grep -Fq 'not found' /tmp/nault-ldd.txt; then
  echo "Missing shared libraries" >&2
  exit 1
fi

case "$DISTRO" in
  ubuntu|debian)
    apt-get purge -y nault
    if dpkg-query -W -f='${Status}' nault 2>/dev/null | grep -q 'install ok installed'; then
      echo "Nault remains installed" >&2
      exit 1
    fi
    ;;
  fedora)
    dnf remove -y nault
    if rpm -q nault; then exit 1; fi
    ;;
  opensuse)
    zypper --non-interactive remove nault
    if rpm -q nault; then exit 1; fi
    ;;
  arch)
    pacman -R --noconfirm nault
    if pacman -Q nault; then exit 1; fi
    ;;
esac
test ! -e "$desktop"
test ! -e "$launcher"
echo "PASS: $DISTRO install, metadata, executable, libraries and removal."
