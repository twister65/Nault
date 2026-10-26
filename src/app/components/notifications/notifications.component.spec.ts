import { ComponentTestModule, isolateConstructorIO } from '../../../testing/component-test.module';
import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { NotificationsComponent } from './notifications.component';
import { NotificationService } from '../../services/notification.service';
import { TranslocoService } from '@jsverse/transloco';
import { Subject } from 'rxjs';

describe('NotificationsComponent', () => {
  let component: NotificationsComponent;
  let fixture: ComponentFixture<NotificationsComponent>;

  beforeEach(waitForAsync(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(NotificationsComponent);
    component = fixture.componentInstance;
    // Constructor smoke test; lifecycle scenarios supply explicit inputs and I/O mocks.
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});


describe('NotificationsComponent offline language loading', () => {
  it('retranslates the persistent price warning when offline language loading finishes', () => {
    const service = new NotificationService();
    const translationsReady$ = new Subject<Record<string, unknown>>();
    let ready = false;
    const french = 'Impossible de récupérer le dernier cours du Nano. Vérifiez votre connexion Internet ou les paramètres de votre bloqueur de publicités, puis actualisez la page pour afficher des montants en monnaie fiduciaire à jour.';
    const i18n = {
      selectTranslation: () => translationsReady$.asObservable(),
      translate: (key: string) => ready && key === 'ui-notifications.nano-price-unavailable' ? french : key
    } as unknown as TranslocoService;
    const notices = new NotificationsComponent(service, i18n);

    notices.ngOnInit();
    try {
      service.sendWarning(
        'There was an issue retrieving latest nano price.  Ensure your AdBlocker is disabled on this page then reload to see accurate FIAT values.',
        { identifier: 'price-adblock', length: 0 }
      );
      expect(notices.notifications[0].message).toBe('ui-notifications.nano-price-unavailable');

      ready = true;
      translationsReady$.next({});
      expect(notices.notifications[0].message).toBe(french);
      expect(notices.notifications[0].identifier).toBe('price-adblock');
    } finally {
      notices.ngOnDestroy();
    }
  });

  it('retranslates existing offline toasts when the French dictionary becomes available', () => {
    const service = new NotificationService();
    const translationsReady$ = new Subject<Record<string, unknown>>();
    let ready = false;
    const translations: Record<string, string> = {
      'ui-notifications.node-offline': 'Impossible de se connecter au nœud Nano. Les soldes affichés peuvent être inexacts !',
      'ui-notifications.refresh-balance-failed': 'Impossible d’actualiser les soldes. Vérifiez votre connexion.'
    };
    const i18n = {
      selectTranslation: () => translationsReady$.asObservable(),
      translate: (key: string) => ready ? (translations[key] || key) : key
    } as unknown as TranslocoService;
    const notices = new NotificationsComponent(service, i18n);

    notices.ngOnInit();
    try {
      service.sendError(
        'Unable to connect to the nano node, your balances may be inaccurate!',
        { identifier: 'node-offline', length: 0 }
      );
      service.sendWarning('Unable to refresh balances. Check your connection.', { length: 0 });
      expect(notices.notifications.map(n => n.message)).toEqual([
        'ui-notifications.node-offline',
        'ui-notifications.refresh-balance-failed'
      ]);

      ready = true;
      translationsReady$.next({});
      expect(notices.notifications.map(n => n.message)).toEqual([
        translations['ui-notifications.node-offline'],
        translations['ui-notifications.refresh-balance-failed']
      ]);
      expect(notices.notifications[0].identifier).toBe('node-offline');
      service.removeNotification('node-offline');
      expect(notices.notifications.length).toBe(1);
    } finally {
      notices.ngOnDestroy();
    }
  });
});
