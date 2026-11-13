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

  it('shows simple account view by default and allows explicit return from Add / Hide', () => {
    expect(component.viewAdvanced).toBeFalse();
    component.toggleAccountManagementMode();
    expect(component.viewAdvanced).toBeTrue();
    component.newAccountIndex = '9' as any;
    component.toggleAccountManagementMode();
    expect(component.viewAdvanced).toBeFalse();
    expect(component.newAccountIndex).toBeNull();
    component.toggleAccountManagementMode();
    expect(component.viewAdvanced).toBeTrue();
    expect(component.newAccountIndex).toBeNull();
  });

  it('does not change pending receivables when switching the account display mode', () => {
    const wallet = (component as any).walletService.wallet;
    const pendingRef = wallet.pendingBlocks;
    const wasLocked = wallet.locked;
    component.toggleAccountManagementMode();
    component.toggleAccountManagementMode();
    expect(wallet.pendingBlocks).toBe(pendingRef);
    expect(wallet.locked).toBe(wasLocked);
  });
});
