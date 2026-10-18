import { ComponentTestModule, isolateConstructorIO } from '../../../testing/component-test.module';
import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { QrModalComponent } from './qr-modal.component';

describe('QrModalComponent', () => {
  let component: QrModalComponent;
  let fixture: ComponentFixture<QrModalComponent>;

  beforeEach(waitForAsync(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(QrModalComponent);
    component = fixture.componentInstance;
    // Constructor smoke test; lifecycle scenarios supply explicit inputs and I/O mocks.
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
