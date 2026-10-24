import { ComponentTestModule, isolateConstructorIO } from '../../testing/component-test.module';
import { TestBed, inject } from '@angular/core/testing';

import { LedgerService, LedgerStatus, isAndroidBrowser, LedgerNotReadyError, getLedgerReadinessIssue } from './ledger.service';

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
