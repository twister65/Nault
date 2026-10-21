import { ComponentTestModule, isolateConstructorIO } from '../../testing/component-test.module';
import { TestBed, inject } from '@angular/core/testing';

import { LedgerService, LedgerStatus, isAndroidBrowser, LedgerNotReadyError } from './ledger.service';

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
