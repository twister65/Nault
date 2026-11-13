import { ComponentTestModule, isolateConstructorIO } from '../../../testing/component-test.module';
import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { AccountsComponent } from './accounts.component';
import { WalletOverviewRefreshService } from '../../services/wallet-overview-refresh.service';

describe('AccountsComponent', () => {
  let component: AccountsComponent;
  let fixture: ComponentFixture<AccountsComponent>;

  beforeEach(waitForAsync(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(AccountsComponent);
    component = fixture.componentInstance;
    // Constructor smoke test; lifecycle scenarios supply explicit inputs and I/O mocks.
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('pulls down to refresh accounts at the top of scroll', () => {
    const refresh = spyOn(TestBed.inject(WalletOverviewRefreshService), 'refresh')
      .and.returnValue(Promise.resolve());
    const scroll = { scrollTop: 0 };
    const target = { closest: () => scroll };
    component.onAccountsTouchStart({ touches: [{ clientX: 75, clientY: 40 }], currentTarget: target } as any);
    component.onAccountsTouchEnd({ changedTouches: [{ clientX: 78, clientY: 150 }], currentTarget: target } as any);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('ignores horizontal gestures and downward pulls below the scroll top', () => {
    const refresh = spyOn(TestBed.inject(WalletOverviewRefreshService), 'refresh')
      .and.returnValue(Promise.resolve());
    const scroll = { scrollTop: 0 };
    const target = { closest: () => scroll };
    component.onAccountsTouchStart({ touches: [{ clientX: 175, clientY: 40 }], currentTarget: target } as any);
    component.onAccountsTouchEnd({ changedTouches: [{ clientX: 30, clientY: 100 }], currentTarget: target } as any);
    scroll.scrollTop = 200;
    component.onAccountsTouchStart({ touches: [{ clientX: 75, clientY: 40 }], currentTarget: target } as any);
    component.onAccountsTouchEnd({ changedTouches: [{ clientX: 78, clientY: 150 }], currentTarget: target } as any);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('AccountsComponent account-management mode', () => {
  let component: AccountsComponent;

  beforeEach(waitForAsync(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule]
    }).compileComponents();
  }));

  beforeEach(() => {
    component = TestBed.createComponent(AccountsComponent).componentInstance;
  });

  it('enters Add / Hide and validates back to normal display after an RPC reconciliation', async () => {
    const walletService = (component as any).walletService;
    const active = spyOn(walletService, 'setAccountManagementMode');
    spyOn(walletService, 'isConfigured').and.returnValue(true);
    const reload = spyOn(walletService, 'reloadBalances').and.resolveTo();
    const notify = spyOn(walletService, 'notifyPendingAfterAccountManagement');
    expect(component.viewAdvanced).toBeFalse();
    await component.toggleAccountManagementMode();
    expect(component.viewAdvanced).toBeTrue();
    expect(active).toHaveBeenCalledWith(true);
    expect(reload).not.toHaveBeenCalled();
    component.newAccountIndex = '9' as any;
    await component.toggleAccountManagementMode();
    expect(component.viewAdvanced).toBeFalse();
    expect(component.newAccountIndex).toBeNull();
    expect(active).toHaveBeenCalledWith(false);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(component.confirmingAccountManagement).toBeFalse();
  });

  it('keeps the displayed pending balance untouched and suppresses a false notice when RPC fails', async () => {
    const walletService = (component as any).walletService;
    const wallet = walletService.wallet;
    const pendingRef = wallet.pendingBlocks;
    const wasLocked = wallet.locked;
    spyOn(walletService, 'setAccountManagementMode');
    spyOn(walletService, 'isConfigured').and.returnValue(true);
    spyOn(walletService, 'reloadBalances').and.rejectWith(new Error('RPC offline'));
    const notify = spyOn(walletService, 'notifyPendingAfterAccountManagement');
    const warn = spyOn((component as any).notificationService, 'sendWarning');
    await component.toggleAccountManagementMode();
    await component.toggleAccountManagementMode();
    expect(component.viewAdvanced).toBeFalse();
    expect(wallet.pendingBlocks).toBe(pendingRef);
    expect(wallet.locked).toBe(wasLocked);
    expect(notify).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('does not trigger a second RPC check while Validate is still refreshing', async () => {
    const walletService = (component as any).walletService;
    spyOn(walletService, 'setAccountManagementMode');
    spyOn(walletService, 'isConfigured').and.returnValue(true);
    let done: () => void = () => {};
    const reload = spyOn(walletService, 'reloadBalances').and.returnValue(
      new Promise<void>(resolve => { done = resolve; })
    );
    spyOn(walletService, 'notifyPendingAfterAccountManagement');
    await component.toggleAccountManagementMode();
    const finishing = component.toggleAccountManagementMode();
    expect(component.confirmingAccountManagement).toBeTrue();
    await component.toggleAccountManagementMode();
    expect(reload).toHaveBeenCalledTimes(1);
    done();
    await finishing;
    expect(component.confirmingAccountManagement).toBeFalse();
  });
});
