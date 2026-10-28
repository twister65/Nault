import * as CryptoJS from 'crypto-js';
import {
  encryptWalletSecret, decryptWalletSecret, isLegacyWalletCiphertext,
  isModernWalletCiphertext, isStrongWalletPassword
} from './wallet-encryption';

describe('S-01: authenticated software wallet backup format', () => {
  const seed = '0123456789ABCDEF'.repeat(4);
  const password = 'long test passphrase 2026';

  it('encrypts seeds without exposing their plaintext or password and round-trips', async () => {
    const cipher = await encryptWalletSecret(seed, password, 'seed');
    expect(isModernWalletCiphertext(cipher)).toBeTrue();
    expect(cipher).not.toContain(seed);
    expect(cipher).not.toContain(password);
    expect(await decryptWalletSecret(cipher, password, 'seed')).toBe(seed);
  });

  it('uses fresh salts and IVs even for identical inputs', async () => {
    const a = await encryptWalletSecret(seed, password, 'seed');
    const b = await encryptWalletSecret(seed, password, 'seed');
    expect(a).not.toEqual(b);
  });

  it('rejects an incorrect password, tampering, and a changed wallet type', async () => {
    const cipher = await encryptWalletSecret(seed, password, 'seed');
    await expectAsync(decryptWalletSecret(cipher, 'another secure passphrase', 'seed')).toBeRejected();
    await expectAsync(decryptWalletSecret(cipher, password, 'privateKey')).toBeRejected();
    // Corrupt the authenticated payload without changing its shape.
    const altered = cipher.slice(0, -3) + (cipher.at(-3) === 'A' ? 'B' : 'A') + cipher.slice(-2);
    await expectAsync(decryptWalletSecret(altered, password, 'seed')).toBeRejected();
  });

  it('reads original CryptoJS/OpenSSL backups without rewriting them', async () => {
    const oldCipher = CryptoJS.AES.encrypt(seed, 'old-pass').toString();
    expect(isLegacyWalletCiphertext(oldCipher)).toBeTrue();
    expect(await decryptWalletSecret(oldCipher, 'old-pass', 'seed')).toBe(seed);
    await expectAsync(decryptWalletSecret(oldCipher, 'incorrect', 'seed')).toBeRejected();
  });

  it('does not accept an unknown version, plaintext or malformed data', async () => {
    await expectAsync(decryptWalletSecret('nault:v3:AAAA', password, 'seed')).toBeRejected();
    await expectAsync(decryptWalletSecret(seed, password, 'seed')).toBeRejected();
    await expectAsync(decryptWalletSecret('nault:v2:@@@@', password, 'seed')).toBeRejected();
  });

  it('enforces minimum passphrase strength for all new writes', async () => {
    expect(isStrongWalletPassword('hello1')).toBeFalse();
    expect(isStrongWalletPassword('                 ')).toBeFalse();
    expect(isStrongWalletPassword(password)).toBeTrue();
    await expectAsync(encryptWalletSecret(seed, '', 'seed')).toBeRejected();
    await expectAsync(encryptWalletSecret(seed, 'short1', 'seed')).toBeRejected();
  });
});
