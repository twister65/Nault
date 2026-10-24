import { Injectable } from '@angular/core';
import * as Rx from 'rxjs';

export type NotificationType = 'info'|'success'|'warning'|'error';
export interface NotificationOptions {
  length?: number;
  identifier?: string;
}
export interface AppNotification {
  type: NotificationType;
  message: string;
  options: NotificationOptions;
}

@Injectable()
export class NotificationService {

  notifications$ = new Rx.BehaviorSubject<AppNotification | null>(null);
  removeNotification$ = new Rx.BehaviorSubject<string | null>(null);

  constructor() { }

  // This provides an entry point for all components to send notifications.
  // It exposes an observable that the actual component uses to grab new notifications

  sendNotification(type: NotificationType, message: string, options: NotificationOptions = {}) {
    this.notifications$.next({ type, message, options });
  }

  removeNotification(identifier: string) {
    this.removeNotification$.next(identifier);
  }

  sendInfo(message: string, options: NotificationOptions = {}) {
    this.sendNotification('info', message, options);
  }
  sendSuccess(message: string, options: NotificationOptions = {}) {
    this.sendNotification('success', message, options);
  }
  sendWarning(message: string, options: NotificationOptions = {}) {
    this.sendNotification('warning', message, options);
  }
  sendError(message: string, options: NotificationOptions = {}) {
    this.sendNotification('error', message, options);
  }

  // Custom notification functions - these are re-used in multiple paces through the app
  sendLedgerChromeWarning() {
    this.sendWarning(
      `<b>Notice:</b> You may experience issues using a Ledger device with Google Chrome. ` +
      `If you do please use Brave/Opera browser or ` +
      `<a href="https://github.com/Nault/Nault/releases" target="_blank" rel="noopener noreferrer">Nault Desktop</a>.`,
      { length: 0, identifier: 'chrome-ledger' }
      );
  }

}
