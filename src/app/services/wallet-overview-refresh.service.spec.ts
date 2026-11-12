import { WalletOverviewRefreshService } from './wallet-overview-refresh.service';

describe('WalletOverviewRefreshService', () => {
  let service: WalletOverviewRefreshService;
  let balances: jasmine.Spy;
  let representatives: jasmine.Spy;
  let warnings: jasmine.Spy;
  let walletConfigured: boolean;
  const walletState = { updatingBalance: false };
  const settings = { settings: { serverAPI: 'https://rpc.example.test' } };

  beforeEach(() => {
    walletConfigured = true;
    walletState.updatingBalance = false;
    settings.settings.serverAPI = 'https://rpc.example.test';
    balances = jasmine.createSpy('reloadBalances').and.returnValue(Promise.resolve());
    representatives = jasmine.createSpy('getRepresentativesOverview').and.returnValue(Promise.resolve([]));
    warnings = jasmine.createSpy('sendWarning');
    service = new WalletOverviewRefreshService(
      { wallet: walletState, isConfigured: () => walletConfigured, reloadBalances: balances } as any,
      { getRepresentativesOverview: representatives } as any,
      settings as any,
      { sendWarning: warnings } as any,
      { translate: (key: string) => key } as any
    );
  });

  it('refreshes balances then representative overview', async () => {
    await service.refresh();
    expect(balances).toHaveBeenCalledTimes(1);
    expect(representatives).toHaveBeenCalledTimes(1);
    expect(service.refreshing).toBeFalse();
  });

  it('coalesces repeated clicks while refresh is in flight', async () => {
    let release!: () => void;
    balances.and.returnValue(new Promise<void>(resolve => { release = resolve; }));
    const first = service.refresh();
    await service.refresh();
    expect(balances).toHaveBeenCalledTimes(1);
    release();
    await first;
    expect(representatives).toHaveBeenCalledTimes(1);
  });

  it('does not probe without configured wallet or online RPC setting', async () => {
    walletConfigured = false;
    await service.refresh();
    walletConfigured = true;
    settings.settings.serverAPI = '';
    await service.refresh();
    expect(balances).not.toHaveBeenCalled();
    expect(representatives).not.toHaveBeenCalled();
  });

  it('does not overlap an automatic balance refresh', async () => {
    walletState.updatingBalance = true;
    await service.refresh();
    expect(balances).not.toHaveBeenCalled();
    expect(representatives).not.toHaveBeenCalled();
  });

  it('attempts representative refresh even when balance RPC fails', async () => {
    balances.and.returnValue(Promise.reject(new Error('RPC error')));
    await service.refresh();
    expect(representatives).toHaveBeenCalledTimes(1);
    expect(warnings).toHaveBeenCalledWith('ui-shell.balance-refresh-failed');
    expect(service.refreshing).toBeFalse();
  });

  it('keeps the balance refresh complete on representative failure', async () => {
    representatives.and.returnValue(Promise.reject(new Error('Representative unavailable')));
    await service.refresh();
    expect(balances).toHaveBeenCalledTimes(1);
    expect(warnings).toHaveBeenCalledWith('ui-shell.representative-refresh-failed');
    expect(service.refreshing).toBeFalse();
  });
});
