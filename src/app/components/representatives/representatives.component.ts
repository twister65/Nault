import {Component, OnInit, ViewChild, ElementRef, ChangeDetectionStrategy} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import BigNumber from 'bignumber.js';
import {BehaviorSubject} from 'rxjs';
import { QrModalService } from '../../services/qr-modal.service';
import type {QRType} from '../qr-modal/qr-modal.component';
import type {WalletApiAccount} from '../../services/wallet.service';
import type {StoredRepresentative} from '../../services/representative.service';

import {
  ApiService,
  AppSettingsService,
  FullRepresentativeOverview,
  NanoBlockService,
  NotificationService,
  RepresentativeService,
  UtilService,
  WalletService,
  NinjaService
} from '../../services';
import { TranslocoService } from '@jsverse/transloco';
import { getDirectoryRepresentativeName, getDirectoryRepresentatives } from '../../services/representative-directory';
import { RepresentativeMonitorService, RepresentativeMonitorSnapshot, MonitoredRepresentative } from '../../services/representative-monitor.service';

interface RecommendedRepresentative {
  account: string;
  alias: string;
  votingweight: number | string;
  weight?: BigNumber;
  percent?: string;
  [field: string]: unknown;
}

@Component({
    selector: 'app-representatives',
    templateUrl: './representatives.component.html',
    styleUrls: ['./representatives.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class RepresentativesComponent implements OnInit {
  @ViewChild('repInput') repInput!: ElementRef<HTMLElement>;

  changeAccountID: string | null = null;
  toRepresentativeID = '';

  representativeResults$ = new BehaviorSubject<StoredRepresentative[]>([]);
  showRepresentatives = false;
  representativeListMatch = '';

  representativeOverview: FullRepresentativeOverview[] = [];
  changingRepresentatives = false;

  selectedAccounts: Array<{id: string}> = [];
  fullAccounts: Array<WalletApiAccount & {error?: string}> = [];

  recommendedReps: RecommendedRepresentative[] = [];
  recommendedRepsPaginated: RecommendedRepresentative[] = [];
  recommendedRepsLoading = false;
  selectedRecommendedRep: RecommendedRepresentative | null = null;
  showRecommendedReps = false;
  loadingRepresentatives = false;

  repsPerPage = 5;
  currentRepPage = 0;

  hideOverview = false;

  representativeList: StoredRepresentative[] = [];
  monitorSnapshot: RepresentativeMonitorSnapshot | null = null;
  browseRepresentativeList = false;
  representativeSearch = '';
  onlyOnlineReps = false;

  constructor(
    private router: ActivatedRoute,
    public walletService: WalletService,
    private api: ApiService,
    private notifications: NotificationService,
    private nanoBlock: NanoBlockService,
    private util: UtilService,
    private representativeService: RepresentativeService,
    public settings: AppSettingsService,
    private ninja: NinjaService,
    private qrModalService: QrModalService,
    private translocoService: TranslocoService,
    public representativeMonitor: RepresentativeMonitorService) { }

  async ngOnInit() {
    this.representativeService.loadRepresentativeList();

    // Listen for query parameters that set defaults
    this.router.queryParams.subscribe(params => {
      this.hideOverview = params && params.hideOverview;
      this.showRecommendedReps = params && params.showRecommended;

      if (params && params.accounts) {
        this.selectedAccounts = []; // Reset the preselected accounts
        const accounts = params.accounts.split(',');
        for (const account of accounts) {
          this.newAccountID(account);
        }
      }
      if (params && params.representative) {
        this.selectRepresentative(params.representative);
      }
    });

    this.loadingRepresentatives = true;
    let repOverview = await this.representativeService.getRepresentativesOverview();
    // Sort by weight delegated
    repOverview = repOverview.sort(
      (a: FullRepresentativeOverview, b: FullRepresentativeOverview) => b.delegatedWeight.toNumber() - a.delegatedWeight.toNumber()
    );
    this.representativeOverview = repOverview;
    repOverview.forEach(o => this.fullAccounts.push(...o.accounts));
    this.loadingRepresentatives = false;

    this.populateRepresentativeList();

    await this.loadRecommendedReps();
  }

  async populateRepresentativeList() {
    // No wallet addresses are sent to the third-party service: one global
    // JSON listing is shared for autocomplete and the representative overview.
    this.monitorSnapshot = await this.representativeMonitor.getSnapshot();
    const localReps = this.representativeService.getSortedRepresentatives();
    const monitoredReps: StoredRepresentative[] = (this.monitorSnapshot?.representatives ?? [])
      .filter(rep => !!rep.name).map(rep => ({ id: rep.account, name: rep.name! }));
    const fallback = getDirectoryRepresentatives();
    const verified = await this.ninja.recommendedRandomized().catch(() => []);
    const ninjaReps: StoredRepresentative[] = Array.isArray(verified)
      ? verified.filter(rep => !!rep?.account && !!rep?.alias)
        .map(rep => ({ id: rep.account, name: rep.alias })) : [];
    // Keep the user's local names and avoid flags ahead of third-party aliases.
    this.representativeList = [
      ...localReps, ...monitoredReps, ...fallback, ...ninjaReps
    ].filter((rep, index, list) =>
      list.findIndex(item => item.id.toLowerCase() === rep.id.toLowerCase()) === index
    );
    this.searchRepresentatives();
  }

  getMonitoredRepresentative(id: string): MonitoredRepresentative | null {
    return this.monitorSnapshot?.byAccount[id.toLowerCase()] ?? null;
  }

  /**
   * NanoNode.de's share is a fraction (0.000015 = 0.0015%), not a percentage.
   * Preserve four decimal places below 0.01% so small representatives are not
   * incorrectly displayed as having 0.00% voting weight.
   */
  formatVotingWeightShare(share: number | null): string {
    if (share === null || !Number.isFinite(share) || share < 0 || share > 1) return '';
    const locale = this.translocoService.getActiveLang() || 'en';
    const percentage = share * 100;
    const decimals = percentage > 0 && percentage < 0.01 ? 4 : 2;
    const formatter = new Intl.NumberFormat(locale, {
      style: 'percent',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    // An even smaller positive share must not be displayed as a literal zero.
    if (percentage > 0 && percentage < 0.00005) {
      return '< ' + formatter.format(0.000001);
    }
    return formatter.format(share);
  }

  toggleRepresentativeBrowser() {
    this.browseRepresentativeList = !this.browseRepresentativeList;
    this.representativeSearch = '';
    this.searchRepresentatives();
  }

  toggleOnlineOnly() {
    this.onlyOnlineReps = !this.onlyOnlineReps;
    this.searchRepresentatives();
  }

  getAccountLabel(account: WalletApiAccount) {
    const addressBookName = account.addressBookName;

    if (addressBookName != null) {
      return addressBookName;
    }

    const walletAccount = this.walletService.wallet.accounts.find(a => a.id === account.id);

    if (walletAccount == null) {
      return this.translocoService.translate('general.account');
    }

    return (this.translocoService.translate('general.account') + ' #' + walletAccount.index);
  }

  addSelectedAccounts(accounts: Array<{id: string}>) {
    for (const account of accounts) {
      this.newAccountID(account.id);
    }

    // Scroll to the representative input
    setTimeout(() => this.repInput.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  newAccountID(accountID: string | null) {
    const newAccount = accountID || this.changeAccountID;
    if (!newAccount) {
      return; // Didn't select anything
    }

    const existingAccount = this.selectedAccounts.find(a => a.id === newAccount);
    if (existingAccount) {
      return; // Already selected
    }

    const allExists = this.selectedAccounts.find(a => a.id === 'All Current Accounts');
    if (newAccount === 'all' && !allExists) {
      this.selectedAccounts = []; // Reset the list before adding all
    }
    if (newAccount !== 'all' && allExists) {
      this.selectedAccounts.splice(this.selectedAccounts.indexOf(allExists), 1); // Remove all from the list
    }

    if (newAccount === 'all') {
      if (this.selectedAccounts.length === 0) {
        this.selectedAccounts.push({ id: 'All Current Accounts' });
      }
    } else {
      const walletAccount = this.walletService.getWalletAccount(newAccount);
      if (walletAccount) this.selectedAccounts.push(walletAccount);
    }

    setTimeout(() => this.changeAccountID = null, 10);
  }

  removeSelectedAccount(account: {id: string}) {
    this.selectedAccounts.splice(this.selectedAccounts.indexOf(account), 1); // Remove all from the list
  }

  searchRepresentatives() {
    const search = (this.representativeSearch || '').trim().toLowerCase();
    this.showRepresentatives = this.browseRepresentativeList;
    const matches = this.showRepresentatives ? this.representativeList
      .filter(rep => (!this.onlyOnlineReps || this.getMonitoredRepresentative(rep.id)?.online === true))
      .filter(rep => !search || rep.name.toLowerCase().includes(search) || rep.id.toLowerCase().includes(search))
      .filter(rep => !rep.warn)
      .slice(0, 12) : [];
    this.representativeResults$.next(matches);
  }

  selectRepresentative(account: string) {
    this.browseRepresentativeList = false;
    this.representativeSearch = '';
    this.showRepresentatives = false;
    this.toRepresentativeID = account;
    this.representativeResults$.next([]);
    void this.validateRepresentative();
  }

  async validateRepresentative() {
    setTimeout(() => this.showRepresentatives = false, 400);
    this.toRepresentativeID = this.toRepresentativeID.replace(/ /g, '');
    if (!this.toRepresentativeID) {
      this.representativeListMatch = '';
      return;
    }
    const localName = this.representativeService.getRepresentative(this.toRepresentativeID)?.name;
    const liveName = this.getMonitoredRepresentative(this.toRepresentativeID)?.name;
    const directoryName = getDirectoryRepresentativeName(this.toRepresentativeID);
    const ninjaRep = localName || liveName || directoryName ? null : await this.ninja.getAccount(this.toRepresentativeID);
    this.representativeListMatch = localName || liveName || directoryName || ninjaRep?.alias || '';
  }

  async loadRecommendedReps() {
    this.recommendedRepsLoading = true;
    try {
      const scores = await this.ninja.recommended() as RecommendedRepresentative[];
      const totalSupply = new BigNumber(133248289);

      const reps = scores.map(rep => {
        const nanoWeight = this.util.nano.rawToMnano(rep.votingweight.toString() || 0);
        const percent = nanoWeight.div(totalSupply).times(100);

        // rep.weight = nanoWeight.toString(10);
        rep.weight = this.util.nano.mnanoToRaw(nanoWeight);
        rep.percent = percent.toFixed(3);

        return rep;
      });

      this.recommendedReps = reps;

      this.calculatePage();
      this.recommendedRepsLoading = false;
    } catch (err) {
      this.recommendedRepsLoading = false;
    }

  }

  previousReps() {
    if (this.currentRepPage > 0) {
      this.currentRepPage--;
      this.calculatePage();
    }
  }
  nextReps() {
    if (this.currentRepPage < (this.recommendedReps.length / this.repsPerPage) - 1) {
      this.currentRepPage++;
    } else {
      this.currentRepPage = 0;
    }
    this.calculatePage();
  }

  calculatePage() {
    this.recommendedRepsPaginated = this.recommendedReps.slice(
      (this.currentRepPage * this.repsPerPage),
      (this.currentRepPage * this.repsPerPage) + this.repsPerPage
    );
  }

  selectRecommendedRep(rep: RecommendedRepresentative) {
    this.selectedRecommendedRep = rep;
    this.toRepresentativeID = rep.account;
    this.showRecommendedReps = false;
    this.representativeListMatch = rep.alias; // We will save if they use this, so this is a nice little helper
  }

  async changeRepresentatives() {
    if (this.changingRepresentatives) return;

    const selectedAccounts = this.selectedAccounts;
    const newRep = this.toRepresentativeID;
    if (this.walletService.isLocked()) {
      const wasUnlocked = await this.walletService.requestWalletUnlock();
      if (!wasUnlocked) return;
    }
    if (!selectedAccounts.length) {
      this.notifications.sendWarning(this.translocoService.translate('ui-notifications.rep-select-account'));
      return;
    }
    if (!this.util.account.isValidAccount(newRep)) {
      this.notifications.sendWarning(this.translocoService.translate('ui-notifications.rep-invalid'));
      return;
    }

    const allAccounts = selectedAccounts.some(account => account.id === 'All Current Accounts');
    const accountsToChange = allAccounts ? this.walletService.wallet.accounts : selectedAccounts;
    const failedAccounts: Array<{id: string}> = [];
    const accountsNeedingChange = accountsToChange.filter(account => {
      const info = this.fullAccounts.find(a => a.id === account.id);
      if (!info || info.error || !info.representative) {
        failedAccounts.push({ id: account.id });
        this.notifications.sendError(this.translocoService.translate('ui-notifications.rep-change-failed-account', { account: account.id }));
        return false;
      }
      return info.representative.toLowerCase() !== newRep.toLowerCase();
    });

    if (!accountsNeedingChange.length && !failedAccounts.length) {
      this.notifications.sendInfo(this.translocoService.translate('ui-notifications.rep-no-change'));
      return;
    }

    this.changingRepresentatives = true;
    let successes = 0;
    try {
      for (const account of accountsNeedingChange) {
        const walletAccount = this.walletService.getWalletAccount(account.id);
        if (!walletAccount) {
          failedAccounts.push({ id: account.id });
          this.notifications.sendError(this.translocoService.translate('ui-notifications.rep-change-failed-account', { account: account.id }));
          continue;
        }

        try {
          // Only an RPC-accepted block hash counts as a successful change.
          // Failed/rejected/disconnected Ledger signing returns no block hash.
          const hash = await this.nanoBlock.generateChange(walletAccount, newRep, this.walletService.isLedgerWallet());
          if (!hash) {
            failedAccounts.push({ id: account.id });
            this.notifications.sendError(this.translocoService.translate('ui-notifications.rep-change-failed-account', { account: account.id }));
            continue;
          }
          successes++;
          const cached = this.fullAccounts.find(a => a.id === account.id);
          if (cached) cached.representative = newRep;
        } catch (err) {
          failedAccounts.push({ id: account.id });
          this.notifications.sendError(this.translocoService.translate('ui-notifications.rep-change-failed', {
            error: err instanceof Error ? err.message : String(err)
          }));
        }
      }

      if (successes === 0) {
        // Preserve the selected representative and accounts when all changes fail.
        if (failedAccounts.length) this.selectedAccounts = failedAccounts;
        return;
      }

      if (this.selectedRecommendedRep?.account === newRep) {
        this.representativeService.saveRepresentative(newRep, this.selectedRecommendedRep.alias, false, false);
      }

      if (failedAccounts.length) {
        this.selectedAccounts = failedAccounts;
        this.notifications.sendWarning(this.translocoService.translate('ui-notifications.rep-updated-partial', {
          succeeded: successes, failed: failedAccounts.length
        }));
      } else {
        this.selectedAccounts = [];
        this.toRepresentativeID = '';
        this.representativeListMatch = '';
        this.selectedRecommendedRep = null;
        this.notifications.sendSuccess(this.translocoService.translate('ui-notifications.rep-updated'));
      }

      // The block is already accepted: an overview refresh failure does not
      // undo that transaction or turn a partial result into a false success.
      try {
        if (!this.hideOverview) {
          this.loadingRepresentatives = true;
          this.representativeOverview = await this.representativeService.getRepresentativesOverview();
          this.fullAccounts = this.representativeOverview.flatMap(rep => rep.accounts);
        }
        await this.representativeService.detectChangeableReps(this.hideOverview ? undefined : this.representativeOverview);
      } catch (_) {
        console.warn('Unable to refresh representative overview after the update.');
      } finally {
        this.loadingRepresentatives = false;
      }
    } finally {
      this.changingRepresentatives = false;
    }
  }

  // open qr reader modal
  openQR(reference: string, type: QRType) {
    const qrResult = this.qrModalService.openQR(reference, type);
    qrResult.then((data) => {
      switch (data.reference) {
        case 'rep1':
          this.toRepresentativeID = data.content;
          this.validateRepresentative();
          break;
      }
    }, () => {}
    );
  }
}
