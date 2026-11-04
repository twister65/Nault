import { TestBed, fakeAsync, tick, waitForAsync } from '@angular/core/testing';
import { Renderer2 } from '@angular/core';
import { ApiService } from './services/api.service';
import { WebsocketService } from './services/websocket.service';
import { DesktopService } from './services/desktop.service';
import { AppComponent } from './app.component';
import { WalletService } from './services/wallet.service';
import { NotificationService } from './services/notification.service';
import { ComponentTestModule, isolateConstructorIO } from '../testing/component-test.module';

describe('AppComponent', () => {
  beforeEach(waitForAsync(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
      // The controller-only tests do not render a host view, so Renderer2 needs
      // an explicit double. The existing smoke tests still render the real UI.
      providers: [
        AppComponent,
        { provide: Renderer2, useValue: { addClass: () => {}, removeClass: () => {} } }
      ]
    }).compileComponents();
  }));
  it('constructs the application with its real dependency graph', () => {
    expect(TestBed.createComponent(AppComponent).componentInstance).toBeTruthy();
  });
  it('retries a failed initial price fetch and keeps refreshing after later errors', fakeAsync(() => {
    const app = TestBed.inject(AppComponent);
    const price = spyOn(app.price, 'getPrice').and.returnValues(
      Promise.reject(new Error('offline')), Promise.resolve(1)
    );
    void app.updateFiatPrices().catch(() => {});
    tick(0);
    expect(price).toHaveBeenCalledTimes(1);
    tick(app.fiatTimeout);
    expect(price).toHaveBeenCalledTimes(2);
    app.ngOnDestroy();
    tick(app.fiatTimeout);
    expect(price).toHaveBeenCalledTimes(2);
  }));

  it('keeps a failed FIAT price request silent on first launch without a wallet', fakeAsync(() => {
    const app = TestBed.inject(AppComponent);
    app.settings.settings.serverAPI = 'https://example.test/proxy';
    spyOn(TestBed.inject(WalletService), 'isConfigured').and.returnValue(false);
    const fetch = spyOn(app, 'updateFiatPrices').and.returnValue(Promise.reject(new Error('CoinGecko unavailable')));
    const notifications = TestBed.inject(NotificationService);
    const warn = spyOn(notifications, 'sendWarning');
    const clear = spyOn(notifications, 'removeNotification');
    const network = spyOn(TestBed.inject(DesktopService), 'isNetworkOnline');

    void (app as any).loadInitialFiatPrice();
    tick(0);

    expect(fetch).toHaveBeenCalledTimes(1); // The price retry policy remains unchanged.
    expect(warn).not.toHaveBeenCalled();
    expect(clear).toHaveBeenCalledWith('price-adblock');
    expect(network).not.toHaveBeenCalled(); // No connectivity probe is needed for onboarding.
  }));

  it('still warns about failed FIAT prices for a configured wallet while online', fakeAsync(() => {
    const app = TestBed.inject(AppComponent);
    app.settings.settings.serverAPI = 'https://example.test/proxy';
    app.nodeService.internetRecoveryPending = false;
    spyOnProperty(navigator, 'onLine', 'get').and.returnValue(true);
    spyOn(TestBed.inject(WalletService), 'isConfigured').and.returnValue(true);
    spyOn(app, 'updateFiatPrices').and.returnValue(Promise.reject(new Error('CoinGecko unavailable')));
    const network = spyOn(TestBed.inject(DesktopService), 'isNetworkOnline').and.returnValue(Promise.resolve(true));
    const warn = spyOn(TestBed.inject(NotificationService), 'sendWarning');

    void (app as any).loadInitialFiatPrice();
    tick(0);

    expect(network).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      jasmine.stringMatching(/issue retrieving latest nano price/),
      jasmine.objectContaining({ identifier: 'price-adblock' })
    );
  }));

  it('does not report an ad blocker if the configured wallet is offline', fakeAsync(() => {
    const app = TestBed.inject(AppComponent);
    app.settings.settings.serverAPI = 'https://example.test/proxy';
    app.nodeService.internetRecoveryPending = true;
    spyOn(TestBed.inject(WalletService), 'isConfigured').and.returnValue(true);
    spyOn(app, 'updateFiatPrices').and.returnValue(Promise.reject(new Error('offline')));
    const warn = spyOn(TestBed.inject(NotificationService), 'sendWarning');

    void (app as any).loadInitialFiatPrice();
    tick(0);

    expect(warn).not.toHaveBeenCalled();
  }));

  it('does not show a stale FIAT warning if the wallet is removed during the connectivity check', fakeAsync(() => {
    const app = TestBed.inject(AppComponent);
    app.settings.settings.serverAPI = 'https://example.test/proxy';
    app.nodeService.internetRecoveryPending = false;
    spyOnProperty(navigator, 'onLine', 'get').and.returnValue(true);
    const configured = spyOn(TestBed.inject(WalletService), 'isConfigured').and.returnValue(true);
    spyOn(app, 'updateFiatPrices').and.returnValue(Promise.reject(new Error('CoinGecko unavailable')));
    let resolveOnline: (online: boolean) => void = () => {};
    spyOn(TestBed.inject(DesktopService), 'isNetworkOnline').and.returnValue(
      new Promise<boolean>(resolve => { resolveOnline = resolve; })
    );
    const warn = spyOn(TestBed.inject(NotificationService), 'sendWarning');

    void (app as any).loadInitialFiatPrice();
    tick(0);
    configured.and.returnValue(false);
    resolveOnline(true);
    tick(0);

    expect(warn).not.toHaveBeenCalled();
  }));

  it('refreshes FIAT once after selected WS reconnects following offline startup', fakeAsync(() => {
    const app = TestBed.inject(AppComponent);
    const refresh = spyOn(app, 'updateFiatPrices').and.returnValue(Promise.resolve());
    app.settings.settings.serverWS = 'wss://rainstorm.city/websocket';
    app.onNetworkOffline();
    const ws = TestBed.inject(WebsocketService);
    ws.socket.connected = true;
    ws.connected$.next();
    tick(0);
    expect(app.nodeService.internetRecoveryPending).toBe(false);
    expect(refresh).toHaveBeenCalledTimes(1);
  }));

  it('checks RPC immediately on WebSocket failure for a known built-in node', fakeAsync(() => {
    const app = TestBed.inject(AppComponent);
    const ws = TestBed.inject(WebsocketService);
    app.settings.settings.serverName = 'nanoslo';
    app.settings.settings.serverAPI = 'https://nanoslo.0x.no/proxy';
    app.settings.settings.serverWS = 'wss://nanoslo.0x.no/websocket';
    const check = spyOn(TestBed.inject(ApiService), 'checkNodeAvailability').and.returnValue(Promise.resolve());
    ws.connectionFailure$.next('wss://nanoslo.0x.no/websocket');
    ws.connectionFailure$.next('wss://nanoslo.0x.no/websocket');
    expect(check).toHaveBeenCalledTimes(1);
    tick(0);
    ws.connectionFailure$.next('wss://nanoslo.0x.no/websocket');
    expect(check).toHaveBeenCalledTimes(1); // Cooldown prevents repeated probes.
  }));

  it('ignores stale WS errors, explicit custom RPCs and offline mode', fakeAsync(() => {
    const app = TestBed.inject(AppComponent);
    const ws = TestBed.inject(WebsocketService);
    const check = spyOn(TestBed.inject(ApiService), 'checkNodeAvailability').and.returnValue(Promise.resolve());
    app.settings.settings.serverName = 'nanoslo';
    app.settings.settings.serverAPI = 'https://nanoslo.0x.no/proxy';
    app.settings.settings.serverWS = 'wss://nanoslo.0x.no/websocket';
    ws.connectionFailure$.next('wss://old.example/ws');
    app.settings.settings.serverName = 'custom';
    ws.connectionFailure$.next('wss://nanoslo.0x.no/websocket');
    app.settings.settings.serverName = 'offline';
    ws.connectionFailure$.next('wss://nanoslo.0x.no/websocket');
    expect(check).not.toHaveBeenCalled();
    tick(0);
  }));

  it('silently reconnects WebSocket after automatic failover without a wallet', () => {
    const app = TestBed.inject(AppComponent);
    const configured = spyOn(TestBed.inject(WalletService), 'isConfigured').and.returnValue(false);
    const notice = spyOn(TestBed.inject(NotificationService), 'sendWarning');
    const reconnect = spyOn(TestBed.inject(WebsocketService), 'forceReconnect').and.stub();
    (app as any).handleServerFailover('SpyNano', 'SomeNano');
    expect(notice).not.toHaveBeenCalled();
    expect(reconnect).toHaveBeenCalledTimes(1);

    configured.and.returnValue(true);
    (app as any).handleServerFailover('SpyNano', 'SomeNano');
    expect(notice).toHaveBeenCalledTimes(1);
    expect(reconnect).toHaveBeenCalledTimes(2);
  });

  it('detects native Electron offline/online transitions when browser events are absent', fakeAsync(() => {
    const app = TestBed.inject(AppComponent);
    const native = spyOn(TestBed.inject(DesktopService), 'isNetworkOnline').and.returnValues(
      Promise.resolve(true), Promise.resolve(false), Promise.resolve(false), Promise.resolve(true)
    );
    const offline = spyOn(app, 'onNetworkOffline').and.callThrough();
    const online = spyOn(app, 'onNetworkOnline').and.stub();
    (app as any).pollNativeNetwork(); tick(0);
    expect(offline).not.toHaveBeenCalled();
    expect(online).not.toHaveBeenCalled();
    (app as any).pollNativeNetwork(); tick(0);
    expect(offline).toHaveBeenCalledTimes(1);
    expect(app.nodeService.internetRecoveryPending).toBe(true);
    (app as any).pollNativeNetwork(); tick(0);
    expect(offline).toHaveBeenCalledTimes(1);
    (app as any).pollNativeNetwork(); tick(0);
    expect(online).toHaveBeenCalledTimes(1);
    expect(native).toHaveBeenCalledTimes(4);
  }));

  it('ignores absent native network status in browser/PWA', fakeAsync(() => {
    const app = TestBed.inject(AppComponent);
    spyOn(TestBed.inject(DesktopService), 'isNetworkOnline').and.returnValue(Promise.resolve(null));
    const offline = spyOn(app, 'onNetworkOffline');
    const online = spyOn(app, 'onNetworkOnline');
    (app as any).pollNativeNetwork();
    tick(0);
    expect(offline).not.toHaveBeenCalled();
    expect(online).not.toHaveBeenCalled();
  }));

  it('stops native network monitoring when the component is destroyed', fakeAsync(() => {
    const app = TestBed.inject(AppComponent);
    const check = spyOn(TestBed.inject(DesktopService), 'isNetworkOnline').and.returnValue(Promise.resolve(true));
    (app as any).startNativeNetworkMonitor();
    tick(3000);
    expect(check).toHaveBeenCalledTimes(2);
    app.ngOnDestroy();
    tick(6000);
    expect(check).toHaveBeenCalledTimes(2);
  }));

  it('retains Rainstorm on cable loss and restores its WebSocket without a synthetic RPC probe', fakeAsync(() => {
    const app = TestBed.inject(AppComponent);
    app.settings.settings.serverName = 'rainstorm';
    app.settings.settings.serverAPI = 'https://rainstorm.city/api';
    app.settings.settings.serverWS = 'wss://rainstorm.city/websocket';
    const probe = spyOn(TestBed.inject(ApiService), 'checkNodeAvailability').and.returnValue(Promise.resolve());
    const ws = TestBed.inject(WebsocketService);
    const reconnect = spyOn(ws, 'forceReconnect').and.stub();
    app.onNetworkOffline();
    expect(app.nodeService.internetRecoveryPending).toBe(true);
    ws.connectionFailure$.next('wss://rainstorm.city/websocket');
    expect(probe).not.toHaveBeenCalled();
    // The old socket can still appear connected after unplugging Ethernet.
    // Recovery must force a fresh handshake rather than trusting that flag.
    ws.socket.connected = true;
    app.onNetworkOnline();
    tick(0);
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(probe).not.toHaveBeenCalled();
    ws.socket.connected = true;
    ws.connected$.next();
    tick(0);
    expect(app.settings.settings.serverName).toBe('rainstorm');
    expect(app.nodeService.internetRecoveryPending).toBe(false);
    expect(probe).not.toHaveBeenCalled();
  }));

  it('does not clear Internet outage state when native network is still offline', fakeAsync(() => {
    const app = TestBed.inject(AppComponent);
    app.settings.settings.serverWS = 'wss://rainstorm.city/websocket';
    spyOn(TestBed.inject(DesktopService), 'isNetworkOnline').and.returnValue(Promise.resolve(false));
    app.onNetworkOffline();
    const ws = TestBed.inject(WebsocketService);
    ws.socket.connected = true;
    ws.connected$.next();
    tick(0);
    expect(app.nodeService.internetRecoveryPending).toBe(true);
  }));

  it('does not show the persistent node error during first-run network loss', () => {
    const app = TestBed.inject(AppComponent);
    app.settings.settings.serverAPI = 'https://nanoslo.0x.no/proxy';
    spyOn(TestBed.inject(WalletService), 'isConfigured').and.returnValue(false);
    const sendError = spyOn(TestBed.inject(NotificationService), 'sendError');
    app.onNetworkOffline();
    expect(app.nodeService.node.status).toBe(false);
    expect(sendError).not.toHaveBeenCalled();
  });

  it('does not probe a default RsNano RPC on first start without a wallet and with WS configured', () => {
    const app = TestBed.inject(AppComponent);
    app.settings.settings.serverName = 'twister32-rsnano';
    app.settings.settings.serverAPI = 'https://twister32.changeip.net/proxy';
    app.settings.settings.serverWS = 'wss://twister32.changeip.net/ws';
    spyOn(TestBed.inject(WalletService), 'isConfigured').and.returnValue(false);
    const probe = spyOn(TestBed.inject(ApiService), 'checkNodeAvailability').and.returnValue(Promise.resolve());
    (app as any).probeInitialEmptyWalletRpc();
    expect(probe).not.toHaveBeenCalled();
  });

  it('retains silent startup discovery for an RPC-only node without a wallet', fakeAsync(() => {
    const app = TestBed.inject(AppComponent);
    app.settings.settings.serverAPI = 'https://example.org/proxy';
    app.settings.settings.serverWS = null;
    spyOn(TestBed.inject(WalletService), 'isConfigured').and.returnValue(false);
    const probe = spyOn(TestBed.inject(ApiService), 'checkNodeAvailability').and.returnValue(Promise.resolve());
    (app as any).probeInitialEmptyWalletRpc();
    expect(probe).toHaveBeenCalledOnceWith(true);
    tick(0);
  }));

  it('does not restart RPC discovery on network recovery while an empty-wallet WS is connected', async () => {
    const app = TestBed.inject(AppComponent);
    app.settings.settings.serverAPI = 'https://twister32.changeip.net/proxy';
    app.settings.settings.serverWS = 'wss://twister32.changeip.net/ws';
    app.wallet.accounts = [];
    spyOn(TestBed.inject(WalletService), 'isConfigured').and.returnValue(false);
    const probe = spyOn(TestBed.inject(ApiService), 'checkNodeAvailability');
    const ws = TestBed.inject(WebsocketService);
    ws.socket.connected = true;
    await (app as any).recoverAfterNetworkReturn();
    expect(probe).not.toHaveBeenCalled();
  });

  it('resets the inactivity counter when the user interacts', () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;
    app.inactiveSeconds = 30;
    app.updateIdleTime();
    expect(app.inactiveSeconds).toBe(0);
  });

  it('checks an RPC-only server and clears the offline alert after Wi-Fi returns', fakeAsync(() => {
    const app = TestBed.inject(AppComponent);
    app.settings.settings.serverAPI = 'https://example.test/proxy';
    app.settings.settings.serverWS = null;
    const rpc = spyOn(TestBed.inject(ApiService), 'checkNodeAvailability').and.callFake(async () => {
      app.nodeService.setOnline(); // ApiService does this when a real RPC succeeds.
      return;
    });
    const ws = spyOn(TestBed.inject(WebsocketService), 'forceReconnect').and.stub();

    app.onNetworkOffline();
    expect(app.nodeService.node.status).toBe(false);
    app.onNetworkOnline();
    tick(0);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(app.nodeService.node.status).toBe(true);
    expect(ws).not.toHaveBeenCalled(); // No WebSocket is configured for RPC-only nodes.
  }));

  it('keeps the offline alert on an RPC-only failure and retries after a delay', fakeAsync(() => {
    const app = TestBed.inject(AppComponent);
    app.settings.settings.serverAPI = 'https://example.test/proxy';
    app.settings.settings.serverWS = null;
    let calls = 0;
    const rpc = spyOn(TestBed.inject(ApiService), 'checkNodeAvailability').and.callFake(async () => {
      calls++;
      if (calls === 1) throw new Error('No network');
      app.nodeService.setOnline();
      return;
    });

    app.onNetworkOffline();
    app.onNetworkOnline();
    tick(0);
    expect(app.nodeService.node.status).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
    tick(1000);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(app.nodeService.node.status).toBe(true);
  }));

  it('does not probe wallet RPC in the explicit offline mode', fakeAsync(() => {
    const app = TestBed.inject(AppComponent);
    app.settings.settings.serverAPI = null;
    const rpc = spyOn(TestBed.inject(ApiService), 'checkNodeAvailability').and.stub();
    app.onNetworkOnline();
    tick(0);
    expect(rpc).not.toHaveBeenCalled();
  }));
});
