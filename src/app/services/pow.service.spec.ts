import { ComponentTestModule, isolateConstructorIO } from '../../testing/component-test.module';
import { TestBed, inject } from '@angular/core/testing';

import { PowService } from './pow.service';

describe('PowService', () => {
  beforeEach(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
      providers: [PowService]
    });
  });

  it('should be created', inject([PowService], (service: PowService) => {
    expect(service).toBeTruthy();
  }));
});
