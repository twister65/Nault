import { ConfigureWalletComponent } from './configure-wallet.component';
import { LedgerStatus } from '../../services/ledger.service';

describe('Configured Ledger wallet transport switching', () => {
  it('keeps the existing wallet when USB is replaced by Bluetooth', async () => {
    const modes: boolean[] = [];
    const imports: boolean[] = [];
    const component = {
      walletService: { isLedgerWallet: () => true },
      ledgerService: { enableBluetoothMode: (enabled: boolean) => modes.push(enabled) },
      importLedgerWallet: async (refreshOnly: boolean) => { imports.push(refreshOnly); },
      verifyConfiguredLedgerDevice: jasmine.createSpy('verifyConfiguredLedgerDevice')
    };
    await ConfigureWalletComponent.prototype.connectLedgerByBluetooth.call(component as any);
    expect(modes).toEqual([true]);
    expect(imports).toEqual([true]);
  });

  it('keeps the existing wallet when Bluetooth is replaced by USB', async () => {
    const modes: boolean[] = [];
    const imports: boolean[] = [];
    const component = {
      walletService: { isLedgerWallet: () => true },
      ledgerService: { isAndroidWeb: false, enableBluetoothMode: (enabled: boolean) => modes.push(enabled) },
      importLedgerWallet: async (refreshOnly: boolean) => { imports.push(refreshOnly); },
      verifyConfiguredLedgerDevice: jasmine.createSpy('verifyConfiguredLedgerDevice')
    };
    await ConfigureWalletComponent.prototype.connectLedgerByUsb.call(component as any);
    expect(modes).toEqual([false]);
    expect(imports).toEqual([true]);
  });

  it('still permits initial Ledger wallet creation on Bluetooth', async () => {
    const imports: boolean[] = [];
    const component = {
      walletService: { isLedgerWallet: () => false },
      ledgerService: { enableBluetoothMode: (_enabled: boolean) => {} },
      importLedgerWallet: async (refreshOnly: boolean) => { imports.push(refreshOnly); },
      verifyConfiguredLedgerDevice: jasmine.createSpy('verifyConfiguredLedgerDevice')
    };
    await ConfigureWalletComponent.prototype.connectLedgerByBluetooth.call(component as any);
    expect(imports).toEqual([false]);
  });
});



describe('Configured Ledger identity detection', () => {
  function setup(stored: string, attached: string, storedIndex = 0) {
    const replace = jasmine.createSpy('replaceConfiguredLedgerWallet').and.resolveTo(true);
    const reset = jasmine.createSpy('resetLedger');
    const read = jasmine.createSpy('getLedgerAccount').and.resolveTo({address: attached});
    const warn = jasmine.createSpy('sendWarning');
    const component: any = {
      walletService: {isLedgerWallet: () => true},
      wallet: {accounts: [{id: stored, index: storedIndex}]},
      ledger: {status: LedgerStatus.READY},
      ledgerService: {getLedgerAccount: read, resetLedger: reset},
      replaceConfiguredLedgerWallet: replace,
      notifications: {sendWarning: warn},
      translocoService: {translate: (key: string) => key}
    };
    return {component, read, replace, reset, warn};
  }

  it('keeps stored accounts when the attached device derives the same address at the same index', async () => {
    const c = setup('nano_same', 'xrb_same', 5);
    await ConfigureWalletComponent.prototype.verifyConfiguredLedgerDevice.call(c.component);
    expect(c.read).toHaveBeenCalledWith(5);
    expect(c.replace).not.toHaveBeenCalled();
    expect(c.reset).not.toHaveBeenCalled();
  });

  it('offers wallet replacement on an address mismatch between Nano X and Nano S Plus', async () => {
    const c = setup('nano_old_x', 'nano_new_s_plus');
    await ConfigureWalletComponent.prototype.verifyConfiguredLedgerDevice.call(c.component);
    expect(c.replace).toHaveBeenCalledTimes(1);
    expect(c.reset).not.toHaveBeenCalled();
    expect(c.component.wallet.accounts[0].id).toBe('nano_old_x');
  });

  it('disconnects a mismatched device if the user cancels replacement', async () => {
    const c = setup('nano_old_x', 'nano_new_s_plus');
    c.replace.and.resolveTo(false);
    await ConfigureWalletComponent.prototype.verifyConfiguredLedgerDevice.call(c.component);
    expect(c.reset).toHaveBeenCalled();
    expect(c.component.ledger.status).toBe(LedgerStatus.NOT_CONNECTED);
    expect(c.component.wallet.accounts[0].id).toBe('nano_old_x');
  });

  it('preserves the old wallet if the Ledger device address cannot be verified', async () => {
    const c = setup('nano_old_x', 'nano_new_s_plus');
    c.read.and.rejectWith(new Error('App unavailable'));
    await ConfigureWalletComponent.prototype.verifyConfiguredLedgerDevice.call(c.component);
    expect(c.reset).toHaveBeenCalled();
    expect(c.replace).not.toHaveBeenCalled();
    expect(c.warn).toHaveBeenCalledWith('ui-notifications.ledger-identity-unverified');
  });

  it('skips hardware verification if the Ledger is not ready', async () => {
    const c = setup('nano_old_x', 'nano_new_s_plus');
    c.component.ledger.status = LedgerStatus.LOCKED;
    await ConfigureWalletComponent.prototype.verifyConfiguredLedgerDevice.call(c.component);
    expect(c.read).not.toHaveBeenCalled();
    expect(c.replace).not.toHaveBeenCalled();
  });
});

describe('Explicit Ledger hardware wallet replacement', () => {
  function setup(confirm: () => Promise<unknown>, prepare: () => Promise<any[]>) {
    const storageKey = 'nault-ledger-replacement-test';
    localStorage.setItem(storageKey, JSON.stringify({ type: 'ledger', accounts: [{ id: 'nano_old' }] }));
    const walletService = {
      storeKey: storageKey,
      isLedgerWallet: () => true,
      prepareLedgerReplacementAccounts: jasmine.createSpy('prepareLedgerReplacementAccounts').and.callFake(prepare),
      activatePreparedLedgerWallet: jasmine.createSpy('activatePreparedLedgerWallet'),
      loadStoredWallet: jasmine.createSpy('loadStoredWallet').and.resolveTo()
    };
    const notification = {
      sendInfo: jasmine.createSpy('sendInfo'),
      sendWarning: jasmine.createSpy('sendWarning'),
      sendSuccess: jasmine.createSpy('sendSuccess'),
      removeNotification: jasmine.createSpy('removeNotification')
    };
    const component: any = {
      walletService,
      ledger: { status: 'ready' },
      replacingLedgerWallet: false,
      translocoService: { translate: (key: string) => key },
      notifications: notification,
      route: { navigate: jasmine.createSpy('navigate').and.resolveTo(true) }
    };
    const previousUiKit = (window as any).UIkit;
    (window as any).UIkit = { modal: { confirm } };
    const restore = () => {
      (window as any).UIkit = previousUiKit;
      localStorage.removeItem(storageKey);
    };
    return { component, walletService, notification, restore, storageKey };
  }

  it('leaves the old wallet untouched when device readiness is not confirmed', async () => {
    const c = setup(async () => true, async () => [{ id: 'nano_new' }]);
    c.component.ledger.status = 'not-connected';
    try {
      await ConfigureWalletComponent.prototype.replaceConfiguredLedgerWallet.call(c.component);
      expect(c.walletService.prepareLedgerReplacementAccounts).not.toHaveBeenCalled();
      expect(c.walletService.activatePreparedLedgerWallet).not.toHaveBeenCalled();
    } finally {
      c.restore();
    }
  });

  it('keeps the old wallet when replacement confirmation is cancelled', async () => {
    const c = setup(async () => { throw new Error('cancelled'); }, async () => [{ id: 'nano_new' }]);
    try {
      await ConfigureWalletComponent.prototype.replaceConfiguredLedgerWallet.call(c.component);
      expect(c.walletService.prepareLedgerReplacementAccounts).not.toHaveBeenCalled();
      expect(c.walletService.activatePreparedLedgerWallet).not.toHaveBeenCalled();
      expect(JSON.parse(localStorage.getItem(c.storageKey)!).accounts[0].id).toBe('nano_old');
    } finally {
      c.restore();
    }
  });

  it('activates the new Ledger accounts only after the full scan succeeds', async () => {
    let finishScan!: (accounts: any[]) => void;
    const scan = new Promise<any[]>(resolve => { finishScan = resolve; });
    const c = setup(async () => true, () => scan);
    try {
      const replacement = ConfigureWalletComponent.prototype.replaceConfiguredLedgerWallet.call(c.component);
      await Promise.resolve();
      await Promise.resolve();
      expect(c.walletService.activatePreparedLedgerWallet).not.toHaveBeenCalled();
      finishScan([{ id: 'nano_new', index: 0 }]);
      await replacement;
      expect(c.walletService.activatePreparedLedgerWallet)
        .toHaveBeenCalledWith([{ id: 'nano_new', index: 0 }]);
      expect(c.component.route.navigate).toHaveBeenCalledWith(['accounts']);
      expect(c.component.replacingLedgerWallet).toBe(false);
    } finally {
      c.restore();
    }
  });

  it('preserves the saved wallet when RPC discovery fails', async () => {
    const c = setup(async () => true, async () => { throw new Error('RPC offline'); });
    try {
      await ConfigureWalletComponent.prototype.replaceConfiguredLedgerWallet.call(c.component);
      expect(c.walletService.activatePreparedLedgerWallet).not.toHaveBeenCalled();
      expect(JSON.parse(localStorage.getItem(c.storageKey)!).accounts[0].id).toBe('nano_old');
      expect(c.notification.sendWarning).toHaveBeenCalled();
    } finally {
      c.restore();
    }
  });

  it('restores the old persisted wallet when committing the new one fails', async () => {
    const c = setup(async () => true, async () => [{ id: 'nano_new', index: 0 }]);
    c.walletService.activatePreparedLedgerWallet.and.callFake(() => {
      localStorage.setItem(c.storageKey, 'unexpected new state');
      throw new Error('storage error');
    });
    try {
      await ConfigureWalletComponent.prototype.replaceConfiguredLedgerWallet.call(c.component);
      expect(c.walletService.loadStoredWallet).toHaveBeenCalled();
      expect(JSON.parse(localStorage.getItem(c.storageKey)!).accounts[0].id).toBe('nano_old');
      expect(c.notification.sendWarning).toHaveBeenCalled();
    } finally {
      c.restore();
    }
  });
});
