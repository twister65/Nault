import { fakeAsync, tick } from '@angular/core/testing';
import { WebsocketService } from './websocket.service';

describe('WebSocket bounded connections', () => {
  let sockets: any[];
  let settings: any;
  let service: WebsocketService;
  beforeEach(() => {
    sockets = [];
    spyOn(window, 'WebSocket').and.callFake(() => {
      const socket: any = { send: jasmine.createSpy(), close: () => { if (socket.onclose) socket.onclose({}); } };
      sockets.push(socket);
      return socket;
    });
    settings = { settings: { serverWS: 'wss://example.org' } };
    service = new WebsocketService(settings);
  });
  it('blocks insecure saved endpoints', () => {
    settings.settings.serverWS = 'ws://192.168.1.16:7078';
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
});
