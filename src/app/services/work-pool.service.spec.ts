import { ComponentTestModule, isolateConstructorIO } from '../../testing/component-test.module';
import { TestBed, inject } from '@angular/core/testing';

import { WorkPoolService } from './work-pool.service';

describe('WorkPoolService', () => {
  beforeEach(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
      providers: [WorkPoolService]
    });
  });

  it('should be created', inject([WorkPoolService], (service: WorkPoolService) => {
    expect(service).toBeTruthy();
  }));
});
