'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { APP_WALLET_URL, isTrustedWalletDocument, isPathInsideRoot } =
  require('../dist/lib/wallet-protocol');

test('only the selected wallet document and hash routes are trusted', () => {
  assert.equal(isTrustedWalletDocument(APP_WALLET_URL, APP_WALLET_URL), true);
  assert.equal(isTrustedWalletDocument(APP_WALLET_URL + '#/accounts', APP_WALLET_URL), true);
  for (const other of [
    'https://wallet/index.html',
    'nault-app://other/index.html',
    'nault-app://wallet/other.html',
    'nault-app://wallet/index.html?x=1',
    'nault-app://wallet/index.html.evil',
    'about:blank',
    'blob:nault-app://wallet/123',
    'not a URL'
  ]) {
    assert.equal(isTrustedWalletDocument(other, APP_WALLET_URL), false, other);
  }
});

test('legacy file origin still accepts only its own index document', () => {
  const old = pathToFileURL(path.resolve('/tmp/nault/dist/index.html')).toString();
  assert.equal(isTrustedWalletDocument(old + '#/accounts', old), true);
  assert.equal(isTrustedWalletDocument(old + '?x=1', old), false);
  assert.equal(isTrustedWalletDocument(old.replace('index.html', 'other.html'), old), false);
});

test('file containment denies parent traversal and root directory access', () => {
  const root = path.resolve('/tmp/nault/dist');
  assert.equal(isPathInsideRoot(root, path.join(root, 'assets/logo.svg')), true);
  assert.equal(isPathInsideRoot(root, root), false);
  assert.equal(isPathInsideRoot(root, path.resolve(root, '../secret')), false);
  assert.equal(isPathInsideRoot(root, path.resolve(root, 'assets/../../secret')), false);
});
