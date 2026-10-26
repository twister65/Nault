import { ConfigureWalletComponent } from './configure-wallet.component';
import { LedgerStatus } from '../../services/ledger.service';

describe('Use Ledger explicitly configures the attached device', () => {
  it('imports the attached Ledger when switching to USB even with a saved Ledger wallet', async () => {
    const enableBluetoothMode = jasmine.createSpy('enableBluetoothMode');
    const importLedgerWallet = jasmine.createSpy('importLedgerWallet').and.resolveTo();
    const component: any = {
      ledgerService: { isAndroidWeb: false, enableBluetoothMode },
      importLedgerWallet
    };
    await ConfigureWalletComponent.prototype.connectLedgerByUsb.call(component);
    expect(enableBluetoothMode).toHaveBeenCalledWith(false);
    expect(importLedgerWallet).toHaveBeenCalledWith();
  });

  it('imports the attached Ledger when switching to Bluetooth', async () => {
    const enableBluetoothMode = jasmine.createSpy('enableBluetoothMode');
    const importLedgerWallet = jasmine.createSpy('importLedgerWallet').and.resolveTo();
    const component: any = { ledgerService: { enableBluetoothMode }, importLedgerWallet };
    await ConfigureWalletComponent.prototype.connectLedgerByBluetooth.call(component);
    expect(enableBluetoothMode).toHaveBeenCalledWith(true);
    expect(importLedgerWallet).toHaveBeenCalledWith();
  });

  it('never opens a USB connection on Android', async () => {
    const enableBluetoothMode = jasmine.createSpy('enableBluetoothMode');
    const importLedgerWallet = jasmine.createSpy('importLedgerWallet');
    const component: any = {
      ledgerService: { isAndroidWeb: true, enableBluetoothMode },
      importLedgerWallet
    };
    await ConfigureWalletComponent.prototype.connectLedgerByUsb.call(component);
    expect(enableBluetoothMode).not.toHaveBeenCalled();
    expect(importLedgerWallet).not.toHaveBeenCalled();
  });

  function setup(options: {ready?: boolean; walletType?: 'ledger' | 'seed'; scan?: Promise<any[]>} = {}) {
    const walletType = options.walletType || 'ledger';
    const stored = 'nault-test-use-ledger';
    localStorage.setItem(stored, JSON.stringify({ type: walletType, accounts: [{id:'nano_x',index:0}] }));
    const accounts = [{ id: 'nano_s_plus', index: 0 }];
    const ledger = { status: options.ready === false ? LedgerStatus.NOT_CONNECTED : LedgerStatus.READY };
    const notifications = {
      sendInfo: jasmine.createSpy('sendInfo'),
      removeNotification: jasmine.createSpy('removeNotification'),
      sendWarning: jasmine.createSpy('sendWarning'),
      sendSuccess: jasmine.createSpy('sendSuccess')
    };
    const walletService: any = {
      storeKey: stored,
      isLedgerWallet: () => walletType === 'ledger',
      prepareLedgerReplacementAccounts: jasmine.createSpy('prepareLedgerReplacementAccounts')
        .and.callFake(() => options.scan || Promise.resolve(accounts)),
      activatePreparedLedgerWallet: jasmine.createSpy('activatePreparedLedgerWallet'),
      loadStoredWallet: jasmine.createSpy('loadStoredWallet').and.resolveTo()
    };
    const ledgerService: any = {
      configuringWallet: false,
      loadLedger: jasmine.createSpy('loadLedger').and.resolveTo(options.ready !== false),
      resetLedger: jasmine.createSpy('resetLedger')
    };
    const component: any = {
      isConfigured: () => true,
      walletService, ledgerService, ledger, notifications,
      translocoService: { translate: (key: string) => key },
      route: { navigate: jasmine.createSpy('navigate').and.resolveTo(true) },
      confirmWalletOverwrite: jasmine.createSpy('confirmWalletOverwrite').and.resolveTo(true)
    };
    return {
      component, walletService, ledgerService, notifications, accounts,
      cleanup: () => localStorage.removeItem(stored)
    };
  }

  it('replaces Nano X accounts with Nano S Plus accounts after discovery, without a replacement dialog', async () => {
    const c = setup();
    try {
      await ConfigureWalletComponent.prototype.importLedgerWallet.call(c.component);
      expect(c.walletService.prepareLedgerReplacementAccounts).toHaveBeenCalled();
      expect(c.walletService.activatePreparedLedgerWallet).toHaveBeenCalledWith(c.accounts);
      expect(c.component.confirmWalletOverwrite).not.toHaveBeenCalled();
      expect(c.component.route.navigate).toHaveBeenCalledWith(['accounts']);
      expect(c.ledgerService.configuringWallet).toBe(false);
    } finally { c.cleanup(); }
  });

  it('keeps the previous wallet while the Ledger account scan is in progress', async () => {
    let finishScan!: (v: any[]) => void;
    const pending = new Promise<any[]>(resolve => { finishScan = resolve; });
    const c = setup({scan: pending});
    try {
      const loading = ConfigureWalletComponent.prototype.importLedgerWallet.call(c.component);
      await Promise.resolve();
      await Promise.resolve();
      expect(c.walletService.activatePreparedLedgerWallet).not.toHaveBeenCalled();
      finishScan(c.accounts);
      await loading;
      expect(c.walletService.activatePreparedLedgerWallet).toHaveBeenCalledWith(c.accounts);
    } finally { c.cleanup(); }
  });

  it('leaves the Nano X wallet intact when the Nano S Plus is not ready', async () => {
    const c = setup({ready: false});
    try {
      await ConfigureWalletComponent.prototype.importLedgerWallet.call(c.component);
      expect(c.walletService.activatePreparedLedgerWallet).not.toHaveBeenCalled();
      expect(c.ledgerService.resetLedger).toHaveBeenCalled();
      expect(c.ledgerService.configuringWallet).toBe(false);
    } finally { c.cleanup(); }
  });

  it('keeps the previous wallet if the RPC scan fails', async () => {
    const c = setup({scan: Promise.reject(new Error('RPC offline'))});
    try {
      await ConfigureWalletComponent.prototype.importLedgerWallet.call(c.component);
      expect(c.walletService.activatePreparedLedgerWallet).not.toHaveBeenCalled();
      expect(c.notifications.sendWarning).toHaveBeenCalled();
      expect(c.ledgerService.resetLedger).toHaveBeenCalled();
    } finally { c.cleanup(); }
  });

  it('requires backup confirmation when replacing a software wallet', async () => {
    const c = setup({walletType:'seed'});
    c.component.confirmWalletOverwrite.and.resolveTo(false);
    try {
      await ConfigureWalletComponent.prototype.importLedgerWallet.call(c.component);
      expect(c.component.confirmWalletOverwrite).toHaveBeenCalledTimes(1);
      expect(c.walletService.activatePreparedLedgerWallet).not.toHaveBeenCalled();
    } finally { c.cleanup(); }
  });

  it('refreshes Ledger status without replacing any wallet accounts', async () => {
    const c = setup();
    c.ledgerService.transportMode = 'USB';
    try {
      await ConfigureWalletComponent.prototype.refreshLedgerStatus.call(c.component);
      expect(c.ledgerService.loadLedger).toHaveBeenCalledWith(true, false);
      expect(c.walletService.activatePreparedLedgerWallet).not.toHaveBeenCalled();
    } finally { c.cleanup(); }
  });
});
