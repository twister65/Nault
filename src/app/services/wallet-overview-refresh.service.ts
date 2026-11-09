import { Injectable } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { AppSettingsService } from './app-settings.service';
import { NotificationService } from './notification.service';
import { RepresentativeService } from './representative.service';
import { WalletService } from './wallet.service';

/** Read-only refresh shared by the menu and the Accounts page. */
@Injectable({ providedIn: 'root' })
export class WalletOverviewRefreshService {
  refreshing = false;

  constructor(
    private wallet: WalletService,
    private representatives: RepresentativeService,
    private settings: AppSettingsService,
    private notifications: NotificationService,
    private transloco: TranslocoService
  ) {}

  get disabled(): boolean {
    return this.refreshing ||
      this.wallet.wallet.updatingBalance ||
      !this.wallet.isConfigured() ||
      !this.settings.settings.serverAPI;
  }

  async refresh(): Promise<void> {
    if (this.disabled) return;
    this.refreshing = true;
    try {
      // Reload balance, pending amounts and frontiers; never sign with Ledger.
      try {
        await this.wallet.reloadBalances();
      } catch {
        this.notifications.sendWarning(this.transloco.translate('ui-shell.balance-refresh-failed'));
      }

      // Representative identity, alias and health are queried separately.
      // The sidebar observes walletReps$, so it updates without a PWA reload.
      try {
        await this.representatives.getRepresentativesOverview();
      } catch {
        this.notifications.sendWarning(this.transloco.translate('ui-shell.representative-refresh-failed'));
      }
    } finally {
      this.refreshing = false;
    }
  }
}
