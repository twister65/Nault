import { TestBed, inject } from '@angular/core/testing';

import { WalletService } from './wallet.service';

describe('WalletService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [WalletService]
    });
  });

  it('should be created', inject([WalletService], (service: WalletService) => {
    expect(service).toBeTruthy();
  }));
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
