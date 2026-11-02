import { TestBed, fakeAsync, tick, waitForAsync } from '@angular/core/testing';
import { Renderer2 } from '@angular/core';
import { ApiService } from './services/api.service';
import { WebsocketService } from './services/websocket.service';
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

  it('does not show the persistent node error during first-run network loss', () => {
    const app = TestBed.inject(AppComponent);
    app.settings.settings.serverAPI = 'https://nanoslo.0x.no/proxy';
    spyOn(TestBed.inject(WalletService), 'isConfigured').and.returnValue(false);
    const sendError = spyOn(TestBed.inject(NotificationService), 'sendError');
    app.onNetworkOffline();
    expect(app.nodeService.node.status).toBe(false);
    expect(sendError).not.toHaveBeenCalled();
  });

  it('resets the inactivity counter when the user interacts', () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;
    app.inactiveSeconds = 30;
    app.updateIdleTime();
    expect(app.inactiveSeconds).toBe(0);
  });

  it('checks wallet RPC and clears the offline alert after Wi-Fi returns', fakeAsync(() => {
    const app = TestBed.inject(AppComponent);
    app.settings.settings.serverAPI = 'https://example.test/proxy';
    app.settings.settings.serverWS = 'wss://example.test/ws';
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
    expect(ws).toHaveBeenCalledTimes(1);
  }));

  it('keeps the offline alert on an RPC failure and retries after a delay', fakeAsync(() => {
    const app = TestBed.inject(AppComponent);
    app.settings.settings.serverAPI = 'https://example.test/proxy';
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
