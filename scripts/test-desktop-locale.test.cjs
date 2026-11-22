'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const file = path.join(__dirname, '../desktop-app/src/lib/desktop-locale.ts');
const source = fs.readFileSync(file, 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS }
}).outputText;
const moduleContext = { exports: {} };
vm.runInNewContext(code, moduleContext, { filename: file });
const { desktopLabels } = moduleContext.exports;

test('native connectivity IPC is read-only and restricted to the wallet renderer', () => {
  const main = fs.readFileSync(path.join(__dirname, '../desktop-app/src/desktop-app.ts'), 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, '../desktop-app/src/preload.ts'), 'utf8');
  assert.match(main, /ipcMain\.handle\('app-network-online', event => \{/);
  assert.match(main, /if \(!isTrustedLedgerSender\(event\)\) throw new Error\('Untrusted network status request'\)/);
  assert.match(preload, /isNetworkOnline\(\): Promise<boolean>/);
});

test('native OS locale bridge is restricted to the trusted wallet renderer', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '../desktop-app/src/desktop-app.ts'), 'utf8');
  const preloadSource = fs.readFileSync(path.join(__dirname, '../desktop-app/src/preload.ts'), 'utf8');
  const settingsSource = fs.readFileSync(path.join(__dirname, '../src/app/services/app-settings.service.ts'), 'utf8');
  assert.match(mainSource, /ipcMain\.handle\('app-system-locale', event => \{/);
  assert.match(mainSource, /if \(!isTrustedLedgerSender\(event\)\) throw new Error\('Untrusted locale request'\)/);
  assert.match(preloadSource, /getSystemLocale\(\): Promise<string>/);
  assert.match(settingsSource, /loadAppSettings\(systemLocale\?: string \| null\)/);
});

test('Electron menu tracks the saved wallet language at startup and on changes', () => {
  const main = fs.readFileSync(path.join(__dirname, '../desktop-app/src/desktop-app.ts'), 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, '../desktop-app/src/preload.ts'), 'utf8');
  const typings = fs.readFileSync(path.join(__dirname, '../src/typings.d.ts'), 'utf8');
  const desktop = fs.readFileSync(path.join(__dirname, '../src/app/services/desktop.service.ts'), 'utf8');
  const startup = fs.readFileSync(path.join(__dirname, '../src/app/app.component.ts'), 'utf8');
  const configure = fs.readFileSync(path.join(__dirname, '../src/app/components/configure-app/configure-app.component.ts'), 'utf8');
  const bluetooth = fs.readFileSync(path.join(__dirname, '../desktop-app/src/lib/web-bluetooth.ts'), 'utf8');

  assert.match(main, /ipcMain\.handle\('app-menu-language', \(event, language: unknown\) => \{/);
  assert.match(main, /if \(!isTrustedLedgerSender\(event\)\) throw new Error\('Untrusted menu language request'\)/);
  assert.match(main, /typeof language !== 'string' \|\| !supportedMenuLanguages\.has\(language\)/);
  const match = main.match(/const supportedMenuLanguages = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(match, 'Electron native-menu IPC must use a fixed allowlist');
  const allowed = [...match[1].matchAll(/'([^']+)'/g)].map(entry => entry[1]);
  const transloco = fs.readFileSync(
    path.join(__dirname, '../src/app/transloco/transloco-root.module.ts'), 'utf8'
  );
  const registered = [...transloco.matchAll(/\{ id: '([^']+)', label:/g)].map(entry => entry[1]);
  assert.deepEqual(allowed, registered, 'native menu IPC must support all registered UI languages');
  assert.match(main, /desktopLabels\(applicationMenuLocale \?\? app\.getLocale\(\)\)/);
  assert.match(main, /Menu\.setApplicationMenu\(Menu\.buildFromTemplate\(getApplicationMenu\(\)\)\)/);
  assert.match(preload, /setMenuLanguage\(language: string\): Promise<boolean>/);
  assert.match(preload, /ipcRenderer\.invoke\('app-menu-language', language\)/);
  assert.match(typings, /setMenuLanguage\(language: string\): Promise<boolean>/);
  assert.match(desktop, /if \(!this\._ipc\) return Promise\.resolve\(false\)/);
  assert.match(startup, /void this\.desktop\.setMenuLanguage\(this\.settings\.settings\.language\)/);
  assert.match(configure, /void this\.desktop\.setMenuLanguage\(this\.selectedLanguage\)/);
  assert.match(main, /configureWebBluetooth\(currentWindow, isTrustedWalletURL,/);
  assert.match(main, /\(\) => applicationMenuLocale \?\? app\.getLocale\(\)/);
  assert.match(bluetooth, /const t = desktopLabels\(getLocale\(\)\)/);
  // The existing language dictionaries are reused without changing their labels.
  assert.equal(desktopLabels('en').edit, 'Edit');
  assert.equal(desktopLabels('fr').edit, 'Édition');
  assert.equal(desktopLabels('es').edit, 'Editar');
  assert.equal(desktopLabels('de').edit, 'Bearbeiten');
  assert.equal(desktopLabels('zh-HK').edit, '編輯');
});

test('native Electron menu and updater dialogs use French on fr-FR systems', () => {
  const fr = desktopLabels('fr-FR');
  assert.equal(fr.edit, 'Édition');
  assert.equal(fr.view, 'Affichage');
  assert.equal(fr.window, 'Fenêtre');
  assert.equal(fr.help, 'Aide');
  assert.equal(fr.checkUpdates, 'Rechercher des mises à jour');
  assert.equal(fr.update, 'Mettre à jour');
  assert.match(fr.updateAvailable, /mise à jour/i);
  assert.match(fr.noUpdate, /déjà à jour/);
  assert.equal(fr.cancel, 'Annuler');
  assert.equal(fr.refresh, 'Actualiser');
  assert.equal(fr.confirm, 'Confirmer');
  assert.match(fr.pairLedger, /Ledger/);
});

test('Spanish system locale has native labels and update messages', () => {
  const es = desktopLabels('es-ES');
  assert.equal(es.help, 'Ayuda');
  assert.equal(es.checkUpdates, 'Buscar actualizaciones');
  assert.equal(es.update, 'Actualizar');
});

test('German OS locale localizes the native menu, updater and Bluetooth prompts', () => {
  const de = desktopLabels('de-DE');
  assert.equal(de.help, 'Hilfe');
  assert.equal(de.checkUpdates, 'Nach Updates suchen');
  assert.equal(de.update, 'Aktualisieren');
  assert.equal(de.reload, 'Neu laden');
  assert.equal(de.cancel, 'Abbrechen');
  assert.equal(de.pairLedger, 'Ledger koppeln');
});

test('Traditional Chinese (Hong Kong) has complete native menus, update and Bluetooth dialogs', () => {
  const zh = desktopLabels('zh-HK');
  assert.equal(zh.edit, '編輯');
  assert.equal(zh.help, '說明');
  assert.equal(zh.checkUpdates, '檢查更新');
  assert.equal(zh.pairLedger, '配對 Ledger');
  assert.equal(zh.cancel, '取消');
  assert.deepEqual(zh, desktopLabels('zh-Hant-HK'));
  assert.deepEqual(zh, desktopLabels('zh-TW'));
  // Simplified and Traditional Chinese must remain distinct.
  assert.equal(desktopLabels('zh-CN').help, '帮助');
  assert.equal(desktopLabels('zh-Hans-CN').help, '帮助');
  assert.equal(desktopLabels('zh-Hant-TW').help, '說明');
});

test('all nine new languages localize native menus, updater and Ledger Bluetooth prompts', () => {
  const expected = [
    { locale: 'nb-NO', edit: 'Rediger', help: 'Hjelp', check: 'Se etter oppdateringer', pair: 'Koble sammen Ledger' },
    { locale: 'da-DK', edit: 'Rediger', help: 'Hjælp', check: 'Søg efter opdateringer', pair: 'Par Ledger' },
    { locale: 'nl-NL', edit: 'Bewerken', help: 'Help', check: 'Controleren op updates', pair: 'Ledger koppelen' },
    { locale: 'fi-FI', edit: 'Muokkaa', help: 'Ohje', check: 'Tarkista päivitykset', pair: 'Muodosta pariliitos Ledger-laitteeseen' },
    { locale: 'pt-BR', edit: 'Editar', help: 'Ajuda', check: 'Verificar atualizações', pair: 'Parear Ledger' },
    { locale: 'it-IT', edit: 'Modifica', help: 'Aiuto', check: 'Controlla aggiornamenti', pair: 'Associa Ledger' },
    { locale: 'ja-JP', edit: '編集', help: 'ヘルプ', check: '更新を確認', pair: 'Ledgerをペアリング' },
    { locale: 'ko-KR', edit: '편집', help: '도움말', check: '업데이트 확인', pair: 'Ledger 페어링' },
    { locale: 'zh-CN', edit: '编辑', help: '帮助', check: '检查更新', pair: '配对 Ledger' }
  ];
  for (const {locale, edit, help, check, pair} of expected) {
    const labels = desktopLabels(locale);
    assert.equal(labels.edit, edit, locale + ': edit');
    assert.equal(labels.help, help, locale + ': help');
    assert.equal(labels.checkUpdates, check, locale + ': updater');
    assert.equal(labels.pairLedger, pair, locale + ': Bluetooth');
    assert.notEqual(labels.edit, desktopLabels('fr-FR').edit,
      locale + ': menu must not remain French after changing wallet language');
    assert.ok(labels.ledgerBluetoothAdvice.includes('Ledger'), locale + ': safety advice');
  }
  assert.deepEqual(desktopLabels('no-NO'), desktopLabels('nb'));
  assert.deepEqual(desktopLabels('pt-PT'), desktopLabels('pt-BR'));
  assert.deepEqual(desktopLabels('zh-SG'), desktopLabels('zh-CN'));
  assert.deepEqual(desktopLabels('zh-Hans'), desktopLabels('zh-CN'));
  assert.deepEqual(desktopLabels('zh-TW'), desktopLabels('zh-HK'));
});

test('Italian Ledger notifications, reconnect actions and native menu agree on the selected locale', () => {
  const italian = require('../src/assets/i18n/it.json');
  const reconnect = italian['ui-ledger']['reconnect-via-usb'];
  const notification = italian['ui-notifications']['bluetooth-unavailable'];
  assert.equal(reconnect, 'Riconnetti tramite USB');
  assert.ok(notification.includes(reconnect), 'Bluetooth toast must name the actual Italian reconnect action');
  assert.equal(desktopLabels('it').edit, 'Modifica');
  assert.equal(desktopLabels('it').view, 'Visualizza');
  assert.equal(desktopLabels('it').window, 'Finestra');
  assert.equal(desktopLabels('it').help, 'Aiuto');
});

test('Bluetooth trademark uses approved native word marks without third-party logos', () => {
  const latin = ['en', 'fr', 'es', 'de', 'nb', 'da', 'nl', 'fi', 'pt-BR', 'it'];
  for (const locale of latin) {
    assert.ok(desktopLabels(locale).ledgerBluetoothTitle.includes('Bluetooth®'),
      locale + ': the native Ledger dialog should identify the registered word mark');
  }
  const asian = [
    ['zh-HK', '藍牙'], ['zh-CN', '蓝牙'],
    ['ja', 'ブルートゥース'], ['ko', '블루투스']
  ];
  for (const [locale, approved] of asian) {
    const labels = desktopLabels(locale);
    assert.ok(labels.ledgerBluetoothTitle.includes(approved),
      locale + ': use the Bluetooth SIG-approved translation in native dialogs');
    assert.ok(labels.ledgerBluetoothAdvice.includes(approved),
      locale + ': the Bluetooth advice should use the same word mark');
  }
  assert.doesNotMatch(desktopLabels('zh-CN').ledgerBluetoothTitle, /®/,
    'Do not append the registration symbol to the Simplified Chinese translation');
  const walletMarkup = fs.readFileSync(
    path.join(__dirname, '../src/app/components/configure-wallet/configure-wallet.component.html'), 'utf8'
  );
  assert.match(walletMarkup, /ui-wallet-setup\.bluetooth-trademark-attribution/);
});

test('English and unsupported system locales keep a complete English fallback', () => {
  const en = desktopLabels('en-US');
  assert.equal(en.checkUpdates, 'Check for Updates');
  assert.equal(en.help, 'Help');
  assert.equal(desktopLabels('ru-RU').checkUpdates, en.checkUpdates);
  assert.equal(desktopLabels('').updateFailed, en.updateFailed);
  const fields = Object.keys(en).sort();
  assert.deepEqual(Object.keys(desktopLabels('fr')).sort(), fields);
  assert.deepEqual(Object.keys(desktopLabels('es')).sort(), fields);
  assert.deepEqual(Object.keys(desktopLabels('de')).sort(), fields);
  assert.deepEqual(Object.keys(desktopLabels('zh-HK')).sort(), fields);
  for (const language of ['nb', 'da', 'nl', 'fi', 'pt-BR', 'it', 'ja', 'ko', 'zh-CN']) {
    assert.deepEqual(Object.keys(desktopLabels(language)).sort(), fields,
      'native dictionary must have every menu, updater and Ledger prompt: ' + language);
    assert.ok(Object.values(desktopLabels(language)).every(
      value => typeof value === 'string' && value.trim().length > 0
    ), 'native dictionary cannot have empty entries: ' + language);
  }
});


test('all Electron role commands have explicit labels for all 14 languages while keeping their native roles', () => {
  const electronSource = fs.readFileSync(
    path.join(__dirname, '../desktop-app/src/desktop-app.ts'), 'utf8'
  );
  const menuSource = electronSource.split('function getApplicationMenu() {')[1]
    .split('function loadExternal(')[0];
  const roleEntries = [...menuSource.matchAll(/\{role: '([a-z]+)'(?:, label: t\.([a-zA-Z]+))?\}/g)];
  assert.ok(roleEntries.length >= 28, 'all native menu commands should be covered');
  const locales = [
    'en-US', 'fr-FR', 'es-ES', 'de-DE', 'zh-HK',
    'nb-NO', 'da-DK', 'nl-NL', 'fi-FI', 'pt-BR', 'it-IT',
    'ja-JP', 'ko-KR', 'zh-CN'
  ].map(locale => desktopLabels(locale));
  for (const [, role, key] of roleEntries) {
    assert.ok(key, 'Electron role ' + role + ' is missing its explicit translated label');
    for (const labels of locales) {
      assert.equal(typeof labels[key], 'string', 'missing ' + role + ' label: ' + key);
      assert.ok(labels[key].trim(), 'empty translated command ' + role);
    }
  }
  const fr = desktopLabels('fr-FR');
  assert.equal(fr.reload, 'Recharger');
  assert.equal(fr.forceReload, 'Forcer le rechargement');
  assert.equal(fr.toggleDevTools, 'Outils de développement');
  assert.equal(fr.undo, 'Annuler');
  assert.equal(fr.selectAll, 'Tout sélectionner');
  assert.equal(fr.minimize, 'Réduire');
  assert.equal(fr.close, 'Fermer');
  assert.equal(desktopLabels('es-ES').reload, 'Recargar');
  assert.equal(desktopLabels('de-DE').reload, 'Neu laden');
  assert.equal(desktopLabels('en-US').reload, 'Reload');
  // The native roles retain their accelerator/shortcut behavior.
  assert.match(menuSource, /\{role: 'reload', label: t\.reload\}/);
  assert.match(menuSource, /\{role: 'toggledevtools', label: t\.toggleDevTools\}/);
});

test('release metadata explicitly targets the maintained fork and version is coherent', () => {
  const pkg = require('../package.json');
  const lock = require('../package-lock.json');
  assert.match(pkg.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.deepEqual(pkg.build.publish, {
    provider: 'github', owner: 'twister65', repo: 'Nault'
  });
});

test('Help menu links to maintained fork and omits upstream Discord', () => {
  const electronSource = fs.readFileSync(
    path.join(__dirname, '../desktop-app/src/desktop-app.ts'), 'utf8'
  );
  assert.match(electronSource, /https:\/\/github\.com\/twister65\/Nault'/);
  assert.match(electronSource, /https:\/\/github\.com\/twister65\/Nault\/issues\/new/);
  assert.match(electronSource, /https:\/\/github\.com\/twister65\/Nault\/releases/);
  assert.doesNotMatch(electronSource, /Discord \(#nault\)|discord\.nanocenter\.org/);
});

test('Windows release NSIS installer uses a hyphenated filename', () => {
  const pkg = require('../package.json');
  assert.equal(pkg.build.nsis.artifactName, 'Nault-Windows-Setup-${version}.${ext}');
});
