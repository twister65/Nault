'use strict';

// Dependabot alert #111: lodash _.template imports key code injection.
// Other alerts #109/#66: prototype pollution via _.unset/_.omit.
// All are remediated by lodash@4.18.1 without changing Ledger transports.
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

test('all lodash installs resolve published patched release with valid npm integrity', () => {
  assert.equal(manifest.overrides.lodash, '4.18.1');
  const copies = Object.entries(packages).filter(([name]) =>
    name === 'node_modules/lodash' || name.endsWith('/node_modules/lodash'));
  assert.ok(copies.length > 0, 'lodash is required by Ledger HID and desktop services');
  for (const [path, pkg] of copies) {
    assert.equal(pkg.version, '4.18.1', path);
    assert.match(pkg.resolved || '', /^https:\/\/registry\.npmjs\.org\/lodash\/-\/lodash-4\.18\.1\.tgz$/, path);
    assert.match(pkg.integrity || '', /^sha512-/, path);
  }
});

test('Ledger HID / Electron settings / Karma consumers preserve their dependencies', () => {
  const consumers = [
    ['node_modules/@ledgerhq/hw-transport-node-hid', '6.27.5', '^4.17.21'],
    ['node_modules/@malept/flatpak-bundler', '0.4.0', '^4.17.15'],
    ['node_modules/electron-settings', '4.0.4', '^4.17.21'],
    ['node_modules/karma', '6.3.19', '^4.17.21']
  ];
  for (const [path, version, dependency] of consumers) {
    const consumer = packages[path];
    assert.ok(consumer, path + ' is missing');
    assert.equal(consumer.version, version, path + ' changed unexpectedly');
    assert.equal(consumer.dependencies?.lodash, dependency, path + ' dependency constraint');
    const resolved = resolve(path, 'lodash');
    assert.ok(resolved, path + ' cannot resolve lodash');
    assert.equal(resolved.entry.version, '4.18.1', path);
  }
  assert.equal(manifest.devDependencies.electron, '44.9.3');
  assert.equal(packages['node_modules/tar-fs']?.version, '2.1.4');
});

test('safe lodash template, omit and unset behavior remains available', () => {
  const _ = require('lodash');
  assert.equal(_.VERSION, '4.18.1');
  const render = _.template('Hello <%= name %>');
  assert.equal(render({ name: 'Ledger' }), 'Hello Ledger');
  const obj = { nested: { amount: 42, enabled: true } };
  assert.equal(_.unset(obj, 'nested.enabled'), true);
  assert.deepEqual(_.omit(obj, ['nested.amount']), { nested: {} });
  assert.equal(obj.nested.amount, 42);
});
