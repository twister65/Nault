import LedgerHidWorkerTransport from './ledger-hid-worker-transport';
import { LedgerUsbModel, normalizeLedgerUsbModel } from './ledger-usb-model';
import Transport from '@ledgerhq/hw-transport';
import Nano from 'hw-app-nano';

import * as rx from 'rxjs';

import { ipcMain, IpcMainEvent, IpcMainInvokeEvent, WebContents } from 'electron';

const STATUS_CODES = {
  SECURITY_STATUS_NOT_SATISFIED: 0x6982,
  CONDITIONS_OF_USE_NOT_SATISFIED: 0x6985,
  INVALID_SIGNATURE: 0x6a81,
  CACHE_MISS: 0x6a82
};

function ledgerErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return String(error);
}

function ledgerStatusCode(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'statusCode' in error && typeof error.statusCode === 'number') {
    return error.statusCode;
  }
  return undefined;
}

// APDU 0x6985 means the user rejected the requested action on the Ledger.
// It is not a transport failure and must never close a still-healthy HID handle.
// Recognize the hex fallback as some transport boundaries only preserve .message.
export function isLedgerUserRejection(error: unknown): boolean {
  return ledgerStatusCode(error) === STATUS_CODES.CONDITIONS_OF_USE_NOT_SATISFIED ||
    /\b0x6985\b/i.test(ledgerErrorMessage(error));
}

const LedgerStatus = {
  NOT_CONNECTED: 'not-connected',
  LOCKED: 'locked',
  READY: 'ready',
};

export interface LedgerData {
  status: string;
  nano: any|null;
  transport: Transport|null;
}


/**
 * This class is close to a clone of the LedgerService for web, but it
 * talks to the USB device directly and relays messages over Electron IPC
 */
export class LedgerService {
  walletPrefix = `44'/165'/`;
  waitTimeout = 30000;
  pollInterval = 5000;

  pollingLedger = false;
  queryingLedger = false;
  private usbGeneration = 0;
  private usbOpening: Promise<LedgerHidWorkerTransport> | null = null;
  private usbClosing: Promise<void> = Promise.resolve();

  ledgerStatus$ = new rx.Subject();
  ledgerMessage$ = new rx.Subject();

  ledger: LedgerData = {
    status: LedgerStatus.NOT_CONNECTED,
    nano: null,
    transport: null,
  };

  constructor() {
  }

  // Reset connection to the ledger device, update the status
  resetLedger(errorMessage = '', notifyStatus = true) {
    const transport = this.ledger.transport;
    this.ledger.transport = null;
    this.ledger.nano = null;
    // Release the worker and HID handle when a device disconnects or fails.
    if (transport) {
      const previousClose = this.usbClosing;
      this.usbClosing = (async () => {
        await previousClose;
        try {
          await transport.close();
        } catch (error) {
          console.warn('Could not close Ledger transport:', error);
        }
      })();
    }
    // The renderer already manages its transport-mode transition. In that
    // case, notifying "not-connected" before the new USB status arrives would
    // be consumed as the result of the new get-ledger-status request.
    if (notifyStatus) this.setLedgerStatus(LedgerStatus.NOT_CONNECTED, errorMessage);
    else this.ledger.status = LedgerStatus.NOT_CONNECTED;
  }

  // Open a connection to the usb device and initialize up the Nano Ledger library
  async loadTransport(bluetooth: boolean) {
    if (!bluetooth) {
      // Keep all native USB/HID work inside a dedicated Node.js worker.
      // Electron 44 cannot safely use the legacy node-hid async read
      // callback, while the bounded synchronous read works in the worker.
      console.info('[Ledger diagnosis] Opening USB HID worker transport');
      const generation = this.usbGeneration;
      // Include any cancellation close in the tracked promise: BLE must not
      // proceed just because open() resolved while HID is still shutting down.
      const opening = LedgerHidWorkerTransport.open().then(async hidTransport => {
        if (generation !== this.usbGeneration) {
          await hidTransport.close();
          throw new Error('Ledger USB opening cancelled by Bluetooth switch');
        }
        console.info('[Ledger diagnosis] USB HID worker ready');
        this.ledger.transport = hidTransport;
        this.ledger.nano = new Nano(hidTransport);
        console.info('[Ledger diagnosis] Nano application transport initialized');
        return hidTransport;
      });
      this.usbOpening = opening;
      try {
        return await opening;
      } finally {
        if (this.usbOpening === opening) this.usbOpening = null;
      }
    }

    throw new Error('Native Bluetooth is disabled. Use the Web Bluetooth connection button.');
  }

  /**
   * A Bluetooth connection may be selected immediately after USB (or even
   * while a USB worker is still starting). Wait for all HID handles to close
   * before Chromium discovers GATT services. No automatic BLE pairing.
   */
  async releaseUsbForBluetooth(): Promise<void> {
    this.usbGeneration++;
    this.pollingLedger = false;
    this.resetLedger('', false);
    const opening = this.usbOpening;
    if (opening) {
      // loadTransport() closes its own handle on a generation mismatch.
      try { await opening; } catch (_error) {}
    }
    await this.usbClosing;
    console.info('[Ledger USB] HID worker released before Bluetooth discovery');
  }

  async loadAppConfig(): Promise<any> {
    return new Promise((resolve, reject) => {
      this.ledger.nano.getAppConfiguration().then(resolve).catch(reject);
    });
  }

  // Try connecting to the ledger device and sending a command to it
  async loadLedger(bluetooth = false) {
    if (!this.ledger.transport) {
      try {
        await this.loadTransport(bluetooth);
      } catch (err) {
        console.log(`Error loading transport? `, err);
        this.setLedgerStatus(LedgerStatus.NOT_CONNECTED, `Unable to load Ledger transport: ${ledgerErrorMessage(err)}`);
        this.resetLedger();
        return false;
      }
    }

    let resolved = false;

    // Allow the worker and Ledger up to the configured transport timeout.
    // The former 3-second deadline could close a healthy device mid-request.
    const connectionTimeout = setTimeout(() => {
      if (resolved || this.ledger.status === LedgerStatus.READY) return;
      this.setLedgerStatus(LedgerStatus.NOT_CONNECTED, `Ledger device not detected`);
      this.resetLedger();
      resolved = true;
      return false;
    }, this.waitTimeout);


    // Attempt to load account 0 - which confirms the app is unlocked and ready
    try {
      console.info('[Ledger diagnosis] Reading account 0 from Nano application');
      const accountDetails = await this.getLedgerAccount(0);
      console.info('[Ledger diagnosis] Account 0 read completed');
      this.setLedgerStatus(LedgerStatus.READY, `Ledger device ready`);
      resolved = true;
      clearTimeout(connectionTimeout);

      if (!this.pollingLedger) {
        this.pollingLedger = true;
        this.pollLedgerStatus();
      }

      return true;
    } catch (err) {
      clearTimeout(connectionTimeout);
      console.log(err);
      if (ledgerStatusCode(err) === STATUS_CODES.SECURITY_STATUS_NOT_SATISFIED) {
        this.setLedgerStatus(LedgerStatus.LOCKED, `Ledger device locked`);
      }
    }

    return false;
  }

  async getLedgerAccount(accountIndex: number, showOnScreen = false) {
    try {
      this.queryingLedger = true;
      console.info('[Ledger diagnosis] Requesting Nano address (index only):', accountIndex);
      const account = await this.ledger.nano.getAddress(this.ledgerPath(accountIndex), showOnScreen);
      console.info('[Ledger diagnosis] Nano address request resolved');
      this.queryingLedger = false;

      this.ledgerMessage$.next({ event: 'account-details', data: Object.assign({ accountIndex }, account) });
    } catch (err) {
      this.queryingLedger = false;
      console.error('[Ledger diagnosis] Nano address request failed:', err);

      const data = { error: true, errorMessage: ledgerErrorMessage(err) };
      this.ledgerMessage$.next({ event: 'account-details', data: Object.assign({ accountIndex }, data) });

      if (isLedgerUserRejection(err)) {
        // Refusing address confirmation does not invalidate USB/HID transport.
        return;
      }

      this.resetLedger(data.errorMessage); // Apparently ledger not working?
      throw err;
    }
  }

  async cacheBlock(accountIndex: number, cacheData: unknown, signature: unknown) {
    try {
      this.queryingLedger = true;
      const cacheResponse = await this.ledger.nano.cacheBlock(this.ledgerPath(accountIndex), cacheData, signature);
      this.queryingLedger = false;

      this.ledgerMessage$.next({ event: 'cache-block', data: Object.assign({ accountIndex }, cacheResponse) });
    } catch (err) {
      this.queryingLedger = false;

      const data = { error: true, errorMessage: ledgerErrorMessage(err) };
      this.ledgerMessage$.next({ event: 'cache-block', data: Object.assign({ accountIndex }, data) });

      // Cancellation is expected; preserve READY, Nano app and HID session.
      if (isLedgerUserRejection(err)) return;
      this.resetLedger();
    }
  }

  async signBlock(accountIndex: number, blockData: unknown) {
    try {
      this.queryingLedger = true;
      const signResponse = await this.ledger.nano.signBlock(this.ledgerPath(accountIndex), blockData);
      this.queryingLedger = false;

      this.ledgerMessage$.next({ event: 'sign-block', data: Object.assign({ accountIndex }, signResponse) });
    } catch (err) {
      this.queryingLedger = false;

      const data = { error: true, errorMessage: ledgerErrorMessage(err) };
      this.ledgerMessage$.next({ event: 'sign-block', data: Object.assign({ accountIndex }, data) });

      // 0x6985 is a declined transaction, not a USB/HID disconnect.
      // Report the refusal to the renderer, but keep the worker transport open
      // so the user can approve a later transaction without reconnecting.
      if (isLedgerUserRejection(err)) return;
      this.resetLedger();
    }
  }

  setLedgerStatus(status: string, statusText = '') {
    this.ledger.status = status;
    // Only publish a hardware model with a successfully initialized HID session.
    // The renderer verifies the saved Nano account before persisting this hint.
    const transport = this.ledger.transport as (Transport & { usbModel?: LedgerUsbModel | null }) | null;
    const deviceModel = status === LedgerStatus.READY
      ? normalizeLedgerUsbModel(transport?.usbModel) : null;
    this.ledgerStatus$.next({ status: this.ledger.status, statusText, deviceModel });
  }

  ledgerPath(accountIndex: number) {
    return `${this.walletPrefix}${accountIndex}'`;
  }

  pollLedgerStatus() {
    if (!this.pollingLedger) return;
    setTimeout(async () => {
      await this.checkLedgerStatus();
      this.pollLedgerStatus();
    }, this.pollInterval);
  }

  async checkLedgerStatus() {
    if (this.ledger.status !== LedgerStatus.READY) return;
    if (this.queryingLedger) return; // Already querying ledger, skip this iteration

    try {
      await this.getLedgerAccount(0, false);
      // The native HID session is already READY. Publishing another READY
      // every five seconds makes the renderer temporarily show Reconnect while
      // it verifies the saved account again. Only send changes or failures.

    } catch (err) {
      if (ledgerStatusCode(err) === STATUS_CODES.SECURITY_STATUS_NOT_SATISFIED) {
        this.setLedgerStatus(LedgerStatus.LOCKED, `Ledger device locked`);
      } else {
        this.setLedgerStatus(LedgerStatus.NOT_CONNECTED, `Ledger Disconnected: ${ledgerErrorMessage(err)}`);
      }
      this.pollingLedger = false;
    }
  }
}

let sendingWindow: WebContents | null = null;

// Create a copy of the ledger service and register listeners with the browser window
export function initialize(isTrustedSender: (event: IpcMainEvent | IpcMainInvokeEvent) => boolean) {
  console.log('Ledger service initializing');
  const Ledger = new LedgerService();

  // When the observable emits a new status, send it to the browser window
  Ledger.ledgerStatus$.subscribe(newStatus => {
    if (!sendingWindow) return;

    sendingWindow.send('ledger', { event: 'ledger-status', data: newStatus });
  });

  // When the observable emits a new message, send it to the browser window
  Ledger.ledgerMessage$.subscribe(newMessage => {
    if (!sendingWindow) return;

    sendingWindow.send('ledger', newMessage);
  });

  ipcMain.handle('ledger-release-usb', async event => {
    if (!isTrustedSender(event)) {
      console.warn('Rejected USB release IPC from an untrusted sender');
      throw new Error('Untrusted Ledger IPC sender');
    }
    sendingWindow = event.sender;
    await Ledger.releaseUsbForBluetooth();
    return true;
  });

  // Listen for new messages from the browser window and dispatch accordingly
  ipcMain.on('ledger', (event, data) => {
    // The renderer is not allowed to invoke hardware-wallet commands from
    // another window, a subframe, or a document outside the bundled wallet.
    if (!isTrustedSender(event)) {
      console.warn('Rejected Ledger IPC from an untrusted sender');
      return;
    }
    sendingWindow = event.sender;
    if (!data || !data.event) return;
    switch (data.event) {
      case 'disconnect':
        Ledger.pollingLedger = false;
        // Explicit transport switching is not a failed USB connection.
        // Avoid a stale empty status racing the next get-ledger-status reply.
        Ledger.resetLedger('', false);
        break;
      case 'get-ledger-status':
        Ledger.loadLedger(data.data.bluetooth);
        break;
      case 'account-details':
        Ledger.getLedgerAccount(data.data.accountIndex || 0, data.data.showOnScreen || false);
        break;
      case 'cache-block':
        Ledger.cacheBlock(data.data.accountIndex, data.data.cacheData, data.data.signature);
        break;
      case 'sign-block':
        Ledger.signBlock(data.data.accountIndex, data.data.blockData);
        break;
    }
  });
}
