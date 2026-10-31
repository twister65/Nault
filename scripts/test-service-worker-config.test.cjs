'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const source = JSON.parse(fs.readFileSync(path.join(root, 'ngsw-config.json'), 'utf8'));
const manifestFile = path.join(root, 'dist', 'ngsw.json');

test('PWA uses cache-first navigation while retaining the offline app shell', () => {
  // Serve Angular routes using the prefetched app shell instead of making a
  // network navigation that can time out even when the wallet works offline.
  assert.equal(source.navigationRequestStrategy, 'performance');
  assert.equal(source.index, '/index.html');

  const app = source.assetGroups.find(group => group.name === 'app');
  assert.ok(app, 'App asset group exists');
  assert.equal(app.installMode, 'prefetch');
  assert.ok(app.resources.files.includes('/index.html'), 'Offline navigation shell stays prefetched');
  assert.ok(app.resources.files.includes('/*.js'), 'Wallet JavaScript stays available offline');
  assert.ok(app.resources.files.includes('/*.css'), 'Wallet styles stay available offline');
  // Keep external API freshness policies unchanged: only HTML navigations are cache-first.
  assert.equal(source.dataGroups.find(group => group.name === 'coingecko').cacheConfig.strategy, 'freshness');
  assert.equal(source.dataGroups.find(group => group.name === 'ninja').cacheConfig.strategy, 'freshness');
});

test('Angular production build emits the intended service worker manifest', () => {
  assert.ok(fs.existsSync(manifestFile), 'Run npm run wallet:build before this test');

  const built = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  assert.equal(built.index, '/index.html');
  assert.equal(built.navigationRequestStrategy, 'performance');
  assert.ok(built.hashTable['/index.html'], 'index.html remains integrity-hashed in offline cache');
  assert.ok(built.assetGroups.some(group =>
    group.name === 'app' && group.urls.includes('/index.html')
  ), 'App shell remains in the prefetch group');
});
