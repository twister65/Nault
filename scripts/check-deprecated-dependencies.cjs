#!/usr/bin/env node
'use strict';

// Fail CI when a deprecated dependency is reintroduced.
// Only two known *development/packaging* exceptions remain (2026-10-24):
// - glob@7.2.3: electron-builder -> @electron/asar 3, Karma 6 and Istanbul.
// - boolean@3.2.0: electron-builder 26 -> @electron/get 3 (optional)
//                     -> global-agent 3 -> roarr.
// Do not apply global npm overrides: they may break Electron packaging or tests.
const assert = require('node:assert/strict');
const fs = require('node:fs');

const logPath = process.argv[2];
assert.ok(logPath, 'Usage: node scripts/check-deprecated-dependencies.cjs <npm-ci-log>');
const log = fs.readFileSync(logPath, 'utf8');
const observed = [...log.matchAll(/\bnpm warn deprecated ([^\s:]+):/gi)].map(match => match[1]);
const remainingExceptions = new Set(['glob@7.2.3', 'boolean@3.2.0']);
const unexpected = [...new Set(observed.filter(name => !remainingExceptions.has(name)))];
assert.deepEqual(unexpected, [], 'Unexpected deprecated dependencies: ' + unexpected.join(', '));

const lock = require('../package-lock.json');
const names = Object.entries(lock.packages || {});
const removed = ['protractor', 'request', 'har-validator', '@angular-devkit/build-angular', '@ngtools/webpack', 'worker-loader'];
for (const pkg of removed) {
  const installed = names.filter(([path]) => path === 'node_modules/' + pkg || path.endsWith('/node_modules/' + pkg));
  assert.equal(installed.length, 0, 'Removed package has returned: ' + pkg);
}
const uuid3 = names.filter(([path, p]) => (path === 'node_modules/uuid' || path.endsWith('/node_modules/uuid')) && /^3\./.test(p.version));
assert.equal(uuid3.length, 0, 'Deprecated uuid 3 is back in the lockfile');

console.log('Deprecated packages remaining:', [...new Set(observed)].sort().join(', ') || '(none)');
console.log('Protractor/request/uuid3 and Angular Webpack builder absent; no new warnings introduced.');
