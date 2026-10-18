// Deterministic regression tests of the real TypeScript classes, without network or wallet secrets.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { BehaviorSubject } = require('rxjs');
let now = 0, id = 0;
const timers = new Map();
const schedule = (fn, ms) => { timers.set(++id, { at: now + ms, fn }); return id; };
const tick = ms => {
  const end = now + ms;
  while (true) {
    const next = [...timers].filter(([, t]) => t.at <= end).sort((a,b) => a[1].at - b[1].at)[0];
    if (!next) break;
    timers.delete(next[0]); now = next[1].at; next[1].fn();
  }
  now = end;
};
const sockets = [], warnings = [];
class FakeSocket {
  constructor() { this.sent = []; sockets.push(this); }
  send(value) { this.sent.push(JSON.parse(value)); }
  close() { this.closed = true; } // Intentionally never emits onclose.
}
function load(file, name) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, experimentalDecorators: true }
  }).outputText, {
    exports, require: n => n === '@angular/core' ? { Injectable: () => x => x, Component: () => x => x }
      : n === 'rxjs' ? { BehaviorSubject }
      : n.endsWith('/endpoint-policy') ? { secureEndpoint: u => u } : {},
    setTimeout: schedule, clearTimeout: x => timers.delete(x), WebSocket: FakeSocket,
    console: { log() {}, warn: m => warnings.push(m) }
  }, { filename: file });
  return exports[name];
}
const WS = load('src/app/services/websocket.service.ts', 'WebsocketService');
const Settings = load('src/app/components/configure-app/configure-app.component.ts', 'ConfigureAppComponent');
const Reps = load('src/app/services/representative.service.ts', 'RepresentativeService');
async function main() {
  const settings = { settings: { serverWS: 'wss://example.org' } };
  let service = new WS(settings);
  service.subscribeAccounts(['account']); service.connect();
  const stale = sockets[0]; stale.onopen();
  const staleMessage = stale.onmessage;
  tick(15000); assert.equal(stale.closed, true); assert.equal(service.socket.connected, false);
  tick(5000); sockets[1].onopen();
  assert.equal(sockets[1].sent[0].options.accounts[0], 'account');
  sockets[1].onmessage({ data: '{"ack":"pong"}' });
  staleMessage({ data: '{"topic":"confirmation","message":"stale"}' });
  assert.equal(service.newTransactions$.value, null);
  sockets[1].onmessage({ data: '{"topic":"confirmation","message":"fresh"}' });
  assert.equal(service.newTransactions$.value, 'fresh');
  tick(15000); assert.equal(service.socket.connected, true);
  settings.settings.serverWS = null; service.forceReconnect(); tick(250);
  assert.equal(timers.size, 0);
  console.log('PASS silent socket recovery, resubscription, pong, stale events and cleanup');

  sockets.length = 0; settings.settings.serverWS = 'wss://example.org'; service = new WS(settings); service.connect();
  for (let i = 0; i < 6; i++) { sockets[i].onopen(); tick(15000); if (i < 5) tick((i + 1) * 5000); }
  tick(300000); assert.equal(sockets.length, 6); assert.equal(timers.size, 0);
  assert(warnings.some(x => x.includes('retry limit reached')));
  service.forceReconnect(); tick(250); assert.equal(sockets.length, 7);
  settings.settings.serverWS = null; service.forceReconnect(); tick(250);
  console.log('PASS five-retry limit and explicit recovery after exhaustion');

  const c = Object.create(Settings.prototype);
  Object.assign(c, { statsRequest: 0, statsRefreshEnabled: true, appSettings: { settings: { serverAPI: 'A' } },
    api: { blockCount: async () => ({ count: 10, unchecked: 0, cemented: 9 }), confirmationQuorum: async () => null, version: async () => ({ node_vendor: 'A' }) } });
  await c.updateNodeStats(); assert.equal(c.nodeStatsServer, 'A'); assert.equal(c.nodeVendor, 'A');
  c.serverAPI = 'rejected-form-value'; assert.equal(c.nodeStatsServer, 'A');
  let resolve;
  c.api.blockCount = () => new Promise(r => resolve = r);
  const pending = c.updateNodeStats(); c.appSettings.settings.serverAPI = 'B';
  resolve({ count: 999 }); await pending;
  assert.equal(c.nodeStatsServer, null); assert.equal(c.nodeVendor, null); assert.equal(c.statsRefreshEnabled, true);
  c.api.blockCount = async () => { throw new Error('offline'); };
  c.api.confirmationQuorum = c.api.version = c.api.blockCount;
  await c.updateNodeStats(); assert.equal(c.nodeBlockCount, null); assert.equal(c.statsRefreshEnabled, true);
  console.log('PASS saved endpoint labels, stale result rejection, failed stats and loading cleanup');

  let reconnects = 0, notices = 0;
  Object.assign(c, {
    selectedServer: 'custom', serverAPI: 'https://example.org', serverWS: '', serverAuth: null,
    appSettings: { settings: { serverAPI: 'https://example.org' }, setAppSettings() {}, loadAppSettings() {} },
    notifications: { sendSuccess() {}, sendWarning() { notices++; } },
    translocoService: { translate: x => x }, node: { node: {} },
    walletService: { reloadBalances: async () => { throw new Error('offline'); } },
    websocket: { forceReconnect() { reconnects++; } }
  });
  await c.updateServerSettings();
  await Promise.resolve();
  assert.equal(reconnects, 1); assert.equal(notices, 1);
  console.log('PASS failed settings refresh is handled and still reconnects WebSocket');

  const rep = Object.create(Reps.prototype);
  rep.api = { representativesOnline: async () => { throw { statusCode: 400, message: 'Unsupported RPC action' }; } };
  assert.equal(await rep.getOnlineRepresentatives(), null);
  rep.api.representativesOnline = async () => ({ error: 'unsupported' });
  assert.equal(await rep.getOnlineRepresentatives(), null);
  rep.api.representativesOnline = async () => ({ representatives: [] });
  assert.equal((await rep.getOnlineRepresentatives()).length, 0);
  rep.api.representativesOnline = async () => ({ representatives: ['account'] });
  assert.equal((await rep.getOnlineRepresentatives())[0], 'account');
  console.log('PASS unsupported representatives action is unknown, distinct from an empty online list');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
