import { fakeAsync, tick } from '@angular/core/testing';
import { WebsocketService } from './websocket.service';

describe('WebSocket bounded connections', () => {
  let sockets: any[];
  let settings: any;
  let service: WebsocketService;
  beforeEach(() => {
    sockets = [];
    spyOn(window, 'WebSocket').and.callFake(function () {
      const socket: any = { send: jasmine.createSpy(), close: () => { if (socket.onclose) socket.onclose({}); } };
      sockets.push(socket);
      return socket;
    });
    settings = { settings: { serverWS: 'wss://example.org' } };
    service = new WebsocketService(settings);
  });
  it('blocks insecure saved endpoints', () => {
    settings.settings.serverWS = 'ws://192.0.2.10:7078';
    service.connect();
    expect(sockets.length).toBe(0);
  });
  it('stops after five reconnects, including connection timeouts', fakeAsync(() => {
    service.connect();
    tick(300000);
    expect(sockets.length).toBe(6);
    expect(service.socket.connected).toBe(false);
    tick(300000);
    expect(sockets.length).toBe(6);
  }));
  it('does not create duplicate pending connections and cancels old retries when settings change', fakeAsync(() => {
    service.connect();
    service.connect();
    expect(sockets.length).toBe(1);
    sockets[0].onclose({});
    service.forceReconnect();
    tick(250);
    expect(sockets.length).toBe(2);
    tick(5000);
    expect(sockets.length).toBe(2);
    settings.settings.serverWS = null;
    service.forceReconnect();
    tick(250);
  }));
  it('detects a silent socket without waiting for its close event and restores subscriptions', fakeAsync(() => {
    const onConnected = jasmine.createSpy('onConnected');
    service.connected$.subscribe(onConnected);
    service.subscribeAccounts(['nano_test']);
    service.connect();
    const old = sockets[0];
    old.close = jasmine.createSpy('close'); // A cable cut may never deliver onclose.
    old.onopen({});
    tick(15000);
    expect(service.socket.connected).toBe(false);
    expect(old.close).toHaveBeenCalled();
    tick(5000);
    const fresh = sockets[1];
    fresh.onopen({});
    expect(onConnected).toHaveBeenCalledTimes(2); // Initial open and recovery.
    expect(fresh.send).toHaveBeenCalledWith(JSON.stringify({
      action: 'subscribe', topic: 'confirmation', options: { accounts: ['nano_test'] }
    }));
    fresh.onmessage({ data: JSON.stringify({ ack: 'pong' }) });
    fresh.onmessage({ data: JSON.stringify({ topic: 'confirmation', message: { hash: 'new' } }) });
    expect(service.newTransactions$.value).toEqual({ hash: 'new' });
    tick(15000);
    expect(service.socket.connected).toBe(true);
    settings.settings.serverWS = null;
    service.forceReconnect();
    tick(250);
  }));
  it('bounds silent open connections to five retries', fakeAsync(() => {
    service.connect();
    for (let i = 0; i < 6; i++) {
      sockets[i].onopen({});
      tick(15000);
      if (i < 5) tick((i + 1) * 5000);
    }
    tick(300000);
    expect(sockets.length).toBe(6);
  }));

});
