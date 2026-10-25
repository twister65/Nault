import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import {ActivatedRoute, Router} from '@angular/router';
import {NotificationService} from '../../services/notification.service';
import * as CryptoJS from 'crypto-js';
import {WalletService, WalletType} from '../../services/wallet.service';
import {UtilService} from '../../services/util.service';

@Component({
    selector: 'app-import-wallet',
    templateUrl: './import-wallet.component.html',
    styleUrls: ['./import-wallet.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ImportWalletComponent implements OnInit {
  private readonly translocoService = inject(TranslocoService);

  activePanel = 'error';

  walletPassword = '';
  validImportData = false;
  importData: any = null;
  hostname = '';

  constructor(private route: ActivatedRoute, private notifications: NotificationService, private walletService: WalletService,
    private router: Router, private util: UtilService) { }

  ngOnInit() {
    const importData = this.route.snapshot.fragment;
    const queryData = this.route.snapshot.queryParams;
    if (!importData || !importData.length) {
      return this.importDataError(this.translocoService.translate('ui-notifications.import-data-missing'));
    }

    if ('hostname' in queryData) this.hostname = queryData.hostname;
    const decodedData = atob(importData);

    try {
      const importBlob = JSON.parse(decodedData);
      if (!importBlob || (!importBlob.seed && !importBlob.privateKey && !importBlob.expandedKey)) {
        return this.importDataError(this.translocoService.translate('ui-notifications.import-data-link-bad'));
      }
      this.validImportData = true;
      this.importData = importBlob;
      this.activePanel = 'import';
    } catch (err) {
      return this.importDataError(this.translocoService.translate('ui-notifications.import-data-decode'));
    }
  }

  importDataError(message: string) {
    this.activePanel = 'error';
    return this.notifications.sendError(message);
  }

  async decryptWallet() {
    // Attempt to decrypt the seed value using the password
    try {
      await new Promise(resolve => setTimeout(resolve, 500)); // brute force delay
      let walletType: WalletType | null = null;
      let secret = '';
      if (this.importData.seed) {
        secret = this.importData.seed;
        walletType = 'seed';
      } else if (this.importData.privateKey) {
        secret = this.importData.privateKey;
        walletType = 'privateKey';
      } else if (this.importData.expandedKey) {
        secret = this.importData.expandedKey;
        walletType = 'expandedKey';
      }
      if (walletType === null) {
        return this.importDataError(this.translocoService.translate('ui-notifications.import-data-link-bad'));
      }
      const decryptedBytes = CryptoJS.AES.decrypt(secret, this.walletPassword);
      const decryptedSecret = decryptedBytes?.toString(CryptoJS.enc.Utf8);
      if (!decryptedSecret || decryptedSecret.length !== 64) {
        this.walletPassword = '';
        return this.notifications.sendError(this.translocoService.translate('ui-notifications.password-invalid'));
      }
      if (!this.util.nano.isValidSeed(decryptedSecret)) {
        this.walletPassword = '';
        return this.notifications.sendError(this.translocoService.translate('ui-notifications.import-seed-invalid'));
      }

      this.router.navigate(['accounts']); // load accounts and watch them update in real-time
      this.notifications.sendInfo(this.translocoService.translate('ui-notifications.wallet-loading'));
      if (await this.walletService.loadImportedWallet(decryptedSecret, this.walletPassword,
        this.importData.accountsIndex || 0, this.importData.indexes || null, walletType)) {
          this.notifications.sendSuccess(this.translocoService.translate('ui-notifications.wallet-imported'), {length: 10000});
      } else {
        return this.notifications.sendError(this.translocoService.translate('ui-notifications.wallet-import-failed'));
      }

    } catch (err) {
      this.walletPassword = '';
      return this.notifications.sendError(this.translocoService.translate('ui-notifications.password-invalid'));
    }
  }

}
