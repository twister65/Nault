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

test('English and unknown system locales keep a complete English fallback', () => {
  const en = desktopLabels('en-US');
  assert.equal(en.checkUpdates, 'Check for Updates');
  assert.equal(en.help, 'Help');
  assert.equal(desktopLabels('de-DE').checkUpdates, en.checkUpdates);
  assert.equal(desktopLabels('').updateFailed, en.updateFailed);
  const fields = Object.keys(en).sort();
  assert.deepEqual(Object.keys(desktopLabels('fr')).sort(), fields);
  assert.deepEqual(Object.keys(desktopLabels('es')).sort(), fields);
});


test('all Electron role commands have explicit EN/FR/ES labels while keeping their native roles', () => {
  const electronSource = fs.readFileSync(
    path.join(__dirname, '../desktop-app/src/desktop-app.ts'), 'utf8'
  );
  const menuSource = electronSource.split('function getApplicationMenu() {')[1]
    .split('function loadExternal(')[0];
  const roleEntries = [...menuSource.matchAll(/\\{role: '([a-z]+)'(?:, label: t\\.([a-zA-Z]+))?\\}/g)];
  assert.ok(roleEntries.length >= 28, 'all native menu commands should be covered');
  const locales = ['en-US', 'fr-FR', 'es-ES'].map(locale => desktopLabels(locale));
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
  assert.equal(desktopLabels('en-US').reload, 'Reload');
  // The native roles retain their accelerator/shortcut behavior.
  assert.match(menuSource, /\\{role: 'reload', label: t\\.reload\\}/);
  assert.match(menuSource, /\\{role: 'toggledevtools', label: t\\.toggleDevTools\\}/);
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
  assert.equal(pkg.build.nsis.artifactName, 'Nault-Setup-${version}.${ext}');
});
