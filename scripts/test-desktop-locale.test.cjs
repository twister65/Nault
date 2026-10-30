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

test('release metadata explicitly targets the maintained fork and version is coherent', () => {
  const pkg = require('../package.json');
  const lock = require('../package-lock.json');
  assert.equal(pkg.version, '1.18.5');
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.deepEqual(pkg.build.publish, {
    provider: 'github', owner: 'twister65', repo: 'Nault'
  });
});
