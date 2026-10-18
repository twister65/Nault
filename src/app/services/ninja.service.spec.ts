import { ComponentTestModule, isolateConstructorIO } from '../../testing/component-test.module';
import { TestBed, inject } from '@angular/core/testing';

import { NinjaService } from './ninja.service';

describe('NinjaService', () => {
  beforeEach(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
      providers: [NinjaService]
    });
  });

  it('should be created', inject([NinjaService], (service: NinjaService) => {
    expect(service).toBeTruthy();
  }));
});
