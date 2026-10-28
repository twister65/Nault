import { BehaviorSubject } from 'rxjs';
import { WalletService } from './wallet.service';
import { isModernWalletCiphertext } from './wallet-encryption';

describe('S-01 WalletService persistence', () => {
  const sample = '0'.repeat(64);
  const pass = 'long testing passphrase';
  let service: any;
  const key = 's01-unit-test';

  beforeEach(() => {
    service = Object.create(WalletService.prototype) as any;
    service.storeKey = key;
    service.wallet = {
      type: 'seed', seed: sample, locked: false, password: '',
      accounts: [], selectedAccount: null, locked$: new BehaviorSubject(false)
    };
    service.appSettings = { settings: { walletStore: 'localStorage' } };
  });

  afterEach(() => localStorage.removeItem(key));

  it('does not persist plaintext before encryption', () => {
    service.saveWalletExport();
    expect(localStorage.getItem(key)).toBeNull();
    expect(() => service.generateWalletExport()).toThrow();
  });

  it('stores only authenticated ciphertext after password setup', async () => {
    await service.setSoftwareWalletPassword(pass);
    const exported = service.generateWalletExport();
    expect(isModernWalletCiphertext(exported.ciphertext)).toBeTrue();
    expect(exported.ciphertext).not.toBe(sample);
    expect(JSON.parse(localStorage.getItem(key) as string).ciphertext).toBe(exported.ciphertext);
    expect(service.lockWallet()).toBeTrue();
    expect(service.wallet.seed).toBe(exported.ciphertext);
  });

  it('preserves the old ciphertext when the new password is weak', async () => {
    await service.setSoftwareWalletPassword(pass);
    const before = localStorage.getItem(key);
    await expectAsync(service.setSoftwareWalletPassword('short')).toBeRejected();
    expect(localStorage.getItem(key)).toBe(before);
  });
});
