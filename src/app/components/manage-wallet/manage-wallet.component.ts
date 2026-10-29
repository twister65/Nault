import { Component, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { MIN_WALLET_PASSWORD_LENGTH, isStrongWalletPassword } from '../../services/wallet-encryption';
import {WalletService} from '../../services/wallet.service';
import {NotificationService} from '../../services/notification.service';
import {ApiService} from '../../services/api.service';
import {UtilService} from '../../services/util.service';
import {AppSettingsService} from '../../services/app-settings.service';
import * as QRCode from 'qrcode';
import { entropyToMnemonic } from '../../services/bip39-browser';
import { Subscription } from 'rxjs';
import {formatDate} from '@angular/common';

type CsvCell = string | number | null | undefined;
type CsvRow = Record<string, CsvCell>;
interface HistoryExportEntry {
  account: string;
  type: string;
  amount: string;
  hash: string;
  height: string | number;
  local_timestamp: string | number;
}

@Component({
    selector: 'app-manage-wallet',
    templateUrl: './manage-wallet.component.html',
    styleUrls: ['./manage-wallet.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ManageWalletComponent implements OnInit, OnDestroy {
  private readonly translocoService = inject(TranslocoService);


  wallet = this.walletService.wallet;
  accounts = this.walletService.wallet.accounts;

  newPassword = '';
  readonly minimumPasswordLength = MIN_WALLET_PASSWORD_LENGTH;
  confirmPassword = '';

  showQRExport = false;
  QRExportUrl = '';
  QRExportImg = '';
  seedMnemonicValue = '';
  private mnemonicSubscription: Subscription | null = null;
  private mnemonicGeneration = 0;

  csvExportStarted = false;
  transactionHistoryLimit = 500; // if the backend server limit changes, change this too
  selAccountInit = false;
  invalidCsvCount = false;
  invalidCsvOffset = false;
  csvAccount = this.accounts.length > 0 ? this.accounts[0].id : '0';
  csvCount = this.transactionHistoryLimit.toString();
  csvOffset = '';
  beyondCsvLimit = false;
  exportingCsv = false;
  orderOptions = [
    { name: 'Newest Transactions First', value: false },
    { name: 'Oldest Transactions First', value: true },
  ];
  selectedOrder = this.orderOptions[0].value;
  exportEnabled = true;

  constructor(
    public walletService: WalletService,
    public notifications: NotificationService,
    private api: ApiService,
    private util: UtilService,
    public settings: AppSettingsService) { }

  async ngOnInit() {
    this.wallet = this.walletService.wallet;
    // Recompute only when unlocking, never as a synchronous template expression.
    this.mnemonicSubscription = this.wallet.locked$.subscribe(locked => {
      void this.refreshSeedMnemonic(locked);
    });

    // Update selected account if changed in the sidebar
    this.walletService.wallet.selectedAccount$.subscribe(async acc => {
      if (this.selAccountInit) {
        this.csvAccount = acc ? acc.id : (this.accounts.length > 0 ? this.accounts[0].id : '0');
      }
      this.selAccountInit = true;
    });

    // Set the account selected in the sidebar as default
    if (this.walletService.wallet.selectedAccount !== null) {
      this.csvAccount = this.walletService.wallet.selectedAccount.id;
    }
  }

  async changePassword() {
    if (this.newPassword !== this.confirmPassword) {
      return this.notifications.sendError(this.translocoService.translate('ui-notifications.passwords-mismatch'));
    }
    if (!isStrongWalletPassword(this.newPassword)) {
      return this.notifications.sendError(this.translocoService.translate('ui-notifications.password-minimum'));
    }
    if (this.walletService.isLocked()) {
      const wasUnlocked = await this.walletService.requestWalletUnlock();
      if (!wasUnlocked) return;
    }

    // Migrating an old backup must be an explicit opt-in, never a side-effect
    // of unlocking an old wallet. Require confirmation that a recovery backup exists.
    if (this.walletService.isLegacySoftwareWallet()) {
      const UIkit = (window as unknown as { UIkit: { modal: {
        confirm(message: string, options: { labels: { ok: string; cancel: string } }): Promise<unknown>
      } } }).UIkit;
      try {
        await UIkit.modal.confirm(this.translocoService.translate('ui-manage-wallet.legacy-migration-confirm'), {
          labels: {
            ok: this.translocoService.translate('ui-manage-wallet.password-update'),
            cancel: this.translocoService.translate('general.cancel'),
          }
        });
      } catch {
        return;
      }
    }
    try {
      await this.walletService.setSoftwareWalletPassword(this.newPassword);
    } catch {
      return this.notifications.sendError(this.translocoService.translate('ui-notifications.wallet-encryption-failed'));
    }
    this.newPassword = '';
    this.confirmPassword = '';
    this.notifications.sendSuccess(this.translocoService.translate('ui-notifications.password-updated'));
    this.showQRExport = false;
  }

  async exportWallet() {
    if (this.walletService.isLocked()) {
      const wasUnlocked = await this.walletService.requestWalletUnlock();

      if (wasUnlocked === false) {
        return;
      }
    }

    const exportUrl = this.walletService.generateExportUrl();
    this.QRExportUrl = exportUrl;
    this.QRExportImg = await QRCode.toDataURL(exportUrl, { errorCorrectionLevel: 'M', scale: 8 });
    this.showQRExport = true;
  }

  copied() {
    this.notifications.removeNotification('success-copied');
    this.notifications.sendSuccess(this.translocoService.translate('ui-notifications.wallet-seed-copied'), { identifier: 'success-copied' });
  }

  private async refreshSeedMnemonic(locked: boolean): Promise<void> {
    const generation = ++this.mnemonicGeneration;
    this.seedMnemonicValue = '';
    if (locked || this.wallet.type !== 'seed' || !this.wallet.seed) return;
    const seed = this.wallet.seed;
    try {
      const mnemonic = await entropyToMnemonic(seed);
      // A lock, wallet replacement, or component teardown must discard this copy.
      if (generation !== this.mnemonicGeneration || this.wallet.locked || this.wallet.seed !== seed) return;
      this.seedMnemonicValue = mnemonic;
    } catch {
      this.seedMnemonicValue = '';
    }
  }

  ngOnDestroy() {
    this.mnemonicGeneration++;
    this.seedMnemonicValue = '';
    this.mnemonicSubscription?.unsubscribe();
    this.mnemonicSubscription = null;
  }

  triggerFileDownload(fileName: string, exportData: object, type: 'json' | 'csv') {
    let blob: Blob;
    // first line, include columns for spreadsheet
    let csvFile = 'account,type,amount,hash,height,time\n';

    switch (type) {
      case 'json':
        blob = new Blob([JSON.stringify(exportData)], { type: 'application/json' });
        break;
      case 'csv':
        // comma-separated attributes for each row
        const processRow = function (row: CsvRow) {
          let finalVal = '';
          let j = 0;
          for (const [key, value] of Object.entries(row)) {
            const innerValue = value == null ? '' : value.toString();
            let result = innerValue.replace(/"/g, '""');
            if (result.search(/("|,| |\n)/g) >= 0) {
              result = '"' + result + '"';
            }
            if (j > 0) {
              finalVal += ',';
            }
            j++;
            finalVal += result;
          }
          return finalVal + '\n';
        };
        if (Array.isArray(exportData)) {
          for (const row of exportData as CsvRow[]) {
            csvFile += processRow(row);
          }
        }
        blob = new Blob([csvFile], { type: 'text/csv;charset=utf-8;' });
        break;
    }

    // Check for iOS, which is weird with saving files
    const iOS = !!navigator.platform && /iPad|iPhone|iPod/.test(navigator.platform);

    const elem = window.document.createElement('a');
    const objUrl = window.URL.createObjectURL(blob);
    if (iOS) {
      switch (type) {
        case 'json':
          elem.href = `data:attachment/file,${JSON.stringify(exportData)}`;
          break;
        case 'csv':
          elem.href = `data:attachment/file,${csvFile}`;
          break;
      }
    } else {
      elem.href = objUrl;
    }
    elem.download = fileName;
    document.body.appendChild(elem);
    elem.click();
    setTimeout(function() {
      document.body.removeChild(elem);
      window.URL.revokeObjectURL(objUrl);
    }, 200);
  }

  async exportToFile() {
    if (this.walletService.isLocked()) {
      const wasUnlocked = await this.walletService.requestWalletUnlock();

      if (wasUnlocked === false) {
        return;
      }
    }

    const fileName = `Nault-Wallet.json`;
    const exportData = this.walletService.generateExportData();
    this.triggerFileDownload(fileName, exportData, 'json');

    this.notifications.sendSuccess(this.translocoService.translate('ui-notifications.wallet-export-downloaded'));
  }

  csvCountChange(count: string) {
    if (this.util.string.isNumeric(count) && Number(count) % 1 === 0 || count === '') {
      // only allow beyond limit if using a custom server
      if (this.settings.settings.serverName !== 'custom' &&
      (parseInt(count, 10) > this.transactionHistoryLimit || count === '' || count === '0')) {
        this.invalidCsvCount = true;
        this.beyondCsvLimit = true;
      } else {
        if (parseInt(count, 10) < 0) {
          this.invalidCsvCount = true;
          this.beyondCsvLimit = false;
        } else {
          this.invalidCsvCount = false;
          this.beyondCsvLimit = false;
        }
      }
    } else {
      this.invalidCsvCount = true;
    }
  }

  csvOffsetChange(offset: string) {
    if (this.util.string.isNumeric(offset) && Number(offset) % 1 === 0 || offset === '') {
      if (parseInt(offset, 10) < 0) {
        this.invalidCsvOffset = true;
      } else {
        this.invalidCsvOffset = false;
      }
    } else {
      this.invalidCsvOffset = true;
    }
  }

  csvInit() {
    this.csvExportStarted = true;
  }

  async exportToCsv() {
    // disable export for a period to reduce RPC calls
    if (!this.exportEnabled) return;
    this.exportEnabled = false;
    setTimeout(() => this.exportEnabled = true, 3000);

    if (this.invalidCsvCount) {
      if (this.beyondCsvLimit) {
        return this.notifications.sendWarning(this.translocoService.translate('ui-notifications.history-server-limit'));
      } else {
        return this.notifications.sendWarning(this.translocoService.translate('ui-notifications.history-invalid-limit'));
      }
    }
    if (this.invalidCsvOffset) {
      return this.notifications.sendWarning(this.translocoService.translate('ui-notifications.history-invalid-offset'));
    }

    this.exportingCsv = true;
    const transactionCount = this.csvCount === '' ? 0 : parseInt(this.csvCount, 10);
    const transactionOffset = this.csvOffset === '' ? 0 : parseInt(this.csvOffset, 10);
    const history = await this.api.accountHistory(this.csvAccount, transactionCount, false, transactionOffset, this.selectedOrder);
    this.exportingCsv = false; // reset it here in case the file download fails (don't want spinning button forever)

    // contruct the export data
    const csvData: CsvRow[] = [];
    if (history && history.history && history.history.length > 0) {
      history.history.forEach((a: HistoryExportEntry) => {
        csvData.push({'account': a.account, 'type': a.type, 'amount': this.util.nano.rawToMnano(a.amount).toString(10),
        'hash': a.hash, 'height': a.height, 'time': formatDate(Number(a.local_timestamp) * 1000, 'y-MM-d HH:mm:ss', 'en-US')});
      });
    }

    if (csvData.length === 0) {
      return this.notifications.sendWarning(this.translocoService.translate('ui-notifications.history-empty'));
    }

    // download file
    const fileName = `${this.csvAccount}_offset=${this.csvOffset === '' ? 0 : this.csvOffset}${this.selectedOrder === true ? '_oldestFirst' : '_newestFirst'}.csv`;
    this.triggerFileDownload(fileName, csvData, 'csv');
    this.notifications.sendSuccess(this.translocoService.translate('ui-notifications.history-downloaded'));
  }
}
