'use strict';
// Hardware-free integration tests for the actual main-process controller and
// renderer service. Compile Electron first; renderer TS is transpiled in memory.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { EventEmitter } = require('events');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
let passed = 0;
const flush = () => new Promise(resolve => setImmediate(resolve));
function load(code, deps, extra = {}) {
  const exports = {};
  vm.runInNewContext(code, { exports, console, setTimeout, clearTimeout, AbortController,
    require: name => { if (!(name in deps)) throw new Error(`Unexpected dependency: ${name}`); return deps[name]; }, ...extra });
  return exports;
}
function mainHarness() {
  const contents = new EventEmitter();
  contents.getURL = () => contents.url;
  contents.url = 'file:///wallet/index.html';
  contents.isDestroyed = () => false;
  contents.mainFrame = { url: contents.url };
  contents.session = { setBluetoothPairingHandler(handler) { this.pair = handler; } };
  const window = { webContents: contents, isDestroyed: () => false };
  const dialogs = [];
  const timers = new Map(); let next = 0;
  const code = fs.readFileSync(path.join(root, 'desktop-app/dist/lib/web-bluetooth.js'), 'utf8');
  const { configureWebBluetooth } = load(code, { electron: { dialog: {
    showMessageBox(_window, options) { return new Promise(resolve => dialogs.push({ options, resolve })); }
  } } }, {
    setTimeout(fn, delay) { timers.set(++next, { fn, delay }); return next; },
    clearTimeout(id) { timers.delete(id); }
  });
  const cancel = configureWebBluetooth(window, candidate => candidate === 'file:///wallet/index.html');
  const results = [];
  const devices = [{ deviceId: 'ledger-a', deviceName: 'Nano X A' }, { deviceId: 'ledger-b', deviceName: 'Nano X B' }];
  const select = (list = devices) => contents.emit('select-bluetooth-device', { preventDefault() {} }, list, id => results.push(id));
  return { contents, dialogs, timers, cancel, results, devices, select };
}
async function check(name, fn) { await fn(); console.log('PASS:', name); passed++; }
async function main() {
  await check('explicit device choice; list updates preserve button identity', async () => {
    const h = mainHarness(); h.select(); assert.equal(h.results.length, 0);
    h.select([...h.devices].reverse()); h.dialogs[0].resolve({ response: 2 }); await flush();
    assert.equal(h.results[0], 'ledger-a'); h.cancel();
  });
  await check('cancel selection', async () => {
    const h = mainHarness(); h.select(); h.dialogs[0].resolve({ response: 0 }); await flush();
    assert.deepEqual(h.results, ['']); h.cancel();
  });
  await check('scan timeout rejects late dialog selection', async () => {
    const h = mainHarness(); h.select(); [...h.timers.values()].find(t => t.delay === 60000).fn();
    h.dialogs[0].resolve({ response: 2 }); await flush(); assert.deepEqual(h.results, ['']); h.cancel();
  });
  await check('untrusted page cannot select a device', async () => {
    const h = mainHarness(); h.contents.url = 'https://example.com'; h.select();
    assert.deepEqual(h.results, ['']); assert.equal(h.dialogs.length, 0); h.cancel();
  });
  await check('navigation cancels pending selection and consent', async () => {
    const h = mainHarness(); h.select(); h.contents.emit('did-start-navigation', {}, 'file:///other', false, true);
    assert.deepEqual(h.results, ['']); assert(h.dialogs[0].options.signal.aborted); h.cancel();
  });
  await check('pairing requires selected device and trusted main frame', async () => {
    const h = mainHarness(); let response;
    h.contents.session.pair({ deviceId: 'ledger-a', frame: h.contents.mainFrame, pairingKind: 'confirm' }, r => response = r);
    assert.equal(response.confirmed, false);
    h.select(); h.dialogs[0].resolve({ response: 2 }); await flush();
    h.contents.session.pair({ deviceId: 'ledger-a', frame: {}, pairingKind: 'confirmPin', pin: '123456' }, r => response = r);
    assert.equal(response.confirmed, false); h.cancel();
  });
  await check('pairing code requires explicit confirmation; cancellation fails closed', async () => {
    const h = mainHarness(); h.select(); h.dialogs[0].resolve({ response: 2 }); await flush();
    let response;
    const details = { deviceId: 'ledger-a', frame: h.contents.mainFrame, pairingKind: 'confirmPin', pin: '123456' };
    h.contents.session.pair(details, r => response = r);
    assert(h.dialogs[1].options.message.includes('123456')); assert.equal(response, undefined);
    h.dialogs[1].resolve({ response: 1 }); await flush(); assert.equal(response.confirmed, true);
    h.contents.session.pair(details, r => response = r);
    h.dialogs[2].resolve({ response: 0 }); await flush(); assert.equal(response.confirmed, false); h.cancel();
  });
  await check('unsupported PIN entry is rejected', async () => {
    const h = mainHarness(); h.select(); h.dialogs[0].resolve({ response: 2 }); await flush();
    let response; h.contents.session.pair({ deviceId: 'ledger-a', frame: h.contents.mainFrame, pairingKind: 'providePin' }, r => response = r);
    assert.equal(response.confirmed, false); h.cancel();
  });

  await check('pairing timeout rejects a late confirmation', async () => {
    const h = mainHarness(); h.select(); h.dialogs[0].resolve({ response: 2 }); await flush();
    const responses = [];
    h.contents.session.pair({ deviceId: 'ledger-a', frame: h.contents.mainFrame, pairingKind: 'confirmPin', pin: '123456' }, r => responses.push(r.confirmed));
    [...h.timers.values()].find(t => t.delay === 60000).fn();
    h.dialogs[1].resolve({ response: 1 }); await flush();
    assert.deepEqual(responses, [false]); h.cancel();
  });
  await check('native BLE IPC is rejected without importing Noble', async () => {
    const { LedgerService } = load(fs.readFileSync(path.join(root, 'desktop-app/dist/lib/ledger.js'), 'utf8'), {
      './ledger-hid-worker-transport': {}, 'hw-app-nano': {}, rxjs: require('rxjs'), electron: {}
    });
    await assert.rejects(new LedgerService().loadTransport(true), /Native Bluetooth is disabled/);
  });

  const calls = [];
  class BLE extends EventEmitter {
    constructor() { super(); this.device = { gatt: { disconnect: () => calls.push('disconnect') } }; }
    static isSupported() { return Promise.resolve(true); }
    static async create() { calls.push('create'); if (BLE.fail) throw Error('GATT failed'); return new BLE(); }
  }
  class Nano {
    async getAppConfiguration() { return {}; }
    async getAddress() { calls.push('address'); return { address: 'mock' }; }
    async cacheBlock() { calls.push('cache'); }
    async signBlock() { calls.push('sign'); }
  }
  const navigator = { userActivation: { isActive: true } };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/app/services/ledger.service.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, experimentalDecorators: true }
  }).outputText;
  const { LedgerService } = load(code, {
    '@angular/core': { Injectable: () => value => value }, 'hw-app-nano': { default: Nano },
    '@ledgerhq/hw-transport-u2f': { default: BLE }, '@ledgerhq/hw-transport-webusb': { default: BLE },
    '@ledgerhq/hw-transport-webhid': { default: BLE }, '@ledgerhq/hw-transport-web-ble': { default: BLE },
    rxjs: require('rxjs'), '../../environments/environment': { environment: { desktop: true } }
  }, { navigator });
  const sends = []; let listener;
  const service = new LedgerService({}, { connect() {}, on(_channel, fn) { listener = fn; }, send(_channel, data) { sends.push(data); return true; } },
    { sendWarning() {} }, { getAppSetting() {}, setAppSetting() {} });
  service.pollLedgerStatus = () => {};
  await flush();
  await check('desktop Bluetooth connects through renderer, not native IPC', async () => {
    service.enableBluetoothMode(true); sends.length = 0;
    assert.equal(await service.loadLedger(), true); assert.equal(service.ledger.status, 'ready'); assert.equal(sends.length, 0);
  });
  await check('address, cached block and signature use Web Bluetooth', async () => {
    calls.length = 0; await service.getLedgerAccount(0, true);
    await service.updateCacheOffline(0, { previous: '1', representative: 'r', balance: '0', link: 'l', signature: 's' });
    await service.signBlock(0, {}); assert.deepEqual(calls, ['address', 'cache', 'sign']); assert.equal(sends.length, 0);
  });
  await check('stale USB statuses cannot overwrite Bluetooth state', async () => {
    listener(null, { event: 'ledger-status', data: { status: 'not-connected', statusText: '' } });
    assert.equal(service.ledger.status, 'ready');
  });
  await check('GATT disconnect resets connection; reconnect needs gesture', async () => {
    service.ledger.transport.emit('disconnect'); assert.equal(service.ledger.status, 'not-connected');
    navigator.userActivation.isActive = false; calls.length = 0;
    assert.equal(await service.loadLedger(), false); assert.equal(calls.length, 0);
    navigator.userActivation.isActive = true;
  });
  await check('GATT opening failure returns disconnected, not ready', async () => {
    BLE.fail = true; assert.equal(await service.loadLedger(), false); assert.equal(service.ledger.status, 'not-connected'); BLE.fail = false;
  });
  await check('USB mode retains native IPC routing', async () => {
    service.enableBluetoothMode(false); assert.equal(service.usesDesktopUsb, true);
    let used = false; service.getLedgerAccountDesktop = async () => { used = true; };
    await service.getLedgerAccount(0); assert(used);
  });
  console.log(`${passed} Web Bluetooth regression tests passed`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
