import { ComponentTestModule, isolateConstructorIO } from '../../testing/component-test.module';
import { TestBed, inject } from '@angular/core/testing';

import { LedgerService, isAndroidBrowser } from './ledger.service';

describe('LedgerService', () => {
  beforeEach(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
      providers: [LedgerService]
    });
  });

  it('should be created', inject([LedgerService], (service: LedgerService) => {
    expect(service).toBeTruthy();
  }));

  it('detects Android browser user agents without excluding ChromeOS or desktop browsers', () => {
    expect(isAndroidBrowser('Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit/537.36 Chrome/120')).toBe(true);
    expect(isAndroidBrowser('Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) Chrome/154')).toBe(false);
    expect(isAndroidBrowser('Mozilla/5.0 (X11; Linux x86_64) Chrome/154')).toBe(false);
  });
});
