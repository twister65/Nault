import { ComponentTestModule, isolateConstructorIO } from '../../testing/component-test.module';
import { TestBed, inject } from '@angular/core/testing';

import { LedgerService, LedgerStatus, isAndroidBrowser, LedgerNotReadyError, getLedgerReadinessIssue, identifyLedgerUsbModel } from './ledger.service';

describe('LedgerService', () => {
  beforeEach(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
      providers: [LedgerService]
    });
  });

  it('should be created', inject([LedgerService], (service: LedgerService) => {
    expect(service).toBeTruthy();
  }));

  it('detects Android browser user agents without excluding ChromeOS or desktop browsers', () => {
    expect(isAndroidBrowser('Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit/537.36 Chrome/120')).toBe(true);
    expect(isAndroidBrowser('Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) Chrome/154')).toBe(false);
    expect(isAndroidBrowser('Mozilla/5.0 (X11; Linux x86_64) Chrome/154')).toBe(false);
  });
});

describe('Ledger USB model and transport capabilities', () => {
  it('recognizes Ledger Nano S Plus and Nano X from library model descriptors', () => {
    expect(identifyLedgerUsbModel({deviceModel: {id: 'nanoSP'}})).toBe('nanoSPlus');
    expect(identifyLedgerUsbModel({deviceModel: {id: 'nanoX'}})).toBe('nanoX');
    expect(identifyLedgerUsbModel({deviceModel: {id: 'nanoS'}})).toBe('nanoS');
  });

  it('recognizes official USB product IDs with interface masks', () => {
    expect(identifyLedgerUsbModel({device: {productId: 0x50}})).toBe('nanoSPlus');
    expect(identifyLedgerUsbModel({device: {productId: 0x5011}})).toBe('nanoSPlus');
    expect(identifyLedgerUsbModel({device: {productId: 0x40}})).toBe('nanoX');
    expect(identifyLedgerUsbModel({device: {productId: 0x4011}})).toBe('nanoX');
  });

  it('leaves unidentified devices unknown instead of guessing their Bluetooth support', () => {
    expect(identifyLedgerUsbModel(null)).toBeNull();
    expect(identifyLedgerUsbModel({})).toBeNull();
    expect(identifyLedgerUsbModel({device: {productId: 0x9999}})).toBeNull();
    expect(identifyLedgerUsbModel({device: {productId: 0x0005}})).toBeNull();
  });

  it('reads the USB model while connected and does not infer a disconnected device', () => {
    const service = Object.create(LedgerService.prototype) as LedgerService;
    service.transportMode = 'USB';
    service.ledger = {status: LedgerStatus.READY, nano: {}, transport: {deviceModel: {id: 'nanoSP'}} as any};
    expect(service.connectedDeviceModel).toBe('nanoSPlus');
    service.ledger.transport = null;
    expect(service.connectedDeviceModel).toBeNull();
  });
});

describe('Ledger readiness error classification', () => {
  it('recognizes a device locked at firmware level (0x5515)', () => {
    expect(getLedgerReadinessIssue({ statusCode: 0x5515, message: 'UNKNOWN_ERROR' })).toBe('locked');
    expect(getLedgerReadinessIssue(new Error('Ledger device: UNKNOWN_ERROR (0x5515)'))).toBe('locked');
  });

  it('recognizes an unavailable Nano app (0x6e01)', () => {
    expect(getLedgerReadinessIssue({ statusCode: 0x6e01, message: 'UNKNOWN_ERROR' })).toBe('app-not-open');
    expect(getLedgerReadinessIssue(new Error('Ledger device: UNKNOWN_ERROR (0x6e01)'))).toBe('app-not-open');
  });

  it('never classifies a denied signature or an unrelated transport error as locked', () => {
    expect(getLedgerReadinessIssue({ statusCode: 0x6985, message: 'Conditions not satisfied' })).toBeNull();
    expect(getLedgerReadinessIssue(new Error('Bluetooth disconnected'))).toBeNull();
  });

  it('shows an actionable message when Nano app closes during the polling cycle', async () => {
    const service = Object.create(LedgerService.prototype) as any;
    const sendWarning = jasmine.createSpy('sendWarning');
    const next = jasmine.createSpy('next');
    const resetLedger = jasmine.createSpy('resetLedger');
    service.ledger = { status: LedgerStatus.READY };
    service.bluetoothGeneration = 0;
    service.pollingLedger = true;
    service.notifications = { sendWarning };
    service.ledgerStatus$ = { next };
    service.resetLedger = resetLedger;
    service.getLedgerAccount = jasmine.createSpy('getLedgerAccount')
      .and.returnValue(Promise.reject({ statusCode: 0x6e01, message: 'UNKNOWN_ERROR (0x6e01)' }));

    await service.checkLedgerStatus();

    expect(service.ledger.status).toBe(LedgerStatus.NOT_CONNECTED);
    expect(sendWarning).toHaveBeenCalledTimes(1);
    expect(sendWarning.calls.mostRecent().args[0]).toContain('Open the Nano app');
    expect(resetLedger).toHaveBeenCalled();
    expect(next.calls.mostRecent().args[0].statusText).toContain('Open the Nano app');
  });

  it('marks a firmware-locked Ledger as locked during polling', async () => {
    const service = Object.create(LedgerService.prototype) as any;
    const sendWarning = jasmine.createSpy('sendWarning');
    const next = jasmine.createSpy('next');
    service.ledger = { status: LedgerStatus.READY };
    service.bluetoothGeneration = 0;
    service.pollingLedger = true;
    service.notifications = { sendWarning };
    service.ledgerStatus$ = { next };
    service.resetLedger = jasmine.createSpy('resetLedger');
    service.getLedgerAccount = jasmine.createSpy('getLedgerAccount')
      .and.returnValue(Promise.reject({ statusCode: 0x5515, message: 'UNKNOWN_ERROR (0x5515)' }));

    await service.checkLedgerStatus();

    expect(service.ledger.status).toBe(LedgerStatus.LOCKED);
    expect(sendWarning.calls.mostRecent().args[0]).toContain('Unlock your Ledger');
    expect(next.calls.mostRecent().args[0].status).toBe(LedgerStatus.LOCKED);
  });
});

describe('LedgerService pending-receive reconnect message', () => {
  it('shows one reconnect notification until a confirmed reconnection', () => {
    const service = Object.create(LedgerService.prototype) as any;
    const sendWarning = jasmine.createSpy('sendWarning');
    const removeNotification = jasmine.createSpy('removeNotification');
    service.notifications = { sendWarning, removeNotification };
    service.ledger = { status: LedgerStatus.NOT_CONNECTED };

    service.notifyPendingReconnect();
    service.notifyPendingReconnect();
    expect(sendWarning).toHaveBeenCalledTimes(1);
    expect(sendWarning.calls.mostRecent().args[1].identifier).toBe('ledger-pending-reconnect');
    service.clearPendingReconnect();
    expect(removeNotification).toHaveBeenCalledWith('ledger-pending-reconnect');
    service.notifyPendingReconnect();
    expect(sendWarning).toHaveBeenCalledTimes(2);
  });

  it('classifies an unavailable Nano app without treating it as a refused transaction', () => {
    const service = Object.create(LedgerService.prototype) as any;
    service.ledger = { status: LedgerStatus.READY };
    expect(service.isUnavailableError(new Error('Ledger device: UNKNOWN_ERROR (0x6e01)'))).toBe(true);
    expect(service.isUnavailableError(new LedgerNotReadyError())).toBe(true);
    expect(service.isUnavailableError(new Error('Transaction denied on Ledger device'))).toBe(false);
  });
});

describe('Ledger browser USB connection serialization', () => {
  function setup() {
    const service = Object.create(LedgerService.prototype) as any;
    service.isDesktop = false;
    service.isAndroidWeb = false;
    service.transportMode = 'USB';
    service.ledger = {status: LedgerStatus.NOT_CONNECTED, transport: null, nano: null};
    service.waitTimeout = 30000;
    return service;
  }

  it('waits for a previous WebUSB interface to close before opening again', async () => {
    const service = setup();
    let finishClose: () => void;
    const closed = new Promise<void>(resolve => { finishClose = resolve; });
    const close = jasmine.createSpy('close').and.returnValue(closed);
    service.ledger.transport = { close };
    service.resetLedger();

    const newTransport = {
      close: jasmine.createSpy('newClose').and.resolveTo(),
      setScrambleKey: jasmine.createSpy('setScrambleKey'),
      decorateAppAPIMethods: jasmine.createSpy('decorateAppAPIMethods')
    };
    const create = jasmine.createSpy('create').and.resolveTo(newTransport);
    service.DynamicTransport = { create };

    const opening = service.loadTransport();
    await Promise.resolve();
    expect(close).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();

    finishClose!();
    await opening;
    expect(create).toHaveBeenCalledTimes(1);
    expect(service.ledger.transport).toBe(newTransport);
    expect(service.ledger.nano).toBeTruthy();
  });

  it('keeps multiple asynchronous USB closes ordered ahead of the next open', async () => {
    const service = setup();
    let releaseFirst: () => void;
    const firstClose = new Promise<void>(resolve => { releaseFirst = resolve; });
    const closeFirst = jasmine.createSpy('closeFirst').and.returnValue(firstClose);
    const closeSecond = jasmine.createSpy('closeSecond').and.resolveTo();
    service.ledger.transport = { close: closeFirst };
    service.resetLedger();
    service.ledger.transport = { close: closeSecond };
    service.resetLedger();

    const create = jasmine.createSpy('create').and.resolveTo({
      close: jasmine.createSpy('close').and.resolveTo(),
      setScrambleKey: jasmine.createSpy('setScrambleKey'),
      decorateAppAPIMethods: jasmine.createSpy('decorateAppAPIMethods')
    });
    service.DynamicTransport = { create };
    const opening = service.loadTransport();
    await Promise.resolve();
    await Promise.resolve();
    expect(closeSecond).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();

    releaseFirst!();
    await opening;
    expect(closeSecond).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('discards a USB transport opened after a reset during device selection', async () => {
    const service = setup();
    let finishOpen: (transport: any) => void;
    const deviceOpen = new Promise<any>(resolve => { finishOpen = resolve; });
    const create = jasmine.createSpy('create').and.returnValue(deviceOpen);
    service.DynamicTransport = { create };
    const opening = service.loadTransport();

    await Promise.resolve();
    await Promise.resolve();
    expect(create).toHaveBeenCalledTimes(1);
    service.resetLedger();
    const stale = {close: jasmine.createSpy('close').and.resolveTo()};
    finishOpen!(stale);

    await expectAsync(opening).toBeRejectedWithError('USB connection cancelled');
    expect(stale.close).toHaveBeenCalledTimes(1);
    expect(service.ledger.transport).toBeNull();
  });

  it('shares concurrent USB loads and releases the guard for a future attempt', async () => {
    const service = setup();
    let complete: (value: boolean) => void;
    const pending = new Promise<boolean>(resolve => { complete = resolve; });
    const loadSession = jasmine.createSpy('loadLedgerSession').and.returnValues(
      pending, Promise.resolve(true)
    );
    service.loadLedgerSession = loadSession;

    const first = service.loadLedger(true);
    const second = service.loadLedger(true);
    expect(loadSession).toHaveBeenCalledTimes(1);

    complete!(true);
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(await service.loadLedger(true)).toBe(true);
    expect(loadSession).toHaveBeenCalledTimes(2);
  });

  it('releases the USB guard on failure so a retry is possible', async () => {
    const service = setup();
    const loadSession = jasmine.createSpy('loadLedgerSession').and.returnValues(
      Promise.reject(new Error('USB connection failed')), Promise.resolve(true)
    );
    service.loadLedgerSession = loadSession;
    await expectAsync(service.loadLedger(true)).toBeRejectedWithError('USB connection failed');
    expect(await service.loadLedger(true)).toBe(true);
    expect(loadSession).toHaveBeenCalledTimes(2);
  });

  it('does not serialize Bluetooth load attempts through the browser USB guard', async () => {
    const service = setup();
    service.transportMode = 'Bluetooth';
    const loadSession = jasmine.createSpy('loadLedgerSession').and.resolveTo(false);
    service.loadLedgerSession = loadSession;
    await Promise.all([service.loadLedger(true), service.loadLedger(true)]);
    expect(loadSession).toHaveBeenCalledTimes(2);
  });
});

describe('Ledger USB account readiness after transport changes', () => {
  function setup(error: unknown) {
    const service = Object.create(LedgerService.prototype) as any;
    service.isAndroidWeb = false;
    service.isDesktop = false;
    service.supportsWebUSB = true;
    service.supportsWebHID = false;
    service.transportMode = 'USB';
    service.configuringWallet = true;
    service.pollingLedger = false;
    service.ledger = {
      status: LedgerStatus.NOT_CONNECTED,
      transport: { close: jasmine.createSpy('close').and.resolveTo() },
      nano: { getAppConfiguration: jasmine.createSpy('getAppConfiguration').and.resolveTo({version:'1.0'}) }
    };
    service.getLedgerAccount = jasmine.createSpy('getLedgerAccount').and.rejectWith(error);
    service.verifyConnectedWallet = jasmine.createSpy('verifyConnectedWallet');
    service.ledgerStatus$ = {next: jasmine.createSpy('next')};
    service.notifications = {sendWarning: jasmine.createSpy('sendWarning')};
    return service;
  }

  it('never returns a successful connection after the USB account read fails', async () => {
    const service = setup(new Error('USB transport session not yet ready'));

    expect(await service.loadLedger(true)).toBe(false);
    expect(service.ledger.status).toBe(LedgerStatus.NOT_CONNECTED);
    expect(service.ledgerStatus$.next).toHaveBeenCalledWith({
      status: LedgerStatus.NOT_CONNECTED,
      statusText: 'Unable to read Ledger account. Check the Nano app and retry the connection.'
    });
    expect(service.verifyConnectedWallet).not.toHaveBeenCalled();
  });

  it('classifies an unavailable Nano app rather than reporting successful USB readiness', async () => {
    const service = setup({statusCode: 0x6e01, message: 'UNKNOWN_ERROR (0x6e01)'});

    expect(await service.loadLedger(true)).toBe(false);
    expect(service.ledger.status).toBe(LedgerStatus.NOT_CONNECTED);
    expect(service.ledgerStatus$.next.calls.mostRecent().args[0].statusText)
      .toContain('Open the Nano app');
  });
});

describe('Ledger WebUSB device picker cancellation', () => {
  it('returns disconnected without an error notification when the user dismisses the chooser', async () => {
    const service = Object.create(LedgerService.prototype) as any;
    service.isAndroidWeb = false;
    service.isDesktop = false;
    service.supportsWebUSB = true;
    service.supportsWebHID = false;
    service.transportMode = 'USB';
    service.ledger = {status: LedgerStatus.NOT_CONNECTED, transport: null, nano: null};
    service.appSettings = {setAppSetting: jasmine.createSpy('setAppSetting')};
    service.detectUsbTransport = jasmine.createSpy('detectUsbTransport');
    service.loadTransport = jasmine.createSpy('loadTransport').and.rejectWith({
      name: 'TransportOpenUserCancelled', message: 'User cancelled the device selection'
    });
    service.resetLedger = jasmine.createSpy('resetLedger');
    const notifications = {sendWarning: jasmine.createSpy('sendWarning')};
    service.notifications = notifications;
    service.ledgerStatus$ = {next: jasmine.createSpy('next')};

    expect(await service.loadLedger(false)).toBe(false);
    expect(service.lastUsbSelectionCancelled).toBe(true);
    expect(service.resetLedger).toHaveBeenCalled();
    expect(notifications.sendWarning).not.toHaveBeenCalled();
  });

  it('still distinguishes a real USB failure from user cancellation', async () => {
    const service = Object.create(LedgerService.prototype) as any;
    service.isAndroidWeb = false;
    service.isDesktop = false;
    service.supportsWebUSB = true;
    service.supportsWebHID = false;
    service.transportMode = 'USB';
    service.ledger = {status: LedgerStatus.NOT_CONNECTED, transport: null, nano: null};
    service.appSettings = {setAppSetting: jasmine.createSpy('setAppSetting')};
    service.detectUsbTransport = jasmine.createSpy('detectUsbTransport');
    service.loadTransport = jasmine.createSpy('loadTransport').and.rejectWith(new Error('USB unavailable'));
    service.resetLedger = jasmine.createSpy('resetLedger');
    const notifications = {sendWarning: jasmine.createSpy('sendWarning')};
    service.notifications = notifications;
    service.ledgerStatus$ = {next: jasmine.createSpy('next')};

    expect(await service.loadLedger(false)).toBe(false);
    expect(service.lastUsbSelectionCancelled).toBe(false);
    expect(notifications.sendWarning).toHaveBeenCalled();
  });
});

describe('Ledger wallet identity guard and Android USB policy', () => {
  it('accepts the same seed/account on a different supported transport', async () => {
    const service = Object.create(LedgerService.prototype) as any;
    service.configuringWallet = false;
    service.configuredWalletAccount = () => ({ id: 'nano_same', index: 4 });
    const getAccount = jasmine.createSpy('getLedgerAccount')
      .and.resolveTo({address: 'xrb_same'});
    service.getLedgerAccount = getAccount;
    await expectAsync(service.verifyConnectedWallet()).toBeResolved();
    expect(getAccount).toHaveBeenCalledWith(4);
  });

  it('updates a model hint only after the new hardware passes the same-seed address check', async () => {
    const service = Object.create(LedgerService.prototype) as any;
    service.configuringWallet = false;
    service.transportMode = 'USB';
    service.ledger = {transport: {deviceModel: {id: 'nanoX'}}};
    service.configuredWalletAccount = () => ({ id: 'nano_saved', index: 0 });
    service.getLedgerAccount = jasmine.createSpy('getLedgerAccount').and.resolveTo({address: 'nano_saved'});
    service.onVerifiedDeviceModel = jasmine.createSpy('onVerifiedDeviceModel');
    await service.verifyConnectedWallet();
    expect(service.onVerifiedDeviceModel).toHaveBeenCalledWith('nanoX');

    service.getLedgerAccount.and.resolveTo({address: 'nano_other_seed'});
    await expectAsync(service.verifyConnectedWallet())
      .toBeRejectedWithError('Ledger does not match the configured wallet.');
    expect(service.onVerifiedDeviceModel).toHaveBeenCalledTimes(1);
  });

  it('rejects a Ledger whose account is different from the configured wallet', async () => {
    const service = Object.create(LedgerService.prototype) as any;
    service.configuringWallet = false;
    service.configuredWalletAccount = () => ({ id: 'nano_expected', index: 0 });
    service.getLedgerAccount = jasmine.createSpy('getLedgerAccount')
      .and.resolveTo({address: 'nano_other'});
    await expectAsync(service.verifyConnectedWallet())
      .toBeRejectedWithError('Ledger does not match the configured wallet.');
  });

  it('allows a different hardware wallet only during the explicit wallet setup operation', async () => {
    const service = Object.create(LedgerService.prototype) as any;
    service.configuringWallet = true;
    service.configuredWalletAccount = () => ({id:'nano_previous',index:0});
    const getAccount = jasmine.createSpy('getLedgerAccount');
    service.getLedgerAccount = getAccount;
    await expectAsync(service.verifyConnectedWallet()).toBeResolved();
    expect(getAccount).not.toHaveBeenCalled();
  });

  it('disconnects and explains a mismatch detected during periodic status checking', async () => {
    const service = Object.create(LedgerService.prototype) as any;
    service.ledger = { status: LedgerStatus.READY };
    service.bluetoothGeneration = 0;
    service.pollingLedger = true;
    service.configuringWallet = false;
    service.configuredWalletAccount = () => ({id:'nano_original',index:0});
    service.getLedgerAccount = jasmine.createSpy('getLedgerAccount')
      .and.resolveTo({address:'nano_different'});
    service.resetLedger = jasmine.createSpy('resetLedger');
    const sendWarning = jasmine.createSpy('sendWarning');
    service.notifications = {sendWarning};
    service.ledgerStatus$ = {next: jasmine.createSpy('next')};

    await service.checkLedgerStatus();

    expect(service.ledger.status).toBe(LedgerStatus.NOT_CONNECTED);
    expect(service.resetLedger).toHaveBeenCalled();
    expect(sendWarning).toHaveBeenCalledWith(
      'Ledger does not match the configured wallet.',
      {identifier: 'ledger-wallet-mismatch', length: 10000}
    );
    expect(service.ledgerStatus$.next).toHaveBeenCalledWith({
      status: LedgerStatus.NOT_CONNECTED,
      statusText: 'Ledger does not match the configured wallet.'
    });
  });

  it('refuses USB on Android before trying to open a transport', async () => {
    const service = Object.create(LedgerService.prototype) as any;
    service.isAndroidWeb = true;
    service.isDesktop = false;
    service.transportMode = 'USB';
    service.ledger = { status: LedgerStatus.NOT_CONNECTED };
    service.ledgerStatus$ = {next: jasmine.createSpy('next')};
    const connect = jasmine.createSpy('loadTransport');
    service.loadTransport = connect;

    expect(await service.loadLedger()).toBe(false);
    expect(connect).not.toHaveBeenCalled();
    expect(service.ledgerStatus$.next).toHaveBeenCalledWith(
      jasmine.objectContaining({ status: LedgerStatus.NOT_CONNECTED,
        statusText: jasmine.stringMatching(/disabled on Android/) }));
  });
});
