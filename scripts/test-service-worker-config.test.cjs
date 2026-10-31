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

test('production PWA loads its CSS directly without a deferred inline script', () => {
  const workspace = JSON.parse(fs.readFileSync(path.join(root, 'angular.json'), 'utf8'));
  const build = workspace.projects.nault.architect.build;
  const production = build.configurations.production;
  const desktop = build.configurations.desktop;
  assert.equal(production.optimization.scripts, true);
  assert.equal(production.optimization.styles.minify, true);
  assert.equal(production.optimization.styles.inlineCritical, false);
  assert.equal(production.optimization.fonts, true);
  assert.equal(desktop.optimization, true, 'Desktop optimization is unchanged');

  const htmlFile = path.join(root, 'dist', 'index.html');
  assert.ok(fs.existsSync(htmlFile), 'Run npm run wallet:build before this test');
  const html = fs.readFileSync(htmlFile, 'utf8');

  // The deferred critical-CSS path starts styles.css as media="print" and
  // relies on an inline JavaScript snippet to restore media="all".
  // A strict CSP or unexpected browser behavior can leave the UI unstyled.
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map(match => match[0]);
  const cssLinks = links.filter(link => /\brel=["']stylesheet["']/i.test(link));
  assert.ok(cssLinks.length > 0, 'Production HTML directly includes stylesheets');
  const mainCss = cssLinks.find(link => /\bhref=["']([^"']*styles(?:-[\w]+)?\.css)["']/i.test(link));
  assert.ok(mainCss, 'Main application stylesheet is linked');
  assert.doesNotMatch(mainCss, /\bmedia=["']print["']/i, 'Main stylesheet must not be print-only');
  assert.doesNotMatch(html, /data-beasties-media=/i, 'No deferred critical-CSS loader is required');

  const asset = mainCss.match(/\bhref=["']([^"']+)["']/i)[1].replace(/^\//, '');
  assert.ok(fs.existsSync(path.join(root, 'dist', asset)), 'CSS asset is present in built output');
});
