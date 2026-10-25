import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import {NotificationService, NotificationType} from '../../services/notification.service';
import { TranslocoService } from '@jsverse/transloco';
import { localizeNotificationMessage } from '../../services/notification-message';

@Component({
    selector: 'app-notifications',
    templateUrl: './notifications.component.html',
    styleUrls: ['./notifications.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class NotificationsComponent implements OnInit {

  notificationLength = 5000;

  notifications: Array<{
    type: NotificationType;
    message: string;
    cssClass: string;
    identifier: string | null;
    length: number;
  }> = [];
  constructor(private notificationService: NotificationService, private translocoService: TranslocoService) { }

  ngOnInit() {
    this.notificationService.notifications$.subscribe(notification => {
      if (!notification) {
        return; // Default value
      }

      // Check the options
      const length = notification.options.length ?? this.notificationLength;
      const identifier = notification.options.identifier || null;

      // Stop duplicates
      if (identifier) {
        const existingNotification = this.notifications.find(n => n.identifier === identifier);
        if (existingNotification) {
          return;
        }
      }

      const newNotification = {
        type: notification.type,
        message: localizeNotificationMessage(notification.message, (key, params) => this.translocoService.translate(key, params)),
        cssClass: this.getCssClass(notification.type),
        identifier: identifier,
        length: length,
      };

      this.notifications.push(newNotification);
      if (length) {
        setTimeout(() => this.removeNotification(newNotification), length);
      }
    });

    this.notificationService.removeNotification$.subscribe(identifier => {
      if (!identifier) {
        return;
      }

      const existingNotification = this.notifications.find(n => n.identifier === identifier);
      if (existingNotification) {
        this.removeNotification(existingNotification);
      }
    });
  }

  private removeNotification(notification: (typeof this.notifications)[number]): void {
    const existingNotification = this.notifications.findIndex(n => n === notification);
    if (existingNotification !== -1) {
      this.notifications.splice(existingNotification, 1);
    }
  }

  private getCssClass(type: NotificationType): string {
    switch (type) {
      default:
      case 'info': return 'uk-alert-primary';
      case 'success': return 'uk-alert-success';
      case 'warning': return 'uk-alert-warning';
      case 'error': return 'uk-alert-danger';
    }
  }

}
