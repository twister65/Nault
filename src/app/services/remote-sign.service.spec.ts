import { ComponentTestModule, isolateConstructorIO } from '../../testing/component-test.module';
import { TestBed, inject } from '@angular/core/testing';

import { RemoteSignService } from './remote-sign.service';

describe('RemoteSignService', () => {
  beforeEach(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
      providers: [RemoteSignService]
    });
  });

  it('should be created', inject([RemoteSignService], (service: RemoteSignService) => {
    expect(service).toBeTruthy();
  }));
});
