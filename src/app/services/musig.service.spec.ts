import { ComponentTestModule, isolateConstructorIO } from '../../testing/component-test.module';
import { TestBed } from '@angular/core/testing';

import { MusigService } from './musig.service';
import base32 from 'nano-base32';

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

  it('uses the existing Nano Base32 encoding and decoding in the browser', () => {
    // A public all-zero account, used only as a serialization test vector.
    const encoded = '1'.repeat(52) + 'hifc8npp';
    const bytes = base32.decode(encoded);
    expect(bytes.length).toBe(37);
    expect(Array.from(bytes.slice(0, 32))).toEqual(Array(32).fill(0));
    expect(base32.encode(bytes)).toBe(encoded);
  });
});
