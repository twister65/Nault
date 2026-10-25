'use strict';

// Cryptographic compatibility checks for Nault's use of nanocurrency-web.
// Public upstream test vectors only: never use these keys for real funds.
const test = require('node:test');
const assert = require('node:assert/strict');
const { wallet, tools, block } = require('nanocurrency-web');
const lock = require('../package-lock.json');

const bip39Seed = '0dc285fde768f7ff29b66ce7252d56ed92fe003b605907f7a4f683c3dc8586d34a914d3c71fc099bb38ee4a59e5b081a3497b7a323e90cc68f67b5837690310c';
const expectedAccount0 = {
  privateKey: '3be4fc2ef3f3b7374e6fc4fb6e7bb153f8a2998b3b3dab50853eabe128024143',
  publicKey: '5b65b0e8173ee0802c2c3e6c9080d1a16b06de1176c938a924f58670904e82c4',
  address: 'nano_1pu7p5n3ghq1i1p4rhmek41f5add1uh34xpb94nkbxe8g4a6x1p69emk8y1d',
};

test('derive the same Nano BIP39 account 0 as Nault did before the dependency upgrade', () => {
  const accounts = wallet.accounts(bip39Seed, 0, 0);
  assert.equal(accounts.length, 1);
  for (const [field, expected] of Object.entries(expectedAccount0)) {
    assert.equal(accounts[0][field], expected);
  }
});

test('derive an unchanged higher-index Nano BIP39 account', () => {
  const accounts = wallet.accounts(bip39Seed, 14, 14);
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].accountIndex, 14);
  assert.equal(accounts[0].privateKey, '5f12e37c64daf2501c6a6a20614fd8d977fed65b5b5f0b045ec997f2ed2f53ca');
  assert.equal(accounts[0].publicKey, 'f93a61018e07825a095e8cf7bdce9242e9c12c5c41a55de597a2be93fa41306b');
});

test('verify and reject a state block signature through Nault\'s verification API', () => {
  const sendBlock = block.send({
    walletBalanceRaw: '5618869000000000000000000000000',
    fromAddress: expectedAccount0.address,
    toAddress: 'nano_1q3hqecaw15cjt7thbtxu3pbzr1eihtzzpzxguoc37bj1wc5ffoh7w74gi6p',
    representativeAddress: 'nano_1stofnrxuz3cai7ze75o174bpm7scwj9jn3nxsn8ntzg784jf1gzn1jjdkou',
    frontier: '92BA74A7D6DC7557F3EDA95ADC6341D51AC777A0A6FF0688A5C492AB2B2CB40D',
    amountRaw: '2000000000000000000000000000000',
  }, expectedAccount0.privateKey);
  assert.equal(tools.verifyBlock(expectedAccount0.publicKey, sendBlock), true);
  assert.equal(tools.verifyBlock(expectedAccount0.publicKey, {...sendBlock, balance: '0'}), false);
});

test('production dependency graph contains no crypto-js 3.1.9-1', () => {
  assert.equal(lock.packages['node_modules/nanocurrency-web'].version, '2.0.0');
  assert.ok(!lock.packages['node_modules/nanocurrency-web/node_modules/crypto-js']);
  assert.ok(!lock.dependencies['nanocurrency-web'].requires['crypto-js']);
  for (const [path, metadata] of Object.entries(lock.packages)) {
    if (path.endsWith('/crypto-js')) assert.notEqual(metadata.version, '3.1.9-1', path);
  }
});
