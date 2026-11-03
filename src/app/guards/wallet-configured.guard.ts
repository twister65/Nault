import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs';
import { WalletService } from '../services/wallet.service';

// Don't mistake the as-yet-unloaded wallet for an unconfigured one on a deep link.
// Ledger connectivity is deliberately not part of the authorization decision.
export const walletConfiguredGuard: CanActivateFn = () => {
  const walletService = inject(WalletService);
  const router = inject(Router);

  return walletService.walletLoaded$.pipe(
    filter(loaded => loaded),
    take(1),
    map(() => walletService.isConfigured()
      ? true
      : router.createUrlTree(['/configure-wallet']))
  );
};
