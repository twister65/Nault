'use strict';

// Security regression for GHSA-c2qf-rxjj-qqgw (CVE-2022-25883).
// Keep semver within each consumer's major version; do NOT replace all
// semver majors with v7 (native node-abi uses semver 5.x).
const test = require('node:test');
const assert = require('node:assert/strict');
const manifest = require('../package.json');
const lock = require('../package-lock.json');

const minPatched = { 5: [5, 7, 2], 6: [6, 3, 1], 7: [7, 5, 2] };
function triplet(text) {
  assert.ok(/^[0-9]+[.][0-9]+[.][0-9]+$/.test(text), 'expected stable semver release: ' + text);
  return text.split('.').map(Number);
}
function atLeast(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true;
}
function depVersion(requester, dependency) {
  const packages = lock.packages;
  for (let current = requester;;) {
    const candidate = (current ? current + '/' : '') + 'node_modules/' + dependency;
    if (packages[candidate]) return packages[candidate].version;
    if (!current) break;
    const pos = current.lastIndexOf('/node_modules/');
    if (pos !== -1) current = current.slice(0, pos);
    else if (current.startsWith('node_modules/')) current = '';
    else break;
  }
  return null;
}

test('all installed semver copies are outside all three vulnerable major ranges', () => {
  const copies = Object.entries(lock.packages).filter(([path]) =>
    path === 'node_modules/semver' || path.endsWith('/node_modules/semver'));
  assert.ok(copies.length > 0, 'semver must appear in lockfile');
  for (const [path, entry] of copies) {
    const parsed = triplet(entry.version);
    const minimum = minPatched[parsed[0]];
    assert.ok(minimum, 'unexpected semver major at ' + path + ': ' + entry.version);
    assert.ok(atLeast(parsed, minimum), path + ': vulnerable semver ' + entry.version);
    assert.match(entry.integrity || '', /^sha512-/, path + ': npm integrity required');
  }
});
test('Ledger devices and legacy native build chain remain on compatible patched majors', () => {
  assert.equal(manifest.overrides['@ledgerhq/devices'].semver, '7.8.5');
  assert.equal(manifest.overrides['node-abi@2.30.1'].semver, '5.7.2');
  assert.equal(manifest.overrides['tiny-async-pool'].semver, '5.7.2');
  assert.equal(manifest.overrides['make-dir@2.1.0'].semver, '5.7.2');
  assert.equal(manifest.overrides['make-dir@3.1.0'].semver, '6.3.1');
  const versions = [
    ['node_modules/@ledgerhq/devices', '7.8.5'],
    ['node_modules/node-abi', '5.7.2'],
    ['node_modules/make-dir', '5.7.2'],
    ['node_modules/tiny-async-pool', '5.7.2'],
    ['node_modules/istanbul-lib-report/node_modules/make-dir', '6.3.1']
  ];
  for (const [parent, expected] of versions) {
    assert.ok(lock.packages[parent], parent + ' missing from lockfile');
    assert.equal(depVersion(parent, 'semver'), expected, parent + ' resolved semver version');
  }
  assert.equal(manifest.devDependencies.electron, '44.9.3');
  assert.equal(manifest.dependencies['@ledgerhq/devices'], '7.0.2');
});

test('semver major is compatible with the original dependency specification of every consumer', () => {
  for (const [path, entry] of Object.entries(lock.packages)) {
    const requirement = entry.dependencies?.semver;
    if (!requirement) continue;
    const resolved = depVersion(path, 'semver');
    assert.ok(resolved, path + ': unable to resolve semver ' + requirement);
    // Nault's resolved semver consumers use compatible ^ or ~ constraints.
    const match = /^[~^]([0-9]+)[.]/.exec(requirement);
    if (!match) continue;
    const wantMajor = Number(match[1]);
    const actualMajor = triplet(resolved)[0];
    assert.equal(actualMajor, wantMajor,
      path + ': semver ' + resolved + ' violates declared ' + requirement);
  }
});
