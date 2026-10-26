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
