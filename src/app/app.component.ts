import {Component, ElementRef, HostListener, OnInit, ViewChild, Renderer2, ChangeDetectionStrategy} from '@angular/core';
import {WalletService, WalletAccount} from './services/wallet.service';
import {AddressBookService} from './services/address-book.service';
import {AppSettingsService} from './services/app-settings.service';
import {WebsocketService} from './services/websocket.service';
import {PriceService} from './services/price.service';
import {UtilService} from './services/util.service';
import {NotificationService} from './services/notification.service';
import {WorkPoolService} from './services/work-pool.service';
import {Router} from '@angular/router';
import {SwUpdate} from '@angular/service-worker';
import {RepresentativeService} from './services/representative.service';
import {NodeService} from './services/node.service';
import {ApiService} from './services/api.service';
import { DesktopService, LedgerService } from './services';
import { environment } from 'environments/environment';
import { DeeplinkService } from './services/deeplink.service';
import { TranslocoService } from '@jsverse/transloco';


@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.less'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class AppComponent implements OnInit {

  constructor(
    public walletService: WalletService,
    private addressBook: AddressBookService,
    public settings: AppSettingsService,
    private websocket: WebsocketService,
    private api: ApiService,
    private notifications: NotificationService,
    public nodeService: NodeService,
    private representative: RepresentativeService,
    private router: Router,
    public updates: SwUpdate,
    private workPool: WorkPoolService,
    public price: PriceService,
    private util: UtilService,
    private desktop: DesktopService,
    private ledger: LedgerService,
    private renderer: Renderer2,
    private deeplinkService: DeeplinkService,
    private translate: TranslocoService) {
      router.events.subscribe(() => {
        this.closeNav();
      });
    }

  @ViewChild('selectButton') selectButton!: ElementRef<HTMLElement>;
  @ViewChild('accountsDropdown') accountsDropdown!: ElementRef<HTMLElement>;

  wallet = this.walletService.wallet;
  node = this.nodeService.node;
  nanoPrice = this.price.price;
  fiatTimeout = 5 * 60 * 1000; // Update fiat prices every 5 minutes
  inactiveSeconds = 0;
  innerWidth = 0;
  innerHeight = 0;
  innerHeightWithoutMobileBar = 0;
  navExpanded = false;
  navAnimating = false;
  showAccountsDropdown = false;
  canToggleLightMode = true;
  searchData = '';
  // Android PWAs can stay alive while airplane mode suspends RPC and WebSocket.
  private networkRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private networkRecoveryInProgress = false;
  private networkRecoveryAttempts = 0;
  private readonly maxNetworkRecoveryAttempts = 5;
  isConfigured = this.walletService.isConfigured;
  donationAccount = environment.donationAddress;

  @HostListener('window:resize') onResize(): void {
    this.onWindowResize(window);
  }

  @HostListener('window:offline') onNetworkOffline(): void {
    this.cancelNetworkRecovery();
    if (this.settings.settings.serverAPI) this.nodeService.setOffline();
  }

  @HostListener('window:online') onNetworkOnline(): void {
    this.networkRecoveryAttempts = 0;
    this.scheduleNetworkRecovery(0);
  }

  // Android does not always dispatch 'online' while the PWA is suspended.
  @HostListener('document:visibilitychange') onNetworkVisibilityChange(): void {
    if (document.visibilityState !== 'visible' || !navigator.onLine) return;
    if (this.nodeService.node.status !== true ||
        (this.settings.settings.serverWS && !this.websocket.socket.connected)) {
      this.networkRecoveryAttempts = 0;
      this.scheduleNetworkRecovery(0);
    }
  }

  @HostListener('document:mousedown', ['$event']) onGlobalClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (
            ( this.selectButton.nativeElement.contains(target) === false )
          && ( this.accountsDropdown.nativeElement.contains(target) === false )
      ) {
        this.showAccountsDropdown = false;
    }
  }

  async ngOnInit() {
    this.onWindowResize(window);
    this.settings.loadAppSettings();

    this.updateAppTheme();

    // New for v19: Patch saved xrb_ prefixes to nano_
    await this.patchXrbToNanoPrefixData();

    // set translation language
    this.translate.setActiveLang(this.settings.settings.language);

    this.addressBook.loadAddressBook();
    this.workPool.loadWorkCache();

    await this.walletService.loadStoredWallet();
    // Subscribe to any transaction tracking
    for (const entry of this.addressBook.addressBook) {
      if (entry.trackTransactions) {
        this.walletService.trackAddress(entry.account);
      }
    }

    // Navigate to accounts page if there is wallet, but only if coming from home. On desktop app the path ends with index.html
    if (this.walletService.isConfigured() && (window.location.pathname === '/' || window.location.pathname.endsWith('index.html'))) {
      if (this.wallet.selectedAccountId) {
        this.router.navigate([`account/${this.wallet.selectedAccountId}`], { queryParams: {'compact': 1}, replaceUrl: true });
      } else {
        this.router.navigate(['accounts'], { replaceUrl: true });
      }
    }

    // update selected account object with the latest balance, pending, etc
    if (this.wallet.selectedAccountId) {
      const currentUpdatedAccount = this.wallet.accounts.find(a => a.id === this.wallet.selectedAccountId) ?? null;
      this.wallet.selectedAccount = currentUpdatedAccount;
    }

    await this.walletService.reloadBalances().catch(() => this.notifications.sendWarning('Unable to refresh balances. Check your connection.'));

    // Workaround fix for github pages when Nault is refreshed (or externally linked) and there is a subpath for example to the send screen.
    // This data is saved from the 404.html page
    const path = localStorage.getItem('path');

    if (path) {
      const search = localStorage.getItem('query'); // ?param=value
      const fragment = localStorage.getItem('fragment'); // #value
      localStorage.removeItem('path');
      localStorage.removeItem('query');
      localStorage.removeItem('fragment');

      if (search && search.length) {
        const queryParams: Record<string, string> = {};
        const urlSearch = new URLSearchParams(search);
        urlSearch.forEach(function(value, key) {
          queryParams[key] = value;
        });
        this.router.navigate([path], { queryParams: queryParams, replaceUrl: true });
      } else if (fragment && fragment.length) {
        this.router.navigate([path], { fragment: fragment, replaceUrl: true });
      } else {
        this.router.navigate([path], { replaceUrl: true });
      }
    }

    this.websocket.connect();

    this.representative.loadRepresentativeList();

    // If the wallet is locked and there is a pending balance, show a warning to unlock the wallet
    // (if not receive priority is set to manual)
    if (this.wallet.locked && this.walletService.hasPendingTransactions() && this.settings.settings.pendingOption !== 'manual') {
      this.notifications.sendWarning(`New incoming transaction(s) - Unlock the wallet to receive`, { length: 10000, identifier: 'pending-locked' });
    } else if (this.walletService.hasPendingTransactions() && this.settings.settings.pendingOption === 'manual') {
      this.notifications.sendWarning(`Incoming transaction(s) found - Set to be received manually`, { length: 10000, identifier: 'pending-locked' });
    }

    // When the page closes, determine if we should lock the wallet
    window.addEventListener('beforeunload',  (e) => {
      if (this.wallet.locked) return; // Already locked, nothing to worry about
      this.walletService.lockWallet();
    });
    window.addEventListener('unload',  (e) => {
      if (this.wallet.locked) return; // Already locked, nothing to worry about
      this.walletService.lockWallet();
    });

    // handle deeplinks
    this.desktop.on('deeplink', (_event: unknown, deeplink: string) => {
      if (!this.deeplinkService.navigate(deeplink)) this.notifications.sendWarning('This URI has an invalid address.', { length: 5000 });
    });
    this.desktop.send('deeplink-ready');

    // Angular 17 emits version lifecycle events through versionUpdates.
    this.updates.versionUpdates.subscribe((event) => {
      if (event.type === 'VERSION_READY') {
        console.log(`SW update available. Current: ${event.currentVersion.hash}. New: ${event.latestVersion.hash}`);
        this.notifications.sendInfo(
          'An update was installed in the background and will be applied on next launch. <a href="#" (click)="applySwUpdate()">Apply immediately</a>',
          { length: 10000 }
        );
      } else if (event.type === 'VERSION_INSTALLATION_FAILED') {
        console.error('SW update installation failed:', event.error);
      }
    });

    // Check how long the wallet has been inactive, and lock it if it's been too long
    setInterval(() => {
      this.inactiveSeconds += 1;
      if (!this.settings.settings.lockInactivityMinutes) return; // Do not lock on inactivity
      if (this.wallet.locked || !this.wallet.password) return;

      // Determine if we have been inactive for longer than our lock setting
      if (this.inactiveSeconds >= this.settings.settings.lockInactivityMinutes * 60) {
        this.walletService.lockWallet();
        this.notifications.sendSuccess(`Wallet locked after ${this.settings.settings.lockInactivityMinutes} minutes of inactivity`);
      }
    }, 1000);

    try {
      if (!this.settings.settings.serverAPI) return;
      await this.updateFiatPrices();
    } catch (err) {
      this.notifications.sendWarning(`There was an issue retrieving latest nano price.  Ensure your AdBlocker is disabled on this page then reload to see accurate FIAT values.`, { length: 0, identifier: `price-adblock` });
    }
  }

  onWindowResize(windowObject: Pick<Window, 'innerWidth' | 'innerHeight'>): void {
    this.innerWidth = windowObject.innerWidth;
    this.innerHeight = windowObject.innerHeight;

    const isMobileBarVisible = (this.innerWidth < 940);

    if (isMobileBarVisible === true) {
      this.innerHeightWithoutMobileBar = this.innerHeight - 50;
    } else {
      this.innerHeightWithoutMobileBar = this.innerHeight;
    }
  }

  /*
    This is important as it looks through saved data using hardcoded xrb_ prefixes
    (Your wallet, address book, rep list, etc) and updates them to nano_ prefix for v19 RPC
   */
  async patchXrbToNanoPrefixData() {
    // If wallet is version 2, data has already been patched.  Otherwise, patch all data
    if ((this.settings.settings.walletVersion ?? 0) >= 2) return;

    await this.walletService.patchOldSavedData(); // Change saved xrb_ addresses to nano_
    this.addressBook.patchXrbPrefixData();
    this.representative.patchXrbPrefixData();

    this.settings.setAppSetting('walletVersion', 2); // Update wallet version so we do not patch in the future.
  }

  applySwUpdate() {
    this.updates.activateUpdate();
  }

  private navTouchStart: { x: number; y: number } | null = null;

  onNavTouchStart(event: TouchEvent): void {
    if (!this.navExpanded || event.touches.length !== 1) {
      this.navTouchStart = null;
      return;
    }
    this.navTouchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }

  onNavTouchEnd(event: TouchEvent): void {
    const start = this.navTouchStart;
    this.navTouchStart = null;
    if (!start || !this.navExpanded || event.changedTouches.length !== 1) return;
    const dx = event.changedTouches[0].clientX - start.x;
    const dy = event.changedTouches[0].clientY - start.y;
    // Only a deliberate leftward horizontal swipe closes the drawer.
    // Vertical scrolling and taps retain their existing behavior.
    if (dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.5) this.closeNav();
  }

  onNavTouchCancel(): void {
    this.navTouchStart = null;
  }

  toggleNav() {
    this.navExpanded = !this.navExpanded;
    this.onNavExpandedChange();
  }

  closeNav() {
    if (this.navExpanded === false) {
      return;
    }

    this.navExpanded = false;
    this.onNavExpandedChange();
  }

  onNavExpandedChange() {
    this.navAnimating = true;
    setTimeout(() => { this.navAnimating = false; }, 350);
  }

  toggleLightMode() {
    if (this.canToggleLightMode === false) {
      return;
    }

    this.canToggleLightMode = false;
    setTimeout(() => { this.canToggleLightMode = true; }, 300);

    this.settings.setAppSetting('lightModeEnabled', !this.settings.settings.lightModeEnabled);
    this.updateAppTheme();
  }

  updateAppTheme() {
    if (this.settings.settings.lightModeEnabled) {
      this.renderer.addClass(document.body, 'light-mode');
      this.renderer.removeClass(document.body, 'dark-mode');
    } else {
      this.renderer.addClass(document.body, 'dark-mode');
      this.renderer.removeClass(document.body, 'light-mode');
    }
  }

  toggleAccountsDropdown() {
    if (this.showAccountsDropdown === true) {
      this.showAccountsDropdown = false;
      return;
    }

    this.showAccountsDropdown = true;
    this.accountsDropdown.nativeElement.scrollTop = 0;
  }

  selectAccount(account: WalletAccount | null): void {
    // note: account is null when user is switching to 'Total Balance'
    this.wallet.selectedAccountId = account ? account.id : null;
    this.wallet.selectedAccount = account;
    this.wallet.selectedAccount$.next(account);
    this.toggleAccountsDropdown();
    this.walletService.saveWalletExport();
  }

  performSearch() {
    const searchData = this.searchData.trim();
    if (!searchData.length) return;

    const isValidNanoAccount = (
        ( searchData.startsWith('xrb_') || searchData.startsWith('nano_') )
      && this.util.account.isValidAccount(searchData)
    );

    if (isValidNanoAccount === true) {
      this.router.navigate(['account', searchData]);
      this.searchData = '';
      return;
    }

    const isValidBlockHash = this.util.nano.isValidHash(searchData);

    if (isValidBlockHash === true) {
      const blockHash = searchData.toUpperCase();
      this.router.navigate(['transaction', blockHash]);
      this.searchData = '';
      return;
    }

    this.notifications.sendWarning(`Invalid nano address or block hash! Please double check your input`);
  }

  updateIdleTime() {
    this.inactiveSeconds = 0; // Action has happened, reset the inactivity timer
  }

  private cancelNetworkRecovery(): void {
    if (this.networkRecoveryTimer !== null) {
      clearTimeout(this.networkRecoveryTimer);
      this.networkRecoveryTimer = null;
    }
    this.networkRecoveryAttempts = 0;
  }

  private scheduleNetworkRecovery(delayMs: number): void {
    if (!this.settings.settings.serverAPI || !navigator.onLine || this.networkRecoveryInProgress) return;
    if (this.networkRecoveryTimer !== null) clearTimeout(this.networkRecoveryTimer);
    this.networkRecoveryTimer = setTimeout(() => {
      this.networkRecoveryTimer = null;
      void this.recoverAfterNetworkReturn();
    }, delayMs);
  }

  private async recoverAfterNetworkReturn(): Promise<void> {
    if (this.networkRecoveryInProgress || !this.settings.settings.serverAPI || !navigator.onLine) return;
    this.networkRecoveryInProgress = true;
    const endpoint = this.settings.settings.serverAPI;
    try {
      // Prefer normal wallet reads: not every public RPC allows node statistics.
      if (this.wallet.accounts.length) await this.walletService.reloadBalances();
      // Check connectivity with the normal wallet RPC whitelist, not block_count,
      // which privacy-preserving public nodes may intentionally deny.
      if (this.nodeService.node.status !== true) await this.api.accountsBalances([]);

      if (!navigator.onLine || this.settings.settings.serverAPI !== endpoint) return;

      // A WebSocket may have exhausted its retry budget while Android was offline.
      // Restoring it only follows successful RPC reads and never replays transactions.
      if (this.settings.settings.serverWS) this.websocket.forceReconnect();
      this.networkRecoveryAttempts = 0;
    } catch (_) {
      // Keep the node-offline notification until an RPC read succeeds.
      if (!navigator.onLine || this.settings.settings.serverAPI !== endpoint) return;
      this.networkRecoveryAttempts++;
      if (this.networkRecoveryAttempts < this.maxNetworkRecoveryAttempts) {
        const delayMs = Math.min(30000, 1000 * Math.pow(2, this.networkRecoveryAttempts - 1));
        this.networkRecoveryTimer = setTimeout(() => {
          this.networkRecoveryTimer = null;
          void this.recoverAfterNetworkReturn();
        }, delayMs);
      }
    } finally {
      this.networkRecoveryInProgress = false;
    }
  }

  retryConnection() {
    if (!this.settings.settings.serverAPI) {
      this.notifications.sendInfo(`Wallet server settings is set to offline mode. Please change server first!`);
      return;
    }
    this.walletService.reloadBalances().catch(() => this.notifications.sendWarning('Unable to refresh balances. Check your connection.'));
    this.notifications.sendInfo(`Attempting to reconnect to nano node`);
  }

  async updateFiatPrices() {
    const displayCurrency = this.settings.getAppSetting(`displayCurrency`) || 'USD';
    await this.price.getPrice(displayCurrency);
    this.walletService.reloadFiatBalances();
    setTimeout(() => this.updateFiatPrices(), this.fiatTimeout);
  }
}
