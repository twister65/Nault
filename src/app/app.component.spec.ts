import { TestBed, waitForAsync } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { ComponentTestModule, isolateConstructorIO } from '../testing/component-test.module';

describe('AppComponent', () => {
  beforeEach(waitForAsync(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({ imports: [ComponentTestModule] }).compileComponents();
  }));
  it('constructs the application with its real dependency graph', () => {
    expect(TestBed.createComponent(AppComponent).componentInstance).toBeTruthy();
  });
  it('resets the inactivity counter when the user interacts', () => {
    const app = TestBed.createComponent(AppComponent).componentInstance;
    app.inactiveSeconds = 30;
    app.updateIdleTime();
    expect(app.inactiveSeconds).toBe(0);
  });
});
