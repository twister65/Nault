#!/usr/bin/env node
'use strict';

// Release gate: a valid Linux installer is not enough. All four update types
// must be discoverable in the same GitHub release manifest, with matching
// content hashes. This never downloads or installs anything.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const yaml = require('js-yaml');
const pkg = require('../package.json');

const output = path.resolve(__dirname, '../desktop-app/build');
const manifestPath = path.join(output, 'latest-linux.yml');
const feedPath = path.join(output, 'linux-unpacked', 'resources', 'app-update.yml');
const extensions = ['.AppImage', '.deb', '.rpm', '.pkg.tar.zst'];

function checkedArchiveName(url) {
  assert.equal(typeof url, 'string', 'Update artifact URL must be a string');
  const fileName = decodeURIComponent(url);
  assert.equal(path.basename(fileName), fileName, 'Update URLs must be artifact names, not subpaths');
  assert.ok(!fileName.includes('\\') && !fileName.includes('?') && !fileName.includes('#'),
    'Update artifact filename contains unsafe characters');
  return fileName;
}
async function sha512(file) {
  const hasher = crypto.createHash('sha512');
  for await (const chunk of fs.createReadStream(file)) hasher.update(chunk);
  return hasher.digest('base64');
}
async function main() {
  assert.ok(fs.existsSync(manifestPath), 'Missing latest-linux.yml (no Linux update discovery)');
  assert.ok(fs.existsSync(feedPath), 'Missing packaged app-update.yml (no GitHub update feed)');

  const feed = yaml.load(fs.readFileSync(feedPath, 'utf8'));
  assert.equal(feed.provider, 'github', 'Linux updater must use GitHub Releases');
  assert.equal(feed.owner, pkg.build.publish.owner);
  assert.equal(feed.repo, pkg.build.publish.repo);

  const info = yaml.load(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(info.version, pkg.version, 'Update version must match package.json');
  assert.ok(Array.isArray(info.files), 'Update manifest must contain files array');

  for (const extension of extensions) {
    const matches = info.files.filter(f => typeof f.url === 'string' &&
      checkedArchiveName(f.url).endsWith(extension));
    assert.equal(matches.length, 1, 'Expected exactly one Linux update artifact of type ' + extension);

    const entry = matches[0];
    const file = path.join(output, checkedArchiveName(entry.url));
    assert.ok(fs.existsSync(file), 'Update artifact is absent: ' + entry.url);
    const stat = fs.statSync(file);
    assert.ok(stat.size > 0, 'Empty update artifact: ' + entry.url);
    assert.equal(entry.size, stat.size, 'Size mismatch: ' + entry.url);
    assert.equal(entry.sha512, await sha512(file), 'SHA-512 mismatch: ' + entry.url);
    console.log('Verified update artifact: ' + entry.url);
  }
  console.log('All four Linux package types and the GitHub update feed are verified.');
}
main().catch(error => {
  console.error('::error::Linux release update metadata invalid: ' + error.message);
  process.exitCode = 1;
});
