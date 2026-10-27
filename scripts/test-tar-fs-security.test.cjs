'use strict';

// Regression guard for tar-fs 2.x extraction security advisories.
// GitHub Dependabot alerts #37 (CVE-2024-12905), #40 and #52.
// This is an installation/native build dependency of the Ledger HID stack,
// not a replacement or reconfiguration of the Ledger transports themselves.
const test = require('node:test');
const assert = require('node:assert/strict');
const manifest = require('../package.json');
const lock = require('../package-lock.json');
const packages = lock.packages;

function resolve(from, name) {
  let current = from;
  for (;;) {
    const candidate = (current ? current + '/' : '') + 'node_modules/' + name;
    if (packages[candidate]) return { path: candidate, entry: packages[candidate] };
    if (!current) return null;
    const marker = current.lastIndexOf('/node_modules/');
    current = marker === -1 ? '' : current.slice(0, marker);
  }
}

test('all resolved tar-fs copies are patched, with trusted lockfile metadata', () => {
  assert.equal(manifest.overrides['tar-fs'], '2.1.4');
  const copies = Object.entries(packages).filter(([p]) =>
    p === 'node_modules/tar-fs' || p.endsWith('/node_modules/tar-fs'));
  assert.ok(copies.length > 0, 'tar-fs is expected for native/HID installation');
  for (const [path, pkg] of copies) {
    assert.equal(pkg.version, '2.1.4', path + ' must be patched');
    assert.match(pkg.integrity || '', /^sha512-/, path + ': npm integrity missing');
    assert.match(pkg.resolved || '', /^https:\/\/registry\.npmjs\.org\/tar-fs\/-\/tar-fs-2\.1\.4\.tgz$/, path);
    assert.equal(pkg.dependencies?.['tar-stream'], '^2.0.0',
      path + ' must retain tar-stream v2 compatibility');
  }
});

test('both Ledger HID transports and node-hid native installer resolve patched tar-fs', () => {
  const installers = [
    ['node_modules/prebuild-install', '7.1.2'],
    ['node_modules/@ledgerhq/hw-transport-node-hid/node_modules/prebuild-install', '6.1.4'],
    ['node_modules/@ledgerhq/hw-transport-node-hid-noevents/node_modules/prebuild-install', '6.1.4']
  ];
  for (const [path, version] of installers) {
    const parent = packages[path];
    assert.ok(parent, path + ' missing');
    assert.equal(parent.version, version, path + ' must not change version');
    assert.equal(parent.dependencies?.['tar-fs'], '^2.0.0', path);
    const resolved = resolve(path, 'tar-fs');
    assert.ok(resolved, path + ' cannot resolve tar-fs');
    assert.equal(resolved.entry.version, '2.1.4',
      path + ' resolves insecure tar-fs at ' + resolved.path);
  }
  assert.equal(manifest.devDependencies.electron, '44.9.3');
  assert.equal(manifest.dependencies['@ledgerhq/hw-transport-node-hid'], '6.27.5');
});
