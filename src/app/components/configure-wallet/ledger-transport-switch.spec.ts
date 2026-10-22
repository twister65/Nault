import { ConfigureWalletComponent } from './configure-wallet.component';

describe('Configured Ledger wallet transport switching', () => {
  it('keeps the existing wallet when USB is replaced by Bluetooth', async () => {
    const modes: boolean[] = [];
    const imports: boolean[] = [];
    const component = {
      walletService: { isLedgerWallet: () => true },
      ledgerService: { enableBluetoothMode: (enabled: boolean) => modes.push(enabled) },
      importLedgerWallet: async (refreshOnly: boolean) => { imports.push(refreshOnly); }
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
      importLedgerWallet: async (refreshOnly: boolean) => { imports.push(refreshOnly); }
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
      importLedgerWallet: async (refreshOnly: boolean) => { imports.push(refreshOnly); }
    };
    await ConfigureWalletComponent.prototype.connectLedgerByBluetooth.call(component as any);
    expect(imports).toEqual([false]);
  });
});
