import TransportNodeHidNoEvents from '@ledgerhq/hw-transport-node-hid-noevents';
import Transport from '@ledgerhq/hw-transport';
import Nano from 'hw-app-nano';

import * as rx from 'rxjs';

import { ipcMain } from 'electron';

const STATUS_CODES = {
  SECURITY_STATUS_NOT_SATISFIED: 0x6982,
  CONDITIONS_OF_USE_NOT_SATISFIED: 0x6985,
  INVALID_SIGNATURE: 0x6a81,
  CACHE_MISS: 0x6a82
};

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
  resetLedger(errorMessage = '') {
    this.ledger.transport = null;
    this.ledger.nano = null;
    this.setLedgerStatus(LedgerStatus.NOT_CONNECTED, errorMessage);
  }

  // Open a connection to the usb device and initialize up the Nano Ledger library
  async loadTransport(bluetooth: boolean) {
    if (!bluetooth) {
      // The event-driven HID transport registers native USB hotplug callbacks.
      // Under Electron 44 these can fail with "Error in native callback" even
      // though the native usb and node-hid modules load successfully.
      //
      // For USB devices, enumerate and open the first Ledger HID device
      // directly. The no-events transport uses node-hid alone and does not
      // register USB hotplug listeners. Reconnect remains user-initiated.
      console.info('[Ledger diagnosis] Opening USB HID device (no-events transport)');
      let hidTransport;
      try {
        hidTransport = await TransportNodeHidNoEvents.open(null);
        console.info('[Ledger diagnosis] USB HID device opened');
      } catch (error) {
        console.error('[Ledger diagnosis] USB HID open failed:', error);
        throw error;
      }
      // Temporary instrumentation for Electron 44 / N-API compatibility:
      // record I/O stages without logging any HID packets, APDUs, or addresses.
      // Remove these wrappers once the failing native operation is identified.
      const device: any = hidTransport.device;
      const nativeWrite = device.write.bind(device);
      const nativeRead = device.read.bind(device);
      device.write = (data: number[]) => {
        console.info('[Ledger diagnosis] HID write starting');
        const result = nativeWrite(data);
        console.info('[Ledger diagnosis] HID write completed');
        return result;
      };
      device.read = (callback: (error: Error | null, data: number[]) => void) => {
        console.info('[Ledger diagnosis] HID async read starting');
        const result = nativeRead((error: Error | null, data: number[]) => {
          console.info('[Ledger diagnosis] HID async read callback invoked:', error ? 'error' : 'success');
          callback(error, data);
        });
        console.info('[Ledger diagnosis] HID async read registered');
        return result;
      };
      this.ledger.transport = hidTransport;
      this.ledger.nano = new Nano(hidTransport);
      console.info('[Ledger diagnosis] Nano application transport initialized');
      return hidTransport;
    }

    return new Promise((resolve, reject) => {
      // Keep the optional Bluetooth transport lazy-loaded and unchanged.
      const transport = require('@ledgerhq/hw-transport-node-ble').default;
      let found = false;
      const sub = transport.listen({
        next: async(e) => {
          found = true;
          if (sub) sub.unsubscribe();
          clearTimeout(timeoutId);
          this.ledger.transport = await transport.open(e.descriptor);
          this.ledger.nano = new Nano(this.ledger.transport);
          resolve(this.ledger.transport);
        },
        error: (e) => {
          clearTimeout(timeoutId);
          reject(e);
        },
        complete: () => {
          clearTimeout(timeoutId);
          if (!found) {
            reject(new Error(transport.ErrorMessage_NoDeviceFound));
          }
        }
      })

      const timeoutId = setTimeout(() => {
        sub.unsubscribe();
        reject(new Error(transport.ErrorMessage_ListenTimeout));
      }, this.waitTimeout);
    });
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
        this.setLedgerStatus(LedgerStatus.NOT_CONNECTED, `Unable to load Ledger transport: ${err.message || err}`);
        this.resetLedger();
        return false;
      }
    }

    let resolved = false;

    setTimeout(() => {
      if (resolved || this.ledger.status === LedgerStatus.READY) return;
      this.setLedgerStatus(LedgerStatus.NOT_CONNECTED, `Ledger device not detected`);
      this.resetLedger();
      resolved = true;
      return false;
    }, 3000);


    // Attempt to load account 0 - which confirms the app is unlocked and ready
    try {
      console.info('[Ledger diagnosis] Reading account 0 from Nano application');
      const accountDetails = await this.getLedgerAccount(0);
      console.info('[Ledger diagnosis] Account 0 read completed');
      this.setLedgerStatus(LedgerStatus.READY, `Ledger device ready`);
      resolved = true;

      if (!this.pollingLedger) {
        this.pollingLedger = true;
        this.pollLedgerStatus();
      }

      return true;
    } catch (err) {
      console.log(err);
      if (err.statusCode === STATUS_CODES.SECURITY_STATUS_NOT_SATISFIED) {
        this.setLedgerStatus(LedgerStatus.LOCKED, `Ledger device locked`);
      }
    }

    return false;
  }

  async getLedgerAccount(accountIndex, showOnScreen = false) {
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

      const data = { error: true, errorMessage: typeof err === 'string' ? err : err.message };
      this.ledgerMessage$.next({ event: 'account-details', data: Object.assign({ accountIndex }, data) });

      if (err.statusCode === STATUS_CODES.CONDITIONS_OF_USE_NOT_SATISFIED) {
        // This means they simply denied it...

        return; // We won't reset the ledger status in this instance
      }

      this.resetLedger(data.errorMessage); // Apparently ledger not working?
      throw err;
    }
  }

  async cacheBlock(accountIndex, cacheData, signature) {
    try {
      this.queryingLedger = true;
      const cacheResponse = await this.ledger.nano.cacheBlock(this.ledgerPath(accountIndex), cacheData, signature);
      this.queryingLedger = false;

      this.ledgerMessage$.next({ event: 'cache-block', data: Object.assign({ accountIndex }, cacheResponse) });
    } catch (err) {
      this.queryingLedger = false;

      const data = { error: true, errorMessage: typeof err === 'string' ? err : err.message };
      this.ledgerMessage$.next({ event: 'cache-block', data: Object.assign({ accountIndex }, data) });

      this.resetLedger(); // Apparently ledger not working?
    }
  }

  async signBlock(accountIndex, blockData) {
    try {
      this.queryingLedger = true;
      const signResponse = await this.ledger.nano.signBlock(this.ledgerPath(accountIndex), blockData);
      this.queryingLedger = false;

      this.ledgerMessage$.next({ event: 'sign-block', data: Object.assign({ accountIndex }, signResponse) });
    } catch (err) {
      this.queryingLedger = false;

      const data = { error: true, errorMessage: typeof err === 'string' ? err : err.message };
      this.ledgerMessage$.next({ event: 'sign-block', data: Object.assign({ accountIndex }, data) });

      this.resetLedger(); // Apparently ledger not working?
    }
  }

  setLedgerStatus(status, statusText = '') {
    this.ledger.status = status;
    this.ledgerStatus$.next({ status: this.ledger.status, statusText });
  }

  ledgerPath(accountIndex) {
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
      this.setLedgerStatus(LedgerStatus.READY);
    } catch (err) {
      if (err.statusCode === STATUS_CODES.SECURITY_STATUS_NOT_SATISFIED) {
        this.setLedgerStatus(LedgerStatus.LOCKED, `Ledger device locked`);
      } else {
        this.setLedgerStatus(LedgerStatus.NOT_CONNECTED, `Ledger Disconnected: ${err.message || err }`);
      }
      this.pollingLedger = false;
    }
  }
}

let sendingWindow = null;

// Create a copy of the ledger service and register listeners with the browser window
export function initialize() {
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

  // Listen for new messages from the browser window and dispatch accordingly
  ipcMain.on('ledger', (event, data) => {
    console.log(`Got ledger message?!`, data);
    sendingWindow = event.sender;
    if (!data || !data.event) return;
    switch (data.event) {
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
