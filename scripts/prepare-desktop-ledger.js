#!/usr/bin/env node
'use strict';

// Electron 9 bundles Node 12.14.1, which cannot resolve the pattern-based
// package "exports" used by @ledgerhq/devices 7.0.2.
// Generate CommonJS entry points for the legacy resolver. Do not overwrite
// existing files: everything generated here stays in node_modules.
const fs = require('fs');
const path = require('path');

const packageRoot = path.dirname(require.resolve('@ledgerhq/devices/package.json'));
const libRoot = path.join(packageRoot, 'lib');
let created = 0;

function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const source = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      visit(source);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      const relative = path.relative(libRoot, source);
      const target = path.join(packageRoot, relative);
      if (fs.existsSync(target)) continue;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      let request = path.relative(path.dirname(target), source).split(path.sep).join('/');
      if (!request.startsWith('.')) request = './' + request;
      fs.writeFileSync(target, 'module.exports = require(' + JSON.stringify(request) + ');\n');
      created++;
    }
  }
}

visit(libRoot);
console.log('Ledger Node 12 compatibility entries created: ' + created);
