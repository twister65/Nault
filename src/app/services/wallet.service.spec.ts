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


describe('WalletService verified hardware model updates', () => {
  it('updates the saved model when a Nano X with the same seed is verified after Nano S Plus', () => {
    const ledgerService: any = { ledgerStatus$: new Subject() };
    const service = new WalletService(
      null as any, null as any, null as any,
      { addressBook$: of(null) } as any,
      null as any, null as any,
      { newTransactions$: of(null), connected$: new Subject<void>() } as any,
      null as any, ledgerService, null as any, null as any
    );
    service.wallet.type = 'ledger';
    service.wallet.accounts = [{id: 'nano_same', index: 0}] as any;
    service.wallet.ledgerDeviceModel = 'nanoSPlus';
    const saved = spyOn(service, 'saveWalletExport');
    expect(ledgerService.onVerifiedDeviceModel).toEqual(jasmine.any(Function));
    ledgerService.onVerifiedDeviceModel('nanoX');
    expect(service.wallet.ledgerDeviceModel).toBe('nanoX');
    expect(saved).toHaveBeenCalledTimes(1);
    ledgerService.onVerifiedDeviceModel('nanoX');
    expect(saved).toHaveBeenCalledTimes(1);
  });
});

describe('WalletService saved Ledger device transport capability', () => {
  it('exports the detected Ledger model as non-secret metadata and restores it', async () => {
    const service = Object.create(WalletService.prototype) as any;
    service.storeKey = 'nault-model-test-wallet';
    service.wallet = {
      type: 'ledger', accounts: [{id: 'nano_account', index: 0}],
      selectedAccount: null, selectedAccountId: null,
      ledgerDeviceModel: 'nanoSPlus'
    };
    const exported = service.generateWalletExport();
    expect(exported.ledgerDeviceModel).toBe('nanoSPlus');
    expect(exported.accounts).toEqual([{id:'nano_account', index:0}]);
    const prev = localStorage.getItem(service.storeKey);
    try {
      localStorage.setItem(service.storeKey, JSON.stringify(exported));
      service.resetWallet = jasmine.createSpy('resetWallet').and.callFake(() => {
        service.wallet = {type: 'seed', accounts: [], ledgerDeviceModel: null};
      });
      service.loadWalletAccount = jasmine.createSpy('loadWalletAccount')
        .and.callFake((index: number, id: string) => service.wallet.accounts.push({index, id}));
      await service.loadStoredWallet();
      expect(service.wallet.ledgerDeviceModel).toBe('nanoSPlus');
      expect(service.wallet.accounts).toEqual([{index: 0, id: 'nano_account'}]);
    } finally {
      if (prev === null) localStorage.removeItem(service.storeKey);
      else localStorage.setItem(service.storeKey, prev);
    }
  });

  it('does not infer a hardware model from old or untrusted wallet exports', async () => {
    const service = Object.create(WalletService.prototype) as any;
    service.storeKey = 'nault-model-legacy-test';
    service.resetWallet = jasmine.createSpy('resetWallet').and.callFake(() => {
      service.wallet = {type: 'seed', accounts: [], ledgerDeviceModel: null};
    });
    service.loadWalletAccount = jasmine.createSpy('loadWalletAccount');
    const prior = localStorage.getItem(service.storeKey);
    try {
      for (const value of [undefined, 'custom-invented', 'nanoX']) {
        const data = {type: 'ledger', ...(value ? {ledgerDeviceModel: value} : {})};
        localStorage.setItem(service.storeKey, JSON.stringify(data));
        await service.loadStoredWallet();
        expect(service.wallet.ledgerDeviceModel).toBe(value === 'nanoX' ? 'nanoX' : null);
      }
    } finally {
      if (prior === null) localStorage.removeItem(service.storeKey);
      else localStorage.setItem(service.storeKey, prior);
    }
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


describe('WalletService staged Ledger replacement', () => {
  it('derives only Ledger account zero without RPC and does not reuse old wallet accounts', async () => {
    const service = Object.create(WalletService.prototype) as any;
    const previous = [{ id: 'nano_old', index: 0 }];
    service.wallet = { type: 'ledger', accounts: previous };
    service.ledgerService = {
      getLedgerAccount: jasmine.createSpy('getLedgerAccount')
        .and.callFake(async (index: number) => ({ address: 'nano_' + index, publicKey: 'A' }))
    };
    service.api = { accountsFrontiers: jasmine.createSpy('accountsFrontiers')
      .and.returnValue(Promise.reject(new Error('RPC offline'))) };
    spyOn(service, 'createLedgerAccount').and.callFake(async (index: number) =>
      ({ id: 'nano_' + index, index }) as any);
    const reset = spyOn(service, 'resetWallet').and.stub();

    const prepared = await service.prepareLedgerReplacementAccounts();

    expect(prepared).toEqual([{ id: 'nano_0', index: 0 }] as any);
    expect(service.wallet.accounts).toBe(previous);
    expect(reset).not.toHaveBeenCalled();
  });

  it('returns a prepared list without modifying the existing wallet', async () => {
    const service = Object.create(WalletService.prototype) as any;
    const previous = [{ id: 'nano_old', index: 0 }];
    service.wallet = { type: 'ledger', accounts: previous };
    service.ledgerService = {
      getLedgerAccount: jasmine.createSpy('getLedgerAccount')
        .and.callFake(async (index: number) => ({ address: 'nano_' + index, publicKey: 'AAAA' }))
    };
    service.api = { accountsFrontiers: jasmine.createSpy('accountsFrontiers')
      .and.callFake(async () => ({ frontiers: { nano_2: 'BBBB' } })) };
    service.util = { nano: { isValidHash: () => true } };
    spyOn(service, 'createLedgerAccount')
      .and.callFake(async (index: number) => ({ id: 'nano_' + index, index }));
    const reset = spyOn(service, 'resetWallet').and.stub();

    const prepared = await service.prepareLedgerReplacementAccounts();

    expect(prepared).toEqual([{ id: 'nano_2', index: 2 }]);
    expect(service.wallet.accounts).toBe(previous);
    expect(reset).not.toHaveBeenCalled();
  });

  it('refuses to mix accounts if the connected Ledger changes during discovery', async () => {
    const service = Object.create(WalletService.prototype) as any;
    const previous = [{ id: 'nano_old', index: 0 }];
    service.wallet = { type: 'ledger', accounts: previous };
    let firstAccountReads = 0;
    service.ledgerService = {
      getLedgerAccount: jasmine.createSpy('getLedgerAccount').and.callFake(async (index: number) => {
        if (index === 0 && ++firstAccountReads > 1) return { address: 'nano_swapped', publicKey: 'AAAA' };
        return { address: 'nano_' + index, publicKey: 'AAAA' };
      })
    };
    service.api = { accountsFrontiers: jasmine.createSpy('accountsFrontiers')
      .and.callFake(async () => ({ frontiers: {} })) };
    service.util = { nano: { isValidHash: () => true } };

    await expectAsync(service.prepareLedgerReplacementAccounts())
      .toBeRejectedWithError('Ledger changed during account discovery. Please retry.');
    expect(service.wallet.accounts).toBe(previous);
  });

  it('publishes new accounts only after an explicit activation', () => {
    const service = Object.create(WalletService.prototype) as any;
    service.wallet = {
      type: 'ledger', accounts: [{ id: 'nano_old', index: 0 }],
      ledgerDeviceModel: 'nanoX'
    };
    // Activation reads the model from the detected transport. Model it in
    // this isolated fixture instead of changing production behavior.
    service.ledgerService = { connectedDeviceModel: 'nanoSPlus' };
    service.resetWallet = jasmine.createSpy('resetWallet').and.callFake(() => {
      service.wallet.accounts = [];
      service.wallet.type = 'seed';
      service.wallet.ledgerDeviceModel = null;
    });
    service.websocket = { subscribeAccounts: jasmine.createSpy('subscribeAccounts') };
    service.saveWalletExport = jasmine.createSpy('saveWalletExport');
    service.informNewWallet = jasmine.createSpy('informNewWallet');
    service.reloadBalances = jasmine.createSpy('reloadBalances').and.resolveTo();

    service.activatePreparedLedgerWallet([{ id: 'nano_new', index: 0 }]);

    expect(service.resetWallet).toHaveBeenCalled();
    expect(service.wallet.type).toBe('ledger');
    expect(service.wallet.ledgerDeviceModel).toBe('nanoSPlus');
    expect(service.wallet.accounts).toEqual([{ id: 'nano_new', index: 0 }]);
    expect(service.websocket.subscribeAccounts).toHaveBeenCalledWith(['nano_new']);
    expect(service.saveWalletExport).toHaveBeenCalled();
  });
});
