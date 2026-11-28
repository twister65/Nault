#!/usr/bin/env node
'use strict';
// Assemble a preview on pull requests; never creates a tag or GitHub release.
// On tag runs, assemble Windows and Linux updater feeds and generate download notes.
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
const expected = ['desktop-windows-2022', ...Object.keys(linuxArtifacts)];
const feeds = {'desktop-windows-2022': 'latest.yml'};
const allowed = name => name.endsWith('.exe') || name.endsWith('.AppImage') ||
  name.endsWith('.deb') || name.endsWith('.rpm') || name.endsWith('.pkg.tar.zst') ||
  ['latest.yml', 'latest-linux.yml'].includes(name) ||
  (name.endsWith('.blockmap') && !name.startsWith('Nault-macOS-'));

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
function link(name, caption) {
  if (!tag) return '- **' + caption + ':** ' + String.fromCharCode(96) + name + String.fromCharCode(96);
  const url = 'https://github.com/twister65/Nault/releases/download/' +
    encodeURIComponent(tag) + '/' + encodeURIComponent(name);
  return '- **' + caption + ':** [' + name + '](' + url + ')';
}
function main() {
  assert.ok(fs.existsSync(input), 'Missing downloaded platform artifacts');
  fs.mkdirSync(output, {recursive: true});
  assert.equal(fs.readdirSync(output).length, 0, 'Release output must be empty');
  assert.ok(!fs.readdirSync(input).some(name => name.startsWith('desktop-macos-')), 'Unexpected retired macOS artifacts');
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
      const dst = path.join(output, name);
      assert.ok(!fs.existsSync(dst), 'Collision between platform assets: ' + name);
      fs.copyFileSync(path.join(dir, name), dst);
    }
  }
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
    'Use the [installable Nault PWA in Google Chrome](https://twister32.changeip.org/). Native macOS desktop packages are no longer published by this fork.',
    '',
    '### Linux',
    link(linux[0], 'Debian / Ubuntu / Linux Mint (DEB)'),
    link(linux[1], 'Fedora / openSUSE (RPM)'),
    link(linux[2], 'Arch Linux / Manjaro (Pacman, beta)'),
    link(linux[3], 'Other compatible x86_64 Linux (portable AppImage)'),
    '',
    'The latest*.yml files and blockmaps are included in Assets for Windows and Linux application updates.',
    ''
  ];
  fs.writeFileSync(notes, lines.join('\n'));
  const packages = fs.readdirSync(output).filter(allowed).sort();
  const sums = packages.map(name => hash(path.join(output, name), 'sha256') + '  ' + name);
  fs.writeFileSync(path.join(output, 'SHA256SUMS'), sums.join('\n') + '\n');
  console.log('PASS: grouped release preview, Windows and 4 Linux formats');
  console.log(lines.join('\n'));
}
main();
