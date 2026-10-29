'use strict';

// Dependabot alerts #185 and #156 (engine.io denial of service),
// #177 (socket.io-parser binary attachment exhaustion), #128 (ws DoS).
// These dependencies run in Karma's development/test server, not the wallet.
const test = require('node:test');
const assert = require('node:assert/strict');
const manifest = require('../package.json');
const lock = require('../package-lock.json');
const pk = lock.packages;
const pinned = { 'engine.io': '6.6.10', 'socket.io-parser': '4.2.7', ws: '8.21.0' };

function installedCopy(name) {
  return Object.entries(pk).filter(([path]) =>
    path === 'node_modules/' + name || path.endsWith('/node_modules/' + name));
}
function resolve(from, name) {
  for (let current = from;;) {
    const candidate = (current ? current + '/' : '') + 'node_modules/' + name;
    if (pk[candidate]) return pk[candidate];
    if (!current) return null;
    const i = current.lastIndexOf('/node_modules/');
    current = i < 0 ? '' : current.slice(0, i);
  }
}
test('all vulnerable Socket.IO and ws copies are fixed and registry integrity is present', () => {
  for (const [name, release] of Object.entries(pinned)) {
    assert.equal(manifest.overrides[name], release, name + ' override');
    const copies = installedCopy(name);
    assert.ok(copies.length > 0, name + ' missing from lockfile');
    for (const [path, meta] of copies) {
      assert.equal(meta.version, release, path);
      assert.match(meta.integrity || '', /^sha512-/, path);
      assert.ok((meta.resolved || '').startsWith('https://registry.npmjs.org/' + name + '/-/'),
        path + ' must resolve from canonical npm registry');
      assert.equal(meta.dev, true, path + ' must remain development-only');
    }
  }
});
test('Karma and Socket.IO dependencies still resolve with unchanged major APIs', () => {
  const karma = pk['node_modules/karma'];
  const socketio = pk['node_modules/socket.io'];
  const adapter = pk['node_modules/socket.io-adapter'];
  assert.equal(karma?.version, '6.3.19');
  assert.equal(socketio?.version, '4.8.1');
  assert.equal(adapter?.version, '2.5.5');
  assert.equal(socketio.dependencies?.['engine.io'], '~6.6.0');
  assert.equal(socketio.dependencies?.['socket.io-parser'], '~4.2.4');
  assert.equal(adapter.dependencies?.ws, '~8.17.1');
  for (const [parent, name, expected] of [
    ['node_modules/socket.io', 'engine.io', '6.6.10'],
    ['node_modules/socket.io', 'socket.io-parser', '4.2.7'],
    ['node_modules/socket.io-adapter', 'ws', '8.21.0'],
    ['node_modules/engine.io', 'ws', '8.21.0']
  ]) {
    const dep = resolve(parent, name);
    assert.ok(dep, parent + ' does not resolve ' + name);
    assert.equal(dep.version, expected, parent + ' needs patched ' + name);
  }
  assert.equal(manifest.devDependencies.electron, '44.10.0');
  assert.equal(pk['node_modules/@ledgerhq/hw-transport-node-hid']?.version, '6.27.5');
  assert.equal(pk['node_modules/tar-fs']?.version, '2.1.4');
  assert.equal(pk['node_modules/lodash']?.version, '4.18.1');
});
