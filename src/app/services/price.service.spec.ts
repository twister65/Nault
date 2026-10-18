import { ComponentTestModule, isolateConstructorIO } from '../../testing/component-test.module';
import { TestBed, inject } from '@angular/core/testing';

import { PriceService } from './price.service';

describe('PriceService', () => {
  beforeEach(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
      providers: [PriceService]
    });
  });

  it('should be created', inject([PriceService], (service: PriceService) => {
    expect(service).toBeTruthy();
  }));
});
