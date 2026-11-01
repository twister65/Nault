'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const manifest = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));

test('Electron 45.2.1 is pinned consistently in npm v2 lockfile', () => {
  const selected = '45.2.1';
  const resolved = lock.packages['node_modules/electron'];
  assert.equal(manifest.devDependencies.electron, selected);
  assert.equal(lock.packages[''].devDependencies.electron, selected);
  assert.equal(resolved.version, selected);
  assert.equal(lock.dependencies.electron.version, selected);
  assert.equal(resolved.resolved, 'https://registry.npmjs.org/electron/-/electron-45.2.1.tgz');
  assert.match(resolved.integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/);
  assert.equal(resolved.dependencies['@electron-internal/extract-zip'], '^1.0.1');
  assert.equal(resolved.dependencies['@electron/get'], '^5.0.0');
  assert.equal(resolved.dependencies['@types/node'], '^24.9.0');
});

test('sandboxed preload does not use globals removed in Electron 45', () => {
  const preload = read('desktop-app/src/preload.ts');
  assert.match(preload, /contextBridge\.exposeInMainWorld\('naultDesktop'/);
  assert.doesNotMatch(preload, /\brequire\s*\(\s*['"](?:events|timers|url)['"]\s*\)/);
  assert.doesNotMatch(preload, /\b(?:Buffer|setImmediate|clearImmediate)\b/);
  assert.doesNotMatch(preload, /contextBridge\.exposeInMainWorld\([^,]+,\s*ipcRenderer/);
});

test('desktop retains sandbox, a narrow IPC bridge, and blocked WebHID', () => {
  const main = read('desktop-app/src/desktop-app.ts');
  const preload = read('desktop-app/src/preload.ts');
  for (const policy of ['sandbox: true', 'contextIsolation: true', 'nodeIntegration: false', 'webSecurity: true']) {
    assert.ok(main.includes(policy), `Expected ${policy}`);
  }
  assert.match(main, /isTrustedLedgerSender\(event/);
  assert.match(main, /setDevicePermissionHandler\(\(\) => false\)/);
  assert.match(main, /select-hid-device/);
  assert.match(main, /configureWebBluetooth\(currentWindow, isTrustedWalletURL\)/);
  assert.match(preload, /const allowedIncoming = new Set\(\['ledger', 'deeplink'\]\)/);
  assert.match(preload, /const allowedOutgoing = new Set\(\['ledger', 'deeplink-ready'\]\)/);
});

test('Ledger native HID remains isolated in a worker and packaging targets stay unchanged', () => {
  const mainTransport = read('desktop-app/src/lib/ledger-hid-worker-transport.ts');
  const worker = read('desktop-app/src/lib/ledger-hid-worker.ts');
  assert.match(mainTransport, /new Worker\(/);
  assert.match(worker, /@ledgerhq\/hw-transport-node-hid-noevents/);
  assert.match(worker, /readTimeout\(100\)/);
  const build = manifest.build;
  assert.equal(build.linux.target, 'AppImage');
  assert.equal(build.mac.target, 'dmg');
  assert.equal(build.publish.owner, 'twister65');
  assert.equal(build.publish.repo, 'Nault');
  assert.equal(build.nsis.artifactName, 'Nault-Setup-${version}.${ext}');
});
