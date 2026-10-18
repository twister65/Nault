import { ComponentTestModule, isolateConstructorIO } from '../../../testing/component-test.module';
import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { Router } from '@angular/router';

import { SweeperComponent } from './sweeper.component';

describe('SweeperComponent', () => {
  let component: SweeperComponent;
  let fixture: ComponentFixture<SweeperComponent>;

  beforeEach(waitForAsync(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
    })
    .compileComponents();
  }));

  beforeEach(() => {
    spyOn(TestBed.inject(Router), 'getCurrentNavigation').and.returnValue({extras: {}} as any);
    fixture = TestBed.createComponent(SweeperComponent);
    component = fixture.componentInstance;
    // Constructor smoke test; lifecycle scenarios supply explicit inputs and I/O mocks.
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
