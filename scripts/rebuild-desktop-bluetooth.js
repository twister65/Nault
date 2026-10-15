#!/usr/bin/env node
'use strict';

// Build the legacy NAN addon for Electron, not the host Node ABI.
// node-gyp is already supplied by the locked native-module dependencies.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const env = { ...process.env };
delete env.NODE_OPTIONS; // Angular's OpenSSL option is forbidden by Electron.
delete env.ELECTRON_RUN_AS_NODE;

function run(command, args, childEnv = env) {
  const result = spawnSync(command, args, { cwd: root, env: childEnv, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Bluetooth rebuild/check failed (${result.signal || result.status})`);
  }
}

try {
  if (process.platform !== 'linux') throw new Error('This Bluetooth rebuild command currently supports Linux only.');
  const addon = path.dirname(require.resolve('@abandonware/bluetooth-hci-socket/package.json'));
  const version = require('electron/package.json').version;
  const electron = require('electron');
  const output = path.join(addon, 'lib', 'binding');
  const binding = path.join(output, 'bluetooth_hci_socket.node');
  // Fail early if the Electron binary has not been installed.
  if (!fs.existsSync(electron)) throw new Error('Electron binary missing; install dependencies first.');
  console.log(`Rebuilding Bluetooth for Electron ${version} (${process.arch})`);
  run(process.execPath, [
    require.resolve('node-gyp/bin/node-gyp.js'), 'rebuild',
    `--directory=${addon}`, `--target=${version}`, `--arch=${process.arch}`,
    '--dist-url=https://artifacts.electronjs.org/headers/dist',
    '--', '-Dmodule_name=bluetooth_hci_socket', `-Dmodule_path=${output}`
  ]);
  // Load exactly the file Noble uses. Do not instantiate a socket or scan.
  run(electron, ['-e', `
    const addon = require(${JSON.stringify(binding)});
    if (typeof addon.BluetoothHciSocket !== 'function') throw new Error('Invalid Bluetooth binding');
    console.log('PASS: Bluetooth binding loaded in Electron ' + process.versions.electron + ' (ABI ' + process.versions.modules + ')');
  `], { ...env, ELECTRON_RUN_AS_NODE: '1' });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
