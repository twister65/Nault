import { of, Subject } from 'rxjs';
import { WalletService } from './wallet.service';

describe('WalletService', () => {
  it('initializes with isolated websocket and address-book event streams', () => {
    // Constructor smoke test: no real RPC connection, Ledger or wallet secrets.
    const service = new WalletService(
      null as any, null as any, null as any,
      { addressBook$: of(null) } as any,
      null as any, null as any,
      { newTransactions$: of(null), connected$: new Subject<void>() } as any,
      null as any, null as any, null as any, null as any
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
  it('retries once after a refresh was skipped while an RPC call was running', async () => {
    const service = Object.create(WalletService.prototype) as WalletService;
    service.wallet = { updatingBalance: false } as any;

    let finishFirst!: () => void;
    const firstRpc = new Promise<void>(resolve => { finishFirst = resolve; });
    let callCount = 0;
    spyOn<any>(service, 'refreshBalances').and.callFake(async () => {
      callCount++;
      if (callCount === 1) await firstRpc;
      // In production refreshBalances resets the spinner when it completes.
      service.wallet.updatingBalance = false;
    });

    jasmine.clock().install();
    try {
      const initialRefresh = service.reloadBalances();
      await service.reloadBalances();
      await service.reloadBalances(); // Several WS confirmations are coalesced.
      expect(callCount).toBe(1);

      finishFirst();
      await initialRefresh;
      expect(callCount).toBe(1);

      jasmine.clock().tick(351);
      await Promise.resolve();
      expect(callCount).toBe(2);
    } finally {
      jasmine.clock().uninstall();
    }
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
      null as any, null as any, null as any, notifications as any
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
      null as any, null as any, null as any, notifications as any
    );
    service.wallet.accounts = [{ id: 'nano_test' }] as any;
    spyOn(service, 'reloadBalances').and.returnValue(Promise.reject(new Error('RPC offline')));

    connected$.next();
    await Promise.resolve();
    await Promise.resolve();
    expect(notifications.sendWarning).toHaveBeenCalled();
  });
});
