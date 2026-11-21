import { ComponentTestModule, isolateConstructorIO } from '../../../testing/component-test.module';
import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { ReceiveComponent } from './receive.component';

describe('ReceiveComponent', () => {
  let component: ReceiveComponent;
  let fixture: ComponentFixture<ReceiveComponent>;

  beforeEach(waitForAsync(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ReceiveComponent);
    component = fixture.componentInstance;
    // Constructor smoke test; lifecycle scenarios supply explicit inputs and I/O mocks.
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
  it('uses the official Hong Kong Chinese merchant badge when zh-HK is selected', () => {
    const original = component.settings.settings.language;
    try {
      component.settings.settings.language = 'zh-HK';
      expect(component.merchantModeAcceptedBadgeUrl).toBe('https://assets.nano.org/img/badges/blue-zh-hk-var1.svg');
      component.settings.settings.language = 'fr';
      expect(component.merchantModeAcceptedBadgeUrl).toBe('https://assets.nano.org/img/badges/blue-fr-var1.svg');
      component.settings.settings.language = 'en';
      expect(component.merchantModeAcceptedBadgeUrl).toBe('https://assets.nano.org/img/badges/blue-en-var1.svg');
    } finally {
      component.settings.settings.language = original;
    }
  });
});

describe('ReceiveComponent manual receive while locked', () => {
  function setup() {
    // Avoid UI/transport dependencies: exercise the receive action itself.
    const component = Object.create(ReceiveComponent.prototype) as any;
    const reserved = new Set<string>();
    const walletService: any = {
      wallet: {accounts: [{id: 'nano_test'}]},
      successfulBlocks: [],
      isLocked: jasmine.createSpy('isLocked').and.returnValue(true),
      requestWalletUnlock: jasmine.createSpy('requestWalletUnlock'),
      isLedgerWallet: jasmine.createSpy('isLedgerWallet').and.returnValue(false),
      beginManualReceive: jasmine.createSpy('beginManualReceive').and.callFake((id: string) => {
        if (reserved.has(id)) return false;
        reserved.add(id);
        return true;
      }),
      endManualReceive: jasmine.createSpy('endManualReceive').and.callFake((id: string) => reserved.delete(id)),
      removePendingBlock: jasmine.createSpy('removePendingBlock'),
      processPendingBlocks: jasmine.createSpy('processPendingBlocks').and.resolveTo()
    };
    component.walletService = walletService;
    component.nanoBlock = {
      generateReceive: jasmine.createSpy('generateReceive').and.resolveTo('confirmed-hash')
    };
    component.notificationService = {
      removeNotification: jasmine.createSpy('removeNotification'),
      sendError: jasmine.createSpy('sendError'),
      sendSuccess: jasmine.createSpy('sendSuccess')
    };
    component.translocoService = {translate: (key: string) => key};
    component.mobileTransactionMenuModal = {hide: jasmine.createSpy('hide')};
    component.updatePendingBlocks = jasmine.createSpy('updatePendingBlocks').and.resolveTo();
    const block = {destination: 'nano_test', hash: 'source', loading: false, received: false};
    return {component, walletService, block};
  }

  it('locks the action immediately while waiting for unlock, then receives just once', async () => {
    const {component, walletService, block} = setup();
    let finishUnlock!: (unlocked: boolean) => void;
    walletService.requestWalletUnlock.and.returnValue(new Promise<boolean>(resolve => { finishUnlock = resolve; }));

    const firstClick = component.receiveReceivableBlock(block);
    const secondClick = component.receiveReceivableBlock(block);
    expect(block.loading).toBe(true);
    expect(walletService.beginManualReceive).toHaveBeenCalledTimes(1);
    expect(component.nanoBlock.generateReceive).not.toHaveBeenCalled();

    finishUnlock(true);
    await Promise.all([firstClick, secondClick]);
    expect(component.nanoBlock.generateReceive).toHaveBeenCalledTimes(1);
    expect(walletService.removePendingBlock).toHaveBeenCalledOnceWith('source');
    expect(component.notificationService.sendError).not.toHaveBeenCalled();
    expect(walletService.endManualReceive).toHaveBeenCalledOnceWith('nano_test');
    expect(walletService.processPendingBlocks).toHaveBeenCalledTimes(1);
    expect(block.loading).toBe(false);
    expect(block.received).toBe(true);
  });

  it('releases a reservation on cancelled unlock without publishing', async () => {
    const {component, walletService, block} = setup();
    walletService.requestWalletUnlock.and.resolveTo(false);
    await component.receiveReceivableBlock(block);
    expect(component.nanoBlock.generateReceive).not.toHaveBeenCalled();
    expect(component.notificationService.sendError).not.toHaveBeenCalled();
    expect(walletService.endManualReceive).toHaveBeenCalledOnceWith('nano_test');
    expect(walletService.processPendingBlocks).not.toHaveBeenCalled();
    expect(block.loading).toBe(false);
  });

  it('does not republish a source already received automatically during unlock', async () => {
    const {component, walletService, block} = setup();
    walletService.requestWalletUnlock.and.callFake(async () => {
      walletService.successfulBlocks.push('source');
      return true;
    });
    await component.receiveReceivableBlock(block);
    expect(component.nanoBlock.generateReceive).not.toHaveBeenCalled();
    expect(component.notificationService.sendError).not.toHaveBeenCalled();
    expect(walletService.removePendingBlock).toHaveBeenCalledOnceWith('source');
    expect(block.received).toBe(true);
  });

  it('still reports genuine failures and leaves the receive eligible for retry', async () => {
    const {component, walletService, block} = setup();
    walletService.isLocked.and.returnValue(false);
    component.nanoBlock.generateReceive.and.resolveTo(null);
    await component.receiveReceivableBlock(block);
    expect(component.notificationService.sendError).toHaveBeenCalledTimes(1);
    expect(walletService.processPendingBlocks).not.toHaveBeenCalled();
    expect(block.received).toBe(false);
    expect(block.loading).toBe(false);
    expect(walletService.endManualReceive).toHaveBeenCalledTimes(1);
  });
});
