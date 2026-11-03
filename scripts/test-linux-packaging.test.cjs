'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('Nault release includes distro-native Linux formats and menu metadata', () => {
  const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.deepEqual(p.build.linux.target, ['AppImage', 'deb', 'rpm', 'pacman']);
  assert.equal(p.desktopName, 'cc.nault.desktop');
  assert.equal(p.build.linux.syncDesktopName, true);
  assert.equal(p.build.linux.executableName, 'nault');
  assert.equal(p.build.linux.desktop.entry.Name, 'Nault');
  assert.match(p.build.linux.category, /Office/);
  assert.ok(fs.statSync('desktop-app/assets/linux/256x256.png').size > 0);
});

test('release CI verifies packages before publishing them', () => {
  const workflow = fs.readFileSync('.github/workflows/electron_hash.yml', 'utf8');
  for (const extension of ['*.AppImage', '*.deb', '*.rpm', '*.pkg.tar.zst']) {
    assert.ok(workflow.includes('desktop-app/build/' + extension));
    assert.ok(workflow.includes("-name '" + extension + "'"));
  }
  assert.match(workflow, /bash scripts\/verify-linux-packages\.sh/);
  assert.match(workflow, /sha256sum --check SHA256SUMS/);
});

test('Linux archive validation materializes full manifests before grep', () => {
  const script = fs.readFileSync('scripts/verify-linux-packages.sh', 'utf8');
  assert.match(script, /rpm -qpl "\$rpm" > "\$tmp\/rpm-files\.txt"/);
  assert.match(script, /tar -I zstd -tf "\$pacman" > "\$tmp\/pacman-files\.txt"/);
  assert.doesNotMatch(script, /(?:tar -I zstd -tf|rpm -qpl)[^\n]*\|\s*grep/);
});

test('Linux release validation requires a complete updater manifest', () => {
  const workflow = fs.readFileSync('.github/workflows/electron_hash.yml', 'utf8');
  assert.match(workflow, /node scripts\/verify-linux-update-feed\.cjs/);
  assert.match(workflow, /test -s packages\/latest-linux\.yml/);
  const verifier = fs.readFileSync('scripts/verify-linux-update-feed.cjs', 'utf8');
  assert.match(verifier, /latest-linux\.yml/);
  assert.match(verifier, /app-update\.yml/);
  assert.match(verifier, /createHash\('sha512'\)/);
  const main = fs.readFileSync('desktop-app/src/desktop-app.ts', 'utf8');
  assert.match(main, /process\.platform === 'linux' && !process\.env\.APPIMAGE/);
  assert.match(main, /autoUpdater\.quitAndInstall\(!isNativeLinuxPackage, true\)/);
  assert.match(main, /autoUpdater\.autoDownload = false/);
});

test('release CI installs real packages in five isolated Linux distributions', () => {
  const workflow = fs.readFileSync('.github/workflows/electron_hash.yml', 'utf8');
  assert.match(workflow, /linux-install-smoke:/);
  for (const image of [
    'ubuntu:26.04', 'debian:13', 'fedora:44',
    'opensuse/leap:16.0', 'archlinux/archlinux:base'
  ]) assert.ok(workflow.includes('image: ' + image), 'missing CI image ' + image);
  assert.match(workflow, /name: desktop-ubuntu-24\.04/);
  assert.match(workflow, /docker run --rm --pull=always/);
  assert.match(workflow, /--security-opt no-new-privileges/);
  assert.match(workflow, /needs: \[release-preview, linux-install-smoke\]/);
  const script = fs.readFileSync('scripts/test-linux-install-container.sh', 'utf8');
  for (const command of [
    'apt-get install', 'dnf install', 'zypper --non-interactive',
    'pacman -U', 'desktop-file-validate', 'ldd "$launcher"',
    'apt-get purge', 'dnf remove', 'zypper --non-interactive remove', 'pacman -R'
  ]) assert.ok(script.includes(command), 'missing test operation: ' + command);
  assert.match(script, /test ! -e "\$desktop"/);
  assert.match(script, /test ! -e "\$launcher"/);
});

test('native distro packages declare cross-distribution Electron runtime dependencies', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  for (const dep of [
    'libgtk-3-0', 'libnotify4', 'libnss3', 'libxss1', 'libxtst6',
    'xdg-utils', 'libatspi2.0-0', 'libuuid1', 'libsecret-1-0', 'libgbm1', 'libasound2'
  ]) assert.ok(pkg.build.deb.depends.includes(dep), 'DEB missing ' + dep);
  for (const dep of [
    'libgtk-3.so.0()(64bit)', 'libnotify.so.4()(64bit)',
    'libnss3.so()(64bit)', 'libXss.so.1()(64bit)',
    'libXtst.so.6()(64bit)', 'xdg-utils',
    'libatspi.so.0()(64bit)', 'libuuid.so.1()(64bit)',
    'libsecret-1.so.0()(64bit)',
    'libgbm.so.1()(64bit)', 'libasound.so.2()(64bit)'
  ]) assert.ok(pkg.build.rpm.depends.includes(dep), 'RPM missing ' + dep);
  for (const dep of ['alsa-lib', 'mesa']) {
    assert.ok(pkg.build.pacman.depends.includes(dep), 'Pacman missing ' + dep);
  }
  // electron-builder 26 does NOT expand 'default' in target dependencies.
  assert.ok(!pkg.build.deb.depends.includes('default'));
  assert.ok(!pkg.build.rpm.depends.includes('default'));
  const script = fs.readFileSync('scripts/test-linux-install-container.sh', 'utf8');
  assert.match(script, /shopt -s nullglob/);
  assert.match(script, /matches=\(\/packages\/\*\.rpm\)/);
  assert.doesNotMatch(script, /\bfind \/packages\b/);
  assert.match(script, /ldd "\$launcher"/);
});

test('release notes group platforms and include macOS Apple Silicon plus distro names', () => {
  const p = JSON.parse(fs.readFileSync('package.json','utf8'));
  assert.equal(p.build.nsis.artifactName, 'Nault-Windows-Setup-${version}.${ext}');
  assert.equal(p.build.mac.artifactName, 'Nault-macOS-${version}-${arch}.${ext}');
  assert.deepEqual(p.build.mac.target, ['dmg','zip']);
  assert.equal(p.build.appImage.artifactName, 'Nault-Linux-Portable-${version}-${arch}.${ext}');
  assert.equal(p.build.deb.artifactName, 'Nault-Linux-Debian-Ubuntu-Mint-${version}-${arch}.${ext}');
  assert.equal(p.build.rpm.artifactName, 'Nault-Linux-Fedora-openSUSE-${version}-${arch}.${ext}');
  assert.equal(p.build.pacman.artifactName, 'Nault-Linux-Arch-Manjaro-${version}-${arch}.pkg.tar.zst');
  const w = fs.readFileSync('.github/workflows/electron_hash.yml','utf8');
  assert.ok(w.includes('macos-15-intel, macos-15'));
  assert.ok(w.includes('node scripts/assemble-release-assets.cjs'));
  assert.ok(w.includes('needs: [release-preview, linux-install-smoke]'));
  const assembly = fs.readFileSync('scripts/assemble-release-assets.cjs','utf8');
  for (const heading of ['### Windows','### macOS','### Linux']) assert.ok(assembly.includes(heading));
  for (const arch of ['x64','arm64']) assert.ok(assembly.includes(arch));
  const validator = fs.readFileSync('scripts/verify-release-asset-order.cjs','utf8');
  for (const f of ['latest.yml','latest-mac.yml','latest-linux.yml']) assert.ok(validator.includes(f));
});
