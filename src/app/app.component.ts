import {Component, ElementRef, HostListener, OnInit, OnDestroy, ViewChild, Renderer2, ChangeDetectionStrategy} from '@angular/core';
import {WalletService, WalletAccount} from './services/wallet.service';
import {AddressBookService} from './services/address-book.service';
import {AppSettingsService} from './services/app-settings.service';
import {WebsocketService} from './services/websocket.service';
import {PriceService} from './services/price.service';
import {UtilService} from './services/util.service';
import {NotificationService} from './services/notification.service';
import {WorkPoolService} from './services/work-pool.service';
import {PowService} from './services/pow.service';
import {Router} from '@angular/router';
import {SwUpdate} from '@angular/service-worker';
import {RepresentativeService} from './services/representative.service';
import {NodeService} from './services/node.service';
import {ApiService} from './services/api.service';
import {RpcNodeRankingService} from './services/rpc-node-ranking.service';
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
export class AppComponent implements OnInit, OnDestroy {

  constructor(
    public walletService: WalletService,
    private addressBook: AddressBookService,
    public settings: AppSettingsService,
    private websocket: WebsocketService,
    private api: ApiService,
    private rpcRanking: RpcNodeRankingService,
    private notifications: NotificationService,
    public nodeService: NodeService,
    private representative: RepresentativeService,
    private router: Router,
    public updates: SwUpdate,
    private workPool: WorkPoolService,
    private pow: PowService,
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
      this.websocket.connectionFailure$.subscribe(wsUrl => {
        void this.probeRpcAfterWebsocketFailure(wsUrl);
      });
      this.websocket.connected$.subscribe(() => {
        void this.confirmInternetRestoredBySelectedWebsocket();
      });
    }

  @ViewChild('selectButton') selectButton!: ElementRef<HTMLElement>;
  @ViewChild('accountsDropdown') accountsDropdown!: ElementRef<HTMLElement>;

  wallet = this.walletService.wallet;
  node = this.nodeService.node;
  nanoPrice = this.price.price;
  fiatTimeout = 5 * 60 * 1000; // Update fiat prices every 5 minutes
  private fiatRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private fiatRefreshInFlight = false;
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
  // A fresh WS handshake received during an Internet interruption already
  // restored account subscriptions. Do not force a second reconnect after
  // wallet RPC recovers, since that queues another balance read.
  private wsRestoredDuringInterruption = false;
  private wsFailureProbeInFlight = false;
  private lastWsFailureProbeEndpoint: string | null = null;
  private lastWsFailureProbeAt = 0;
  private readonly wsProbeCooldownMs = 30000;
  // Electron's browser online/offline events can be missing on Linux,
  // especially with a virtual network adapter. Poll the already-allowlisted
  // native, read-only net.isOnline() bridge without making extra HTTP requests.
  private nativeNetworkTimer: ReturnType<typeof setInterval> | null = null;
  private nativeNetworkCheckInFlight = false;
  private lastNativeNetworkOnline: boolean | null = null;
  private readonly nativeNetworkPollMs = 3000;

  // A fresh WebSocket handshake with the selected server after a link outage
  // proves that local Internet connectivity has returned. It does NOT prove
  // that the wallet RPC (accounts_balances) is healthy. Keep those states
  // separate: never leave the no-failover guard latched because a synthetic
  // RPC request times out while the WS responds to pings.
  private async confirmInternetRestoredBySelectedWebsocket(): Promise<void> {
    if (!this.nodeService.internetRecoveryPending || !this.settings.settings.serverWS) return;
    const wsUrl = this.settings.settings.serverWS;
    const generation = this.nodeService.internetInterruptionGeneration;
    if ((await this.desktop.isNetworkOnline()) === false) return;
    if (!this.nodeService.internetRecoveryPending ||
        generation !== this.nodeService.internetInterruptionGeneration ||
        wsUrl !== this.settings.settings.serverWS ||
        !this.websocket.socket.connected) return;
    // A WS handshake proves the physical link is available, but NOT that
    // accounts_balances / accounts_frontiers can read the selected RPC node.
    // Keep failover locked for an existing wallet until its RPC refresh succeeds.
    // Otherwise the first transient post-airplane-mode balance error can rotate
    // away from a perfectly healthy user-selected node.
    console.info('[Nano network] Selected WebSocket reconnected; checking original RPC before unlocking failover.');
    this.wsRestoredDuringInterruption = true;
    void this.updateFiatPrices().catch(() => {});
    if (this.walletService.isConfigured()) {
      this.scheduleNetworkRecovery(0);
      return;
    }
    this.nodeService.internetRecoveryPending = false;
    // A new user has no balances to validate; do not keep firing the
    // artificial burn-address accounts_balances request after a healthy WS.
    this.nodeService.setLoading();
    this.cancelNetworkRecovery();
  }

  private async pollNativeNetwork(): Promise<void> {
    if (this.nativeNetworkCheckInFlight) return;
    this.nativeNetworkCheckInFlight = true;
    try {
      const online = await this.desktop.isNetworkOnline();
      if (typeof online !== 'boolean' || online === this.lastNativeNetworkOnline) return;
      const previous = this.lastNativeNetworkOnline;
      this.lastNativeNetworkOnline = online;
      console.info('[Nano network] Electron network state:', online
        ? 'online (Internet access not guaranteed)' : 'offline');
      if (!online) {
        // One offline transition per interruption; the native poll and
        // window offline event may report the same physical event.
        if (!this.nodeService.internetRecoveryPending) this.onNetworkOffline();
      } else if (previous === false) {
        // A positive native signal is only an opportunity to retry the
        // originally selected server, never a reason to rotate.
        this.onNetworkOnline();
      }
    } finally {
      this.nativeNetworkCheckInFlight = false;
    }
  }

  private startNativeNetworkMonitor(): void {
    if (this.nativeNetworkTimer !== null) return;
    void this.pollNativeNetwork();
    this.nativeNetworkTimer = setInterval(() => {
      void this.pollNativeNetwork();
    }, this.nativeNetworkPollMs);
  }

  ngOnDestroy(): void {
    if (this.nativeNetworkTimer !== null) {
      clearInterval(this.nativeNetworkTimer);
      this.nativeNetworkTimer = null;
    }
    this.cancelNetworkRecovery();
    if (this.fiatRefreshTimer !== null) {
      clearTimeout(this.fiatRefreshTimer);
      this.fiatRefreshTimer = null;
    }
  }

  // WS can be unavailable while RPC still works (blocked WS port/proxy).
  // A failed WS therefore triggers an immediate bounded RPC health check,
  // never an unconditional switch. Only the RPC layer can select a fallback.
  private async probeRpcAfterWebsocketFailure(failedWs: string): Promise<void> {
    const settings = this.settings.settings;
    if (!settings.serverAPI || settings.serverWS !== failedWs ||
        settings.serverName === 'custom' || settings.serverName === 'offline' ||
        this.nodeService.internetRecoveryPending ||
        (typeof navigator !== 'undefined' && !navigator.onLine)) return;
    if (!this.settings.serverOptions.some(node =>
      node.allowFailover && node.api === settings.serverAPI)) return;
    if (this.wsFailureProbeInFlight) return;
    const now = Date.now();
    if (this.lastWsFailureProbeEndpoint === settings.serverAPI &&
        now - this.lastWsFailureProbeAt < this.wsProbeCooldownMs) return;
    this.wsFailureProbeInFlight = true;
    this.lastWsFailureProbeEndpoint = settings.serverAPI;
    this.lastWsFailureProbeAt = now;
    try {
      console.info('WebSocket connection failed; verifying Nano RPC before failover.');
      await this.api.checkNodeAvailability(!this.walletService.isConfigured());
    } catch (_) {
      // ApiService retains the existing offline notice if no RPC works.
    } finally {
      this.wsFailureProbeInFlight = false;
    }
  }
  // On a clean start there are no wallet accounts to load, and an available
  // WebSocket already supplies a connection signal. Probing the public burn
  // address here can falsely declare a working node offline when the RPC
  // proxy needs more than 3 seconds or rejects that synthetic account.
  // Let the WebSocket-failure handler validate RPC before any failover.
  // RPC-only installations still benefit from a silent initial health check.
  private probeInitialEmptyWalletRpc(): void {
    if (!this.settings.settings.serverAPI || this.settings.settings.serverWS) return;
    void this.api.checkNodeAvailability(!this.walletService.isConfigured()).catch(() => {
      // Without a configured wallet, no persistent offline notification.
    });
  }

  private handleServerFailover(previousName: string, nextName: string): void {
    this.notifications.removeNotification('node-failover');
    if (this.walletService.isConfigured()) {
      this.notifications.sendWarning(this.translate.translate('ui-notifications.node-failover', {
        previous: previousName, next: nextName,
      }), { identifier: 'node-failover', length: 12000 });
    }
    // Reconnect notifications and account subscriptions even for an empty wallet.
    this.websocket.forceReconnect();
  }

  isConfigured = this.walletService.isConfigured;
  donationAccount = environment.donationAddress;

  @HostListener('window:resize') onResize(): void {
    this.onWindowResize(window);
  }

  @HostListener('window:offline') onNetworkOffline(): void {
    if (this.nodeService.internetRecoveryPending) return;
    this.nodeService.markInternetInterrupted();
    this.wsRestoredDuringInterruption = false;
    console.info('[Nano network] Internet disconnected; preserving selected server.');
    this.cancelNetworkRecovery();
    if (this.settings.settings.serverAPI) {
      this.nodeService.setOffline(this.walletService.isConfigured() ? undefined : null);
    }
  }

  @HostListener('window:online') onNetworkOnline(): void {
    // Browser and Electron may both announce the same transition. Do not
    // queue duplicate recovery attempts or misleading transition messages.
    if (this.networkRecoveryInProgress || this.networkRecoveryTimer !== null) return;
    // A scan performed while the device was offline has no viable backups.
    // Refresh the public-node ranking in the background on connectivity return,
    // without switching away from the user's previously selected RPC.
    void this.rpcRanking.refresh().catch(() => {});
    if (this.nodeService.internetRecoveryPending) {
      // socket.connected may still describe an old TCP connection from
      // before the cable was unplugged. Only connected$ after a fresh
      // handshake can confirm recovery, never a stale socket flag.
      console.info('[Nano network] Link available; reconnecting the selected server.');
    }
    this.networkRecoveryAttempts = 0;
    this.scheduleNetworkRecovery(0);
  }

  // Android does not always dispatch 'online' while the PWA is suspended.
  @HostListener('document:visibilitychange') onNetworkVisibilityChange(): void {
    if (document.visibilityState !== 'visible' || !navigator.onLine) return;
    // Focus/DevTools visibility changes must not start unnecessary burn-account
    // probes for an empty wallet while the WebSocket is already connected or
    // performing its normal handshake. WS failures have a dedicated handler.
    if (!this.walletService.isConfigured() && this.settings.settings.serverWS &&
        this.websocket.socket.ws) return;
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
    // Resolve Electron's native OS locale before choosing the initial Angular
    // language. Browsers fall back to their navigator culture as before.
    const nativeLocale = await this.desktop.getSystemLocale();
    this.settings.loadAppSettings(nativeLocale);
    // Completing a previously saved "The best" choice is not failover.
    // Reconnect only once when the first ranked result becomes available.
    this.settings.serverBestSelected$.subscribe(() => {
      this.websocket.forceReconnect();
      if (this.walletService.isConfigured()) {
        void this.walletService.reloadBalances().catch(() => {});
      }
    });
    // Never await this diagnostic on startup: first-run RsNano and the wallet
    // UI must be usable immediately, even if every other public RPC is slow.
    void this.rpcRanking.refresh().catch(() => {
      console.info('[Nano RPC ranking] Background node scan unavailable.');
    });
    // Only installed Android PWAs preselect a proven external work server at
    // startup. This is independent of the wallet RPC and never blocks the UI.
    void this.pow.initializeAndroidPwaExternalPoW();
    // The PWA uses browser online/offline events; only the Electron renderer
    // has an OS locale and the trusted native connectivity bridge.
    if (nativeLocale !== null) this.startNativeNetworkMonitor();

    this.updateAppTheme();

    // New for v19: Patch saved xrb_ prefixes to nano_
    await this.patchXrbToNanoPrefixData();

    // set translation language
    this.translate.setActiveLang(this.settings.settings.language);

    // Align WebSocket subscriptions and the visible notice after an RPC switch.
    this.settings.serverFailover$.subscribe(({ previousName, nextName }) => {
      this.handleServerFailover(previousName, nextName);
    });

    this.addressBook.loadAddressBook();
    this.workPool.loadWorkCache();

    // Start WS first rather than serializing it behind RPC balance checks.
    // Account subscriptions are added during wallet restore and kept on reconnect.
    this.websocket.connect();
    try {
      await this.walletService.loadStoredWallet();
    } finally {
      // Release guarded routes only after the persisted wallet has been read.
      this.walletService.walletLoaded$.next(true);
    }
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

    if (this.wallet.accounts.length) {
      await this.walletService.reloadBalances().catch(() => this.notifications.sendWarning('Unable to refresh balances. Check your connection.'));
    } else {
      // Do not probe a synthetic account on every fresh start with a working
      // WebSocket. The first WS failure will trigger a real RPC health probe.
      this.probeInitialEmptyWalletRpc();
    }

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
          'An update was installed in the background and will be applied on next launch.',
          { identifier: 'pwa-update-ready', length: 0,
            action: { labelKey: 'ui-notifications.apply-update', run: () => { void this.applySwUpdate(); } } }
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

    await this.loadInitialFiatPrice();
  }

  // Price discovery may fail on first launch (e.g. CoinGecko rate limiting).
  // Do not present a persistent FIAT warning before a wallet exists: a new
  // user has no FIAT balances to display. Keep the periodic retry unchanged,
  // so FIAT prices are available after a wallet is configured.
  private async loadInitialFiatPrice(): Promise<void> {
    if (!this.settings.settings.serverAPI) return;
    try {
      await this.updateFiatPrices();
    } catch (_error) {
      if (!this.walletService.isConfigured()) {
        this.notifications.removeNotification('price-adblock');
        return;
      }
      // An Internet outage is not evidence of an ad blocker. Check wallet
      // state again after the asynchronous connectivity test, in case it was
      // reset while the price request was pending.
      const offline = (typeof navigator !== 'undefined' && !navigator.onLine) ||
        this.nodeService.internetRecoveryPending ||
        (await this.desktop.isNetworkOnline()) === false;
      if (!offline && this.walletService.isConfigured()) {
        this.notifications.sendWarning(`There was an issue retrieving latest nano price. Ensure your AdBlocker is disabled on this page then reload to see accurate FIAT values.`,
          { length: 0, identifier: 'price-adblock' });
      }
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

  async applySwUpdate(): Promise<void> {
    // Replacing the app shell during a hardware signature can strand a
    // pending user confirmation. The user can retry once signing has ended.
    if (this.ledger.signingInProgress) {
      this.notifications.sendWarning(this.translate.translate('ui-notifications.update-signing-active'));
      return;
    }
    try {
      await this.updates.activateUpdate();
      // activateUpdate() alone would leave mixed old/new chunks in memory.
      window.location.reload();
    } catch (_error) {
      this.notifications.sendWarning(this.translate.translate('ui-notifications.update-activation-failed'));
    }
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
      // If the native link is definitely offline, defer recovery until its
      // next positive transition. No other public node can help yet.
      if ((await this.desktop.isNetworkOnline()) === false) return;
      if (!this.walletService.isConfigured() && this.settings.settings.serverWS) {
        if (!this.nodeService.internetRecoveryPending && this.websocket.socket.connected) {
          // Ordinary visibility/online events need no additional I/O when
          // the WS is already healthy and no cable interruption was observed.
          return;
        }
        // On an empty wallet, reconnect the original WS first. Do not
        // repeatedly probe an artificial account when the RPC proxy is slow
        // or refuses that request. WebSocket.connected$ clears the link guard.
        console.info('[Nano network] Reconnecting selected WebSocket; keeping RPC health separate.');
        this.websocket.forceReconnect();
        return;
      }
      // Prefer normal wallet reads: not every public RPC allows node statistics.
      if (this.wallet.accounts.length) {
        // A successful normal refresh validates both balances and frontiers
        // on the ORIGINAL RPC, while failover is still locked. Do not fire a
        // redundant second accounts_balances request during reconnection.
        await this.walletService.reloadBalances();
      } else if (this.nodeService.node.status !== true) {
        // Empty account arrays may be refused by healthy public RPC proxies.
        await this.api.checkNodeAvailability(!this.walletService.isConfigured(),
          !this.nodeService.internetRecoveryPending);
      }

      if (!navigator.onLine || this.settings.settings.serverAPI !== endpoint) return;

      // A fresh WS handshake during this outage already restored subscriptions
      // and triggered a balance read. Reconnecting it a second time can create
      // overlapping RPC loads and spurious timeout-based failovers.
      // If the WS exhausted its retry budget, still force a fresh connection.
      if (this.settings.settings.serverWS && !this.wsRestoredDuringInterruption) {
        this.websocket.forceReconnect();
      }
      this.wsRestoredDuringInterruption = false;
      this.nodeService.internetRecoveryPending = false;
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

  async updateFiatPrices(): Promise<void> {
    if (this.fiatRefreshInFlight) return;
    this.fiatRefreshInFlight = true;
    try {
      const displayCurrency = this.settings.getAppSetting('displayCurrency') || 'USD';
      await this.price.getPrice(displayCurrency);
      this.walletService.reloadFiatBalances();
      this.notifications.removeNotification('price-adblock');
    } finally {
      this.fiatRefreshInFlight = false;
      // Schedule periodic refresh even when the FIRST request failed offline.
      // Keep one bounded timer, including after an immediate WS recovery retry.
      if (this.fiatRefreshTimer !== null) clearTimeout(this.fiatRefreshTimer);
      this.fiatRefreshTimer = setTimeout(() => {
        this.fiatRefreshTimer = null;
        void this.updateFiatPrices().catch(() => {
          // A temporary CoinGecko failure must not stop future refreshes.
        });
      }, this.fiatTimeout);
    }
  }
}
