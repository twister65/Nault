import { ComponentTestModule, isolateConstructorIO } from '../../../testing/component-test.module';
import { ComponentFixture, TestBed, fakeAsync, tick, waitForAsync } from '@angular/core/testing';

import { ConfigureAppComponent } from './configure-app.component';
import { WebsocketService } from '../../services/websocket.service';

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
      setAppSettings: jasmine.createSpy(), loadAppSettings: jasmine.createSpy()
    };
    settings.setAppSettings.and.callFake((values: any) => Object.assign(settings.settings, values));
    notifications = { sendWarning: jasmine.createSpy(), sendSuccess: jasmine.createSpy() };
    websocket = { forceReconnect: jasmine.createSpy() };
    wallet = {
      wallet: { accounts: [{ id: 'nano_test' }] },
      isConfigured: jasmine.createSpy().and.returnValue(true),
      reloadBalances: jasmine.createSpy().and.returnValue(Promise.resolve())
    };
    Object.assign(component, {
      selectedServer: 'custom', serverAPI: 'https://new.example/rpc', serverWS: 'wss://new.example/ws',
      appSettings: settings, notifications, websocket, walletService: wallet,
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
