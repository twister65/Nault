import { ConfigureWalletComponent } from './configure-wallet.component';
import { LedgerStatus } from '../../services/ledger.service';

describe('Use Ledger explicitly configures the attached device', () => {
  it('imports the attached Ledger when switching to USB even with a saved Ledger wallet', async () => {
    const enableBluetoothMode = jasmine.createSpy('enableBluetoothMode');
    const importLedgerWallet = jasmine.createSpy('importLedgerWallet').and.resolveTo();
    const component: any = {
      ledgerService: { isAndroidWeb: false, isDesktop: false, enableBluetoothMode,
        resetLedger: jasmine.createSpy('resetLedger'),
        ledgerStatus$: { next: jasmine.createSpy('next') } },
      ledger: { status: LedgerStatus.READY },
      importLedgerWallet
    };
    await ConfigureWalletComponent.prototype.connectLedgerByUsb.call(component);
    expect(enableBluetoothMode).toHaveBeenCalledWith(false);
    expect(importLedgerWallet).toHaveBeenCalledWith();
  });

  it('does not close the transport twice when changing Bluetooth to USB during setup', async () => {
    const resetLedger = jasmine.createSpy('resetLedger');
    const ledger = { status: LedgerStatus.READY };
    const component: any = {
      ledger,
      ledgerService: {
        isAndroidWeb: false,
        isDesktop: false,
        transportMode: 'Bluetooth',
        enableBluetoothMode: jasmine.createSpy('enableBluetoothMode').and.callFake(() => {
          resetLedger(); // Already done inside LedgerService.enableBluetoothMode.
        }),
        resetLedger,
        ledgerStatus$: { next: jasmine.createSpy('next') },
      },
      importLedgerWallet: jasmine.createSpy('importLedgerWallet').and.resolveTo()
    };

    await ConfigureWalletComponent.prototype.connectLedgerByUsb.call(component);

    expect(resetLedger).toHaveBeenCalledTimes(1);
    expect(component.ledgerService.enableBluetoothMode).toHaveBeenCalledWith(false);
    expect(component.importLedgerWallet).toHaveBeenCalled();
    expect(ledger.status).toBe(LedgerStatus.NOT_CONNECTED);
  });

  it('does not reuse an old Bluetooth Nano-app warning after switching to USB', () => {
    const component: any = {
      ledgerService: {
        bluetoothErrorMessage: 'Nano app is not open on your Ledger. Open the Nano app, then click Reconnect.'
      },
      translocoService: { translate: (key: string) =>
        key === 'ui-notifications.ledger-nano-app-not-open' ? 'L’application Nano n’est pas ouverte.' : key }
    };
    expect(Object.getOwnPropertyDescriptor(ConfigureWalletComponent.prototype, 'bluetoothConnectionHint')!
      .get!.call(component)).toBe('L’application Nano n’est pas ouverte.');
  });

  it('publishes disconnected status to sidebar before new USB wallet configuration', async () => {
    const ledgerStatus$ = { next: jasmine.createSpy('next') };
    const ledger = { status: LedgerStatus.READY };
    const component: any = {
      ledger,
      ledgerService: {
        isAndroidWeb: false,
        isDesktop: false,
        enableBluetoothMode: jasmine.createSpy('enableBluetoothMode'),
        resetLedger: jasmine.createSpy('resetLedger'),
        ledgerStatus$
      },
      importLedgerWallet: jasmine.createSpy('importLedgerWallet').and.resolveTo()
    };

    await ConfigureWalletComponent.prototype.connectLedgerByUsb.call(component);

    expect(ledger.status).toBe(LedgerStatus.NOT_CONNECTED);
    expect(ledgerStatus$.next).toHaveBeenCalledWith({
      status: LedgerStatus.NOT_CONNECTED, statusText: ''
    });
    expect(component.importLedgerWallet).toHaveBeenCalled();
  });

  it('imports the attached Ledger when switching to Bluetooth', async () => {
    const enableBluetoothMode = jasmine.createSpy('enableBluetoothMode');
    const importLedgerWallet = jasmine.createSpy('importLedgerWallet').and.resolveTo();
    const component: any = { ledgerService: { enableBluetoothMode }, importLedgerWallet };
    await ConfigureWalletComponent.prototype.connectLedgerByBluetooth.call(component);
    expect(enableBluetoothMode).toHaveBeenCalledWith(true);
    expect(importLedgerWallet).toHaveBeenCalledWith();
  });

  it('does not change transports during an existing Ledger wallet import', async () => {
    const changeMode = jasmine.createSpy('enableBluetoothMode');
    const load = jasmine.createSpy('importLedgerWallet');
    const component: any = {
      ledgerSetupInProgress: true,
      ledgerService: { isAndroidWeb: false, enableBluetoothMode: changeMode },
      importLedgerWallet: load
    };

    await ConfigureWalletComponent.prototype.connectLedgerByBluetooth.call(component);
    await ConfigureWalletComponent.prototype.connectLedgerByUsb.call(component);

    expect(changeMode).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
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

  function setup(options: {ready?: boolean; walletType?: 'ledger' | 'seed'; scan?: Promise<any[]>; configured?: boolean} = {}) {
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
      resetLedger: jasmine.createSpy('resetLedger'),
      ledgerStatus$: { next: jasmine.createSpy('next') }
    };
    const component: any = {
      isConfigured: () => options.configured !== false,
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

  it('confirms before replacing existing Nano X accounts with Nano S Plus accounts', async () => {
    const c = setup();
    try {
      await ConfigureWalletComponent.prototype.importLedgerWallet.call(c.component);
      expect(c.walletService.prepareLedgerReplacementAccounts).toHaveBeenCalled();
      expect(c.walletService.activatePreparedLedgerWallet).toHaveBeenCalledWith(c.accounts);
      expect(c.component.confirmWalletOverwrite).toHaveBeenCalledTimes(1);
      expect(c.component.route.navigate).toHaveBeenCalledWith(['accounts']);
      expect(c.ledgerService.configuringWallet).toBe(false);
    } finally { c.cleanup(); }
  });

  it('rejects overlapping wallet imports while a Ledger account scan is running', async () => {
    let finishScan!: (v: any[]) => void;
    const pendingScan = new Promise<any[]>(resolve => { finishScan = resolve; });
    const c = setup({ scan: pendingScan });
    try {
      const first = ConfigureWalletComponent.prototype.importLedgerWallet.call(c.component);
      expect(c.component.ledgerSetupInProgress).toBe(true);
      await ConfigureWalletComponent.prototype.importLedgerWallet.call(c.component);
      expect(c.walletService.prepareLedgerReplacementAccounts).toHaveBeenCalledTimes(1);
      expect(c.component.confirmWalletOverwrite).toHaveBeenCalledTimes(1);
      expect(c.walletService.activatePreparedLedgerWallet).not.toHaveBeenCalled();
      finishScan(c.accounts);
      await first;
      expect(c.walletService.activatePreparedLedgerWallet).toHaveBeenCalledTimes(1);
      expect(c.component.ledgerSetupInProgress).toBe(false);
    } finally { c.cleanup(); }
  });

  it('leaves saved Ledger wallet accounts untouched if replacement is cancelled', async () => {
    const c = setup();
    c.component.confirmWalletOverwrite.and.resolveTo(false);
    const previous = localStorage.getItem(c.walletService.storeKey);
    try {
      await ConfigureWalletComponent.prototype.importLedgerWallet.call(c.component);
      expect(c.component.confirmWalletOverwrite).toHaveBeenCalledTimes(1);
      expect(c.walletService.prepareLedgerReplacementAccounts).not.toHaveBeenCalled();
      expect(c.walletService.activatePreparedLedgerWallet).not.toHaveBeenCalled();
      expect(c.component.route.navigate).not.toHaveBeenCalled();
      expect(localStorage.getItem(c.walletService.storeKey)).toBe(previous);
      expect(c.ledgerService.configuringWallet).toBe(false);
      expect(c.ledgerService.resetLedger).toHaveBeenCalled();
      expect(c.ledgerService.ledgerStatus$.next).toHaveBeenCalledWith({
        status: LedgerStatus.NOT_CONNECTED, statusText: ''
      });
    } finally { c.cleanup(); }
  });

  it('does not request replacement confirmation if no wallet is configured', async () => {
    const c = setup({ configured: false });
    try {
      await ConfigureWalletComponent.prototype.importLedgerWallet.call(c.component);
      expect(c.component.confirmWalletOverwrite).not.toHaveBeenCalled();
      expect(c.walletService.activatePreparedLedgerWallet).toHaveBeenCalledWith(c.accounts);
    } finally { c.cleanup(); }
  });

  it('shows a translated replacement warning for an existing Ledger wallet', async () => {
    const modalConfirm = jasmine.createSpy('confirm').and.resolveTo(true);
    const original = (window as any).UIkit;
    (window as any).UIkit = { modal: { confirm: modalConfirm } };
    const component: any = {
      isConfigured: () => true,
      walletService: { isLedgerWallet: () => true },
      translocoService: { translate: (key: string) => ({
        'ui-wallet-setup.overwrite-ledger-before': 'A Ledger wallet is already configured in Nault. This will',
        'ui-wallet-setup.overwrite-ledger-strong': 'replace its saved accounts with those of the connected Ledger',
        'ui-wallet-setup.overwrite-ledger-after': 'Your funds and Ledger devices will not be changed.',
        'ui-wallet-setup.confirm-overwrite': 'Confirm replacement',
        'general.cancel': 'Cancel'
      } as Record<string, string>)[key] || key },
      notifications: { sendInfo: jasmine.createSpy('sendInfo') }
    };
    try {
      expect(await ConfigureWalletComponent.prototype.confirmWalletOverwrite.call(component)).toBe(true);
      expect(modalConfirm).toHaveBeenCalledTimes(1);
      const message: string = modalConfirm.calls.mostRecent().args[0];
      expect(message).toContain('replace its saved accounts');
      expect(message).toContain('Your funds and Ledger devices will not be changed');
      expect(modalConfirm.calls.mostRecent().args[1]).toEqual({
        i18n: { ok: 'Confirm replacement', cancel: 'Cancel' }
      });
    } finally { (window as any).UIkit = original; }
  });

  it('keeps the previous wallet without a failure notification when the USB chooser is cancelled', async () => {
    const c = setup({ ready: false });
    c.ledgerService.lastUsbSelectionCancelled = true;
    const previous = localStorage.getItem(c.walletService.storeKey);
    try {
      await ConfigureWalletComponent.prototype.importLedgerWallet.call(c.component);
      expect(c.walletService.prepareLedgerReplacementAccounts).not.toHaveBeenCalled();
      expect(c.walletService.activatePreparedLedgerWallet).not.toHaveBeenCalled();
      expect(c.component.confirmWalletOverwrite).not.toHaveBeenCalled();
      expect(c.notifications.sendWarning).not.toHaveBeenCalled();
      expect(localStorage.getItem(c.walletService.storeKey)).toBe(previous);
      expect(c.ledgerService.ledgerStatus$.next).toHaveBeenCalledWith({
        status: LedgerStatus.NOT_CONNECTED, statusText: ''
      });
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
