import { ComponentTestModule, isolateConstructorIO } from '../../../testing/component-test.module';
import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { ChangeRepWidgetComponent } from './change-rep-widget.component';

describe('ChangeRepWidgetComponent', () => {
  let component: ChangeRepWidgetComponent;
  let fixture: ComponentFixture<ChangeRepWidgetComponent>;

  beforeEach(waitForAsync(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ChangeRepWidgetComponent);
    component = fixture.componentInstance;
    // Constructor smoke test; lifecycle scenarios supply explicit inputs and I/O mocks.
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('displays votes detected for unknown health when NanoNode.de observes recent votes', () => {
    const rep = {
      statusText: 'unknown',
      networkObservation: { rpcOnline: false, nanonodeOnline: true }
    };
    expect(component.hasVotesWithUnverifiedHealth(rep as any)).toBeTrue();
    expect(rep.statusText).toBe('unknown'); // The actual health state is unchanged.
  });

  it('retains unknown status without a positive NanoNode.de observation', () => {
    for (const observation of [false, null, undefined]) {
      expect(component.hasVotesWithUnverifiedHealth({
        statusText: 'unknown',
        networkObservation: {nanonodeOnline: observation}
      } as any)).toBeFalse();
    }
    expect(component.hasVotesWithUnverifiedHealth({
      statusText: 'unknown'
    } as any)).toBeFalse();
  });

  it('does not mask reliable health assessments even when votes were detected', () => {
    for (const statusText of ['trusted', 'ok', 'warn', 'alert']) {
      expect(component.hasVotesWithUnverifiedHealth({
        statusText, networkObservation: {nanonodeOnline: true}
      } as any)).toBeFalse();
    }
  });

  it('keeps the representatives overview visible when opening change-required for one account', () => {
    const widget = Object.create(ChangeRepWidgetComponent.prototype) as any;
    widget.showRepHelp = false;
    widget.selectedAccount = null;
    widget.representatives = [{
      id: 'nano_rep_1',
      accounts: [{id: 'nano_account_1'}]
    }];
    widget.router = {navigate: jasmine.createSpy('navigate')};
    widget.showRepSelectionForSpecificRep(widget.representatives[0]);
    expect(widget.router.navigate).toHaveBeenCalledWith(['/representatives'], {
      queryParams: {accounts: 'nano_account_1'}
    });
  });

  it('preserves the overview when opening change-required for all affected accounts', () => {
    const widget = Object.create(ChangeRepWidgetComponent.prototype) as any;
    widget.changeableRepresentatives = [
      {accounts: [{id:'nano_account_1'}]},
      {accounts: [{id:'nano_account_2'}]}
    ];
    widget.router = {navigate: jasmine.createSpy('navigate')};
    widget.showRepSelectionForAllChangeableReps();
    expect(widget.router.navigate).toHaveBeenCalledWith(['/representatives'], {
      queryParams: {accounts: 'nano_account_1,nano_account_2'}
    });
  });

  it('does not report votes detected solely from a different RPC observer', () => {
    expect(component.hasVotesWithUnverifiedHealth({
      statusText: 'unknown',
      networkObservation: { rpcOnline: true, nanonodeOnline: false }
    } as any)).toBeFalse();
  });

});
