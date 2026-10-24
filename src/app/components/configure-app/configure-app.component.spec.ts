import { ComponentTestModule, isolateConstructorIO } from '../../../testing/component-test.module';
import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { ConfigureAppComponent } from './configure-app.component';

describe('ConfigureAppComponent', () => {
  let component: ConfigureAppComponent;
  let fixture: ComponentFixture<ConfigureAppComponent>;

  beforeEach(waitForAsync(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ConfigureAppComponent);
    component = fixture.componentInstance;
    // Constructor smoke test; lifecycle scenarios supply explicit inputs and I/O mocks.
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

// Behavior coverage is separate from the constructor smoke test above.
describe('ConfigureAppComponent server settings', () => {
  let component: ConfigureAppComponent;
  let settings: any;
  let notifications: any;
  let websocket: any;
  let wallet: any;
  beforeEach(() => {
    component = Object.create(ConfigureAppComponent.prototype);
    settings = {
      settings: { serverAPI: 'https://saved.example/rpc' },
      setAppSettings: jasmine.createSpy(), loadAppSettings: jasmine.createSpy()
    };
    notifications = { sendWarning: jasmine.createSpy(), sendSuccess: jasmine.createSpy() };
    websocket = { forceReconnect: jasmine.createSpy() };
    wallet = { reloadBalances: jasmine.createSpy().and.returnValue(Promise.resolve()) };
    Object.assign(component, {
      selectedServer: 'custom', serverAPI: 'https://new.example/rpc', serverWS: 'wss://new.example/ws',
      appSettings: settings, notifications, websocket, walletService: wallet,
      translocoService: { translate: (key: string) => key }, node: { node: {} }, statsRequest: 0
    });
    spyOn(component, 'updateNodeStats').and.returnValue(Promise.resolve());
  });
  it('rejects plaintext without changing the saved server or restarting the socket', async () => {
    component.serverAPI = 'http://example.invalid';
    await component.updateServerSettings();
    expect(notifications.sendWarning).toHaveBeenCalled();
    expect(settings.setAppSettings).not.toHaveBeenCalled();
    expect(websocket.forceReconnect).not.toHaveBeenCalled();
  });
  it('reconnects immediately even while the balance refresh is pending', async () => {
    let resolve!: () => void;
    wallet.reloadBalances.and.returnValue(new Promise<void>(r => resolve = r));
    const saving = component.updateServerSettings();
    expect(websocket.forceReconnect).toHaveBeenCalledTimes(1);
    resolve();
    await saving;
    expect(websocket.forceReconnect).toHaveBeenCalledTimes(1);
  });
  it('handles a failed refresh without retaining old statistics', async () => {
    component.nodeVendor = 'old server';
    wallet.reloadBalances.and.returnValue(Promise.reject(new Error('offline')));
    await component.updateServerSettings();
    expect(component.nodeVendor).toBeNull();
    expect(notifications.sendWarning).toHaveBeenCalled();
    expect(websocket.forceReconnect).toHaveBeenCalled();
  });
});
