import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { BehaviorSubject, firstValueFrom, Observable } from 'rxjs';
import { WalletService } from '../services/wallet.service';
import { walletConfiguredGuard } from './wallet-configured.guard';

describe('walletConfiguredGuard', () => {
  const restored$ = new BehaviorSubject<boolean>(false);
  let configured: boolean;
  let isConfigured: jasmine.Spy;

  beforeEach(() => {
    restored$.next(false);
    configured = false;
    isConfigured = jasmine.createSpy('isConfigured').and.callFake(() => configured);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: WalletService, useValue: { walletLoaded$: restored$, isConfigured } }
      ]
    });
  });

  const activate = (): Promise<boolean | UrlTree> => firstValueFrom(
    TestBed.runInInjectionContext(() =>
      walletConfiguredGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
    ) as Observable<boolean | UrlTree>
  );

  it('waits for persisted wallet restoration before deciding on a direct route', async () => {
    let resolved = false;
    const decision = activate().then(result => { resolved = true; return result; });
    await Promise.resolve();
    expect(resolved).toBeFalse();
    expect(isConfigured).not.toHaveBeenCalled();

    configured = true;
    restored$.next(true);
    expect(await decision).toBeTrue();
  });

  it('redirects an unconfigured wallet to setup', async () => {
    restored$.next(true);
    const decision = await activate();
    expect(decision instanceof UrlTree).toBeTrue();
    expect(TestBed.inject(Router).serializeUrl(decision as UrlTree)).toBe('/configure-wallet');
  });

  it('permits configured wallets even if the Ledger transport is disconnected', async () => {
    restored$.next(true);
    configured = true; // Ledger is configured; hardware connection is independent.
    expect(await activate()).toBeTrue();
  });

  it('blocks both routes again after a wallet reset', async () => {
    restored$.next(true);
    configured = true;
    expect(await activate()).toBeTrue();
    configured = false;
    expect(TestBed.inject(Router).serializeUrl(await activate() as UrlTree)).toBe('/configure-wallet');
  });
});
