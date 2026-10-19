import { ComponentTestModule, isolateConstructorIO } from '../../testing/component-test.module';
import { TestBed, inject } from '@angular/core/testing';

import { RepresentativeService } from './representative.service';

describe('RepresentativeService', () => {
  beforeEach(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
      providers: [RepresentativeService]
    });
  });

  it('should be created', inject([RepresentativeService], (service: RepresentativeService) => {
    expect(service).toBeTruthy();
  }));
});
