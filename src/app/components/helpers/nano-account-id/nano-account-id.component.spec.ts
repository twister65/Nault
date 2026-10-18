import { ComponentTestModule, isolateConstructorIO } from '../../../../testing/component-test.module';
import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { NanoAccountIdComponent } from './nano-account-id.component';

describe('NanoAccountIdComponent', () => {
  let component: NanoAccountIdComponent;
  let fixture: ComponentFixture<NanoAccountIdComponent>;

  beforeEach(waitForAsync(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(NanoAccountIdComponent);
    component = fixture.componentInstance;
    // Constructor smoke test; lifecycle scenarios supply explicit inputs and I/O mocks.
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
