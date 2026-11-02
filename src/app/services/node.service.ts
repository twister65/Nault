import { Injectable } from '@angular/core';
import {NotificationService} from './notification.service';

@Injectable()
export class NodeService {

  node: {status: boolean | null} = {
    status: null, // null - loading, false - offline, true - online
  };

  constructor(private notifications: NotificationService) { }

  // Background connectivity discovery before wallet setup should update
  // status without frightening a first-time user with persistent alerts.
  // A real wallet operation still uses the standard visible error.
  setOffline(msg: string | null = `Unable to connect to the nano node, your balances may be inaccurate!`) {
    if (msg === null) {
      this.node.status = false;
      this.notifications.removeNotification('node-offline');
      return;
    }
    if (this.node.status === false) return; // Already offline
    this.node.status = false;

    this.notifications.sendError(msg, { identifier: 'node-offline', length: 0 });
  }

  setOnline() {
    if (this.node.status) return; // Already online

    this.node.status = true;
    this.notifications.removeNotification('node-offline');
  }

  setLoading() {
    this.node.status = null;
  }

}
