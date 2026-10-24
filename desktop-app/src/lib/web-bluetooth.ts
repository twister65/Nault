import { BrowserWindow, dialog } from 'electron';
const log = require('electron-log');

// Chromium filters requestDevice by the Ledger service UUIDs in TransportWebBLE.
// A name is only a label: never automatically select or pair based on a name.
export function configureWebBluetooth(window: BrowserWindow, isTrustedURL: (url: string) => boolean) {
  const contents = window.webContents;
  const trusted = () => !window.isDestroyed() && !contents.isDestroyed() && isTrustedURL(contents.getURL());
  const selected = new Set<string>();
  type Scan = {
    callback: (id: string) => void;
    devices: Electron.BluetoothDevice[];
    timer: ReturnType<typeof setTimeout> | null;
    refresh?: ReturnType<typeof setTimeout>;
    abort: AbortController;
    showing: boolean;
  };
  let scan: Scan | null = null;
  const pairingCancels = new Set<() => void>();

  function finish(request: Scan, id = '') {
    if (scan !== request) return;
    scan = null;
    if (request.timer) clearTimeout(request.timer);
    clearTimeout(request.refresh);
    request.abort.abort();
    if (id) selected.add(id);
    console.info('[Ledger BLE chooser] selection completed', { selected: !!id });
    request.callback(id);
  }

  async function show(request: Scan) {
    if (scan !== request || request.showing) return;
    if (!trusted()) return finish(request);
    request.showing = true;
    // Snapshot: updates must not change the meaning of an existing button.
    const devices = request.devices.slice(0, 12);
    try {
      const result = await dialog.showMessageBox(window, {
        type: 'question', title: 'Connect Ledger via Bluetooth',
        message: devices.length ? 'Select your Ledger' : 'Searching for a Ledger…',
        detail: 'Unlock your Ledger, enable Bluetooth and open the Nano app. Use Refresh if your device is not listed. Verify any pairing code on the Ledger.',
        buttons: ['Cancel', 'Refresh', ...devices.map(d => `${d.deviceName || 'Unnamed device'} (${d.deviceId})`)],
        defaultId: 0, cancelId: 0, noLink: true, signal: request.abort.signal
      });
      if (scan !== request) return;
      request.showing = false;
      if (!trusted()) return finish(request);
      if (result.response === 1) {
        console.info('[Ledger BLE chooser] refreshed', { visibleDevices: request.devices.length });
        request.refresh = setTimeout(() => { void show(request); }, 500);
      } else {
        const device = devices[result.response - 2];
        finish(request, device && request.devices.some(d => d.deviceId === device.deviceId) ? device.deviceId : '');
      }
    } catch (_error) {
      finish(request);
    }
  }

  contents.on('select-bluetooth-device', (event, devices, callback) => {
    event.preventDefault();
    if (!trusted()) return callback('');
    if (scan) {
      scan.devices = devices;
      console.info('[Ledger BLE chooser] scan updated', { devices: devices.length });
      return;
    }
    console.info('[Ledger BLE chooser] scan started', { devices: devices.length });
    const request: Scan = {
      callback, devices, timer: null, abort: new AbortController(), showing: false
    };
    scan = request;
    request.timer = setTimeout(() => finish(request), 60000);
    void show(request);
  });

  contents.session.setBluetoothPairingHandler((details, callback) => {
    // Do not log device identifiers or pairing PINs. Windows can initiate
    // encryption when enabling notifications, after GATT discovery succeeded.
    const trustedDocument = trusted();
    const trustedFrame = !!details.frame && details.frame === contents.mainFrame &&
      isTrustedURL(details.frame.url);
    const previouslySelected = selected.has(details.deviceId);
    const knownKind = ['confirm', 'confirmPin'].includes(details.pairingKind);
    const validPin = details.pairingKind !== 'confirmPin' || /^\d{6}$/.test(details.pin || '');
    log.info('[Ledger BLE pairing] request', {
      kind: details.pairingKind, trustedDocument, trustedFrame,
      previouslySelected, knownKind, validPin
    });
    if (!trustedDocument || !trustedFrame || !previouslySelected || !knownKind || !validPin) {
      log.warn('[Ledger BLE pairing] denied by device or frame policy');
      callback({ confirmed: false });
      return;
    }
    const abort = new AbortController();
    let done = false;
    let timer: ReturnType<typeof setTimeout>;
    const finishPairing = (confirmed: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      pairingCancels.delete(cancel);
      abort.abort();
      log.info('[Ledger BLE pairing] user response', { confirmed });
      callback({ confirmed });
    };
    const cancel = () => finishPairing(false);
    pairingCancels.add(cancel);
    timer = setTimeout(cancel, 60000);
    dialog.showMessageBox(window, {
      type: 'question', title: 'Pair Ledger',
      message: details.pairingKind === 'confirmPin' ? `Does your Ledger display ${details.pin}?` : 'Pair with the Ledger you selected?',
      detail: 'Confirm only if you are pairing your own Ledger. Also confirm on the device when asked.',
      buttons: ['Cancel', 'Confirm'], defaultId: 0, cancelId: 0, noLink: true,
      signal: abort.signal
    }).then(result => finishPairing(trusted() && details.frame === contents.mainFrame && result.response === 1), cancel);
  });

  const cancelAll = () => {
    if (scan) finish(scan);
    selected.clear();
    for (const cancel of pairingCancels) cancel();
  };
  contents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) cancelAll();
  });
  contents.on('render-process-gone', cancelAll);
  contents.on('destroyed', cancelAll);
  return cancelAll;
}
