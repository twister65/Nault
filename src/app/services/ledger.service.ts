import { Injectable } from '@angular/core';
import Nano from 'hw-app-nano';
import TransportUSB from '@ledgerhq/hw-transport-webusb';
import TransportHID from '@ledgerhq/hw-transport-webhid';
import TransportBLE from './ledger-web-ble';
import { handleLedgerBleControl } from './ledger-ble-control';
import Transport from '@ledgerhq/hw-transport';
import {Subject} from 'rxjs';
import {ApiService} from './api.service';
import {NotificationService} from './notification.service';
import { environment } from '../../environments/environment';
import {DesktopService} from './desktop.service';
import { AppSettingsService } from './app-settings.service';

export const STATUS_CODES = {
  SECURITY_STATUS_NOT_SATISFIED: 0x6982,
  DEVICE_LOCKED: 0x5515,
  NANO_APP_NOT_OPEN: 0x6e01,
  CONDITIONS_OF_USE_NOT_SATISFIED: 0x6985,
  INVALID_SIGNATURE: 0x6a81,
  CACHE_MISS: 0x6a82
};

export const LedgerStatus = {
  NOT_CONNECTED: 'not-connected',
  LOCKED: 'locked',
  READY: 'ready',
};

// Not a rejected transaction: the device cannot currently sign a receive block.
export class LedgerNotReadyError extends Error {
  constructor() {
    super('Ledger is not ready. Unlock your Ledger, open the Nano app, then click Reconnect.');
    this.name = 'LedgerNotReadyError';
  }
}


export interface LedgerData {
  status: string;
  nano: any|null;
  transport: Transport|null;
}

export interface LedgerLog {
  type: string;
  message?: string;
  data?: any;
  id: string;
  date: Date;
}

// Preserve the legacy Ledger status/error codes while narrowing unknown values
// from native transports and browser APIs. This helper never calls the device.
function ledgerErrorFields(error: unknown): {
  name?: unknown;
  message?: unknown;
  id?: unknown;
  statusCode?: unknown;
  statusText?: unknown;
} {
  return error !== null && typeof error === 'object'
    ? error as {name?: unknown; message?: unknown; id?: unknown; statusCode?: unknown; statusText?: unknown}
    : {};
}

// Only these known APDU responses identify an unavailable device/app.
// Preserve other transport errors, including user-denied signatures, unchanged.
export function getLedgerReadinessIssue(error: unknown): 'locked' | 'app-not-open' | null {
  const detail = ledgerErrorFields(error);
  const message = String(detail.message || '');
  if (detail.statusCode === STATUS_CODES.DEVICE_LOCKED || /0x5515\b/i.test(message)) return 'locked';
  if (detail.statusCode === STATUS_CODES.NANO_APP_NOT_OPEN || /0x6e01\b/i.test(message)) return 'app-not-open';
  return null;
}

function ledgerReadinessMessage(issue: 'locked' | 'app-not-open'): string {
  return issue === 'locked'
    ? 'Ledger locked. Unlock your Ledger, open the Nano app, then click Reconnect.'
    : 'Nano app is not open on your Ledger. Open the Nano app, then click Reconnect.';
}

// This app uses Web Bluetooth, rather than experimental WebUSB, on Android browsers.
export function isAndroidBrowser(userAgent: string): boolean {
  return /\bAndroid\b/i.test(userAgent || '');
}

const zeroBlock = '0000000000000000000000000000000000000000000000000000000000000000';

@Injectable()
export class LedgerService {
  walletPrefix = `44'/165'/`;

  waitTimeout = 30000;
  pollInterval = 5000;

  pollingLedger = false;

  ledger: LedgerData = {
    status: LedgerStatus.NOT_CONNECTED,
    nano: null,
    transport: null,
  };

  // isDesktop = true;
  isDesktop = environment.desktop;
  readonly isAndroidWeb = !this.isDesktop && typeof navigator !== 'undefined' && isAndroidBrowser(navigator.userAgent);
  // WalletService supplies the expected account without injecting it here (avoids a service cycle).
  configuredWalletAccount: (() => { index: number; id: string } | null) | null = null;
  // The explicit setup screen may select a different physical device.
  configuringWallet = false;

  async verifyConnectedWallet(): Promise<void> {
    if (this.configuringWallet) return;
    const expected = this.configuredWalletAccount?.();
    if (!expected) return;
    const account = await this.getLedgerAccount(expected.index);
    if (account.address.replace(/^xrb_/, 'nano_') !== expected.id) {
      throw new Error('Ledger does not match the configured wallet.');
    }
  }

  private reportWalletMismatch(): void {
    const message = 'Ledger does not match the configured wallet.';
    this.resetLedger();
    this.ledger.status = LedgerStatus.NOT_CONNECTED;
    this.ledgerStatus$.next({ status: this.ledger.status, statusText: message });
    this.notifications.sendWarning(message, { identifier: 'ledger-wallet-mismatch', length: 10000 });
  }

  // Browser USB/HID selection can be dismissed by the user without a
  // transport error. Setup must not show a misleading connection failure.
  lastUsbSelectionCancelled = false;

  queryingDesktopLedger = false;
  private bluetoothConnecting = false;
  private bluetoothGeneration = 0;
  private pendingReconnectNotified = false;
  // Human-readable pairing advice for the Configure Wallet flow (not a raw native error).
  bluetoothErrorMessage = '';

  // Incoming funds remain pending on the network until the Ledger can sign.
  // Show a single persistent instruction instead of a toast per WebSocket block.
  notifyPendingReconnect(): void {
    if (this.pendingReconnectNotified) return;
    this.pendingReconnectNotified = true;
    this.notifications.sendWarning(
      'Incoming XNO is waiting. Unlock your Ledger, open the Nano app, then click Reconnect to receive it.',
      { identifier: 'ledger-pending-reconnect', length: 0 }
    );
  }

  clearPendingReconnect(): void {
    if (!this.pendingReconnectNotified) return;
    this.pendingReconnectNotified = false;
    this.notifications.removeNotification('ledger-pending-reconnect');
  }

  // These errors indicate that the Nano app is unavailable, not a denied payment.
  isUnavailableError(err: any): boolean {
    if (this.ledger.status !== LedgerStatus.READY || err instanceof LedgerNotReadyError) return true;
    const message = String((err && err.message) || err || '');
    return getLedgerReadinessIssue(err) !== null ||
      /Cannot read properties of null \(reading '(?:cacheBlock|signBlock)'\)/i.test(message);
  }

  handleUnavailableReceive(): void {
    if (this.ledger.status === LedgerStatus.READY) {
      this.ledger.status = LedgerStatus.NOT_CONNECTED;
      this.ledgerStatus$.next({
        status: LedgerStatus.NOT_CONNECTED,
        statusText: 'Ledger is not ready. Unlock it, open the Nano app and reconnect.'
      });
    }
    this.notifyPendingReconnect();
  }

  private async requireReadyForSigning(): Promise<void> {
    if (this.configuringWallet) throw new LedgerNotReadyError();
    if (this.ledger.status !== LedgerStatus.READY) {
      await this.loadLedger(true);
    }
    if (this.ledger.status !== LedgerStatus.READY) throw new LedgerNotReadyError();
  }

  get usesDesktopUsb() {
    return this.isDesktop && this.transportMode !== 'Bluetooth';
  }

  supportsWebHID = false;
  supportsWebUSB = false;
  supportsBluetooth = false;
  supportsUSB = false;

  transportMode: 'USB' | 'HID' | 'Bluetooth' = 'USB';
  DynamicTransport: typeof TransportUSB | typeof TransportHID | typeof TransportBLE = TransportUSB;

  ledgerStatus$: Subject<{ status: string, statusText: string }> = new Subject();
  desktopMessage$ = new Subject();

  constructor(private api: ApiService,
              private desktop: DesktopService,
              private notifications: NotificationService,
              private appSettings: AppSettingsService) {
    if (this.isDesktop) {
      this.configureDesktop();
    } else {
      this.checkBrowserSupport().then(() => {
        // Android web builds always use Bluetooth when available; never fall back to USB.
        if (this.supportsBluetooth && (this.isAndroidWeb || appSettings.getAppSetting('ledgerReconnect') === 'bluetooth')) {
          this.enableBluetoothMode(true);
        }
      });
    }
  }

  // Scraps binding to any existing transport/nano object
  resetLedger() {
    const transport = this.ledger.transport;
    this.ledger.transport = null;
    this.ledger.nano = null;
    this.pollingLedger = false;
    this.bluetoothGeneration++;
    if (transport) {
      Promise.resolve(transport.close()).catch(() => {});
    }
  }

  /**
   * Prepare the main listener for events from the desktop client.
   * Dispatches new messages via the main Observables
   */
  configureDesktop() {
    this.desktop.connect();
    this.desktop.on('ledger', (event, message) => {
      if (!message || !message.event || !this.usesDesktopUsb) return;
      switch (message.event) {
        case 'ledger-status':
          if (message.data.status === LedgerStatus.READY && !this.configuringWallet) {
            // Desktop USB also requires device/account matching before exposing READY.
            this.ledger.status = LedgerStatus.NOT_CONNECTED;
            void this.verifyConnectedWallet().then(() => {
              this.ledger.status = LedgerStatus.READY;
              this.ledgerStatus$.next({ status: LedgerStatus.READY, statusText: message.data.statusText });
            }).catch((error) => {
              if ((error as Error)?.message === 'Ledger does not match the configured wallet.') {
                this.reportWalletMismatch();
              } else {
                this.ledger.status = LedgerStatus.NOT_CONNECTED;
                this.ledgerStatus$.next({ status: this.ledger.status, statusText: String(error) });
              }
            });
          } else {
            this.ledger.status = message.data.status;
            this.ledgerStatus$.next({ status: message.data.status, statusText: message.data.statusText });
          }
          break;

        case 'account-details':
        case 'cache-block':
        case 'sign-block':
          this.desktopMessage$.next(message);
          break;
      }
    });
    this.supportsUSB = true;
    TransportBLE.isSupported().then(supported => {
      this.supportsBluetooth = supported;
      if (supported && this.appSettings.getAppSetting('ledgerReconnect') === 'bluetooth') {
        this.enableBluetoothMode(true);
      }
    });
  }

  /**
   * Check which transport protocols are supported by the browser
   */
  async checkBrowserSupport() {
    await Promise.all([
      TransportHID.isSupported().then(supported => this.supportsWebHID = supported),
      TransportUSB.isSupported().then(supported => this.supportsWebUSB = supported),
      TransportBLE.isSupported().then(supported => this.supportsBluetooth = supported),
    ]);
    this.supportsUSB = !this.isAndroidWeb && (this.supportsWebHID || this.supportsWebUSB);
  }

  /**
   * Detect the optimal USB transport protocol for the current browser and OS
   */
  detectUsbTransport() {
    if (this.supportsWebUSB) {
      // Prefer WebUSB
      this.transportMode = 'USB';
      this.DynamicTransport = TransportUSB;
    } else if (this.supportsWebHID) {
      // Fallback to WebHID
      this.transportMode = 'HID';
      this.DynamicTransport = TransportHID;
    } else {
      // No supported browser USB transport (U2F has been retired).
      // The UI disables USB; loadLedger() must not open the fallback.
      this.transportMode = 'USB';
      this.DynamicTransport = TransportUSB;
    }
  }

  /**
   * Enable or disable bluetooth communication, if supported
   * @param enabled   The bluetooth enabled state
   */
  enableBluetoothMode(enabled: boolean) {
    // Disallow accidental USB selection from old wallet state or indirect UI paths.
    if (this.isAndroidWeb && !enabled) return;
    if ((this.transportMode === 'Bluetooth') !== enabled) {
      this.resetLedger();
      this.ledger.status = LedgerStatus.NOT_CONNECTED;
      if (this.isDesktop) this.desktop.send('ledger', { event: 'disconnect' });
    }
    if (this.supportsBluetooth && enabled) {
      this.transportMode = 'Bluetooth';
      this.DynamicTransport = TransportBLE;
      // Remember an explicit Bluetooth selection even if first-time pairing
      // fails. Otherwise restarting Nault silently falls back to native USB,
      // and clicking Reconnect reports the misleading "NoDevice" error.
      if (this.isDesktop) this.appSettings.setAppSetting('ledgerReconnect', 'bluetooth');
    } else {
      this.detectUsbTransport();
      // An explicit switch back to USB must also update the saved mode.
      if (this.isDesktop && !enabled) this.appSettings.setAppSetting('ledgerReconnect', 'usb');
    }
  }

  /**
   * Get the next response coming from the desktop client for a specific event/filter
   * @param eventType
   * @param {any} filterFn
   * @returns {Promise<any>}
   */
  async getDesktopResponse(eventType: string, filterFn?: (data: {accountIndex: number}) => boolean): Promise<any> {
    return new Promise((resolve, reject) => {
      const sub = this.desktopMessage$
        .subscribe((response: any) => {
          // Listen to all desktop messages until one passes our filters
          if (response.event !== eventType) {
            return; // Not the event we want.
          }

          if (filterFn) {
            const shouldSkip = filterFn(response.data); // This function should return boolean
            if (!shouldSkip) return; // This is not the message the subscriber wants
          }

          sub.unsubscribe(); // This is a message we want, safe to unsubscribe to further messages now.

          if (response.data && response.data.error === true) {
            return reject(new Error(response.data.errorMessage)); // Request failed!
          }

          resolve(response.data);
        }, err => {
          console.log(`Desktop message got error!`, err);
          reject(err);
        });
    });

  }



  async getLedgerAccountDesktop(accountIndex: number, showOnScreen: boolean) {
    if (this.queryingDesktopLedger) {
      throw new Error(`Already querying desktop device, please wait`);
    }
    this.queryingDesktopLedger = true;

    this.desktop.send('ledger', { event: 'account-details', data: { accountIndex, showOnScreen } });

    try {
      const details = await this.getDesktopResponse('account-details', a => a.accountIndex === accountIndex);
      this.queryingDesktopLedger = false;

      return details;
    } catch (err) {
      this.queryingDesktopLedger = false;
      throw err;
    }
  }

  async updateCacheDesktop(accountIndex: number, cacheData: unknown, signature: string) {
    if (this.queryingDesktopLedger) {
      throw new Error(`Already querying desktop device, please wait`);
    }
    this.queryingDesktopLedger = true;

    this.desktop.send('ledger', { event: 'cache-block', data: { accountIndex, cacheData, signature } });

    try {
      const details = await this.getDesktopResponse('cache-block', a => a.accountIndex === accountIndex);
      this.queryingDesktopLedger = false;

      return details;
    } catch (err) {
      this.queryingDesktopLedger = false;
      throw new Error(`Error caching block: ${ledgerErrorFields(err).message ?? err}`);
    }
  }

  async signBlockDesktop(accountIndex: number, blockData: unknown) {
    if (this.queryingDesktopLedger) {
      throw new Error(`Already querying desktop device, please wait`);
    }
    this.queryingDesktopLedger = true;

    this.desktop.send('ledger', { event: 'sign-block', data: { accountIndex, blockData } });

    try {
      const details = await this.getDesktopResponse('sign-block', a => a.accountIndex === accountIndex);
      this.queryingDesktopLedger = false;

      return details;
    } catch (err) {
      this.queryingDesktopLedger = false;
      throw new Error(`Error signing block: ${ledgerErrorFields(err).message ?? err}`);
    }
  }

  async loadTransport() {
    return new Promise((resolve, reject) => {
      this.DynamicTransport.create(3000, this.waitTimeout).then(trans => {

        // LedgerLogs.listen((log: LedgerLog) => console.log(`Ledger: ${log.type}: ${log.message}`));
        this.ledger.transport = trans;
        this.ledger.nano = new Nano(this.ledger.transport);

        resolve(this.ledger.transport);
      }).catch(reject);
    });
  }


  /**
   * Main ledger loading function.  Can be called multiple times to attempt a reconnect.
   * @param {boolean} hideNotifications
   * @returns {Promise<any>}
   */
  async loadLedger(hideNotifications = false, forceBluetoothReconnect = false) {
    this.lastUsbSelectionCancelled = false;
    if (this.isAndroidWeb && this.transportMode !== 'Bluetooth') {
      this.ledger.status = LedgerStatus.NOT_CONNECTED;
      this.ledgerStatus$.next({
        status: this.ledger.status,
        statusText: 'USB Ledger connection is disabled on Android. Connect via Bluetooth.'
      });
      return false;
    }
    if (this.transportMode === 'Bluetooth') return this.loadWebBluetooth(hideNotifications, forceBluetoothReconnect);
    return new Promise(async (resolve, reject) => {

      // Desktop uses native HID, not the browser transports.
      if (!this.isDesktop && !this.supportsWebUSB && !this.supportsWebHID) {
        this.ledger.status = LedgerStatus.NOT_CONNECTED;
        const message = 'USB Ledger connection requires WebUSB or WebHID. Use a supported browser or connect via Bluetooth.';
        this.ledgerStatus$.next({ status: this.ledger.status, statusText: message });
        if (!hideNotifications) this.notifications.sendWarning(message);
        return resolve(false);
      }

      // Desktop is handled completely differently.  Send a message for status instead of setting anything up
      if (this.isDesktop) {
        if (!this.desktop.send('ledger', { event: 'get-ledger-status', data: { bluetooth: this.transportMode === 'Bluetooth' } })) {
          reject(new Error(`Electron\'s IPC was not loaded`));
        }

        // Any response will be handled by the configureDesktop() function, which pipes responses into this observable
        const sub = this.ledgerStatus$.subscribe(newStatus => {
          if (newStatus.status === LedgerStatus.READY) {
            resolve(true);
          } else if (newStatus.statusText.includes('No compatible USB Bluetooth 4.0 device found') || newStatus.statusText.includes('Could not start scanning')) {
            this.supportsBluetooth = false;
            reject(newStatus.statusText);
          } else {
            reject(new Error(newStatus.statusText || `Unable to load desktop Ledger device`));
          }
          sub.unsubscribe();
        }, reject);
        return;
      }

      if (!this.ledger.transport) {

        // If in USB mode, detect best transport option
        if (this.transportMode !== 'Bluetooth') {
          this.detectUsbTransport();
          this.appSettings.setAppSetting('ledgerReconnect', 'usb');
        } else {
          this.appSettings.setAppSetting('ledgerReconnect', 'bluetooth');
        }

        try {
          await this.loadTransport();
        } catch (err) {
          const detail = ledgerErrorFields(err);
          // Ledger WebUSB/WebHID wraps a dismissed browser picker in this error.
          this.lastUsbSelectionCancelled = detail.name === 'TransportOpenUserCancelled';
          if (!this.lastUsbSelectionCancelled) {
            console.log(`Error loading ${this.transportMode} transport `, err);
            this.ledger.status = LedgerStatus.NOT_CONNECTED;
            this.ledgerStatus$.next({ status: this.ledger.status, statusText: `Unable to load Ledger transport: ${detail.message || err}` });
            if (!hideNotifications) {
              this.notifications.sendWarning(`Ledger connection failed. Make sure your Ledger is unlocked.  Restart the nano app on your Ledger if the error persists`);
            }
          }
          this.resetLedger();
          resolve(false);
        }
      }

      if (!this.ledger.transport || !this.ledger.nano) {
        return resolve(false);
      }

      let resolved = false;

      // Set up a timeout when things are not ready
      setTimeout(() => {
        if (resolved) return;
        console.log(`Timeout expired, sending not connected`);
        this.ledger.status = LedgerStatus.NOT_CONNECTED;
        this.ledgerStatus$.next({ status: this.ledger.status, statusText: `Unable to detect Nano Ledger application (Timeout)` });
        if (!hideNotifications) {
          this.notifications.sendWarning(`Unable to connect to the Ledger device.  Make sure it is unlocked and the nano application is open`);
        }
        resolved = true;
        return resolve(false);
      }, 10000);

      // Try to load the app config
      try {
        const ledgerConfig = await this.ledger.nano.getAppConfiguration();
        resolved = true;

        if (!ledgerConfig) return resolve(false);
      } catch (err) {
        const detail = ledgerErrorFields(err);
        console.log(`App config error: `, err);
        this.ledger.status = LedgerStatus.NOT_CONNECTED;
        this.ledgerStatus$.next({ status: this.ledger.status, statusText: `Unable to load Nano App configuration: ${detail.message || err}` });
        if (detail.statusText === 'HALTED') {
          this.resetLedger();
        }
        if (!hideNotifications && !resolved) {
          this.notifications.sendWarning(`Unable to connect to the Ledger device.  Make sure your Ledger is unlocked.  Restart the nano app on your Ledger if the error persists`);
        }
        resolved = true;
        return resolve(false);
      }

      // Attempt to load account 0 - which confirms the app is unlocked and ready
      try {
        const accountDetails = await this.getLedgerAccount(0);
        await this.verifyConnectedWallet();
        this.ledger.status = LedgerStatus.READY;
        this.ledgerStatus$.next({ status: this.ledger.status, statusText: `Nano Ledger application connected` });

        if (!this.pollingLedger) {
          this.pollingLedger = true;
          this.pollLedgerStatus();
        }
      } catch (err) {
        if ((err as Error)?.message === 'Ledger does not match the configured wallet.') {
          this.reportWalletMismatch();
          return resolve(false);
        }
        console.log(`Error on account details: `, err);
        if (ledgerErrorFields(err).statusCode === STATUS_CODES.SECURITY_STATUS_NOT_SATISFIED) {
          this.ledger.status = LedgerStatus.LOCKED;
          if (!hideNotifications) {
            this.notifications.sendWarning(`Ledger device locked.  Unlock and open the nano application`);
          }
        }
      }

      resolve(true);
    }).catch(err => {
      console.log(`error when loading ledger `, err);
      if (!hideNotifications) {
        if (this.isUnavailableError(err)) {
          this.notifications.sendWarning('Ledger unavailable. Unlock your Ledger, open the Nano app, then click Reconnect.', { identifier: 'ledger-connection-help', length: 10000 });
        } else {
          this.notifications.sendWarning(`Error loading Ledger device: ${typeof err === 'string' ? err : err.message}`, { length: 6000 });
        }
      }

      return null;
    });

  }

  private async loadWebBluetooth(hideNotifications: boolean, forceReconnect = false) {
    if (this.bluetoothConnecting) return false;
    this.bluetoothErrorMessage = '';
    // Explicit user reconnect always discards the old session, even if Chromium
    // still reports GATT connected after a dropped radio link.
    if (forceReconnect && this.ledger.transport) {
      // Close the previous GATT session before Chromium starts a new one.
      // resetLedger() normally closes in the background; that can race
      // with requestDevice() and the next MTU negotiation.
      const staleTransport = this.ledger.transport;
      this.ledger.transport = null;
      this.ledger.nano = null;
      this.pollingLedger = false;
      this.bluetoothGeneration++;
      this.ledger.status = LedgerStatus.NOT_CONNECTED;
      try {
        await staleTransport.close();
        console.info('[Ledger BLE] previous GATT session closed before reconnect');
      } catch (error) {
        console.warn('[Ledger BLE] previous GATT close failed', error);
      }
    }
    // Device selection requires a deliberate click, including after disconnect.
    const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
    if (!this.ledger.transport && activation && !activation.isActive) {
      this.ledger.status = LedgerStatus.NOT_CONNECTED;
      this.ledgerStatus$.next({ status: this.ledger.status, statusText: 'Click Reconnect to select your Ledger via Bluetooth.' });
      return false;
    }
    // Never reuse a dead GATT session, including when a disconnect event
    // was missed and the UI still reports READY.
    const previous = this.ledger.transport as TransportBLE | null;
    if (previous && (this.ledger.status !== LedgerStatus.READY ||
        !previous.device || !previous.device.gatt || !previous.device.gatt.connected)) {
      this.resetLedger();
      this.ledger.status = LedgerStatus.NOT_CONNECTED;
    }
    this.bluetoothConnecting = true;
    console.info('[Ledger BLE] reconnect started', { forceReconnect, hadTransport: !!previous });
    const generation = this.bluetoothGeneration;
    let timeout;
    let active = true;
    const connect = async () => {
      if (!this.ledger.transport) {
        console.info('[Ledger BLE] requesting device and opening GATT');
        const transport = await TransportBLE.create(90000, 60000) as TransportBLE;
        console.info('[Ledger BLE] GATT and MTU ready');
        if (!active || generation !== this.bluetoothGeneration) {
          await transport.close();
          throw new Error('Bluetooth connection cancelled');
        }
        handleLedgerBleControl(transport);
        this.ledger.transport = transport;
        this.ledger.nano = new Nano(transport);
        transport.on('disconnect', () => {
          if (this.ledger.transport !== transport) return;
          this.resetLedger();
          this.ledger.status = LedgerStatus.NOT_CONNECTED;
          this.ledgerStatus$.next({ status: this.ledger.status, statusText: 'Ledger Bluetooth disconnected. Click Reconnect.' });
        });
      }
      console.info('[Ledger BLE] reading Nano app configuration');
      await this.ledger.nano.getAppConfiguration();
      console.info('[Ledger BLE] reading account address');
      await this.ledger.nano.getAddress(this.ledgerPath(0), false);
      await this.verifyConnectedWallet();
      console.info('[Ledger BLE] account address read successfully');
    };
    try {
      await Promise.race([
        connect(),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Bluetooth connection timed out')), 90000); })
      ]);
      if (generation !== this.bluetoothGeneration) return false;
      console.info('[Ledger BLE] reconnect successful');
      this.bluetoothErrorMessage = '';
      this.notifications.removeNotification('ledger-connection-help');
      this.appSettings.setAppSetting('ledgerReconnect', 'bluetooth');
      this.ledger.status = LedgerStatus.READY;
      this.ledgerStatus$.next({ status: this.ledger.status, statusText: 'Nano Ledger application connected via Bluetooth' });
      if (!this.pollingLedger) {
        this.pollingLedger = true;
        this.pollLedgerStatus();
      }
      return true;
    } catch (error) {
      console.error('[Ledger BLE] reconnect failed', error);
      const failure = ledgerErrorFields(error);
      if (generation !== this.bluetoothGeneration) return false;
      if ((error as Error)?.message === 'Ledger does not match the configured wallet.') {
        this.reportWalletMismatch();
        return false;
      }
      this.resetLedger();
      const readinessIssue = getLedgerReadinessIssue(error);
      this.ledger.status = readinessIssue === 'locked' ? LedgerStatus.LOCKED : LedgerStatus.NOT_CONNECTED;
      const detail = String(failure.message || error || '');
      const adapterUnavailable = failure.name === 'TransportOpenUserCancelled' &&
        /bluetooth adapter not available|adapter not available|bluetooth unavailable|bluetooth is disabled/i.test(detail);
      const pairingAdvice = 'Ledger Nano X Bluetooth authentication failed. Your device may not be paired correctly. ' +
        'Re-pair it in your computer Bluetooth settings (Linux: bluetoothctl), then click Reconnect.';
      const authenticationFailed = failure.name === 'LedgerBluetoothAuthenticationError' ||
        /pin or key missing|authentication failed/i.test(detail);
      const possiblePairing = failure.name === 'DisconnectedDevice' &&
        /pairing may be missing or invalid/i.test(detail);
      if (readinessIssue) this.bluetoothErrorMessage = ledgerReadinessMessage(readinessIssue);
      else if (authenticationFailed) this.bluetoothErrorMessage = pairingAdvice;
      else if (possiblePairing) this.bluetoothErrorMessage = detail;
      const message = adapterUnavailable
        ? 'Bluetooth unavailable. Check Bluetooth on your computer and Ledger, or choose Reconnect via USB.'
        : failure.name === 'TransportOpenUserCancelled'
          ? 'Bluetooth selection cancelled'
          : this.bluetoothErrorMessage || `Bluetooth connection failed: ${detail}`;
      this.ledgerStatus$.next({ status: this.ledger.status, statusText: message });
      if (!hideNotifications) {
        this.notifications.sendWarning(message, readinessIssue
          ? { identifier: 'ledger-connection-help', length: 10000 }
          : undefined);
      }
      return false;
    } finally {
      active = false;
      clearTimeout(timeout);
      this.bluetoothConnecting = false;
    }
  }

  async updateCache(accountIndex: number, blockHash: string) {
    await this.requireReadyForSigning();
    const blockResponse = await this.api.blocksInfo([blockHash]);
    const blockData = blockResponse.blocks[blockHash];
    if (!blockData) throw new Error(`Unable to load block data`);
    blockData.contents = JSON.parse(blockData.contents);

    const cacheData = {
      representative: blockData.contents.representative,
      balance: blockData.contents.balance,
      previousBlock: blockData.contents.previous === zeroBlock ? null : blockData.contents.previous,
      sourceBlock: blockData.contents.link,
    };

    if (this.usesDesktopUsb) {
      return await this.updateCacheDesktop(accountIndex, cacheData, blockData.contents.signature);
    } else {
      return await this.ledger.nano.cacheBlock(this.ledgerPath(accountIndex), cacheData, blockData.contents.signature);
    }
  }

  async updateCacheOffline(accountIndex: number, blockData: {representative: string; balance: string; previous: string; link: string; signature: string}) {
    await this.requireReadyForSigning();

    const cacheData = {
      representative: blockData.representative,
      balance: blockData.balance,
      previousBlock: blockData.previous === zeroBlock ? null : blockData.previous,
      sourceBlock: blockData.link,
    };

    if (this.usesDesktopUsb) {
      return await this.updateCacheDesktop(accountIndex, cacheData, blockData.signature);
    } else {
      return await this.ledger.nano.cacheBlock(this.ledgerPath(accountIndex), cacheData, blockData.signature);
    }
  }

  async signBlock(accountIndex: number, blockData: any) {
    await this.requireReadyForSigning();
    if (this.usesDesktopUsb) {
      return await this.signBlockDesktop(accountIndex, blockData);
    } else {
      return await this.ledger.nano.signBlock(this.ledgerPath(accountIndex), blockData);
    }
  }

  ledgerPath(accountIndex: number) {
    return `${this.walletPrefix}${accountIndex}'`;
  }

  async getLedgerAccountWeb(accountIndex: number, showOnScreen = false) {
    try {
      return await this.ledger.nano.getAddress(this.ledgerPath(accountIndex), showOnScreen);
    } catch (err) {
      throw err;
    }
  }

  async getLedgerAccount(accountIndex: number, showOnScreen = false) {
    if (this.usesDesktopUsb) {
      return await this.getLedgerAccountDesktop(accountIndex, showOnScreen);
    } else {
      return await this.getLedgerAccountWeb(accountIndex, showOnScreen);
    }
  }

  pollLedgerStatus() {
    if (!this.pollingLedger) return;
    const generation = this.bluetoothGeneration;
    setTimeout(async () => {
      if (!this.pollingLedger || generation !== this.bluetoothGeneration) return;
      await this.checkLedgerStatus();
      if (generation !== this.bluetoothGeneration) return;
      this.pollLedgerStatus();
    }, this.pollInterval);
  }

  async checkLedgerStatus() {
    if (this.ledger.status !== LedgerStatus.READY) {
      return;
    }

    const generation = this.bluetoothGeneration;
    let statusText = '';
    try {
      const accountDetails = await this.getLedgerAccount(0);
      if (this.configuringWallet) return;
      await this.verifyConnectedWallet();
      if (generation !== this.bluetoothGeneration) return;
      this.ledger.status = LedgerStatus.READY;
    } catch (err) {
      if (generation !== this.bluetoothGeneration) return;
      const failure = ledgerErrorFields(err);
      // App methods hold TransportLocked throughout device confirmation;
      // exchange-level contention uses TransportRaceCondition. Neither means
      // the device disconnected: resetting here interrupts the pending signature.
      if (failure.name === 'TransportRaceCondition' || failure.id === 'TransportRaceCondition' ||
          failure.id === 'TransportLocked') return;
      if ((err as Error)?.message === 'Ledger does not match the configured wallet.') {
        this.reportWalletMismatch();
        return;
      }
      console.log('Check ledger status failed ', JSON.stringify(err));
      const readinessIssue = getLedgerReadinessIssue(err);
      if (failure.statusCode === STATUS_CODES.SECURITY_STATUS_NOT_SATISFIED || readinessIssue === 'locked') {
        this.ledger.status = LedgerStatus.LOCKED;
      } else {
        this.ledger.status = LedgerStatus.NOT_CONNECTED;
      }
      if (readinessIssue) {
        statusText = ledgerReadinessMessage(readinessIssue);
        this.notifications.sendWarning(statusText, { identifier: 'ledger-connection-help', length: 10000 });
      }
      this.pollingLedger = false;
      this.resetLedger();
    }

    this.ledgerStatus$.next({ status: this.ledger.status, statusText });
  }



}
