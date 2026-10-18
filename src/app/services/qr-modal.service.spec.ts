import { ComponentTestModule, isolateConstructorIO } from '../../testing/component-test.module';
import { TestBed } from '@angular/core/testing';

import { QrModalService } from './qr-modal.service';

describe('QrModalService', () => {
  let service: QrModalService;

  beforeEach(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],});
    service = TestBed.inject(QrModalService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
