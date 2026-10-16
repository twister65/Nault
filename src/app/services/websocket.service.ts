import { secureEndpoint } from './endpoint-policy';
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {AppSettingsService} from './app-settings.service';

@Injectable()
export class WebsocketService {

  queuedCommands = [];

  keepaliveTimeout = 60 * 1000;
  reconnectTimeout = 5 * 1000;

  keepaliveSet = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout>;
  private connectionTimer: ReturnType<typeof setTimeout>;
  private keepaliveTimer: ReturnType<typeof setTimeout>;
  // A finite budget per explicit connection cycle, including short-lived opens.
  private readonly maxReconnectAttempts = 5;

  socket = {
    connected: false,
    ws: null,
  };

  subscribedAccounts = [];

  newTransactions$ = new BehaviorSubject(null);

  constructor(private appSettings: AppSettingsService) { }

  forceReconnect() {
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.connectionTimer);
    clearTimeout(this.keepaliveTimer);
    this.keepaliveSet = false;
    if (this.socket.ws) {
      this.socket.ws.onclose = null;
      this.socket.ws.onopen = null;
      this.socket.ws.onmessage = null;
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
    if (!this.appSettings.settings.serverWS) return;
    let wsUrl: string;
    try { wsUrl = secureEndpoint(this.appSettings.settings.serverWS, 'ws'); } catch (_) {
      console.warn('WebSocket blocked: use WSS (WS is allowed only on loopback).');
      return;
    }
    const ws = new WebSocket(wsUrl);
    this.socket.ws = ws;
    this.connectionTimer = setTimeout(() => {
      if (this.socket.ws === ws && !this.socket.connected) ws.close();
    }, 15000);

    ws.onopen = event => {
      if (this.socket.ws !== ws) return;
      clearTimeout(this.connectionTimer);
      this.socket.connected = true;
      this.queuedCommands.forEach(queueevent => ws.send(JSON.stringify(queueevent)));

      this.queuedCommands = [];

      // Resubscribe to accounts?
      if (this.subscribedAccounts.length) {
        this.subscribeAccounts(this.subscribedAccounts);
      }

      if (!this.keepaliveSet) {
        this.keepalive(); // Start keepalives!
      }
    };
    ws.onerror = event => {
      console.warn('WebSocket connection error.');
    };
    ws.onclose = event => {
      if (this.socket.ws !== ws) return;
      clearTimeout(this.connectionTimer);
      clearTimeout(this.keepaliveTimer);
      this.keepaliveSet = false;
      this.socket.connected = false;
      this.socket.ws = null;
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectTimer = setTimeout(() => this.attemptReconnect(), this.reconnectTimeout);
      } else {
        console.warn('WebSocket retry limit reached. Save server settings to reconnect.');
      }
    };
    ws.onmessage = event => {
      if (this.socket.ws !== ws) return;
      try {
        const newEvent = JSON.parse(event.data);
        console.log('WS', newEvent);

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

  keepalive() {
    this.keepaliveSet = true;
    if (this.socket.connected) {
      this.socket.ws.send(JSON.stringify({ action: 'ping' }));
    }

    this.keepaliveTimer = setTimeout(() => {
      this.keepalive();
    }, this.keepaliveTimeout);
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
