import { BehaviorSubject } from 'rxjs';
import { WalletService } from './wallet.service';
import { isModernWalletCiphertext } from './wallet-encryption';

describe('S-01 WalletService persistence', () => {
  const sample = '0'.repeat(64);
  const pass = 'long testing passphrase';
  let service: any;
  const key = 's01-unit-test';
  const deviceKey = 'nault-device-unlock-prf-v1-wallet';
  let originalDevice: string | null;

  beforeEach(() => {
    originalDevice = localStorage.getItem(deviceKey);
    localStorage.removeItem(deviceKey);
    service = Object.create(WalletService.prototype) as any;
    service.storeKey = key;
    service.wallet = {
      type: 'seed', seed: sample, locked: false, password: '',
      accounts: [], selectedAccount: null, locked$: new BehaviorSubject(false)
    };
    service.appSettings = { settings: { walletStore: 'localStorage' } };
  });

  afterEach(() => {
    localStorage.removeItem(key);
    if (originalDevice === null) localStorage.removeItem(deviceKey);
    else localStorage.setItem(deviceKey, originalDevice);
  });

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

  it('invalidates local device enrollment on password rotation and wallet removal', async () => {
    await service.setSoftwareWalletPassword(pass);
    localStorage.setItem(deviceKey, 'encrypted device wrapper placeholder');
    await service.setSoftwareWalletPassword('different strong password for rotation');
    expect(localStorage.getItem(deviceKey)).toBeNull();
    localStorage.setItem(deviceKey, 'another encrypted device wrapper');
    service.removeWalletData();
    expect(localStorage.getItem(deviceKey)).toBeNull();
  });

  it('does not redirect a v2 QR to an incompatible upstream app', async () => {
    await service.setSoftwareWalletPassword(pass);
    const currentIsPublicHttps = window.location.protocol === 'https:' &&
      !!window.location.hostname &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1';
    expect(service.canExportWalletQr()).toBe(currentIsPublicHttps);
    if (currentIsPublicHttps) {
      expect(service.generateExportUrl()).toContain(window.location.origin + '/import-wallet#');
      expect(service.generateExportUrl()).not.toContain('https://nault.cc/import-wallet#');
    } else {
      expect(() => service.generateExportUrl()).toThrow();
      // JSON is still usable regardless of origin.
      expect(service.generateExportData().seed).toBe(service.walletCiphertext);
    }
  });

  it('keeps the historical CryptoJS QR destination for compatible v1 backups', () => {
    // A salted OpenSSL/CryptoJS fixture is sufficient for this routing test.
    service.walletCiphertext = 'U2FsdGVkX1' + 'A'.repeat(55);
    expect(service.canExportWalletQr()).toBeTrue();
    expect(service.generateExportUrl()).toContain('https://nault.cc/import-wallet#');
  });
});
