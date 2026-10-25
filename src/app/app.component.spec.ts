import { TestBed, fakeAsync, tick, waitForAsync } from '@angular/core/testing';
import { Renderer2 } from '@angular/core';
import { ApiService } from './services/api.service';
import { WebsocketService } from './services/websocket.service';
import { AppComponent } from './app.component';
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
  it('resets the inactivity counter when the user interacts', () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;
    app.inactiveSeconds = 30;
    app.updateIdleTime();
    expect(app.inactiveSeconds).toBe(0);
  });

  it('rechecks RPC and clears the offline alert after Wi-Fi returns', fakeAsync(() => {
    const app = TestBed.inject(AppComponent);
    app.settings.settings.serverAPI = 'https://example.test/proxy';
    app.settings.settings.serverWS = 'wss://example.test/ws';
    const rpc = spyOn(TestBed.inject(ApiService), 'blockCount').and.callFake(async () => {
      app.nodeService.setOnline(); // ApiService does this when a real RPC succeeds.
      return { count: 1, unchecked: 0, cemented: 1 };
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
    const rpc = spyOn(TestBed.inject(ApiService), 'blockCount').and.callFake(async () => {
      calls++;
      if (calls === 1) throw new Error('No network');
      app.nodeService.setOnline();
      return { count: 1, unchecked: 0, cemented: 1 };
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

  it('does not probe RPC in the explicit offline mode', fakeAsync(() => {
    const app = TestBed.inject(AppComponent);
    app.settings.settings.serverAPI = null;
    const rpc = spyOn(TestBed.inject(ApiService), 'blockCount').and.stub();
    app.onNetworkOnline();
    tick(0);
    expect(rpc).not.toHaveBeenCalled();
  }));
});
