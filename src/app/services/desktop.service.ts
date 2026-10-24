import { Injectable } from '@angular/core';
import {NotificationService} from './notification.service';

@Injectable()
export class DesktopService {

  private _ipc: NaultDesktopBridge | undefined;

  constructor(private notifications: NotificationService) {
    // The main process provides this allowlisted bridge from the preload.
    // Browsers do not expose it; they continue to run without desktop IPC.
    try {
      if (window.naultDesktop) {
        this._ipc = window.naultDesktop;
        console.log('Desktop IPC bridge loaded');
      }
    } catch (error) {
      // Fail closed if the preload bridge is unavailable or throws.
      this._ipc = undefined;
      console.error('Unable to initialize desktop IPC bridge:', error);
    }
  }

  connect() {
  }

  on(channel: string, listener: Parameters<NaultDesktopBridge['on']>[1]) {
    if (!this._ipc) return false;
    return this._ipc.on(channel, listener);
  }

  send(...args: Parameters<NaultDesktopBridge['send']>) {
    if (!this._ipc) return false;
    return this._ipc.send(...args);
  }

}
