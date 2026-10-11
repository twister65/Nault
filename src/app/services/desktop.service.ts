import { Injectable } from '@angular/core';
import {NotificationService} from './notification.service';

@Injectable()
export class DesktopService {

  private _ipc: NaultDesktopBridge | undefined;

  constructor(private notifications: NotificationService) {
    // The main process provides this allowlisted bridge from the preload.
    // Browsers do not expose it; they continue to run without desktop IPC.
    if (window.naultDesktop) {
      this._ipc = window.naultDesktop;
      console.log('Desktop IPC bridge loaded');
    }
  }

  connect() {
  }

  on(channel: string, listener) {
    if (!this._ipc) return false;
    this._ipc.on(channel, listener);
    return true;
  }

  send(channel: string, ...args) {
    if (!this._ipc) return false;
    this._ipc.send(channel, ...args);
    return true;
  }

}
