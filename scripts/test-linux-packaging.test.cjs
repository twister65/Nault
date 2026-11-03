'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('Nault release includes distro-native Linux formats and menu metadata', () => {
  const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.deepEqual(p.build.linux.target, ['AppImage', 'deb', 'rpm', 'pacman']);
  assert.equal(p.desktopName, 'cc.nault.desktop');
  assert.equal(p.build.linux.syncDesktopName, true);
  assert.equal(p.build.linux.executableName, 'nault');
  assert.equal(p.build.linux.desktop.entry.Name, 'Nault');
  assert.match(p.build.linux.category, /Office/);
  assert.ok(fs.statSync('desktop-app/assets/linux/256x256.png').size > 0);
});

test('release CI verifies packages before publishing them', () => {
  const workflow = fs.readFileSync('.github/workflows/electron_hash.yml', 'utf8');
  for (const extension of ['*.AppImage', '*.deb', '*.rpm', '*.pkg.tar.zst']) {
    assert.ok(workflow.includes('desktop-app/build/' + extension));
    assert.ok(workflow.includes("-name '" + extension + "'"));
  }
  assert.match(workflow, /bash scripts\/verify-linux-packages\.sh/);
  assert.match(workflow, /sha256sum --check SHA256SUMS/);
});

test('Linux archive validation materializes full manifests before grep', () => {
  const script = fs.readFileSync('scripts/verify-linux-packages.sh', 'utf8');
  assert.match(script, /rpm -qpl "\$rpm" > "\$tmp\/rpm-files\.txt"/);
  assert.match(script, /tar -I zstd -tf "\$pacman" > "\$tmp\/pacman-files\.txt"/);
  assert.doesNotMatch(script, /(?:tar -I zstd -tf|rpm -qpl)[^\n]*\|\s*grep/);
});
