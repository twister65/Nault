'use strict';

// Verify the installed dependency tree, not just the package.json range.
// This guards against accidentally reintroducing the Windows signature-bypass
// updater or the older redirect credential and YAML parser vulnerabilities.
const test = require('node:test');
const assert = require('node:assert/strict');
const manifest = require('../package.json');
const lock = require('../package-lock.json');

function versionParts(v) {
  assert.match(v, /^\d+\.\d+\.\d+$/, 'stable release expected');
  return v.split('.').map(Number);
}
function gte(actual, minimum) {
  const a = versionParts(actual), b = versionParts(minimum);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true;
}
function childPackage(name) {
  // npm may hoist compatible dependencies, otherwise use the nested copy.
  return lock.packages['node_modules/electron-updater/node_modules/' + name]
    || lock.packages['node_modules/' + name];
}
test('upgrade is the pinned, stable and Windows code-signature-safe release', () => {
  assert.equal(manifest.dependencies['electron-updater'], '6.8.12');
  const updater = lock.packages['node_modules/electron-updater'];
  assert.equal(updater?.version, '6.8.12');
  assert.match(updater?.integrity || '', /^sha512-/);
  assert.equal(lock.packages[''].dependencies['electron-updater'], '6.8.12');
});
test('updater runtime, parser and semantic versioning dependencies are patched', () => {
  for (const [name, minimum] of [
    ['builder-util-runtime', '9.7.1'],
    ['js-yaml', '4.3.2'],
    ['semver', '7.5.2']
  ]) {
    const resolved = childPackage(name);
    assert.ok(resolved, 'missing updater dependency: ' + name);
    assert.ok(gte(resolved.version, minimum), name + ' ' + resolved.version + ' < ' + minimum);
    assert.match(resolved.integrity || '', /^sha512-/, name + ' integrity');
  }
});
