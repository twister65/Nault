import { ComponentTestModule, isolateConstructorIO } from '../../testing/component-test.module';
import { TestBed } from '@angular/core/testing';

import { MusigService } from './musig.service';

describe('MusigService', () => {
  let service: MusigService;

  beforeEach(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],});
    service = TestBed.inject(MusigService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
