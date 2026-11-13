'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('service-worker update uses a real Angular action, not compiled-on-the-fly HTML', () => {
  const app = read('src/app/app.component.ts');
  const template = read('src/app/components/notifications/notifications.component.html');
  assert.match(app, /action:\s*\{ labelKey: 'ui-notifications\.apply-update'/);
  assert.doesNotMatch(app, /\(click\)="applySwUpdate\(\)"/);
  assert.match(template, /\(click\)="\$event\.stopPropagation\(\); notification\.action\.run\(\)"/);
  assert.match(app, /await this\.updates\.activateUpdate\(\);/);
  assert.match(app, /window\.location\.reload\(\);/);
  assert.match(app, /this\.ledger\.signingInProgress/);
});

test('native signing IPC remains narrow and guarded by the trusted main frame', () => {
  const preload = read('desktop-app/src/preload.ts');
  const main = read('desktop-app/src/lib/ledger.ts');
  const renderer = read('src/app/services/ledger.service.ts');
  for (const action of ['ledger-signing-start', 'ledger-signing-end']) {
    assert.ok(preload.includes("ipcRenderer.invoke('" + action + "')"));
    assert.ok(main.includes("ipcMain.handle('" + action + "'"));
  }
  assert.match(main, /if \(!isTrustedSender\(event\)\) throw new Error\('Untrusted Ledger IPC sender'\)/);
  assert.match(main, /this\.signingReserved \|\| this\.ledger\.status/);
  assert.match(renderer, /await this\.desktop\.beginLedgerSigning\(\);/);
  assert.match(renderer, /await this\.desktop\.endLedgerSigning\(\);/);
  assert.match(renderer, /response\.data\?\.requestId !== requestId/);
});

test('native Bluetooth dialogues have the same locale inventory as Desktop menus', () => {
  const locale = read('desktop-app/src/lib/desktop-locale.ts');
  const bluetooth = read('desktop-app/src/lib/web-bluetooth.ts');
  assert.match(bluetooth, /desktopLabels\(app\.getLocale\(\)\)/);
  for (const key of ['cancel', 'refresh', 'confirm', 'pairLedger', 'ledgerBluetoothAdvice']) {
    assert.match(locale, new RegExp(key + ':'));
    assert.ok(bluetooth.includes('t.' + key));
  }
});
