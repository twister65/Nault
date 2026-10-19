import { ComponentTestModule, isolateConstructorIO } from '../../../../testing/component-test.module';
import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { NanoTransactionMobileComponent } from './nano-transaction-mobile.component';

describe('NanoTransactionMobileComponent', () => {
  let component: NanoTransactionMobileComponent;
  let fixture: ComponentFixture<NanoTransactionMobileComponent>;

  beforeEach(waitForAsync(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(NanoTransactionMobileComponent);
    component = fixture.componentInstance;
    // Constructor smoke test; lifecycle scenarios supply explicit inputs and I/O mocks.
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
