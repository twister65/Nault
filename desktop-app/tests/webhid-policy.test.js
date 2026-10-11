'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isNanoSPlusHidDevice, isTrustedWebHidOrigin } =
  require('../dist/lib/webhid-policy');
const { APP_WALLET_ORIGIN, APP_WALLET_URL } =
  require('../dist/lib/wallet-origin');

test('HID policy permits Nano S Plus normal device variants only', () => {
  const base = { vendorId: 0x2c97, deviceId: 'session-device-1' };
  for (const productId of [0x50, 0x5000, 0x5011, 0x501f]) {
    assert.equal(isNanoSPlusHidDevice({ ...base, productId }), true);
  }
  for (const productId of [0x0005, 0x40, 0x4f, 0x5020, -1]) {
    assert.equal(isNanoSPlusHidDevice({ ...base, productId }), false);
  }
  assert.equal(isNanoSPlusHidDevice({ ...base, productId: 0x5011, vendorId: 0x1234 }), false);
  assert.equal(isNanoSPlusHidDevice({ ...base, productId: 0x5011, deviceId: '' }), false);
  assert.equal(isNanoSPlusHidDevice(null), false);
});

test('HID permissions check the complete and exact secure origin', () => {
  const trusted = APP_WALLET_ORIGIN;
  assert.equal(APP_WALLET_ORIGIN, 'nault-app://wallet');
  assert.equal(APP_WALLET_URL, APP_WALLET_ORIGIN + '/index.html');
  // This was the bug: Node returns "null" for custom URL schemes.
  assert.equal(new URL(APP_WALLET_URL).origin, 'null');
  assert.equal(isTrustedWebHidOrigin(trusted, trusted), true);
  for (const other of [
    'file://', 'https://wallet', 'nault-app://wallet.evil',
    'nault-app://wallet/index.html', 'nault-app://other', undefined
  ]) {
    assert.equal(isTrustedWebHidOrigin(other, trusted), false);
  }
});
