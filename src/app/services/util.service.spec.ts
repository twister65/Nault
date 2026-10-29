import { ComponentTestModule, isolateConstructorIO } from '../../testing/component-test.module';
import { TestBed, inject } from '@angular/core/testing';

import { UtilService } from './util.service';

describe('UtilService', () => {
  beforeEach(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
      providers: [UtilService]
    });
  });

  it('should be created', inject([UtilService], (service: UtilService) => {
    expect(service).toBeTruthy();
  }));
  it('derives the established BIP39 PBKDF2-HMAC-SHA512 test vector in the browser', inject([UtilService], (service: UtilService) => {
    // Public BIP39 test vector; never a wallet for holding funds.
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const bytes = service.string.mnemonicToSeedSync(mnemonic, 'TREZOR');
    expect(service.hex.fromUint8(bytes)).toBe(
      'C55257C360C07C72029AEBC1B53C05ED0362ADA38EAD3E3E9EFA3708E53495531F09A6987599D18264C1E1C92F2CF141630C7A3C4AB7C81B2F001698E7463B04'
    );
  }));

});
