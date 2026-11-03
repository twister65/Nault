#!/usr/bin/env node
'use strict';
// Validate real native platform artifacts, not the GitHub Assets display order.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const pkg = require('../package.json');
const dir = path.resolve(__dirname, '../desktop-app/build');
const formats = {
  win32: [['.exe', /^Nault-Windows-Setup-/]],
  darwin: [['.dmg', /^Nault-macOS-/], ['.zip', /^Nault-macOS-/]],
  linux: [
    ['.AppImage', /^Nault-Linux-Portable-/],
    ['.deb', /^Nault-Linux-Debian-Ubuntu-Mint-/],
    ['.rpm', /^Nault-Linux-Fedora-openSUSE-/],
    ['.pkg.tar.zst', /^Nault-Linux-Arch-Manjaro-/]
  ]
};
const feeds = {win32: 'latest.yml', darwin: 'latest-mac.yml', linux: 'latest-linux.yml'};
async function digest(file) {
  const hash = crypto.createHash('sha512');
  for await (const data of fs.createReadStream(file)) hash.update(data);
  return hash.digest('base64');
}
async function main() {
  const target = formats[process.platform];
  assert.ok(target, 'Unsupported platform: ' + process.platform);
  const feed = feeds[process.platform];
  const info = yaml.load(fs.readFileSync(path.join(dir, feed), 'utf8'));
  assert.equal(info.version, pkg.version);
  assert.ok(Array.isArray(info.files));
  const names = fs.readdirSync(dir);
  for (const [extension, prefix] of target) {
    const found = names.filter(name => name.endsWith(extension));
    assert.equal(found.length, 1, 'Expected one ' + extension + ', got ' + found);
    const name = found[0];
    assert.match(name, prefix);
    assert.ok(name.includes(pkg.version));
    if (process.platform === 'darwin') assert.ok(name.includes(process.arch), 'Wrong Mac architecture ' + name);
    const entries = info.files.filter(entry => entry.url === name);
    assert.equal(entries.length, 1, 'Missing/ambiguous updater entry for ' + name);
    const file = path.join(dir, name);
    assert.equal(entries[0].size, fs.statSync(file).size, name + ' size');
    assert.equal(entries[0].sha512, await digest(file), name + ' checksum');
    console.log('PASS ' + feed + ' -> ' + name);
  }
}
main().catch(err => { console.error('::error::' + err.message); process.exitCode = 1; });
