'use strict';
// Run after npm run desktop:compile. No hardware or native modules required.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const code = fs.readFileSync(path.join(__dirname, '../desktop-app/dist/lib/ledger.js'), 'utf8');
function service(ble) {
  const exports = {};
  vm.runInNewContext(code, {
    exports, console, setTimeout, clearTimeout,
    require(name) {
      if (name === '@ledgerhq/hw-transport-node-ble') return { default: ble };
      if (name === 'rxjs') return { Subject: class { next() {} } };
      if (name === 'hw-app-nano') return class { constructor(transport) { this.transport = transport; } };
      // USB and Electron are not used by these Bluetooth-only tests.
      return {};
    }
  });
  const result = new exports.LedgerService();
  result.waitTimeout = 20;
  return result;
}
async function main() {
  let unsubscribed = false;
  const transport = { close: async () => {} };
  let subject = service({
    listen(observer) {
      setTimeout(() => observer.next({ descriptor: 'mock-ledger' }), 0);
      return { unsubscribe() { unsubscribed = true; } };
    },
    open: async () => transport
  });
  assert.strictEqual(await subject.loadTransport(true), transport);
  assert.strictEqual(subject.ledger.nano.transport, transport);
  assert(unsubscribed);
  console.log('PASS: discovery and opening');

  subject = service({ listen(observer) {
    setTimeout(() => observer.error(new Error('scan failed')), 0);
    return { unsubscribe() {} };
  } });
  await assert.rejects(subject.loadTransport(true), /scan failed/);
  console.log('PASS: scan error');

  unsubscribed = false;
  subject = service({ ErrorMessage_ListenTimeout: 'scan timeout', listen() {
    return { unsubscribe() { unsubscribed = true; } };
  } });
  await assert.rejects(subject.loadTransport(true), /scan timeout/);
  assert(unsubscribed);
  console.log('PASS: timeout stops scanning');

  subject = service({
    listen(observer) {
      setTimeout(() => observer.next({ descriptor: 'mock-ledger' }), 0);
      return { unsubscribe() {} };
    },
    open: async () => { throw new Error('open failed'); }
  });
  let timer;
  try {
    await assert.rejects(Promise.race([
      subject.loadTransport(true),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('connection remained pending')), 250); })
    ]), /open failed/);
  } finally { clearTimeout(timer); }
  assert.strictEqual(subject.ledger.transport, null);
  console.log('PASS: opening failure rejects connection');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
