import { ComponentTestModule, isolateConstructorIO } from '../../testing/component-test.module';
import { TestBed, inject } from '@angular/core/testing';

import { ModalService } from './modal.service';

describe('ModalService', () => {
  beforeEach(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
      providers: [ModalService]
    });
  });

  it('should be created', inject([ModalService], (service: ModalService) => {
    expect(service).toBeTruthy();
  }));
});
