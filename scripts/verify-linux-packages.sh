#!/usr/bin/env bash
# Verify native Linux archives contain a freedesktop application launcher.
# This checks packaging only; hardware Ledger USB/BLE tests remain manual.
set -euo pipefail

cd "$(dirname "$0")/.."
output="desktop-app/build"
deb="$(find "$output" -maxdepth 1 -type f -name '*.deb' -print -quit)"
rpm="$(find "$output" -maxdepth 1 -type f -name '*.rpm' -print -quit)"
pacman="$(find "$output" -maxdepth 1 -type f -name '*.pkg.tar.zst' -print -quit)"
appimage="$(find "$output" -maxdepth 1 -type f -name '*.AppImage' -print -quit)"
for archive in "$deb" "$rpm" "$pacman" "$appimage"; do
  if test -z "$archive" || ! test -s "$archive"; then
    echo "::error::Missing or empty Linux release artifact"
    exit 1
  fi
done

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
dpkg-deb -x "$deb" "$tmp/deb"
desktop_file="$tmp/deb/usr/share/applications/cc.nault.desktop"
test -s "$desktop_file"
grep -qx 'Name=Nault' "$desktop_file"
grep -Eq '^Exec=.*nault([[:space:]]|$)' "$desktop_file"
grep -Eq '^Icon=[^[:space:]]+' "$desktop_file"
grep -Eq '^Categories=.*Office' "$desktop_file"
grep -Eq '^StartupWMClass=cc\.nault$' "$desktop_file"
find "$tmp/deb/usr/share/icons" -type f -name '*.png' | grep -q .
dpkg-deb -f "$deb" Package Version Architecture

rpm -qpl "$rpm" | grep -Eq '/usr/share/applications/cc\.nault\.desktop$'
rpm -qpl "$rpm" | grep -Eq '/usr/share/icons/.+\.png$'
tar -I zstd -tf "$pacman" | grep -Eq '(^|/)usr/share/applications/cc\.nault\.desktop$'
tar -I zstd -tf "$pacman" | grep -Eq '(^|/)usr/share/icons/.+\.png$'

echo "Linux AppImage, DEB, RPM, and Pacman launchers are present."
