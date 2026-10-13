'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function harness(webHidOnly) {
  const filename = path.join(__dirname, '../dist/lib/ledger.js');
  const localRequire = createRequire(filename);
  const listeners = new Map();
  const exports = {};
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    exports, console,
    require: name => name === 'electron'
      ? { ipcMain: { on: (channel, fn) => listeners.set(channel, fn) } }
      : localRequire(name)
  }, { filename });
  const calls = [];
  for (const method of ['loadLedger', 'getLedgerAccount', 'cacheBlock', 'signBlock']) {
    exports.LedgerService.prototype[method] = async (...args) => calls.push({ method, args });
  }
  exports.initialize(event => event.trusted === true, webHidOnly);
  const replies = [];
  return {
    calls, replies,
    send: (message, trusted = true) => listeners.get('ledger')({
      trusted, sender: { send: (channel, reply) => replies.push({ channel, reply }) }
    }, message)
  };
}

test('WebHID profile rejects every native hardware command with a matching response', () => {
  const h = harness(true);
  for (const bluetooth of [false, true]) h.send({ event: 'get-ledger-status', data: { bluetooth } });
  for (const event of ['account-details', 'cache-block', 'sign-block']) {
    h.send({ event, data: { accountIndex: 7, blockData: {}, cacheData: {} } });
  }
  assert.equal(h.calls.length, 0);
  assert.equal(h.replies.length, 5);
  for (const { channel, reply } of h.replies) {
    assert.equal(channel, 'ledger');
    if (reply.event === 'ledger-status') assert.equal(reply.data.status, 'not-connected');
    else {
      assert.equal(reply.data.accountIndex, 7);
      assert.equal(reply.data.error, true);
    }
  }
});

test('WebHID rejection handler ignores untrusted senders and unknown messages', () => {
  const h = harness(true);
  for (const event of ['get-ledger-status', 'account-details', 'cache-block', 'sign-block']) {
    h.send({ event, data: { accountIndex: 0 } }, false);
  }
  h.send(null);
  h.send({ event: 'unknown' });
  assert.equal(h.calls.length, 0);
  assert.equal(h.replies.length, 0);
  h.send({ event: 'account-details' });
  assert.equal(h.replies[0].reply.data.accountIndex, 0);
  assert.equal(h.replies[0].reply.data.error, true);
});

test('normal profile retains native routing and sender checks', () => {
  const h = harness(false);
  h.send({ event: 'get-ledger-status', data: { bluetooth: false } }, false);
  assert.equal(h.calls.length, 0);
  for (const event of ['get-ledger-status', 'account-details', 'cache-block', 'sign-block']) {
    h.send({ event, data: { accountIndex: 0, bluetooth: false } });
  }
  assert.deepEqual(h.calls.map(call => call.method), ['loadLedger', 'getLedgerAccount', 'cacheBlock', 'signBlock']);
});

test('Electron passes the startup-only WebHID flag to native initialization', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/desktop-app.ts'), 'utf8');
  assert.match(source, /initialize\(isTrustedLedgerSender, useExperimentalWebHID\)/);
  assert.match(source, /const useExperimentalWebHID = useExperimentalAppOrigin &&\s*process.env.NAULT_TEST_WEBHID === '1'/);
});
