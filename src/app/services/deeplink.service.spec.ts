import { ComponentTestModule, isolateConstructorIO } from '../../testing/component-test.module';
import { TestBed, inject } from '@angular/core/testing';

import { DeeplinkService } from './deeplink.service';

describe('DeeplinkService', () => {
  beforeEach(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
      providers: [DeeplinkService]
    });
  });

  it('should be created', inject([DeeplinkService], (service: DeeplinkService) => {
    expect(service).toBeTruthy();
  }));
});
