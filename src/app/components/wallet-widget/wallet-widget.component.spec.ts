import { ComponentTestModule, isolateConstructorIO } from '../../../testing/component-test.module';
import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { WalletWidgetComponent } from './wallet-widget.component';

describe('WalletWidgetComponent', () => {
  let component: WalletWidgetComponent;
  let fixture: ComponentFixture<WalletWidgetComponent>;

  beforeEach(waitForAsync(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(WalletWidgetComponent);
    component = fixture.componentInstance;
    // Constructor smoke test; lifecycle scenarios supply explicit inputs and I/O mocks.
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
  it('never shows Ledger ready after the shared device status was reset without an event', () => {
    const ledger = component.ledgerService.ledger;
    const initialStatus = ledger.status;
    try {
      ledger.status = 'ready';
      (component as any).lastReportedLedgerStatus = {
        status: 'ready', statusText: 'Nano Ledger application connected'
      };
      expect(component.ledgerStatus.status).toBe('ready');

      // Configuring another wallet changes the service before the status event.
      ledger.status = 'not-connected';
      expect(component.ledgerStatus.status).toBe('not-connected');
      expect(component.ledgerStatus.statusText).toBe('');
    } finally {
      ledger.status = initialStatus;
    }
  });

  it('uses the authoritative ready status even when the previous event was disconnected', () => {
    const ledger = component.ledgerService.ledger;
    const initialStatus = ledger.status;
    try {
      (component as any).lastReportedLedgerStatus = {
        status: 'not-connected', statusText: 'Ledger disconnected'
      };
      ledger.status = 'ready';
      expect(component.ledgerStatus.status).toBe('ready');
      expect(component.ledgerStatus.statusText).toBe('');
    } finally {
      ledger.status = initialStatus;
    }
  });

  it('shows the USB reconnect label in a ChromeOS PWA with a Nano S Plus', () => {
    component.ledgerService.isDesktop = false;
    component.ledgerService.transportMode = 'USB';
    expect(component.reconnectTransportTranslationKey).toBe('ui-ledger.reconnect-via-usb');
  });

  it('also shows USB for a WebHID fallback', () => {
    component.ledgerService.isDesktop = false;
    component.ledgerService.transportMode = 'HID';
    expect(component.reconnectTransportTranslationKey).toBe('ui-ledger.reconnect-via-usb');
  });

  it('keeps the Bluetooth label for a Nano X using Web Bluetooth', () => {
    component.ledgerService.isDesktop = false;
    component.ledgerService.transportMode = 'Bluetooth';
    expect(component.reconnectTransportTranslationKey).toBe('ui-ledger.reconnect-via-bluetooth');
  });

  it('reconnects with the selected USB transport even if the link was previously mislabeled', async () => {
    component.ledgerService.isDesktop = false;
    component.ledgerService.transportMode = 'USB';
    const loadLedger = spyOn(component.ledgerService, 'loadLedger').and.resolveTo(true);
    spyOn(component['notificationService'], 'sendInfo');
    spyOn(component['notificationService'], 'removeNotification');

    await component.reloadLedger();

    expect(loadLedger).toHaveBeenCalledWith(false, false);
    expect(component.ledgerService.transportMode).toBe('USB');
  });
});
