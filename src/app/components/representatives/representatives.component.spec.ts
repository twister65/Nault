import { ComponentTestModule, isolateConstructorIO } from '../../../testing/component-test.module';
import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { RepresentativesComponent } from './representatives.component';

describe('RepresentativesComponent', () => {
  let component: RepresentativesComponent;
  let fixture: ComponentFixture<RepresentativesComponent>;

  beforeEach(waitForAsync(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(RepresentativesComponent);
    component = fixture.componentInstance;
    // Constructor smoke test; lifecycle scenarios supply explicit inputs and I/O mocks.
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

describe('Representative change transaction outcome', () => {
  function setup(result: string | null | undefined) {
    // Test RPC acceptance/failure without any physical Ledger or transactions.
    const component = Object.create(RepresentativesComponent.prototype) as any;
    component.selectedAccounts = [{ id: 'nano_account' }];
    component.toRepresentativeID = 'nano_target';
    component.fullAccounts = [{ id: 'nano_account', representative: 'nano_previous' }];
    component.changingRepresentatives = false;
    component.hideOverview = false;
    component.loadingRepresentatives = false;
    component.walletService = {
      isLocked: () => false,
      isLedgerWallet: () => true,
      getWalletAccount: () => ({ id: 'nano_account', index: 0 }),
      wallet: { accounts: [{ id: 'nano_account' }] }
    };
    component.util = { account: { isValidAccount: () => true } };
    component.nanoBlock = { generateChange: jasmine.createSpy('generateChange').and.resolveTo(result) };
    component.notifications = {
      sendSuccess: jasmine.createSpy('sendSuccess'),
      sendWarning: jasmine.createSpy('sendWarning'),
      sendError: jasmine.createSpy('sendError'),
      sendInfo: jasmine.createSpy('sendInfo')
    };
    component.translocoService = { translate: (key: string) => key };
    component.representativeService = {
      getRepresentativesOverview: jasmine.createSpy('getRepresentativesOverview').and.resolveTo([]),
      detectChangeableReps: jasmine.createSpy('detectChangeableReps').and.resolveTo([]),
      saveRepresentative: jasmine.createSpy('saveRepresentative')
    };
    return component;
  }

  it('does not show success when the disconnected Ledger returns no block hash', async () => {
    const component = setup(undefined);
    await component.changeRepresentatives();
    expect(component.notifications.sendSuccess).not.toHaveBeenCalled();
    expect(component.notifications.sendError).toHaveBeenCalled();
    expect(component.selectedAccounts).toEqual([{ id: 'nano_account' }]);
    expect(component.toRepresentativeID).toBe('nano_target');
    expect(component.representativeService.getRepresentativesOverview).not.toHaveBeenCalled();
    expect(component.changingRepresentatives).toBeFalse();
  });

  it('does not show success when signing throws or the RPC rejects a block', async () => {
    const component = setup(null);
    component.nanoBlock.generateChange.and.rejectWith(new Error('Transport unavailable'));
    await component.changeRepresentatives();
    expect(component.notifications.sendSuccess).not.toHaveBeenCalled();
    expect(component.notifications.sendError).toHaveBeenCalled();
    expect(component.selectedAccounts.length).toBe(1);
    expect(component.changingRepresentatives).toBeFalse();
  });

  it('reports success and resets the form only after the RPC accepts a block', async () => {
    const component = setup('block-hash');
    await component.changeRepresentatives();
    expect(component.notifications.sendSuccess).toHaveBeenCalledTimes(1);
    expect(component.selectedAccounts).toEqual([]);
    expect(component.toRepresentativeID).toBe('');
    expect(component.representativeService.getRepresentativesOverview).toHaveBeenCalled();
    expect(component.changingRepresentatives).toBeFalse();
  });

  it('reports partial success and retains only failed accounts for retry', async () => {
    const component = setup('block-hash');
    component.selectedAccounts = [{ id: 'nano_account' }, { id: 'nano_second' }];
    component.fullAccounts.push({ id: 'nano_second', representative: 'nano_previous' });
    component.walletService.getWalletAccount = (id: string) => ({ id, index: id === 'nano_account' ? 0 : 1 });
    component.nanoBlock.generateChange.and.returnValues(Promise.resolve('block-hash'), Promise.resolve(null));
    await component.changeRepresentatives();
    expect(component.notifications.sendSuccess).not.toHaveBeenCalled();
    expect(component.notifications.sendWarning).toHaveBeenCalledWith('ui-notifications.rep-updated-partial');
    expect(component.selectedAccounts).toEqual([{ id: 'nano_second' }]);
    expect(component.toRepresentativeID).toBe('nano_target');
  });
});
