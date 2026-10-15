import { BrowserWindow, dialog } from 'electron';

// Chromium filters requestDevice by the Ledger service UUIDs in TransportWebBLE.
// A name is only a label: never automatically select or pair based on a name.
export function configureWebBluetooth(window: BrowserWindow, isTrustedURL: (url: string) => boolean) {
  const contents = window.webContents;
  const trusted = () => !window.isDestroyed() && !contents.isDestroyed() && isTrustedURL(contents.getURL());
  const selected = new Set<string>();
  type Scan = {
    callback: (id: string) => void;
    devices: Electron.BluetoothDevice[];
    timer: ReturnType<typeof setTimeout>;
    refresh?: ReturnType<typeof setTimeout>;
    abort: AbortController;
    showing: boolean;
  };
  let scan: Scan | null = null;
  const pairingCancels = new Set<() => void>();

  function finish(request: Scan, id = '') {
    if (scan !== request) return;
    scan = null;
    clearTimeout(request.timer);
    clearTimeout(request.refresh);
    request.abort.abort();
    if (id) selected.add(id);
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
      return;
    }
    const request: Scan = {
      callback, devices, timer: null, abort: new AbortController(), showing: false
    };
    scan = request;
    request.timer = setTimeout(() => finish(request), 60000);
    void show(request);
  });

  contents.session.setBluetoothPairingHandler((details, callback) => {
    if (!trusted() || details.frame !== contents.mainFrame ||
        !isTrustedURL(details.frame.url) || !selected.has(details.deviceId) ||
        !['confirm', 'confirmPin'].includes(details.pairingKind)) {
      callback({ confirmed: false });
      return;
    }
    if (details.pairingKind === 'confirmPin' && !/^\d{6}$/.test(details.pin || '')) {
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
