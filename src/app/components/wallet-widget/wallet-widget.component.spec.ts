import { ComponentTestModule, isolateConstructorIO } from '../../../testing/component-test.module';
import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { WalletWidgetComponent } from './wallet-widget.component';

describe('WalletWidgetComponent', () => {
  let component: WalletWidgetComponent;
  let fixture: ComponentFixture<WalletWidgetComponent>;

  beforeEach(waitForAsync(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(WalletWidgetComponent);
    component = fixture.componentInstance;
    // Constructor smoke test; lifecycle scenarios supply explicit inputs and I/O mocks.
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
  it('never shows Ledger ready after the shared device status was reset without an event', () => {
    const ledger = component.ledgerService.ledger;
    const initialStatus = ledger.status;
    try {
      ledger.status = 'ready';
      (component as any).lastReportedLedgerStatus = {
        status: 'ready', statusText: 'Nano Ledger application connected'
      };
      expect(component.ledgerStatus.status).toBe('ready');

      // Configuring another wallet changes the service before the status event.
      ledger.status = 'not-connected';
      expect(component.ledgerStatus.status).toBe('not-connected');
      expect(component.ledgerStatus.statusText).toBe('');
    } finally {
      ledger.status = initialStatus;
    }
  });

  it('uses the authoritative ready status even when the previous event was disconnected', () => {
    const ledger = component.ledgerService.ledger;
    const initialStatus = ledger.status;
    try {
      (component as any).lastReportedLedgerStatus = {
        status: 'not-connected', statusText: 'Ledger disconnected'
      };
      ledger.status = 'ready';
      expect(component.ledgerStatus.status).toBe('ready');
      expect(component.ledgerStatus.statusText).toBe('');
    } finally {
      ledger.status = initialStatus;
    }
  });

  it('shows the USB reconnect label in a ChromeOS PWA with a Nano S Plus', () => {
    component.ledgerService.isDesktop = false;
    component.ledgerService.transportMode = 'USB';
    expect(component.reconnectTransportTranslationKey).toBe('ui-ledger.reconnect-via-usb');
  });

  it('also shows USB for a WebHID fallback', () => {
    component.ledgerService.isDesktop = false;
    component.ledgerService.transportMode = 'HID';
    expect(component.reconnectTransportTranslationKey).toBe('ui-ledger.reconnect-via-usb');
  });

  it('keeps the Bluetooth label for a Nano X using Web Bluetooth', () => {
    component.ledgerService.isDesktop = false;
    component.ledgerService.transportMode = 'Bluetooth';
    expect(component.reconnectTransportTranslationKey).toBe('ui-ledger.reconnect-via-bluetooth');
  });

  it('exposes both USB and Bluetooth reconnect links on a ChromeOS PWA that supports both', () => {
    component.ledgerService.isDesktop = false;
    component.ledgerService.supportsUSB = true;
    component.ledgerService.supportsBluetooth = true;
    component.ledgerService.transportMode = 'USB';
    expect(component.canReconnectUsb).toBeTrue();
    expect(component.canReconnectBluetooth).toBeTrue();
    component.ledgerService.transportMode = 'Bluetooth';
    expect(component.canReconnectUsb).toBeTrue();
    expect(component.canReconnectBluetooth).toBeTrue();
  });

  it('only offers USB reconnect when a saved Nano S Plus has no Bluetooth hardware', () => {
    const oldModel = component.walletService.wallet.ledgerDeviceModel;
    const oldUsb = component.ledgerService.supportsUSB;
    const oldBluetooth = component.ledgerService.supportsBluetooth;
    try {
      component.ledgerService.supportsUSB = true;
      component.ledgerService.supportsBluetooth = true; // browser supports it, device does not
      component.walletService.wallet.ledgerDeviceModel = 'nanoSPlus';
      expect(component.canReconnectUsb).toBeTrue();
      expect(component.canReconnectBluetooth).toBeFalse();
      component.walletService.wallet.ledgerDeviceModel = 'nanoX';
      expect(component.canReconnectBluetooth).toBeTrue();
      component.walletService.wallet.ledgerDeviceModel = null; // legacy exports
      expect(component.canReconnectBluetooth).toBeTrue();
    } finally {
      component.walletService.wallet.ledgerDeviceModel = oldModel;
      component.ledgerService.supportsUSB = oldUsb;
      component.ledgerService.supportsBluetooth = oldBluetooth;
    }
  });

  it('hides Bluetooth on Windows and Linux Desktop after native HID identifies Nano S Plus', () => {
    const oldModel = component.walletService.wallet.ledgerDeviceModel;
    const oldDesktop = component.ledgerService.isDesktop;
    const oldUsb = component.ledgerService.supportsUSB;
    const oldBluetooth = component.ledgerService.supportsBluetooth;
    try {
      component.ledgerService.isDesktop = true;
      component.ledgerService.supportsUSB = true;
      component.ledgerService.supportsBluetooth = true;
      component.walletService.wallet.ledgerDeviceModel = 'nanoSPlus';
      expect(component.canReconnectUsb).toBeTrue();
      expect(component.canReconnectBluetooth).toBeFalse();
      component.walletService.wallet.ledgerDeviceModel = 'nanoS';
      expect(component.canReconnectBluetooth).toBeFalse();
      component.walletService.wallet.ledgerDeviceModel = 'nanoX';
      expect(component.canReconnectBluetooth).toBeTrue();
      component.walletService.wallet.ledgerDeviceModel = null;
      expect(component.canReconnectBluetooth).toBeTrue(); // older wallets remain compatible
    } finally {
      component.walletService.wallet.ledgerDeviceModel = oldModel;
      component.ledgerService.isDesktop = oldDesktop;
      component.ledgerService.supportsUSB = oldUsb;
      component.ledgerService.supportsBluetooth = oldBluetooth;
    }
  });

  it('does not change transport after a blocked Nano S Plus Bluetooth reconnect', async () => {
    const model = component.walletService.wallet.ledgerDeviceModel;
    const bluetooth = component.ledgerService.supportsBluetooth;
    try {
      component.walletService.wallet.ledgerDeviceModel = 'nanoSPlus';
      component.ledgerService.supportsBluetooth = true;
      const mode = spyOn(component.ledgerService, 'enableBluetoothMode');
      const load = spyOn(component.ledgerService, 'loadLedger');
      await component.reconnectBluetooth();
      expect(mode).not.toHaveBeenCalled();
      expect(load).not.toHaveBeenCalled();
    } finally {
      component.walletService.wallet.ledgerDeviceModel = model;
      component.ledgerService.supportsBluetooth = bluetooth;
    }
  });

  it('switches an existing ChromeOS USB Ledger wallet to Web Bluetooth reconnect without wallet setup', async () => {
    component.ledgerService.isDesktop = false;
    component.ledgerService.supportsUSB = true;
    component.ledgerService.supportsBluetooth = true;
    component.ledgerService.transportMode = 'USB';
    const accounts = component.walletService.wallet.accounts;
    const enableBluetoothMode = spyOn(component.ledgerService, 'enableBluetoothMode').and.callFake(enabled => {
      component.ledgerService.transportMode = enabled ? 'Bluetooth' : 'USB';
    });
    const loadLedger = spyOn(component.ledgerService, 'loadLedger').and.resolveTo(true);
    spyOn(component['notificationService'], 'sendInfo');
    spyOn(component['notificationService'], 'removeNotification');

    await component.reconnectBluetooth();

    expect(enableBluetoothMode).toHaveBeenCalledWith(true);
    expect(loadLedger).toHaveBeenCalledWith(false, true);
    expect(component.walletService.wallet.accounts).toBe(accounts);
  });

  it('switches an existing ChromeOS Bluetooth wallet back to USB without wallet setup', async () => {
    component.ledgerService.isDesktop = false;
    component.ledgerService.supportsUSB = true;
    component.ledgerService.supportsBluetooth = true;
    component.ledgerService.transportMode = 'Bluetooth';
    const accounts = component.walletService.wallet.accounts;
    const enableBluetoothMode = spyOn(component.ledgerService, 'enableBluetoothMode').and.callFake(enabled => {
      component.ledgerService.transportMode = enabled ? 'Bluetooth' : 'USB';
    });
    const loadLedger = spyOn(component.ledgerService, 'loadLedger').and.resolveTo(true);
    spyOn(component['notificationService'], 'sendInfo');
    spyOn(component['notificationService'], 'removeNotification');

    await component.reconnectUsb();

    expect(enableBluetoothMode).toHaveBeenCalledWith(false);
    expect(loadLedger).toHaveBeenCalledWith(false, false);
    expect(component.walletService.wallet.accounts).toBe(accounts);
  });

  it('does not offer USB reconnect on Android web but keeps Bluetooth when supported', () => {
    component.ledgerService.isDesktop = false;
    (component.ledgerService as any).isAndroidWeb = true;
    component.ledgerService.supportsUSB = true;
    component.ledgerService.supportsBluetooth = true;
    expect(component.canReconnectUsb).toBeFalse();
    expect(component.canReconnectBluetooth).toBeTrue();
  });

  it('does not attempt an unavailable Bluetooth transport', async () => {
    component.ledgerService.supportsBluetooth = false;
    const loadLedger = spyOn(component.ledgerService, 'loadLedger');
    const switchTransport = spyOn(component.ledgerService, 'enableBluetoothMode');

    await component.reconnectBluetooth();

    expect(loadLedger).not.toHaveBeenCalled();
    expect(switchTransport).not.toHaveBeenCalled();
  });

  it('reconnects with the selected USB transport even if the link was previously mislabeled', async () => {
    component.ledgerService.isDesktop = false;
    component.ledgerService.transportMode = 'USB';
    const loadLedger = spyOn(component.ledgerService, 'loadLedger').and.resolveTo(true);
    spyOn(component['notificationService'], 'sendInfo');
    spyOn(component['notificationService'], 'removeNotification');

    await component.reloadLedger();

    expect(loadLedger).toHaveBeenCalledWith(false, false);
    expect(component.ledgerService.transportMode).toBe('USB');
  });
  describe('hot-wallet device unlock enrollment from the password prompt', () => {
    function fakePrompt(options: {
      enrolled?: boolean;
      consent?: boolean;
      unlockSuccessful?: boolean;
      enrollmentFails?: boolean;
    } = {}) {
      const widget = Object.create(WalletWidgetComponent.prototype) as any;
      const { enrolled = false, consent = false, unlockSuccessful = true,
        enrollmentFails = false } = options;
      widget.wallet = { type: 'seed', locked: true };
      widget.unlockPassword = 'correct test password 1234';
      widget.enableDeviceUnlockAfterPassword = consent;
      widget.mayAttemptUnlock = true;
      widget.walletPasswordUnlockBusy = false;
      widget.deviceUnlockBusy = false;
      widget.deviceUnlockSupported = true;
      widget.timeoutIdAllowingUnlock = null;
      widget.modal = { hide: jasmine.createSpy('hide') };
      widget.translocoService = { translate: (key: string) => key };
      widget.notificationService = {
        sendSuccess: jasmine.createSpy('sendSuccess'),
        sendError: jasmine.createSpy('sendError'),
        sendWarning: jasmine.createSpy('sendWarning')
      };
      const passwordUnlock = jasmine.createSpy('unlockWallet').and.callFake(async () => {
        if (unlockSuccessful) widget.wallet.locked = false;
        return unlockSuccessful;
      });
      widget.walletService = {
        unlockWallet: passwordUnlock,
        getDeviceUnlockBinding: jasmine.createSpy('binding').and.returnValue('seed:encrypted-v2-wallet'),
        isLocked: () => widget.wallet.locked
      };
      const enroll = jasmine.createSpy('enroll').and.callFake(async () => {
        if (enrollmentFails) throw new Error('PRF cancelled');
      });
      widget.deviceUnlock = {
        has: jasmine.createSpy('has').and.returnValue(enrolled),
        enroll,
        remove: jasmine.createSpy('remove')
      };
      return { widget, passwordUnlock, enroll };
    }

    it('offers opt-in only and enrolls after verifying the software wallet password', async () => {
      const { widget, passwordUnlock, enroll } = fakePrompt({ consent: true });
      await widget.unlockWallet();
      expect(passwordUnlock).toHaveBeenCalledWith('correct test password 1234');
      expect(enroll).toHaveBeenCalledOnceWith('wallet', 'correct test password 1234', 'seed:encrypted-v2-wallet');
      expect(widget.modal.hide).toHaveBeenCalled();
      expect(widget.unlockPassword).toBe('');
      expect(widget.enableDeviceUnlockAfterPassword).toBeFalse();
      expect(widget.walletPasswordUnlockBusy).toBeFalse();
    });

    it('never enrolls without explicit checkbox consent', async () => {
      const { widget, enroll } = fakePrompt();
      await widget.unlockWallet();
      expect(enroll).not.toHaveBeenCalled();
      expect(widget.modal.hide).toHaveBeenCalled();
    });

    it('never enrolls on a wrong password and keeps the prompt open', async () => {
      const { widget, enroll } = fakePrompt({ consent: true, unlockSuccessful: false });
      await widget.unlockWallet();
      expect(enroll).not.toHaveBeenCalled();
      expect(widget.modal.hide).not.toHaveBeenCalled();
      expect(widget.notificationService.sendError)
        .toHaveBeenCalledWith('ui-notifications.wallet-password-incorrect');
      clearTimeout(widget.timeoutIdAllowingUnlock);
    });

    it('does not block a valid send unlock when biometric enrollment is cancelled', async () => {
      const { widget, enroll } = fakePrompt({ consent: true, enrollmentFails: true });
      await widget.unlockWallet();
      expect(enroll).toHaveBeenCalled();
      expect(widget.modal.hide).toHaveBeenCalled();
      expect(widget.notificationService.sendWarning).toHaveBeenCalledWith('device-unlock.failed');
    });

    it('does not replace an existing device enrollment', async () => {
      const { widget, enroll } = fakePrompt({ enrolled: true, consent: true });
      await widget.unlockWallet();
      expect(enroll).not.toHaveBeenCalled();
    });

    it('keeps Ledger wallets independent from biometric enrollment', async () => {
      const { widget, passwordUnlock, enroll } = fakePrompt({ consent: true });
      widget.wallet.type = 'ledger';
      await widget.unlockWallet();
      expect(passwordUnlock).not.toHaveBeenCalled();
      expect(enroll).not.toHaveBeenCalled();
    });

    it('resets transient opt-in when the dialog is dismissed or reopened', () => {
      const { widget } = fakePrompt({ consent: true });
      widget.wallet = { type: 'seed', locked: true, unlockModalRequested$: {
        next: jasmine.createSpy('next')
      } };
      widget.onModalHidden();
      expect(widget.enableDeviceUnlockAfterPassword).toBeFalse();
      widget.enableDeviceUnlockAfterPassword = true;
      widget.modal.show = jasmine.createSpy('show');
      widget.showModal();
      expect(widget.enableDeviceUnlockAfterPassword).toBeFalse();
    });
  });

});
