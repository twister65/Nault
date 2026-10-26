import { Component, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Subscription } from 'rxjs';
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
export class NotificationsComponent implements OnInit, OnDestroy {

  notificationLength = 5000;

  notifications: Array<{
    type: NotificationType;
    message: string;
    source: string;
    cssClass: string;
    identifier: string | null;
    length: number;
  }> = [];
  private readonly subscriptions = new Subscription();

  constructor(private notificationService: NotificationService, private translocoService: TranslocoService) { }

  ngOnInit() {
    // Offline startup can emit an RPC error before the lazy language chunk resolves.
    // Retranslate visible notices once Transloco has actually loaded the language.
    this.subscriptions.add(this.translocoService.selectTranslation().subscribe(() => {
      for (const notification of this.notifications) {
        notification.message = localizeNotificationMessage(
          notification.source, (key, params) => this.translocoService.translate(key, params)
        );
      }
    }));
    this.subscriptions.add(this.notificationService.notifications$.subscribe(notification => {
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
        source: notification.message,
        cssClass: this.getCssClass(notification.type),
        identifier: identifier,
        length: length,
      };

      this.notifications.push(newNotification);
      if (length) {
        setTimeout(() => this.removeNotification(newNotification), length);
      }
    }));

    this.subscriptions.add(this.notificationService.removeNotification$.subscribe(identifier => {
      if (!identifier) {
        return;
      }

      const existingNotification = this.notifications.find(n => n.identifier === identifier);
      if (existingNotification) {
        this.removeNotification(existingNotification);
      }
    }));
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
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
