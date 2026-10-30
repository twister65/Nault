import { ComponentTestModule, isolateConstructorIO } from '../../../testing/component-test.module';
import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { AccountDetailsComponent } from './account-details.component';

describe('AccountDetailsComponent', () => {
  let component: AccountDetailsComponent;
  let fixture: ComponentFixture<AccountDetailsComponent>;

  beforeEach(waitForAsync(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(AccountDetailsComponent);
    component = fixture.componentInstance;
    // Constructor smoke test; lifecycle scenarios supply explicit inputs and I/O mocks.
  });

  it('keeps advanced account options and remote signing disabled', () => {
    expect(component.advancedFeaturesEnabled).toBe(false);
    expect(component.showAdvancedOptions).toBe(false);
    expect(component.remoteVisible).toBe(false);

    component.showRemote(false);
    expect(component.remoteVisible).toBe(false);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
