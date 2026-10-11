import { contextBridge, ipcRenderer } from 'electron';

// Keep the renderer API intentionally narrow. Do not expose ipcRenderer,
// require(), or the Electron event object to the web page.
const allowedIncoming = new Set(['ledger', 'deeplink']);
const allowedOutgoing = new Set(['ledger', 'deeplink-ready']);

// This is a read-only UI capability hint, not an HID permission grant.
// The main process independently enforces the same two opt-in switches.
const experimentalWebHidReadOnly =
  process.env.NAULT_TEST_APP_ORIGIN === '1' &&
  process.env.NAULT_TEST_WEBHID === '1';

contextBridge.exposeInMainWorld('naultDesktop', {
  experimentalWebHidReadOnly,
  on(channel: string, listener: (...args: any[]) => void): boolean {
    if (!allowedIncoming.has(channel) || typeof listener !== 'function') {
      return false;
    }
    ipcRenderer.on(channel, (_event, ...args) => {
      // Preserve DesktopService's (event, ...args) callback signature.
      // The native IpcRendererEvent must never cross the isolated context.
      listener(null, ...args);
    });
    return true;
  },
  send(channel: string, ...args: any[]): boolean {
    if (!allowedOutgoing.has(channel)) {
      return false;
    }
    ipcRenderer.send(channel, ...args);
    return true;
  }
});
