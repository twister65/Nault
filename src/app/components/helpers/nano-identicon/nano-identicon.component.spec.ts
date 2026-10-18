import { ComponentTestModule, isolateConstructorIO } from '../../../../testing/component-test.module';
import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { NanoIdenticonComponent } from './nano-identicon.component';

describe('NanoIdenticonComponent', () => {
  let component: NanoIdenticonComponent;
  let fixture: ComponentFixture<NanoIdenticonComponent>;

  beforeEach(waitForAsync(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(NanoIdenticonComponent);
    component = fixture.componentInstance;
    // Constructor smoke test; lifecycle scenarios supply explicit inputs and I/O mocks.
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
