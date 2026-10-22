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
  } }, 'electron-log': { info() {}, warn() {} } }, {
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

  await check('USB reconnect ignores the intentional disconnect event until native HID is ready', async () => {
    const callbacks = {};
    let opens = 0;
    class FakeNano {
      async getAddress() { return { address: 'nano_mock' }; }
    }
    const compiled = fs.readFileSync(path.join(root, 'desktop-app/dist/lib/ledger.js'), 'utf8');
    const { initialize, LedgerService: NativeLedgerService } = load(compiled, {
      './ledger-hid-worker-transport': { async open() {
        opens++;
        return { async close() {} };
      } },
      'hw-app-nano': FakeNano,
      rxjs: require('rxjs'),
      electron: { ipcMain: { on(channel, fn) { callbacks[channel] = fn; } } }
    });
    // Avoid a background poller when exercising just the IPC handshake.
    NativeLedgerService.prototype.pollLedgerStatus = () => {};
    initialize(() => true);
    const messages = [];
    const event = { sender: { send(_channel, msg) { messages.push(msg); } } };
    callbacks.ledger(event, { event: 'disconnect' });
    assert.deepEqual(messages.filter(m => m.event === 'ledger-status'), [],
      'an intentional transport switch must not report a failed USB status');
    callbacks.ledger(event, { event: 'get-ledger-status', data: { bluetooth: false } });
    for (let i = 0; i < 5; i++) await flush();
    assert.equal(opens, 1);
    assert.deepEqual(messages.filter(m => m.event === 'ledger-status').map(m => m.data.status), ['ready']);
  });

  const controlCode = ts.transpileModule(fs.readFileSync(path.join(root, 'src/app/services/ledger-ble-control.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 }
  }).outputText;
  const control = load(controlCode, { 'rxjs/operators': require('rxjs/operators') });
  await check('real BLE exchange tolerates repeated MTU replies and returns the signature bytes', async () => {
    const RealBLE = require('@ledgerhq/hw-transport-web-ble').default;
    const frames = new (require('rxjs').Subject)();
    let disconnected = false;
    const transport = new RealBLE({ id: 'test', gatt: { disconnect() { disconnected = true; } } }, {}, frames, {});
    transport.mtuSize = 153;
    control.handleLedgerBleControl(transport);
    transport.write = async () => {};
    const result = transport.exchange(Buffer.from('0102', 'hex'));
    frames.next(Buffer.from('080000990199', 'hex'));
    frames.next(Buffer.from('0500000004aabb', 'hex'));
    frames.next(Buffer.from('080000000199', 'hex'));
    frames.next(Buffer.from('0500019000', 'hex'));
    assert.equal((await result).toString('hex'), 'aabb9000');
    assert.equal(disconnected, false);
    for (const hex of ['090000000199', '080000000198', '08000099019900', '080000980199']) {
      const pending = transport.exchange(Buffer.from('0102', 'hex'));
      const rejected = assert.rejects(pending, error => error.id === 'InvalidTag');
      frames.next(Buffer.from(hex, 'hex'));
      await rejected;
    }
  });
  const sessionCode = ts.transpileModule(fs.readFileSync(path.join(root, 'src/app/services/ledger-web-ble.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 }
  }).outputText;
  const SessionBLE = load(sessionCode, {
    '@ledgerhq/hw-transport-web-ble': require('@ledgerhq/hw-transport-web-ble'),
    '@ledgerhq/devices': require('@ledgerhq/devices'), rxjs: require('rxjs'), buffer: require('buffer')
  }).default;
  function gattHarness() {
    const device = new EventEmitter();
    device.id = 'same-ledger';
    device.addEventListener = device.on.bind(device);
    device.removeEventListener = device.removeListener.bind(device);
    const notifications = new EventEmitter();
    notifications.addEventListener = notifications.on.bind(notifications);
    notifications.removeEventListener = notifications.removeListener.bind(notifications);
    notifications.startNotifications = async () => {};
    let stops = 0;
    notifications.stopNotifications = async () => {
      stops++;
      if (!device.gatt.connected) throw Error('GATT Server is disconnected');
    };
    function receive(hex) {
      const bytes = Buffer.from(hex, 'hex');
      // A DataView can reference only part of its backing buffer.
      const padded = Buffer.concat([Buffer.from([0xff]), bytes, Buffer.from([0xff])]);
      notifications.value = new DataView(padded.buffer, padded.byteOffset + 1, bytes.length);
      notifications.emit('characteristicvaluechanged');
    }
    const devices = require('@ledgerhq/devices');
    const uuid = devices.getBluetoothServiceUuids()[0];
    const info = devices.getInfosForServiceUuid(uuid);
    const writer = { writeValue: async frame => {
      if (frame[0] === 8) receive('080000990199');
    } };
    const service = { uuid, getCharacteristic: async id => id === info.notifyUuid ? notifications : writer };
    device.gatt = {
      connected: false,
      async connect() { this.connected = true; },
      disconnect() { this.connected = false; device.emit('gattserverdisconnected'); },
      async getPrimaryServices() { return [service]; }
    };
    return { device, notifications, receive, stops: () => stops };
  }
  await check('GATT loss rejects an in-flight exchange and reconnects on the same device without stale listeners', async () => {
    const h = gattHarness();
    for (let i = 0; i < 3; i++) {
      const transport = await SessionBLE.open(h.device, 1000);
      assert.equal(transport.mtuSize, 153);
      assert.equal(h.notifications.listenerCount('characteristicvaluechanged'), 1);
      const pending = transport.exchange(Buffer.from('0102', 'hex'));
      const rejected = assert.rejects(pending, e => e.name === 'DisconnectedDevice');
      h.device.gatt.disconnect();
      await rejected;
      assert.equal(h.notifications.listenerCount('characteristicvaluechanged'), 0);
      assert.equal(h.device.listenerCount('gattserverdisconnected'), 0);
      assert.equal(transport.exchangeBusyPromise, undefined);
    }
    assert.equal(h.stops(), 0);
    const fresh = await SessionBLE.open(h.device, 1000);
    const response = fresh.exchange(Buffer.from('0102', 'hex'));
    h.receive('05000000029000');
    assert.equal((await response).toString('hex'), '9000');
    await fresh.close();
    await flush();
    assert.equal(h.notifications.listenerCount('characteristicvaluechanged'), 0);
  });
  await check('Windows authentication error fails closed before MTU and removes listeners', async () => {
    const h = gattHarness();
    h.notifications.startNotifications = async () => {
      const error = new Error('Authentication failed.');
      error.name = 'NetworkError';
      throw error;
    };
    await assert.rejects(SessionBLE.open(h.device, 1000), error =>
      error.name === 'LedgerBluetoothAuthenticationError' &&
      error.message.includes('Bluetooth settings')
    );
    assert.equal(h.notifications.listenerCount('characteristicvaluechanged'), 0);
    assert.equal(h.device.listenerCount('gattserverdisconnected'), 0);
    assert.equal(h.device.gatt.connected, false);
  });
  await check('GATT loss during service discovery fails closed and permits explicit reconnect', async () => {
    const h = gattHarness();
    const discover = h.device.gatt.getPrimaryServices.bind(h.device.gatt);
    h.device.gatt.getPrimaryServices = async () => {
      h.device.gatt.disconnect();
      return discover();
    };
    await assert.rejects(SessionBLE.open(h.device, 1000), error =>
      error.name === 'DisconnectedDevice' && /Reconnect/.test(error.message)
    );
    assert.equal(h.device.gatt.connected, false);
    assert.equal(h.device.listenerCount('gattserverdisconnected'), 0);
    assert.equal(h.notifications.listenerCount('characteristicvaluechanged'), 0);
    h.device.gatt.getPrimaryServices = discover;
    const fresh = await SessionBLE.open(h.device, 1000);
    await fresh.close();
    assert.equal(h.device.listenerCount('gattserverdisconnected'), 0);
    assert.equal(h.notifications.listenerCount('characteristicvaluechanged'), 0);
  });
  await check('disconnect during notification setup rejects opening promptly', async () => {
    const h = gattHarness();
    h.notifications.startNotifications = async () => { h.device.gatt.disconnect(); };
    await assert.rejects(SessionBLE.open(h.device, 1000), /disconnected|closed/);
    assert.equal(h.notifications.listenerCount('characteristicvaluechanged'), 0);
  });
  const calls = [];
  class BLE extends EventEmitter {
    constructor() { super(); this.notifyObservable = new (require('rxjs').Subject)(); this.device = { gatt: { disconnect: () => calls.push('disconnect') } }; }
    static isSupported() { return Promise.resolve(true); }
    static async create() { calls.push('create'); if (BLE.fail) throw BLE.fail instanceof Error ? BLE.fail : Error('GATT failed'); return new BLE(); }
    async close() { this.device.gatt.disconnect(); }
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
    './ledger-web-ble': { default: BLE },
    './ledger-ble-control': control,
    '@angular/core': { Injectable: () => value => value }, 'hw-app-nano': { default: Nano },
    '@ledgerhq/hw-transport-u2f': { default: BLE }, '@ledgerhq/hw-transport-webusb': { default: BLE },
    '@ledgerhq/hw-transport-webhid': { default: BLE }, '@ledgerhq/hw-transport-web-ble': { default: BLE },
    rxjs: require('rxjs'), '../../environments/environment': { environment: { desktop: true } }
  }, { navigator });
  const sends = []; let listener;
  const preferences = {};
  const service = new LedgerService({}, { connect() {}, on(_channel, fn) { listener = fn; }, send(_channel, data) { sends.push(data); return true; } },
    { sendWarning() {} }, { getAppSetting(key) { return preferences[key]; }, setAppSetting(key, value) { preferences[key] = value; } });
  service.pollLedgerStatus = () => {};
  await flush();
  await check('explicit Bluetooth choice persists even if Windows pairing fails', async () => {
    BLE.fail = true;
    service.enableBluetoothMode(true);
    assert.equal(preferences.ledgerReconnect, 'bluetooth');
    assert.equal(await service.loadLedger(), false);
    assert.equal(service.transportMode, 'Bluetooth');
    assert.equal(preferences.ledgerReconnect, 'bluetooth');
    BLE.fail = false;
  });
  await check('desktop Bluetooth connects through renderer, not native IPC', async () => {
    service.enableBluetoothMode(true); sends.length = 0;
    assert.equal(await service.loadLedger(), true); assert.equal(service.ledger.status, 'ready'); assert.equal(sends.length, 0);
  });
  await check('address, cached block and signature use Web Bluetooth', async () => {
    calls.length = 0; await service.getLedgerAccount(0, true);
    await service.updateCacheOffline(0, { previous: '1', representative: 'r', balance: '0', link: 'l', signature: 's' });
    await service.signBlock(0, {}); assert.deepEqual(calls, ['address', 'cache', 'sign']); assert.equal(sends.length, 0);
  });
  await check('missed GATT disconnect does not reuse a READY transport', async () => {
    const stale = service.ledger.transport;
    stale.device.gatt.connected = false;
    calls.length = 0;
    assert.equal(await service.loadLedger(), true);
    assert.notEqual(service.ledger.transport, stale);
    assert.equal(service.ledger.status, 'ready');
    assert(calls.includes('create'));
  });
  await check('manual BLE reconnect replaces an apparently connected stale session', async () => {
    const stale = service.ledger.transport;
    stale.device.gatt.connected = true;
    calls.length = 0;
    assert.equal(await service.loadLedger(false, true), true);
    assert.notEqual(service.ledger.transport, stale);
    assert.equal(service.ledger.status, 'ready');
    assert(calls.includes('create'));
  });
  await check('stale USB statuses cannot overwrite Bluetooth state', async () => {
    listener(null, { event: 'ledger-status', data: { status: 'not-connected', statusText: '' } });
    assert.equal(service.ledger.status, 'ready');
  });
  await check('polling preserves a pending Ledger signature while the app API is locked', async () => {
    const Transport = require('@ledgerhq/hw-transport').default;
    const transport = new Transport();
    let confirm;
    const nano = service.ledger.nano;
    const ble = service.ledger.transport;
    const pendingNano = {
      signBlock: () => new Promise(resolve => { confirm = resolve; }),
      getAddress: async () => ({ address: 'mock' })
    };
    transport.decorateAppAPIMethods(pendingNano, ['signBlock', 'getAddress'], 'nano');
    service.ledger.nano = pendingNano;
    calls.length = 0;
    const signing = service.signBlock(0, {});
    await flush();
    await service.checkLedgerStatus();
    await service.checkLedgerStatus();
    assert.equal(service.ledger.status, 'ready');
    assert.equal(service.ledger.transport, ble);
    assert.equal(calls.includes('disconnect'), false);
    confirm({ signature: 'confirmed-signature' });
    assert.deepEqual(await signing, { signature: 'confirmed-signature' });
    await service.checkLedgerStatus();
    assert.equal(service.ledger.status, 'ready');
    service.ledger.nano = nano;
  });
  await check('GATT disconnect resets connection; reconnect needs gesture', async () => {
    service.ledger.transport.emit('disconnect'); assert.equal(service.ledger.status, 'not-connected');
    navigator.userActivation.isActive = false; calls.length = 0;
    assert.equal(await service.loadLedger(), false); assert.equal(calls.length, 0);
    navigator.userActivation.isActive = true;
  });
  await check('an old status failure cannot reset a reconnected Bluetooth session', async () => {
    assert.equal(await service.loadLedger(), true);
    let failOld;
    service.ledger.nano.getAddress = () => new Promise((_resolve, reject) => { failOld = reject; });
    const checking = service.checkLedgerStatus();
    service.ledger.transport.emit('disconnect');
    assert.equal(await service.loadLedger(), true);
    const fresh = service.ledger.transport;
    failOld(Error('Old session disconnected'));
    await checking;
    assert.equal(service.ledger.transport, fresh);
    assert.equal(service.ledger.status, 'ready');
    service.ledger.transport.emit('disconnect');
  });
  await check('GATT opening failure returns disconnected, not ready', async () => {
    BLE.fail = true; assert.equal(await service.loadLedger(), false); assert.equal(service.ledger.status, 'not-connected'); BLE.fail = false;
  });
  await check('Bluetooth adapter unavailable is not reported as device selection cancelled', async () => {
    const radioError = Error('Bluetooth adapter not available.');
    radioError.name = 'TransportOpenUserCancelled';
    BLE.fail = radioError;
    let status;
    const sub = service.ledgerStatus$.subscribe(value => { status = value; });
    try {
      assert.equal(await service.loadLedger(), false);
      assert.match(status.statusText, /Bluetooth unavailable/);
      assert.match(status.statusText, /Reconnect via USB/);
      assert.doesNotMatch(status.statusText, /selection cancelled/);
    } finally {
      sub.unsubscribe();
      BLE.fail = false;
    }
  });
  await check('wallet widget switches Bluetooth to native USB only on explicit click', async () => {
    const widgetCode = ts.transpileModule(
      fs.readFileSync(path.join(root, 'src/app/components/wallet-widget/wallet-widget.component.ts'), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, experimentalDecorators: true } }
    ).outputText;
    const { WalletWidgetComponent } = load(widgetCode, {
      '@angular/core': { Component: () => value => value, ViewChild: () => () => {} },
      '../../services/wallet.service': {},
      '../../services/notification.service': {},
      '../../services/ledger.service': { LedgerStatus: { READY: 'ready', NOT_CONNECTED: 'not-connected' } },
      '../../services/app-settings.service': {},
      '../../services/pow.service': {}
    });
    const operations = [];
    const ledger = {
      isDesktop: true, supportsBluetooth: true, transportMode: 'Bluetooth',
      enableBluetoothMode(enabled) {
        operations.push(['mode', enabled]);
        this.transportMode = enabled ? 'Bluetooth' : 'U2F';
      },
      async loadLedger(hide, forceBle) { operations.push(['load', hide, forceBle]); return true; }
    };
    const notifications = {
      sendInfo() {}, removeNotification() {}, sendSuccess() {}
    };
    const widget = new WalletWidgetComponent({ wallet: {} }, notifications, ledger, {}, {});
    widget.ledgerStatus = { status: 'ready', statusText: '' };
    await widget.reconnectUsb();
    assert.equal(ledger.transportMode, 'U2F');
    assert.deepEqual(operations, [['mode', false], ['load', false, false]]);
    operations.length = 0;
    await widget.reloadLedger();
    assert.deepEqual(operations, [['load', false, false]], 'normal USB reconnect must not ask for Bluetooth');
    operations.length = 0;
    await widget.reconnectBluetooth();
    assert.deepEqual(operations, [['mode', true], ['load', false, true]]);
  });
  await check('Bluetooth session reset is explicit and limited to disconnected MTU failures', async () => {
    let reloads = 0;
    const widgetCode = ts.transpileModule(
      fs.readFileSync(path.join(root, 'src/app/components/wallet-widget/wallet-widget.component.ts'), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, experimentalDecorators: true } }
    ).outputText;
    const { WalletWidgetComponent } = load(widgetCode, {
      '@angular/core': { Component: () => value => value, ViewChild: () => () => {} },
      '../../services/wallet.service': {},
      '../../services/notification.service': {},
      '../../services/ledger.service': { LedgerStatus: { READY: 'ready', NOT_CONNECTED: 'not-connected' } },
      '../../services/app-settings.service': {},
      '../../services/pow.service': {}
    }, { window: { location: { reload() { reloads++; } } } });
    const ledger = { isDesktop: true, transportMode: 'Bluetooth' };
    const widget = new WalletWidgetComponent({ wallet: {} }, {}, ledger, {}, {});
    widget.ledgerStatus = { status: 'ready', statusText: 'MTU negotiation timed out' };
    assert.equal(widget.canResetBluetoothSession, false);
    widget.resetBluetoothSession();
    ledger.transportMode = 'USB';
    widget.ledgerStatus.status = 'not-connected';
    assert.equal(widget.canResetBluetoothSession, false);
    widget.resetBluetoothSession();
    ledger.transportMode = 'Bluetooth';
    widget.ledgerStatus.statusText = 'Ledger disconnected';
    assert.equal(widget.canResetBluetoothSession, false);
    widget.resetBluetoothSession();
    assert.equal(reloads, 0);
    widget.ledgerStatus.statusText = 'Bluetooth connection failed: Ledger Bluetooth MTU negotiation timed out';
    assert.equal(widget.canResetBluetoothSession, true);
    widget.resetBluetoothSession();
    assert.equal(reloads, 1);
  });
  await check('USB mode retains native IPC routing', async () => {
    service.enableBluetoothMode(false); assert.equal(service.usesDesktopUsb, true);
    assert.equal(preferences.ledgerReconnect, 'usb');
    let used = false; service.getLedgerAccountDesktop = async () => { used = true; };
    await service.getLedgerAccount(0); assert(used);
    sends.length = 0;
    const statusRequest = service.loadLedger();
    assert.equal(sends.length, 1);
    assert.equal(sends[0].event, 'get-ledger-status');
    assert.equal(sends[0].data.bluetooth, false, 'USB reconnect must use native HID IPC');
    listener(null, { event: 'ledger-status', data: { status: 'ready', statusText: 'Ledger device ready' } });
    assert.equal(await statusRequest, true);
  });
  console.log(`${passed} Web Bluetooth regression tests passed`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
