import { ComponentTestModule, isolateConstructorIO } from '../../testing/component-test.module';
import { TestBed, inject } from '@angular/core/testing';

import { NanoBlockService } from './nano-block.service';

describe('NanoBlockService', () => {
  beforeEach(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
      providers: [NanoBlockService]
    });
  });

  it('should be created', inject([NanoBlockService], (service: NanoBlockService) => {
    expect(service).toBeTruthy();
  }));
});
