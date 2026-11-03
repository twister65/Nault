#!/usr/bin/env node
'use strict';
// Assemble a preview on pull requests; never creates a tag or GitHub release.
// On tag runs, merge macOS x64/arm64 updater feeds and generate download notes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const yaml = require('js-yaml');
const pkg = require('../package.json');

const input = path.resolve(process.argv[2] || 'desktop-platforms');
const output = path.resolve(process.argv[3] || 'release-ready');
const notes = path.resolve(process.argv[4] || 'release-downloads.md');
const tag = process.argv[5] || '';
const linuxArtifacts = {
  'desktop-linux-deb': '.deb',
  'desktop-linux-rpm': '.rpm',
  'desktop-linux-pacman': '.pkg.tar.zst',
  'desktop-linux-appimage': '.AppImage'
};
const expected = ['desktop-windows-2022', 'desktop-macos-15-intel',
  'desktop-macos-15', ...Object.keys(linuxArtifacts)];
const macHosts = ['desktop-macos-15-intel', 'desktop-macos-15'];
const feeds = {
  'desktop-windows-2022': 'latest.yml',
  'desktop-macos-15-intel': 'latest-mac.yml',
  'desktop-macos-15': 'latest-mac.yml'
};
const allowed = name => name.endsWith('.exe') || name.endsWith('.dmg') ||
  name.endsWith('.zip') || name.endsWith('.AppImage') || name.endsWith('.deb') ||
  name.endsWith('.rpm') || name.endsWith('.pkg.tar.zst') ||
  ['latest.yml', 'latest-linux.yml', 'latest-mac.yml'].includes(name) ||
  name.endsWith('.blockmap');

function hash(file, algo) {
  const h = crypto.createHash(algo);
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let length;
    while ((length = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) h.update(buffer.subarray(0, length));
  } finally { fs.closeSync(fd); }
  return h.digest(algo === 'sha256' ? 'hex' : 'base64');
}
function onlyFile(dir, ending) {
  const items = fs.readdirSync(dir).filter(name => name.endsWith(ending));
  assert.equal(items.length, 1, 'Expected exactly one ' + ending + ' in ' + dir + ': ' + items);
  return items[0];
}
function validateFeed(dir, feedName) {
  const f = yaml.load(fs.readFileSync(path.join(dir, feedName), 'utf8'));
  assert.equal(f.version, pkg.version, 'Updater feed version mismatch in ' + dir);
  assert.ok(Array.isArray(f.files) && f.files.length, 'Empty updater file list in ' + dir);
  for (const entry of f.files) {
    const name = entry.url;
    assert.equal(path.basename(name), name, 'Unsafe update URL ' + name);
    const file = path.join(dir, name);
    assert.ok(fs.existsSync(file), 'Missing updater artifact ' + file);
    assert.equal(entry.size, fs.statSync(file).size, 'Size mismatch ' + name);
    assert.equal(entry.sha512, hash(file, 'sha512'), 'SHA512 mismatch ' + name);
  }
  return f;
}
function label(arch) { return arch === 'x64' ? 'Intel (x64)' : 'Apple Silicon (arm64)'; }
function link(name, caption) {
  if (!tag) return '- **' + caption + ':** ' + String.fromCharCode(96) + name + String.fromCharCode(96);
  const url = 'https://github.com/twister65/Nault/releases/download/' +
    encodeURIComponent(tag) + '/' + encodeURIComponent(name);
  return '- **' + caption + ':** [' + name + '](' + url + ')';
}
function main() {
  assert.ok(fs.existsSync(input), 'Missing downloaded platform artifacts');
  fs.mkdirSync(output, {recursive: true});
  for (const host of expected) {
    const dir = path.join(input, host);
    assert.ok(fs.existsSync(dir), 'Missing CI platform ' + host);
    if (feeds[host]) validateFeed(dir, feeds[host]);
    // Artifacts are intentionally per Linux package. Catch accidental
    // cross-format uploads before assembling the complete release.
    if (linuxArtifacts[host]) {
      const extension = linuxArtifacts[host];
      onlyFile(dir, extension);
      for (const other of Object.values(linuxArtifacts).filter(x => x !== extension)) {
        assert.ok(!fs.readdirSync(dir).some(name => name.endsWith(other)),
          'Wrong package type in ' + host + ': ' + other);
      }
    }
  }
  // The combined Linux update feed references *all four* installers, so it
  // can only be validated after the separate artifacts have been assembled.
  assert.ok(fs.existsSync(path.join(input, 'desktop-linux-appimage', 'latest-linux.yml')),
    'Missing shared Linux updater manifest');
  for (const host of expected) {
    const dir = path.join(input, host);
    for (const name of fs.readdirSync(dir).filter(allowed)) {
      if (name === 'latest-mac.yml') continue; // Merge x64/arm64 feeds below.
      const dst = path.join(output, name);
      assert.ok(!fs.existsSync(dst), 'Collision between platform assets: ' + name);
      fs.copyFileSync(path.join(dir, name), dst);
    }
  }
  const nativeMac = [];
  for (const host of macHosts) {
    const dir = path.join(input, host);
    const arch = host.endsWith('intel') ? 'x64' : 'arm64';
    const dmg = onlyFile(dir, '.dmg');
    const zip = onlyFile(dir, '.zip');
    assert.ok(dmg.includes('-' + arch + '.dmg'), 'Missing native macOS ' + arch + ' DMG');
    assert.ok(zip.includes('-' + arch + '.zip'), 'Missing native macOS ' + arch + ' ZIP');
    const meta = validateFeed(dir, 'latest-mac.yml');
    assert.equal(meta.files.length, 2, 'Expected both DMG and ZIP per macOS architecture');
    nativeMac.push({arch, dmg, zip, meta});
  }
  const combined = {...nativeMac[0].meta, files: nativeMac.flatMap(x => x.meta.files)};
  assert.equal(combined.files.length, 4, 'macOS updater must contain 2 DMG + 2 ZIP');
  fs.writeFileSync(path.join(output, 'latest-mac.yml'), yaml.dump(combined, {lineWidth: -1}));
  const win = onlyFile(output, '.exe');
  const linux = [
    onlyFile(output, '.deb'), onlyFile(output, '.rpm'),
    onlyFile(output, '.pkg.tar.zst'), onlyFile(output, '.AppImage')
  ];
  assert.ok(win.startsWith('Nault-Windows-Setup-'));
  assert.ok(linux[0].includes('-Debian-Ubuntu-Mint-'));
  assert.ok(linux[1].includes('-Fedora-openSUSE-'));
  assert.ok(linux[2].includes('-Arch-Manjaro-'));
  assert.ok(linux[3].includes('-Portable-'));
  validateFeed(output, 'latest.yml');
  validateFeed(output, 'latest-linux.yml');
  validateFeed(output, 'latest-mac.yml');

  const lines = [
    '## Downloads',
    '',
    'Download the version that matches your operating system.',
    '',
    !tag ? '**Preview only: these assets have NOT been published.**' : '',
    '',
    '### Windows',
    link(win, 'Windows 64-bit (EXE)'),
    '',
    '### macOS',
    ...nativeMac.map(m => link(m.dmg, label(m.arch) + ' (DMG)')),
    '',
    '### Linux',
    link(linux[0], 'Debian / Ubuntu / Linux Mint (DEB)'),
    link(linux[1], 'Fedora / openSUSE (RPM)'),
    link(linux[2], 'Arch Linux / Manjaro (Pacman, beta)'),
    link(linux[3], 'Other compatible x86_64 Linux (portable AppImage)'),
    '',
    'The technical ZIP archives and latest*.yml files are included in Assets for application updates.',
    'The macOS ZIP update mechanism requires Apple code signing; unsigned CI previews do not validate native automatic installation.',
    ''
  ];
  fs.writeFileSync(notes, lines.join('\n'));
  const packages = fs.readdirSync(output).filter(allowed).sort();
  const sums = packages.map(name => hash(path.join(output, name), 'sha256') + '  ' + name);
  fs.writeFileSync(path.join(output, 'SHA256SUMS'), sums.join('\n') + '\n');
  console.log('PASS: grouped release preview, 2 native macOS architectures and 4 Linux formats');
  console.log(lines.join('\n'));
}
main();
