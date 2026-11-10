import { ComponentTestModule, isolateConstructorIO } from '../../../testing/component-test.module';
import { ComponentFixture, TestBed, fakeAsync, tick, waitForAsync } from '@angular/core/testing';

import { ConfigureAppComponent } from './configure-app.component';
import { PoWVaultUnlockError } from '../../services/pow-api-key-vault.service';
import { WebsocketService } from '../../services/websocket.service';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

describe('ConfigureAppComponent', () => {
  let component: ConfigureAppComponent;
  let fixture: ComponentFixture<ConfigureAppComponent>;

  beforeEach(waitForAsync(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ConfigureAppComponent);
    component = fixture.componentInstance;
    // Constructor smoke test; lifecycle scenarios supply explicit inputs and I/O mocks.
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('refreshes missing node statistics when WebSocket reconnects after offline startup', fakeAsync(() => {
    (component as any).appSettings.settings.serverAPI = 'https://rainstorm.city/api';
    spyOn(component, 'loadFromSettings').and.stub();
    const stats = spyOn(component, 'updateNodeStats').and.returnValue(Promise.resolve());
    spyOn(component, 'populateRepresentativeList').and.returnValue(Promise.resolve());
    void component.ngOnInit();
    const ws = TestBed.inject(WebsocketService);
    expect(stats).toHaveBeenCalledTimes(1);
    // A failed initial stats request left the panel empty.
    component.statsRefreshEnabled = true;
    ws.connected$.next();
    expect(stats).toHaveBeenCalledTimes(2);
    component.nodeBlockCount = '123';
    ws.connected$.next();
    expect(stats).toHaveBeenCalledTimes(2);
    component.ngOnDestroy();
    ws.connected$.next();
    expect(stats).toHaveBeenCalledTimes(2);
    tick(500);
  }));


  it('discloses translated automatic PoW fallback guidance on touch and keyboard', async () => {
    spyOn(component, 'ngOnInit').and.stub();
    const transloco = TestBed.inject(TranslocoService);
    await firstValueFrom(transloco.load(transloco.getActiveLang()));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const details = fixture.nativeElement.querySelector('#pow-source-help') as HTMLDetailsElement;
    expect(details).toBeTruthy();
    const summary = details.querySelector('summary') as HTMLElement;
    const content = details.querySelector('.pow-vault-help-content') as HTMLElement;
    expect(summary.textContent).toContain(transloco.translate('configure-app.pow-source'));
    expect(summary.hasAttribute('uk-tooltip')).toBeFalse();
    expect(details.open).toBeFalse();
    summary.click();
    expect(details.open).toBeTrue();
    expect(content.textContent).toContain(transloco.translate('configure-app.pow-source-help'));
    expect(content.textContent).toContain('Nano.to');

    const selector = fixture.nativeElement.querySelector('select[aria-label]') as HTMLSelectElement;
    expect(selector.getAttribute('aria-label')).toBe(transloco.translate('configure-app.pow-source'));
    summary.click();
    expect(details.open).toBeFalse();
  });

  it('opens and closes the PoW API-key explanation on tap without a hover tooltip', async () => {
    // The whole settings view is inside *transloco. Wait for its lazy-loaded
    // language chunk so the actual browser <details> element is rendered.
    spyOn(component, 'ngOnInit').and.stub();
    const settings = (component as any).appSettings.settings;
    settings.powSource = 'nanoTo';
    settings.serverName = 'nano-to';
    settings.serverAPI = 'https://rpc.nano.to/';
    component.selectedPoWOption = 'nanoTo';
    const transloco = TestBed.inject(TranslocoService);
    await firstValueFrom(transloco.load(transloco.getActiveLang()));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const details = fixture.nativeElement.querySelector('#pow-vault-help') as HTMLDetailsElement;
    expect(details).toBeTruthy();
    const summary = details.querySelector('summary') as HTMLElement;
    const content = details.querySelector('.pow-vault-help-content') as HTMLElement;
    expect(summary).toBeTruthy();
    expect(summary.hasAttribute('uk-tooltip')).toBeFalse();
    expect(details.open).toBeFalse();
    summary.click();
    expect(details.open).toBeTrue();
    expect(content.textContent).toContain('Nano.to');
    const privacyLink = content.querySelector('a[href="https://rpc.nano.to/privacy"]') as HTMLAnchorElement;
    const termsLink = content.querySelector('a[href="https://rpc.nano.to/terms"]') as HTMLAnchorElement;
    expect(privacyLink).toBeTruthy();
    expect(termsLink).toBeTruthy();
    expect(privacyLink.rel).toContain('noopener');
    expect(termsLink.rel).toContain('noreferrer');
    // Legal notice and links belong to the disclosure, not under the key fields.
    expect(fixture.nativeElement.querySelectorAll('a[href="https://rpc.nano.to/privacy"]').length).toBe(1);
    summary.click();
    expect(details.open).toBeFalse();
  });

  it('shows Nano.to key management only for explicit Nano.to PoW, regardless of wallet RPC', async () => {
    spyOn(component, 'ngOnInit').and.stub();
    const settings = (component as any).appSettings.settings;
    const transloco = TestBed.inject(TranslocoService);
    await firstValueFrom(transloco.load(transloco.getActiveLang()));
    for (const source of ['best', 'nanoTo', 'server', 'custom', 'clientWebGL', 'clientCPU'] as const) {
      component.selectedPoWOption = source;
      settings.powSource = source;
      for (const rpc of ['https://rainstorm.city/api', 'https://rpc.nano.to/']) {
        settings.serverAPI = rpc;
        fixture.changeDetectorRef.markForCheck();
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
        expect(!!fixture.nativeElement.querySelector('#pow-vault-help')).toBe(source === 'nanoTo');
      }
    }
    expect(component.powOptions.some(option => option.value === 'nanoTo')).toBeTrue();
  });

  it('shows an eligible provider in best mode, never a saved Nano.to RPC without a key', () => {
    const settings = (component as any).appSettings.settings;
    const hasKey = spyOn(component.powApiKeyVault, 'hasKey').and.returnValue(false);
    settings.powSource = 'best';
    settings.serverName = 'nano-to';
    settings.serverAPI = 'https://rpc.nano.to/';
    component.selectedPoWOption = 'best';

    component.pow.syncProviderFromSettings(true);
    expect(component.pow.activeProvider$.value).toEqual({
      source: 'best', name: 'Twister32 RsNano',
      endpoint: 'https://twister32.changeip.net/pow', status: 'unverified'
    });
    expect(component.getRemotePoWOptionName('best')).toContain('Twister32 RsNano');
    expect(component.getRemotePoWOptionName('best')).not.toContain('Nano.to');
    expect(component.showNanoToPowApiKeys()).toBeFalse();

    hasKey.and.returnValue(true);
    component.pow.syncProviderFromSettings(true);
    expect(component.pow.activeProvider$.value).toEqual({
      source: 'best', name: 'Nano.to',
      endpoint: 'https://rpc.nano.to/', status: 'unverified'
    });
    expect(component.getRemotePoWOptionName('best')).toContain('Nano.to');
    expect(component.showNanoToPowApiKeys()).toBeFalse();

    hasKey.and.returnValue(false);
    component.pow.syncProviderFromSettings(true);
    expect(component.getRemotePoWOptionName('best')).toContain('Twister32 RsNano');
    expect(component.showNanoToPowApiKeys()).toBeFalse();
    expect(settings.serverName).toBe('nano-to');
    expect(settings.serverAPI).toBe('https://rpc.nano.to/');
  });

  it('warns about irreversible erasure after three wrong vault passwords', async () => {
    spyOn(component, 'ngOnInit').and.stub();
    const settings = (component as any).appSettings.settings;
    settings.powSource = 'nanoTo';
    settings.serverName = 'nano-to';
    settings.serverAPI = 'https://rpc.nano.to/';
    component.selectedPoWOption = 'nanoTo';
    const vault = component.powApiKeyVault;
    spyOnProperty(vault, 'hasVault', 'get').and.returnValue(true);
    spyOnProperty(vault, 'isUnlocked', 'get').and.returnValue(false);
    const transloco = TestBed.inject(TranslocoService);
    await firstValueFrom(transloco.load(transloco.getActiveLang()));
    // The view uses Eager change detection; explicitly mark changes made
    // directly in this test before checking conditional template content.
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#pow-vault-help')).toBeTruthy();
    const warning = fixture.nativeElement.querySelector(
      '#pow-vault-help + .uk-form-controls [role="note"]') as HTMLElement;
    expect(warning).toBeTruthy();
    expect(warning.textContent)
      .toContain(transloco.translate('configure-app.pow-api-vault.unlock-security-warning'));
  });

  it('reports failed vault unlock attempts and updates PoW after vault erasure', async () => {
    const vault = component.powApiKeyVault;
    spyOnProperty(vault, 'hasVault', 'get').and.returnValue(true);
    spyOnProperty(vault, 'isUnlocked', 'get').and.returnValue(false);
    const unlock = spyOn(vault, 'unlock').and.rejectWith(new PoWVaultUnlockError(2, false));
    const notifications = (component as any).notifications;
    const notify = spyOn(notifications, 'sendError');
    const refresh = spyOn(component.pow, 'syncProviderFromSettings');

    component.powVaultPassphrase = 'wrong vault password';
    await component.unlockPowApiKeys();
    expect(unlock).toHaveBeenCalledTimes(1);
    expect(component.powVaultPassphrase).toBe('');
    expect(notify).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();

    unlock.and.rejectWith(new PoWVaultUnlockError(0, true));
    component.powVaultPassphrase = 'wrong password again';
    await component.unlockPowApiKeys();
    expect(notify).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledOnceWith(true);
  });

  it('enables Unlock keys for a locked Nano.to vault even with an empty passphrase', async () => {
    // These tests change component state directly, outside an Angular DOM event.
    // Mark the Eager/OnPush view dirty before checking its template bindings.
    const render = async () => {
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();
      // NgModel synchronizes [disabled] via a microtask; wait for the
      // ControlValueAccessor before checking the actual input element.
      await fixture.whenStable();
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();
    };
    spyOn(component, 'ngOnInit').and.stub();
    const settings = (component as any).appSettings.settings;
    settings.powSource = 'nanoTo';
    settings.serverName = 'nano-to';
    settings.serverAPI = 'https://rpc.nano.to/';
    component.selectedPoWOption = 'nanoTo';
    const vault = component.powApiKeyVault;
    const hasVault = spyOnProperty(vault, 'hasVault', 'get').and.returnValue(true);
    const isUnlocked = spyOnProperty(vault, 'isUnlocked', 'get').and.returnValue(false);
    const unlock = spyOn(vault, 'unlock').and.returnValue(Promise.resolve());
    const transloco = TestBed.inject(TranslocoService);
    await firstValueFrom(transloco.load(transloco.getActiveLang()));
    await render();
    await fixture.whenStable();
    await render();

    const button = fixture.nativeElement.querySelector('#pow-api-key-unlock') as HTMLButtonElement;
    const passphrase = fixture.nativeElement.querySelector('#pow-vault-passphrase') as HTMLInputElement;
    expect(button).toBeTruthy();
    expect(passphrase).toBeTruthy();
    expect(button.disabled).toBeFalse();
    expect(passphrase.disabled).toBeFalse();

    const focus = spyOn(passphrase, 'focus').and.callThrough();
    button.click();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(unlock).not.toHaveBeenCalled();

    component.powVaultPassphrase = 'the saved vault passphrase';
    await render();
    button.click();
    await fixture.whenStable();
    expect(unlock).toHaveBeenCalledOnceWith('the saved vault passphrase');
    expect(component.powVaultPassphrase).toBe('');

    isUnlocked.and.returnValue(true);
    await render();
    expect(button.disabled).toBeTrue();
    expect(passphrase.disabled).toBeTrue(); // No re-entry after explicit unlock.

    isUnlocked.and.returnValue(false);
    hasVault.and.returnValue(false);
    await render();
    expect(button.disabled).toBeTrue();
    expect(passphrase.disabled).toBeFalse(); // First vault creation is allowed.
  });

  it('enables key creation only for a new vault or an already unlocked vault', async () => {
    // These tests change component state directly, outside an Angular DOM event.
    // Mark the Eager/OnPush view dirty before checking its template bindings.
    const render = async () => {
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();
      // NgModel synchronizes [disabled] via a microtask; wait for the
      // ControlValueAccessor before checking the actual input element.
      await fixture.whenStable();
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();
    };
    spyOn(component, 'ngOnInit').and.stub();
    const settings = (component as any).appSettings.settings;
    settings.powSource = 'nanoTo';
    settings.serverName = 'nano-to';
    settings.serverAPI = 'https://rpc.nano.to/';
    component.selectedPoWOption = 'nanoTo';
    component.powApiKeyInput = 'NANO-NEW-API-KEY-123456';
    component.powVaultPassphrase = '';
    const vault = component.powApiKeyVault;
    const hasVault = spyOnProperty(vault, 'hasVault', 'get').and.returnValue(false);
    const isUnlocked = spyOnProperty(vault, 'isUnlocked', 'get').and.returnValue(false);
    const transloco = TestBed.inject(TranslocoService);
    await firstValueFrom(transloco.load(transloco.getActiveLang()));
    await render();
    await fixture.whenStable();
    await render();
    const buttons = fixture.nativeElement.querySelectorAll('.pow-vault-actions button') as NodeListOf<HTMLButtonElement>;
    const save = Array.from(buttons).find(button => button.classList.contains('uk-button-primary'))!;
    const labelInput = fixture.nativeElement.querySelector('#pow-api-key-label') as HTMLInputElement;
    const keyInput = fixture.nativeElement.querySelector('#pow-api-key') as HTMLInputElement;
    const passphraseInput = fixture.nativeElement.querySelector('#pow-vault-passphrase') as HTMLInputElement;

    expect(save).toBeTruthy();
    expect(labelInput).toBeTruthy();
    expect(keyInput).toBeTruthy();
    expect(labelInput.disabled).toBeFalse();
    expect(keyInput.disabled).toBeFalse();
    expect(passphraseInput.disabled).toBeFalse();
    expect(save.disabled).toBeTrue(); // New vault requires an initial passphrase.

    component.powVaultPassphrase = 'initial vault passphrase';
    await render();
    expect(save.disabled).toBeFalse();

    hasVault.and.returnValue(true);
    isUnlocked.and.returnValue(false);
    await render();
    expect(save.disabled).toBeTrue(); // Stored vault must be explicitly unlocked first.
    expect(labelInput.disabled).toBeTrue();
    expect(keyInput.disabled).toBeTrue();
    expect(passphraseInput.disabled).toBeFalse(); // Required to unlock.

    isUnlocked.and.returnValue(true);
    component.powVaultPassphrase = '';
    await render();
    expect(labelInput.disabled).toBeFalse();
    expect(keyInput.disabled).toBeFalse();
    expect(passphraseInput.disabled).toBeTrue(); // Session already unlocked.
    expect(save.disabled).toBeFalse(); // No need to re-enter passphrase for a new key.

    // Locking again must immediately disable both sensitive editing fields.
    isUnlocked.and.returnValue(false);
    await render();
    expect(labelInput.disabled).toBeTrue();
    expect(keyInput.disabled).toBeTrue();
    expect(passphraseInput.disabled).toBeFalse();
    expect(save.disabled).toBeTrue();
  });

  it('keeps selector labels as translation keys until Transloco has loaded', () => {
    // Do not eagerly call translate() in the component constructor: the
    // asynchronous dictionary may not be ready, leaving raw keys visible.
    expect(component.storageOptions[0].name).toBe('configure-app.storage-options.browser-local-storage');
    expect(component.powOptions.find(option => option.value === 'clientWebGL')?.name)
      .toBe('configure-app.pow-options.client-side-gpu-webgl');
    expect(component.pendingOptions.find(option => option.value === 'amount')?.name)
      .toBe('configure-app.pending-options.automatic-largest-amount-first');
    expect(component.inactivityOptions.find(option => option.value === 15)?.params)
      .toEqual({ minutes: 15 });
    expect(component.selectedPoWOption).toBe('best');
    expect(component.selectedPendingOption).toBe('amount');
  });
});

// Behavior coverage is separate from the constructor smoke test above.
describe('ConfigureAppComponent server settings', () => {
  let component: ConfigureAppComponent;
  let settings: any;
  let notifications: any;
  let websocket: any;
  let wallet: any;
  beforeEach(() => {
    component = Object.create(ConfigureAppComponent.prototype);
    settings = {
      settings: { serverAPI: 'https://saved.example/rpc' },
      serverOptions: [{ value: 'custom', name: 'New', isLocal: false }],
      setAppSettings: jasmine.createSpy(), loadAppSettings: jasmine.createSpy(),
      saveLocalNode: jasmine.createSpy('saveLocalNode')
    };
    settings.setAppSettings.and.callFake((values: any) => Object.assign(settings.settings, values));
    settings.saveLocalNode.and.callFake((_name: string, api: string, ws: string | null) => {
      settings.serverOptions = [
        { value: 'custom', name: 'New', isLocal: false },
        { value: 'local-test', name: 'My node', isLocal: true, api, ws }
      ];
      return 'local-test';
    });
    settings.loadAppSettings.and.callFake(() => {
      const node = settings.serverOptions.find((item: any) => item.value === settings.settings.serverName);
      settings.settings.serverAPI = node?.api || null;
      settings.settings.serverWS = node?.ws || null;
    });
    notifications = { sendWarning: jasmine.createSpy(), sendSuccess: jasmine.createSpy() };
    websocket = { forceReconnect: jasmine.createSpy() };
    wallet = {
      wallet: { accounts: [{ id: 'nano_test' }] },
      isConfigured: jasmine.createSpy().and.returnValue(true),
      reloadBalances: jasmine.createSpy().and.returnValue(Promise.resolve())
    };
    Object.assign(component, {
      selectedServer: 'custom', serverAPI: 'https://new.example/rpc', serverWS: 'wss://new.example/ws',
      serverOptions: settings.serverOptions, serverNodeName: 'My node',
      showServerConfigs: () => true, selectedLocalNode: () => null,
      appSettings: settings, notifications, websocket, walletService: wallet,
      pow: {
        syncProviderFromSettings: jasmine.createSpy('syncProviderFromSettings'),
        initializeAndroidPwaExternalPoW: jasmine.createSpy('initializeAndroidPwaExternalPoW').and.returnValue(Promise.resolve())
      },
      api: { checkNodeAvailability: jasmine.createSpy().and.returnValue(Promise.resolve()) },
      translocoService: { translate: (key: string) => key },
      node: { setLoading: jasmine.createSpy(), node: {} }, statsRequest: 0
    });
    spyOn(component, 'updateNodeStats').and.returnValue(Promise.resolve());
  });
  it('rejects plaintext without changing the saved server or restarting the socket', async () => {
    component.serverAPI = 'http://example.invalid';
    await component.updateServerSettings();
    expect(notifications.sendWarning).toHaveBeenCalled();
    expect(settings.setAppSettings).not.toHaveBeenCalled();
    expect(websocket.forceReconnect).not.toHaveBeenCalled();
  });
  it('reconnects immediately even while the balance refresh is pending', async () => {
    let resolve!: () => void;
    wallet.reloadBalances.and.returnValue(new Promise<void>(r => resolve = r));
    const saving = component.updateServerSettings();
    expect(websocket.forceReconnect).toHaveBeenCalledTimes(1);
    resolve();
    await saving;
    expect(websocket.forceReconnect).toHaveBeenCalledTimes(1);
  });
  it('reports a single warning for an explicitly failed server change without a wallet', async () => {
    wallet.wallet.accounts = [];
    wallet.isConfigured.and.returnValue(false);
    component.serverWS = ''; // RPC-only selection: explicit health check applies.
    (component as any).api.checkNodeAvailability.and.returnValue(Promise.reject(new Error('offline')));
    await component.updateServerSettings();
    expect((component as any).api.checkNodeAvailability).toHaveBeenCalledWith(true);
    expect(notifications.sendWarning).toHaveBeenCalledTimes(1);
  });

  it('probes after saving an RPC-only server without a configured wallet', async () => {
    wallet.wallet.accounts = [];
    wallet.isConfigured.and.returnValue(false);
    component.serverWS = '';
    await component.updateServerSettings();
    expect(wallet.reloadBalances).not.toHaveBeenCalled();
    expect((component as any).api.checkNodeAvailability).toHaveBeenCalledTimes(1);
    expect(websocket.forceReconnect).toHaveBeenCalledTimes(1);
  });
  it('shows node stats immediately and does not probe a synthetic account with WS configured', async () => {
    wallet.wallet.accounts = [];
    wallet.isConfigured.and.returnValue(false);
    await component.updateServerSettings();
    expect(component.updateNodeStats).toHaveBeenCalledTimes(1);
    expect((component as any).api.checkNodeAvailability).not.toHaveBeenCalled();
    expect(websocket.forceReconnect).toHaveBeenCalledTimes(1);
    expect(notifications.sendWarning).not.toHaveBeenCalled();
  });

  it('does not wait for an RPC-only availability check before requesting node stats', async () => {
    wallet.wallet.accounts = [];
    wallet.isConfigured.and.returnValue(false);
    component.serverWS = '';
    let finishProbe!: () => void;
    const probe = new Promise<void>(resolve => { finishProbe = resolve; });
    (component as any).api.checkNodeAvailability.and.returnValue(probe);
    const saving = component.updateServerSettings();
    expect((component as any).api.checkNodeAvailability).toHaveBeenCalledTimes(1);
    expect(component.updateNodeStats).toHaveBeenCalledTimes(1);
    finishProbe();
    await saving;
  });

  it('handles a failed refresh without retaining old statistics', async () => {
    component.nodeVendor = 'old server';
    wallet.reloadBalances.and.returnValue(Promise.reject(new Error('offline')));
    await component.updateServerSettings();
    expect(component.nodeVendor).toBeNull();
    expect(notifications.sendWarning).toHaveBeenCalled();
    expect(websocket.forceReconnect).toHaveBeenCalled();
  });
});

describe('ConfigureAppComponent local-node management with The best selected', () => {
  let component: ConfigureAppComponent;
  let settings: any;
  let websocket: any;
  let wallet: any;
  let previousUIkit: any;

  beforeEach(() => {
    const local = {
      name: 'Nano.to (local)', value: 'local-nano-to', isLocal: true,
      api: 'https://rpc.nano.to/', ws: 'wss://ws.nano.to/'
    };
    settings = {
      settings: {
        serverName: 'random', serverAPI: 'https://rainstorm.city/api',
        serverWS: 'wss://rainstorm.city/websocket'
      },
      serverOptions: [local, {
        name: 'Rainstorm City', value: 'rainstorm', isLocal: false,
        api: 'https://rainstorm.city/api', ws: 'wss://rainstorm.city/websocket'
      }],
      removeLocalNode: jasmine.createSpy('removeLocalNode').and.callFake((id: string) => {
        settings.serverOptions = settings.serverOptions.filter((node: any) => node.value !== id);
      }),
      setAppSettings: jasmine.createSpy('setAppSettings').and.callFake((updates: any) =>
        Object.assign(settings.settings, updates)),
      loadServerSettings: jasmine.createSpy('loadServerSettings').and.callFake(() => {
        settings.settings.serverAPI = 'https://twister32.changeip.net/proxy';
        settings.settings.serverWS = 'wss://twister32.changeip.net/ws';
      }),
      saveAppSettings: jasmine.createSpy('saveAppSettings')
    };
    websocket = { forceReconnect: jasmine.createSpy('forceReconnect') };
    wallet = {
      wallet: { accounts: [{ id: 'nano_test' }] },
      reloadBalances: jasmine.createSpy('reloadBalances').and.returnValue(Promise.resolve())
    };
    component = Object.create(ConfigureAppComponent.prototype);
    Object.assign(component, {
      serverOptions: settings.serverOptions,
      selectedServer: 'random',
      localNodeToDeleteId: '',
      appSettings: settings,
      websocket, walletService: wallet,
      translocoService: { translate: (key: string) => key },
      notifications: { sendWarning: jasmine.createSpy('sendWarning') },
      rpcRanking: { refresh: jasmine.createSpy('refresh').and.returnValue(Promise.resolve()) },
      localNodes: () => component.serverOptions.filter(node => node.isLocal),
      localNodeToDelete: () => component.localNodes().find(node => node.value === component.localNodeToDeleteId),
      serverConfigChange: jasmine.createSpy('serverConfigChange'),
      resetNodeStats: jasmine.createSpy('resetNodeStats'),
      updateNodeStats: jasmine.createSpy('updateNodeStats').and.returnValue(Promise.resolve())
    });
    previousUIkit = (window as any).UIkit;
    (window as any).UIkit = {
      modal: { confirm: jasmine.createSpy('confirm').and.returnValue(Promise.resolve()) }
    };
  });

  afterEach(() => {
    (window as any).UIkit = previousUIkit;
  });

  it('lists only actual RPC nodes and switches connection modes outside the list', () => {
    const actionModes = [
      { value: 'random', api: null, name: 'The best' },
      { value: 'custom', api: null, name: 'New' },
      { value: 'offline', api: null, name: 'Offline' }
    ];
    component.serverOptions = [...settings.serverOptions, ...actionModes] as any;
    // Angular class-field initializers are not run by this prototype harness.
    component.availableServerNodes = () => component.serverOptions.filter(server =>
      !!server.api && server.value !== 'custom');
    component.selectedServerIsNode = () => component.availableServerNodes().some(server =>
      server.value === component.selectedServer);
    const nodes = component.availableServerNodes();
    expect(nodes.map(node => node.value)).toEqual(['local-nano-to', 'rainstorm']);
    expect(component.selectedServerIsNode()).toBeFalse();

    component.selectServerNode('rainstorm');
    expect(component.selectedServer).toBe('rainstorm');
    expect(component.selectedServerIsNode()).toBeTrue();

    component.selectServerMode('random');
    expect(component.selectedServerIsNode()).toBeFalse();
    component.selectServerMode('custom');
    expect(component.selectedServer).toBe('custom');
    component.selectServerMode('offline');
    expect(component.selectedServer).toBe('offline');
    expect(component.serverConfigChange).toHaveBeenCalledTimes(4);
  });

  it('exposes the local-node deletion picker even when The best is selected', () => {
    expect(component.selectedServer).toBe('random');
    expect(component.localNodes().length).toBe(1);
    expect(component.localNodeToDelete()).toBeUndefined();
    component.localNodeToDeleteId = 'local-nano-to';
    expect(component.localNodeToDelete()?.name).toBe('Nano.to (local)');
  });

  it('does not delete anything without an explicit local-node target', async () => {
    await component.deleteLocalNode();
    expect(settings.removeLocalNode).not.toHaveBeenCalled();
  });

  it('deletes an inactive local node without changing The best or reconnecting', async () => {
    component.localNodeToDeleteId = 'local-nano-to';
    await component.deleteLocalNode();
    expect(settings.removeLocalNode).toHaveBeenCalledOnceWith('local-nano-to');
    expect(component.selectedServer).toBe('random');
    expect(settings.settings.serverName).toBe('random');
    expect(settings.loadServerSettings).not.toHaveBeenCalled();
    expect(websocket.forceReconnect).not.toHaveBeenCalled();
    expect(wallet.reloadBalances).not.toHaveBeenCalled();
    expect(component.localNodes().length).toBe(0);
    expect(component.localNodeToDeleteId).toBe('');
  });

  it('switches to RsNano safely when the local node being deleted was active', async () => {
    settings.settings.serverName = 'local-nano-to';
    settings.settings.serverAPI = 'https://rpc.nano.to/';
    settings.settings.serverWS = 'wss://ws.nano.to/';
    component.selectedServer = 'local-nano-to';
    component.localNodeToDeleteId = 'local-nano-to';
    await component.deleteLocalNode();
    expect(settings.settings.serverName).toBe('twister32-rsnano');
    expect(component.selectedServer).toBe('twister32-rsnano');
    expect(websocket.forceReconnect).toHaveBeenCalledTimes(1);
    expect(wallet.reloadBalances).toHaveBeenCalledTimes(1);
  });
});


describe('ConfigureAppComponent live PoW selection label', () => {
  it('shows the fallback provider in the selected dropdown without changing wallet RPC or PoW mode', () => {
    const component = Object.create(ConfigureAppComponent.prototype) as ConfigureAppComponent;
    const settings = {
      powSource: 'server', serverName: 'rainstorm',
      serverAPI: 'https://rainstorm.city/api'
    };
    const active = {
      source: 'server', name: 'Rainstorm City',
      endpoint: 'https://rainstorm.city/api', status: 'unverified'
    };
    const translations: Record<string, string> = {
      'configure-app.pow-options.external-selected-server': 'Externe — serveur sélectionné',
      'configure-app.pow-options.external-provider': 'Externe',
      'configure-app.pow-options.best-option-available': 'Meilleure option disponible',
      'configure-app.pow-provider-fallback': 'secours PoW'
    };
    Object.assign(component, {
      selectedPoWOption: 'server',
      selectedServer: 'rainstorm',
      appSettings: {
        settings,
        serverOptions: [
          { value: 'rainstorm', api: 'https://rainstorm.city/api', name: 'Rainstorm City' },
          { value: 'twister32-rsnano', api: 'https://twister32.changeip.net/proxy',
            work: 'https://twister32.changeip.net/pow', name: 'Twister32 RsNano' }
        ],
        getSelectedServerWorkUrl: () => ''
      },
      pow: {
        activeProvider$: { value: active },
        getPreferredBestPoWProvider: () => ({
          name: 'Twister32 RsNano', endpoint: 'https://twister32.changeip.net/pow'
        })
      },
      powApiKeyVault: { hasKey: () => false },
      translocoService: {
        translate: (key: string) => translations[key] || key
      }
    });
    const label = () => component.getRemotePoWOptionName('server');
    expect(label()).toBe('Externe — serveur sélectionné (Rainstorm City)');

    active.name = 'Twister32 RsNano';
    active.endpoint = 'https://twister32.changeip.net/pow';
    active.status = 'available';
    expect(label()).toBe('Externe (Twister32 RsNano — secours PoW)');

    // A second external work provider becomes the active source dynamically.
    active.name = 'NanOslo';
    active.endpoint = 'https://nanoslo.0x.no/proxy';
    expect(label()).toBe('Externe (NanOslo — secours PoW)');
    expect(settings.serverName).toBe('rainstorm');
    expect(settings.serverAPI).toBe('https://rainstorm.city/api');
    expect(settings.powSource).toBe('server');
    expect(component.selectedPoWOption).toBe('server');

    // Do not display another attempted provider as selected before success.
    active.status = 'checking';
    expect(label()).toBe('Externe — serveur sélectionné (Rainstorm City)');

    // A draft option change is not an applied provider change.
    component.selectedPoWOption = 'best';
    expect(label()).toBe('Externe — serveur sélectionné');
    expect(component.getRemotePoWOptionName('best')).toBe('Meilleure option disponible');

    component.selectedPoWOption = 'server';
    settings.powSource = 'best';
    active.source = 'best';
    active.status = 'unverified';
    component.selectedPoWOption = 'best';
    expect(component.getRemotePoWOptionName('best'))
      .toBe('Meilleure option disponible (Twister32 RsNano)');
    // The saved RPC's name is not a fallback PoW selection.
    active.name = 'Twister32 RsNano';
    active.endpoint = 'https://twister32.changeip.net/pow';
    active.status = 'available';
    expect(component.getRemotePoWOptionName('best'))
      .toBe('Meilleure option disponible (Twister32 RsNano)');
    expect(settings.serverName).toBe('rainstorm');
    expect(settings.serverAPI).toBe('https://rainstorm.city/api');

    // The custom URL stays editable and persisted; only the visible source
    // label reflects a successful public PoW fallback.
    settings.powSource = 'custom';
    (settings as any).customWorkServer = 'https://proxy.nanos.cc/proxy';
    active.source = 'custom';
    active.status = 'available';
    active.name = 'Twister32 RsNano';
    active.endpoint = 'https://twister32.changeip.net/pow';
    component.selectedPoWOption = 'custom';
    expect(component.getRemotePoWOptionName('custom'))
      .toBe('configure-app.pow-options.external-custom-server (Twister32 RsNano — secours PoW)');
    expect(settings.serverAPI).toBe('https://rainstorm.city/api');
    expect((settings as any).customWorkServer).toBe('https://proxy.nanos.cc/proxy');
  });
});


describe('ConfigureAppComponent advanced-data deletion removes the PoW vault', () => {
  const testWindow = window as unknown as { UIkit?: { modal: { confirm: jasmine.Spy } } };
  let previousUIkit: typeof testWindow.UIkit;
  let component: ConfigureAppComponent;
  let confirm: jasmine.Spy;
  let vault: { clearVault: jasmine.Spy };
  let wallet: { resetWallet: jasmine.Spy; removeWalletData: jasmine.Spy };
  let workPool: { clearCache: jasmine.Spy; deleteCache: jasmine.Spy };
  let settings: { clearAppSettings: jasmine.Spy };
  let notifications: { sendSuccess: jasmine.Spy };

  beforeEach(() => {
    previousUIkit = testWindow.UIkit;
    confirm = jasmine.createSpy('confirm').and.resolveTo();
    testWindow.UIkit = { modal: { confirm } };
    component = Object.create(ConfigureAppComponent.prototype) as ConfigureAppComponent;
    vault = { clearVault: jasmine.createSpy('clearVault') };
    wallet = {
      resetWallet: jasmine.createSpy('resetWallet'),
      removeWalletData: jasmine.createSpy('removeWalletData')
    };
    workPool = {
      clearCache: jasmine.createSpy('clearCache'),
      deleteCache: jasmine.createSpy('deleteCache')
    };
    settings = { clearAppSettings: jasmine.createSpy('clearAppSettings') };
    notifications = { sendSuccess: jasmine.createSpy('sendSuccess') };
    Object.assign(component, {
      powApiKeyVault: vault,
      walletService: wallet,
      // The deletion flow must revoke Web Push before clearing wallet data.
      // Stub the isolated notification backend for these existing deletion tests.
      receivablePush: {
        disableReceivable: jasmine.createSpy('disableReceivable').and.resolveTo(true),
        disable: jasmine.createSpy('disable').and.resolveTo(true)
      },
      workPool,
      notifications,
      appSettings: settings,
      addressBook: { clearAddressBook: jasmine.createSpy('clearAddressBook') },
      repService: { resetRepresentativeList: jasmine.createSpy('resetRepresentativeList') },
      api: { deleteCache: jasmine.createSpy('deleteCache') },
      translocoService: { translate: (key: string) => key },
      powSelectedKeyId: 'key-id',
      powApiKeyInput: 'raw-secret-not-persisted',
      powApiKeyLabel: 'My key',
      powVaultPassphrase: 'a strong passphrase',
      loadFromSettings: jasmine.createSpy('loadFromSettings'),
      updateServerSettings: jasmine.createSpy('updateServerSettings').and.resolveTo()
    });
  });
  afterEach(() => {
    if (previousUIkit === undefined) delete testWindow.UIkit;
    else testWindow.UIkit = previousUIkit;
  });

  it('deletes the PoW vault after confirming Delete wallet data', async () => {
    await component.clearWalletData();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.calls.mostRecent().args[0]).toContain(
      'configure-app.pow-api-vault.delete-with-wallet');
    expect(vault.clearVault).toHaveBeenCalledTimes(1);
    expect(wallet.resetWallet).toHaveBeenCalledTimes(1);
    expect(wallet.removeWalletData).toHaveBeenCalledTimes(1);
    expect(workPool.deleteCache).not.toHaveBeenCalled();
    expect(settings.clearAppSettings).not.toHaveBeenCalled();
    expect(component.powApiKeyInput).toBe('');
    expect(component.powVaultPassphrase).toBe('');
    expect(component.powApiKeyLabel).toBe('');
    expect(component.powSelectedKeyId).toBe('');
  });

  it('deletes the PoW vault after confirming Delete all data', async () => {
    await component.clearAllData();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.calls.mostRecent().args[0]).toContain(
      'configure-app.pow-api-vault.delete-with-wallet');
    expect(vault.clearVault).toHaveBeenCalledTimes(1);
    expect(wallet.resetWallet).toHaveBeenCalledTimes(1);
    expect(wallet.removeWalletData).toHaveBeenCalledTimes(1);
    expect(workPool.deleteCache).toHaveBeenCalledTimes(1);
    expect(settings.clearAppSettings).toHaveBeenCalledTimes(1);
    expect(component.powApiKeyInput).toBe('');
    expect(component.powSelectedKeyId).toBe('');
  });

  it('preserves wallet data when revoking receivable notifications fails', async () => {
    ((component as any).receivablePush.disableReceivable as jasmine.Spy).and.resolveTo(false);
    await component.clearWalletData();
    expect(vault.clearVault).not.toHaveBeenCalled();
    expect(wallet.resetWallet).not.toHaveBeenCalled();
    expect(wallet.removeWalletData).not.toHaveBeenCalled();
  });

  it('preserves all app data when revoking all push subscriptions fails', async () => {
    ((component as any).receivablePush.disable as jasmine.Spy).and.resolveTo(false);
    await component.clearAllData();
    expect(vault.clearVault).not.toHaveBeenCalled();
    expect(wallet.resetWallet).not.toHaveBeenCalled();
    expect(wallet.removeWalletData).not.toHaveBeenCalled();
    expect(settings.clearAppSettings).not.toHaveBeenCalled();
  });

  it('cancelling either destructive action leaves the wallet and PoW vault intact', async () => {
    confirm.and.rejectWith(new Error('Cancelled'));
    await component.clearWalletData();
    await component.clearAllData();
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(vault.clearVault).not.toHaveBeenCalled();
    expect(wallet.resetWallet).not.toHaveBeenCalled();
    expect(wallet.removeWalletData).not.toHaveBeenCalled();
    expect(workPool.deleteCache).not.toHaveBeenCalled();
    expect(settings.clearAppSettings).not.toHaveBeenCalled();
    expect(component.powApiKeyInput).toBe('raw-secret-not-persisted');
  });

  it('clearing only the PoW work cache keeps encrypted API keys intact', async () => {
    await component.clearWorkCache();
    expect(workPool.clearCache).toHaveBeenCalledTimes(1);
    expect(vault.clearVault).not.toHaveBeenCalled();
  });
});


describe('ConfigureAppComponent PoW API-key activation', () => {
  it('activates a selected key without entering a passphrase while unlocked', async () => {
    const component = Object.create(ConfigureAppComponent.prototype) as ConfigureAppComponent;
    const activateKey = jasmine.createSpy('activateKey').and.resolveTo();
    const notifications = {
      sendSuccess: jasmine.createSpy('sendSuccess'),
      sendError: jasmine.createSpy('sendError')
    };
    Object.assign(component, {
      powApiKeyVault: {
        isUnlocked: true,
        getKeySummaries: () => [{ id: 'stored-key', provider: 'nano-to', label: 'Saved', active: false }],
        activateKey
      },
      pow: { syncProviderFromSettings: jasmine.createSpy('syncProviderFromSettings') },
      notifications,
      translocoService: { translate: (key: string) => key },
      powVaultPassphrase: '',
      powSelectedKeyId: 'stored-key',
      powVaultBusy: false
    });

    await component.activatePowApiKey();
    expect(activateKey).toHaveBeenCalledOnceWith('nano-to', 'stored-key');
    expect(notifications.sendSuccess).toHaveBeenCalledOnceWith('configure-app.pow-api-vault.activated');
    expect(notifications.sendError).not.toHaveBeenCalled();
    expect(component.powVaultPassphrase).toBe('');
    expect(component.powVaultBusy).toBeFalse();
  });

  it('does not activate a selected key while the vault is locked', async () => {
    const component = Object.create(ConfigureAppComponent.prototype) as ConfigureAppComponent;
    const activateKey = jasmine.createSpy('activateKey').and.resolveTo();
    Object.assign(component, {
      powApiKeyVault: {
        isUnlocked: false,
        getKeySummaries: () => [{ id: 'stored-key', provider: 'nano-to', label: 'Saved', active: false }],
        activateKey
      },
      powSelectedKeyId: 'stored-key',
      powVaultBusy: false
    });
    await component.activatePowApiKey();
    expect(activateKey).not.toHaveBeenCalled();
  });
});

describe('ConfigureAppComponent PoW API-key save errors', () => {
  it('reports an encryption failure as a red error notification without claiming success', async () => {
    const component = Object.create(ConfigureAppComponent.prototype) as ConfigureAppComponent;
    const notifications = {
      sendSuccess: jasmine.createSpy('sendSuccess'),
      sendError: jasmine.createSpy('sendError'),
      sendWarning: jasmine.createSpy('sendWarning')
    };
    const saveKey = jasmine.createSpy('saveKey').and.rejectWith(new Error('Failed to seal vault'));
    Object.assign(component, {
      powApiKeyVault: { saveKey },
      notifications,
      translocoService: { translate: (key: string) => key },
      powApiKeyInput: 'NANO-NEW-KEY-123456',
      powVaultPassphrase: 'existing vault phrase',
      powApiKeyLabel: 'Second key',
      powSelectedKeyId: 'original-id',
      powVaultBusy: false
    });

    await component.savePowApiKey();
    expect(saveKey).toHaveBeenCalledOnceWith('nano-to', 'NANO-NEW-KEY-123456',
      'existing vault phrase', 'Second key');
    expect(notifications.sendError).toHaveBeenCalledOnceWith('configure-app.pow-api-vault.failed');
    expect(notifications.sendWarning).not.toHaveBeenCalled();
    expect(notifications.sendSuccess).not.toHaveBeenCalled();
    expect(component.powSelectedKeyId).toBe('original-id');
    expect(component.powVaultBusy).toBeFalse();
  });
});

describe('ConfigureAppComponent selected PoW key deletion', () => {
  const windowWithUIkit = window as unknown as { UIkit?: { modal: { confirm: jasmine.Spy } } };
  let previousUIkit: typeof windowWithUIkit.UIkit;
  let component: ConfigureAppComponent;
  let confirm: jasmine.Spy;
  let vault: any;
  let notify: any;
  let pow: any;

  beforeEach(() => {
    previousUIkit = windowWithUIkit.UIkit;
    confirm = jasmine.createSpy('confirm').and.resolveTo();
    windowWithUIkit.UIkit = { modal: { confirm } };
    component = Object.create(ConfigureAppComponent.prototype) as ConfigureAppComponent;
    vault = {
      isUnlocked: true,
      getKeySummaries: jasmine.createSpy('getKeySummaries').and.returnValue([
        { id: 'active-key-id', label: 'Nano.to active', provider: 'nano-to', active: true }
      ]),
      removeKey: jasmine.createSpy('removeKey').and.resolveTo()
    };
    notify = { sendSuccess: jasmine.createSpy('sendSuccess'), sendWarning: jasmine.createSpy('sendWarning') };
    pow = { syncProviderFromSettings: jasmine.createSpy('syncProviderFromSettings') };
    Object.assign(component, {
      powApiKeyVault: vault,
      notifications: notify,
      pow,
      translocoService: { translate: (key: string) => key },
      powApiProvider: 'nano-to',
      powSelectedKeyId: '',
      powApiKeyInput: '',
      powVaultPassphrase: '',
      powVaultBusy: false
    });
  });
  afterEach(() => {
    if (previousUIkit === undefined) delete windowWithUIkit.UIkit;
    else windowWithUIkit.UIkit = previousUIkit;
  });

  it('deletes an active stored key with empty new-key and phrase inputs after confirmation', async () => {
    expect(component.selectedPowKeyId()).toBe('active-key-id');
    await component.removePowApiKey();
    expect(confirm).toHaveBeenCalledOnceWith('configure-app.pow-api-vault.delete-confirm');
    expect(vault.removeKey).toHaveBeenCalledOnceWith('nano-to', null, 'active-key-id');
    expect(component.powSelectedKeyId).toBe('');
    expect(pow.syncProviderFromSettings).toHaveBeenCalledOnceWith(true);
    expect(notify.sendSuccess).toHaveBeenCalled();
  });

  it('does not delete the key when confirmation is cancelled', async () => {
    confirm.and.rejectWith(new Error('cancel'));
    component.powSelectedKeyId = 'active-key-id';
    await component.removePowApiKey();
    expect(vault.removeKey).not.toHaveBeenCalled();
    expect(component.powSelectedKeyId).toBe('active-key-id');
    expect(notify.sendWarning).not.toHaveBeenCalled();
  });

  it('does not delete while vault is locked or without a selected key', async () => {
    vault.isUnlocked = false;
    await component.removePowApiKey();
    expect(confirm).not.toHaveBeenCalled();
    vault.isUnlocked = true;
    vault.getKeySummaries.and.returnValue([]);
    await component.removePowApiKey();
    expect(confirm).not.toHaveBeenCalled();
    expect(vault.removeKey).not.toHaveBeenCalled();
  });
});
