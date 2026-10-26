import { of, Subject } from 'rxjs';
import { LedgerStatus } from './ledger.service';
import { WalletService } from './wallet.service';

describe('WalletService', () => {
  it('initializes with isolated websocket and address-book event streams', () => {
    // Constructor smoke test: no real RPC connection, Ledger or wallet secrets.
    const service = new WalletService(
      null as any, null as any, null as any,
      { addressBook$: of(null) } as any,
      null as any, null as any,
      { newTransactions$: of(null), connected$: new Subject<void>() } as any,
      null as any, { ledgerStatus$: new Subject() } as any, null as any, null as any
    );
    expect(service.wallet.accounts).toEqual([]);
    expect(service.wallet.updatingBalance).toBe(false);
  });
});


describe('WalletService.reloadBalances errors', () => {
  it('clears the loading indicator if the RPC refresh rejects', async () => {
    // Avoid unrelated Angular dependencies: exercise the error boundary directly.
    const service = Object.create(WalletService.prototype) as WalletService;
    service.wallet = { updatingBalance: false } as any;
    spyOn<any>(service, 'refreshBalances').and.returnValue(Promise.reject(new Error('RPC unavailable')));

    let caughtError: any;
    try {
      await service.reloadBalances();
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toEqual(jasmine.any(Error));
    expect(caughtError.message).toBe('RPC unavailable');
    expect(service.wallet.updatingBalance).toBe(false);
  });
});

describe('WalletService.reloadBalances when confirmations overlap', () => {
  it('waits for the in-flight refresh and coalesces simultaneous confirmations into one follow-up', async () => {
    const service = Object.create(WalletService.prototype) as WalletService;
    service.wallet = { updatingBalance: false } as any;

    let finishFirst!: () => void;
    const firstRpc = new Promise<void>(resolve => { finishFirst = resolve; });
    let callCount = 0;
    spyOn<any>(service, 'refreshBalances').and.callFake(async () => {
      callCount++;
      if (callCount === 1) await firstRpc;
    });

    const initialRefresh = service.reloadBalances();
    const overlappingRefresh = service.reloadBalances();
    const anotherConfirmation = service.reloadBalances();
    expect(overlappingRefresh).toBe(initialRefresh);
    expect(anotherConfirmation).toBe(initialRefresh);
    await Promise.resolve(); // Let the first RPC start.
    expect(callCount).toBe(1);
    expect(service.wallet.updatingBalance).toBe(true);

    finishFirst();
    await Promise.all([initialRefresh, overlappingRefresh, anotherConfirmation]);
    expect(callCount).toBe(2);
    expect(service.wallet.updatingBalance).toBe(false);
  });
});

describe('WalletService reconciling missed confirmations after reconnect', () => {
  it('refreshes balances and pending blocks via RPC after the WebSocket connects', async () => {
    const connected$ = new Subject<void>();
    const notifications = { sendWarning: jasmine.createSpy('sendWarning') };
    const service = new WalletService(
      null as any, null as any, null as any,
      { addressBook$: of(null) } as any,
      null as any, null as any,
      { newTransactions$: of(null), connected$ } as any,
      null as any, { ledgerStatus$: new Subject() } as any, null as any, notifications as any
    );
    const refresh = spyOn(service, 'reloadBalances').and.returnValue(Promise.resolve());

    connected$.next(); // No wallet configured: avoid unnecessary RPC calls.
    expect(refresh).not.toHaveBeenCalled();

    service.wallet.accounts = [{ id: 'nano_test' }] as any;
    connected$.next(); // The confirmation could have occurred while offline.
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(notifications.sendWarning).not.toHaveBeenCalled();
  });

  it('handles RPC failures after reconnect without unhandled rejections', async () => {
    const connected$ = new Subject<void>();
    const notifications = { sendWarning: jasmine.createSpy('sendWarning') };
    const service = new WalletService(
      null as any, null as any, null as any,
      { addressBook$: of(null) } as any,
      null as any, null as any,
      { newTransactions$: of(null), connected$ } as any,
      null as any, { ledgerStatus$: new Subject() } as any, null as any, notifications as any
    );
    service.wallet.accounts = [{ id: 'nano_test' }] as any;
    spyOn(service, 'reloadBalances').and.returnValue(Promise.reject(new Error('RPC offline')));

    connected$.next();
    await Promise.resolve();
    await Promise.resolve();
    expect(notifications.sendWarning).toHaveBeenCalled();
  });
});

describe('WalletService Ledger receive scheduling', () => {
  function setup(status: string) {
    const service = Object.create(WalletService.prototype) as any;
    const notifyPendingReconnect = jasmine.createSpy('notifyPendingReconnect');
    service.wallet = {
      type: 'ledger', locked: false,
      pendingBlocks: [{ account: 'nano_test', hash: 'hash', amount: '1' }]
    };
    service.appSettings = { settings: { pendingOption: 'automatic' } };
    service.ledgerService = {
      ledger: { status },
      notifyPendingReconnect
    };
    return { service, notifyPendingReconnect };
  }

  it('leaves pending incoming funds untouched when the Ledger is disconnected', async () => {
    const { service, notifyPendingReconnect } = setup(LedgerStatus.NOT_CONNECTED);
    await service.processPendingBlocks();
    expect(notifyPendingReconnect).toHaveBeenCalledTimes(1);
    expect(service.processingPending).toBeFalsy();
    expect(service.wallet.pendingBlocks.length).toBe(1);
  });

  it('leaves pending incoming funds untouched when the Ledger is locked', async () => {
    const { service, notifyPendingReconnect } = setup(LedgerStatus.LOCKED);
    await service.processPendingBlocks();
    expect(notifyPendingReconnect).toHaveBeenCalledTimes(1);
    expect(service.wallet.pendingBlocks.length).toBe(1);
  });

  it('does not start an automatic receive when the wallet uses manual mode', async () => {
    const { service, notifyPendingReconnect } = setup(LedgerStatus.NOT_CONNECTED);
    service.appSettings.settings.pendingOption = 'manual';
    await service.processPendingBlocks();
    expect(notifyPendingReconnect).not.toHaveBeenCalled();
    expect(service.wallet.pendingBlocks.length).toBe(1);
  });
});

describe('WalletService successful incoming-block coalescing', () => {
  it('does not retry a previously successful receivable block', async () => {
    // The successful-block cache stores hashes, never objects. Repeated
    // confirmations must not trigger another Ledger or PoW transaction.
    const service = Object.create(WalletService.prototype) as any;
    const generateReceive = jasmine.createSpy('generateReceive');
    service.wallet = {
      type: 'seed', locked: false,
      pendingBlocks: [{ account: 'nano_test', hash: 'already-received', amount: '1', source: 'nano_sender' }]
    };
    service.appSettings = { settings: { pendingOption: 'automatic' } };
    service.nanoBlock = { generateReceive };
    service.successfulBlocks = ['already-received'];
    service.processingPending = false;

    jasmine.clock().install();
    try {
      await service.processPendingBlocks();
      expect(generateReceive).not.toHaveBeenCalled();
      expect(service.wallet.pendingBlocks.length).toBe(1);
    } finally {
      jasmine.clock().uninstall();
    }
  });
});
