import {Component, OnInit, ViewChild, ElementRef, ChangeDetectionStrategy} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {BehaviorSubject} from 'rxjs';
import { QrModalService } from '../../services/qr-modal.service';
import type {QRType} from '../qr-modal/qr-modal.component';
import type {WalletApiAccount} from '../../services/wallet.service';
import { hasPositiveNanoNodeHealthEvidence } from '../../services/representative.service';
import type {StoredRepresentative} from '../../services/representative.service';

import {
  AppSettingsService,
  FullRepresentativeOverview,
  NanoBlockService,
  NotificationService,
  RepresentativeService,
  UtilService,
  WalletService
} from '../../services';
import { TranslocoService } from '@jsverse/transloco';
import { getDirectoryRepresentativeName, getDirectoryRepresentatives } from '../../services/representative-directory';
import { RepresentativeMonitorService, RepresentativeMonitorSnapshot, MonitoredRepresentative } from '../../services/representative-monitor.service';

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

  loadingRepresentatives = false;

  representativeList: StoredRepresentative[] = [];
  monitorSnapshot: RepresentativeMonitorSnapshot | null = null;
  browseRepresentativeList = false;
  representativeSearch = '';
  onlyOnlineReps = false;
  onlyMonitoredGoodReps = false;
  visibleRepresentativeLimit = 12;
  matchingRepresentativeCount = 0;
  private lastRepresentativeSearch = '';

  constructor(
    private router: ActivatedRoute,
    public walletService: WalletService,
    private notifications: NotificationService,
    private nanoBlock: NanoBlockService,
    private util: UtilService,
    private representativeService: RepresentativeService,
    public settings: AppSettingsService,
    private qrModalService: QrModalService,
    private translocoService: TranslocoService,
    public representativeMonitor: RepresentativeMonitorService) { }

  async ngOnInit() {
    this.representativeService.loadRepresentativeList();

    // Listen for query parameters that set defaults
    this.router.queryParams.subscribe(params => {
      // Historical hideOverview/showRecommended flags are intentionally ignored:
      // the representative summary must remain visible after opening the
      // change-required action and after an accepted representative change.

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
    this.fullAccounts = repOverview.flatMap(o => o.accounts);
    this.loadingRepresentatives = false;

    await this.populateRepresentativeList();
  }

  async populateRepresentativeList() {
    // No wallet addresses are sent to the third-party service: one global
    // JSON listing is shared for autocomplete and the representative overview.
    this.monitorSnapshot = await this.representativeMonitor.getSnapshot();
    const localReps = this.representativeService.getSortedRepresentatives();
    const monitoredReps: StoredRepresentative[] = (this.monitorSnapshot?.representatives ?? [])
      .filter(rep => !!rep.name).map(rep => ({ id: rep.account, name: rep.name! }));
    const fallback = getDirectoryRepresentatives();
    // Keep the user's local names and avoid flags ahead of third-party aliases.
    this.representativeList = [
      ...localReps, ...monitoredReps, ...fallback
    ].filter((rep, index, list) =>
      list.findIndex(item => item.id.toLowerCase() === rep.id.toLowerCase()) === index
    );
    this.searchRepresentatives();
  }

  getMonitoredRepresentative(id: string): MonitoredRepresentative | null {
    return this.monitorSnapshot?.byAccount[id.toLowerCase()] ?? null;
  }

  isMonitoredGoodRepresentative(id: string): boolean {
    return hasPositiveNanoNodeHealthEvidence(this.getMonitoredRepresentative(id));
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

  /**
   * Node votes are independent observations. An absent RPC response is
   * unknown; disagreement with NanoNode.de is not proof of an offline node.
   * This tooltip is not a health or trusted-status assessment.
   */
  getVoteObservationsTooltip(rep: FullRepresentativeOverview): string {
    const observation = rep.networkObservation;
    const status = (value: boolean | null | undefined): string => {
      const key = value === true ? 'observed-online'
        : value === false ? 'not-observed' : 'observation-unavailable';
      return this.translocoService.translate('ui-representatives.' + key);
    };
    return [
      'RPC : ' + status(observation?.rpcOnline),
      'NanoNode.de : ' + status(observation?.nanonodeOnline)
    ].join(' • ');
  }

  /** The online-only picker accepts observed votes from either RPC or NanoNode. */
  private hasRecentObservedVote(id: string): boolean {
    const rpc = this.representativeOverview.find(rep => rep.id.toLowerCase() === id.toLowerCase())
      ?.networkObservation?.rpcOnline;
    return rpc === true || this.getMonitoredRepresentative(id)?.online === true;
  }

  /**
   * Representative-list ranking is UI-only and never selects a delegate.
   * Always show the wallet's current representative before truncating results.
   */
  private representativePriority(rep: StoredRepresentative): number {
    const current = this.representativeOverview.some(item => item.id.toLowerCase() === rep.id.toLowerCase());
    if (current) return 5;
    if (rep.trusted) return 4;
    if (this.isMonitoredGoodRepresentative(rep.id)) return 3;
    if (this.hasRecentObservedVote(rep.id)) return 2;
    return 1;
  }

  showMoreRepresentatives() {
    this.visibleRepresentativeLimit += 12;
    this.searchRepresentatives();
  }

  toggleRepresentativeBrowser() {
    this.browseRepresentativeList = !this.browseRepresentativeList;
    this.representativeSearch = '';
    this.visibleRepresentativeLimit = 12;
    this.lastRepresentativeSearch = '';
    this.searchRepresentatives();
  }

  toggleOnlineOnly() {
    this.onlyOnlineReps = !this.onlyOnlineReps;
    this.visibleRepresentativeLimit = 12;
    this.searchRepresentatives();
  }

  toggleMonitoredGoodOnly() {
    this.onlyMonitoredGoodReps = !this.onlyMonitoredGoodReps;
    this.visibleRepresentativeLimit = 12;
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
    if (search !== this.lastRepresentativeSearch) {
      this.visibleRepresentativeLimit = 12;
      this.lastRepresentativeSearch = search;
    }
    this.showRepresentatives = this.browseRepresentativeList;
    if (!this.showRepresentatives) {
      this.matchingRepresentativeCount = 0;
      this.representativeResults$.next([]);
      return;
    }
    const matches = this.representativeList
      .filter(rep => !rep.warn)
      .filter(rep => !this.onlyOnlineReps || this.hasRecentObservedVote(rep.id))
      .filter(rep => !this.onlyMonitoredGoodReps || this.isMonitoredGoodRepresentative(rep.id))
      .filter(rep => !search || rep.name.toLowerCase().includes(search) || rep.id.toLowerCase().includes(search))
      .sort((a, b) => this.representativePriority(b) - this.representativePriority(a) ||
        a.name.localeCompare(b.name));
    this.matchingRepresentativeCount = matches.length;
    this.representativeResults$.next(matches.slice(0, this.visibleRepresentativeLimit));
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
    // The inline browser is controlled only by its Browse button/selection.
    // An address-input blur must never close a list opened by the same click.
    this.toRepresentativeID = this.toRepresentativeID.replace(/ /g, '');
    if (!this.toRepresentativeID) {
      this.representativeListMatch = '';
      return;
    }
    const localName = this.representativeService.getRepresentative(this.toRepresentativeID)?.name;
    const liveName = this.getMonitoredRepresentative(this.toRepresentativeID)?.name;
    const directoryName = getDirectoryRepresentativeName(this.toRepresentativeID);
    this.representativeListMatch = localName || liveName || directoryName || '';
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

      if (failedAccounts.length) {
        this.selectedAccounts = failedAccounts;
        this.notifications.sendWarning(this.translocoService.translate('ui-notifications.rep-updated-partial', {
          succeeded: successes, failed: failedAccounts.length
        }));
      } else {
        this.selectedAccounts = [];
        this.toRepresentativeID = '';
        this.representativeListMatch = '';
        this.notifications.sendSuccess(this.translocoService.translate('ui-notifications.rep-updated'));
      }

      // The block is already accepted: an overview refresh failure does not
      // undo that transaction or turn a partial result into a false success.
      try {
        this.loadingRepresentatives = true;
        this.representativeOverview = await this.representativeService.getRepresentativesOverview();
        this.fullAccounts = this.representativeOverview.flatMap(rep => rep.accounts);
        await this.representativeService.detectChangeableReps(this.representativeOverview);
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
