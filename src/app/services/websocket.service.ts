import { secureEndpoint } from './endpoint-policy';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import {AppSettingsService} from './app-settings.service';

@Injectable()
export class WebsocketService {

  queuedCommands = [];

  keepaliveTimeout = 60 * 1000;
  pongTimeout = 15 * 1000;
  reconnectTimeout = 5 * 1000;

  keepaliveSet = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout>;
  private connectionTimer: ReturnType<typeof setTimeout>;
  private pongTimer: ReturnType<typeof setTimeout>;
  private keepaliveTimer: ReturnType<typeof setTimeout>;
  // A finite budget per explicit connection cycle, including short-lived opens.
  private readonly maxReconnectAttempts = 5;

  socket = {
    connected: false,
    ws: null,
  };

  subscribedAccounts = [];

  newTransactions$ = new BehaviorSubject(null);
  // A new connection does not replay confirmations missed while offline.
  readonly connected$ = new Subject<void>();

  constructor(private appSettings: AppSettingsService) { }

  forceReconnect() {
    console.info('WebSocket reconnect requested. Retry budget reset.');
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.connectionTimer);
    clearTimeout(this.keepaliveTimer);
    clearTimeout(this.pongTimer);
    this.keepaliveSet = false;
    if (this.socket.ws) {
      this.socket.ws.onclose = null;
      this.socket.ws.onopen = null;
      this.socket.ws.onmessage = null;
      this.socket.ws.onerror = null;
      this.socket.ws.close();
    }
    this.socket.ws = null;
    this.socket.connected = false;
    this.reconnectAttempts = 0;
    this.reconnectTimeout = 5000;
    this.reconnectTimer = setTimeout(() => this.connect(), 250);
  }

  connect() {
    if (this.socket.ws) return;
    if (!this.appSettings.settings.serverWS) {
      console.info('WebSocket disabled: no server configured.');
      return;
    }
    let wsUrl: string;
    try { wsUrl = secureEndpoint(this.appSettings.settings.serverWS, 'ws'); } catch (_) {
      console.warn('WebSocket blocked: use WSS (WS is allowed only on loopback).');
      return;
    }
    console.info('WebSocket connecting.');
    const ws = new WebSocket(wsUrl);
    this.socket.ws = ws;
    this.connectionTimer = setTimeout(() => {
      if (this.socket.ws === ws && !this.socket.connected) this.disconnect(ws);
    }, 15000);

    ws.onopen = event => {
      if (this.socket.ws !== ws) return;
      clearTimeout(this.connectionTimer);
      this.socket.connected = true;
      console.info('WebSocket connected. Restoring account subscriptions.');
      // The current account list is authoritative, including offline unsubscribes.
      this.queuedCommands = [];
      if (this.subscribedAccounts.length) {
        this.subscribeAccounts([...this.subscribedAccounts]);
      }
      // Notify the wallet to reconcile balances and pending blocks via RPC.
      this.connected$.next();

      if (!this.keepaliveSet) {
        this.keepalive(); // Start keepalives!
      }
    };
    ws.onerror = event => {
      console.warn('WebSocket connection error.');
    };
    ws.onclose = () => this.disconnect(ws);
    ws.onmessage = event => {
      if (this.socket.ws !== ws) return;
      try {
        const newEvent = JSON.parse(event.data);
        console.log('WS', newEvent);

        if (newEvent.ack === 'pong') clearTimeout(this.pongTimer);

        if (newEvent.topic === 'confirmation') {
          this.newTransactions$.next(newEvent.message);
        }
      } catch (err) {
        console.log(`Error parsing message`, err);
      }
    };
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    this.reconnectAttempts++;
    this.connect();
    if (this.reconnectTimeout < 30 * 1000) {
      this.reconnectTimeout += 5 * 1000; // Slowly increase the timeout up to 30 seconds
    }
  }

  private disconnect(ws: WebSocket) {
    if (this.socket.ws !== ws) return;
    clearTimeout(this.connectionTimer);
    clearTimeout(this.keepaliveTimer);
    clearTimeout(this.pongTimer);
    this.keepaliveSet = false;
    this.socket.connected = false;
    this.socket.ws = null;
    ws.onclose = ws.onopen = ws.onmessage = ws.onerror = null;
    // Do not wait for the TCP close handshake on a disconnected network.
    ws.close();
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectTimer = setTimeout(() => this.attemptReconnect(), this.reconnectTimeout);
    } else {
      console.warn('WebSocket retry limit reached. Save server settings to reconnect.');
    }
  }

  keepalive() {
    const ws = this.socket.ws;
    if (!ws || !this.socket.connected) return;
    this.keepaliveSet = true;
    this.pongTimer = setTimeout(() => {
      console.warn('WebSocket pong timeout. Reconnecting.');
      this.disconnect(ws);
    }, this.pongTimeout);
    try {
      ws.send(JSON.stringify({ action: 'ping' }));
    } catch (_) {
      this.disconnect(ws);
      return;
    }
    this.keepaliveTimer = setTimeout(() => this.keepalive(), this.keepaliveTimeout);
  }

  subscribeAccounts(accountIDs: string[]) {
    const event = {
      action: 'subscribe',
      topic: 'confirmation',
      options: {
        accounts: accountIDs
      }
    };

    accountIDs.forEach(account => {
      if (this.subscribedAccounts.indexOf(account) === -1) {
        this.subscribedAccounts.push(account); // Keep a unique list of subscriptions for reconnecting
      }
    });
    if (!this.socket.connected) {
      this.queuedCommands.push(event);
      if (this.queuedCommands.length >= 3) {
        this.queuedCommands.shift(); // Prune queued commands
      }
      return;
    }
    this.socket.ws.send(JSON.stringify(event));
  }

  unsubscribeAccounts(accountIDs: string[]) {
    const event = {
      action: 'unsubscribe',
      topic: 'confirmation',
      options: {
        accounts: accountIDs
      }
    };

    accountIDs.forEach(account => {
      const existingIndex = this.subscribedAccounts.indexOf(account);
      if (existingIndex !== -1) {
        this.subscribedAccounts.splice(existingIndex, 1); // Remove from our internal subscription list
      }
    });
    // If we aren't connected, we don't need to do anything.  On reconnect, it won't subscribe.
    if (this.socket.connected) {
      this.socket.ws.send(JSON.stringify(event));
    }
  }

}
