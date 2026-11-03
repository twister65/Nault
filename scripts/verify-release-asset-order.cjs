#!/usr/bin/env node
'use strict';
// GitHub sorts assets by name; numeric prefixes present Windows, macOS, Linux.
// Leave updater channel names intact, and verify every referenced artifact.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const yaml = require('js-yaml');

const config = {
  win32: { prefix: '01-Windows-', feed: 'latest.yml', formats: ['.exe'] },
  darwin: { prefix: '02-macOS-', feed: 'latest-mac.yml', formats: ['.dmg'] },
  linux: {
    prefix: '03-Linux-', feed: 'latest-linux.yml',
    formats: ['.AppImage', '.deb', '.rpm', '.pkg.tar.zst']
  }
};
const target = config[process.platform];
assert.ok(target, 'Unsupported release OS: ' + process.platform);
const dir = path.resolve(__dirname, '../desktop-app/build');
async function sha512(file) {
  const hash = crypto.createHash('sha512');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('base64');
}
async function main() {
  const manifest = path.join(dir, target.feed);
  assert.ok(fs.existsSync(manifest), 'Missing updater feed ' + target.feed);
  const metadata = yaml.load(fs.readFileSync(manifest, 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
  assert.equal(metadata.version, pkg.version, 'Feed version mismatch');
  assert.ok(Array.isArray(metadata.files), 'Missing updater files list');
  const entries = fs.readdirSync(dir);

  for (const ext of target.formats) {
    const found = entries.filter(name => name.endsWith(ext));
    assert.equal(found.length, 1, 'Expected a single ' + ext + ' artifact: ' + found.join(', '));
    const filename = found[0];
    assert.ok(filename.startsWith(target.prefix), 'Wrong release sort prefix: ' + filename);
    assert.ok(filename.includes(pkg.version), 'Installer version not encoded: ' + filename);
    const matches = metadata.files.filter(f => f.url === filename);
    assert.equal(matches.length, 1, 'Updater does not reference ' + filename);
    const entry = matches[0];
    const full = path.join(dir, filename);
    assert.equal(entry.size, fs.statSync(full).size, 'Artifact size mismatch: ' + filename);
    assert.equal(entry.sha512, await sha512(full), 'Artifact SHA512 mismatch: ' + filename);
    console.log('PASS ' + target.feed + ' -> ' + filename);
  }
}
main().catch(err => {
  console.error('::error::Release asset naming/update-feed validation: ' + err.message);
  process.exitCode = 1;
});
