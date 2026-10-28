import { entropyToMnemonic, mnemonicToEntropy, mnemonicToSeedHex, validateMnemonic } from './bip39-browser';

describe('BIP39 browser SHA-256 checksum compatibility', () => {
  it('matches the official 128-bit zero entropy vector', async () => {
    const entropy = '00'.repeat(16);
    const mnemonic = Array(11).fill('abandon').concat('about').join(' ');
    expect(await entropyToMnemonic(entropy)).toBe(mnemonic);
    expect(await mnemonicToEntropy(mnemonic)).toBe(entropy);
    expect(await validateMnemonic(mnemonic)).toBeTrue();
  });

  it('round-trips the 24-word Nano recovery phrase used by Natrium', async () => {
    // Natrium's NanoMnemomics uses BIP39 entropy <-> 24 English words,
    // then the legacy Nano seed/index derivation (not HD BIP44).
    // Public test vector only; never use these words to hold real funds.
    const natriumTestSeed = '00'.repeat(32).toUpperCase();
    const natriumTestWords = Array(23).fill('abandon').concat('art').join(' ');
    expect(await entropyToMnemonic(natriumTestSeed)).toBe(natriumTestWords);
    expect((await mnemonicToEntropy(natriumTestWords)).toUpperCase()).toBe(natriumTestSeed);
  });

  it('matches the official 256-bit zero entropy vector used for Nano seeds', async () => {
    const entropy = '00'.repeat(32);
    const mnemonic = Array(23).fill('abandon').concat('art').join(' ');
    expect(await entropyToMnemonic(entropy)).toBe(mnemonic);
    expect(await mnemonicToEntropy(mnemonic)).toBe(entropy);
  });

  it('round-trips a fixed 256-bit test vector', async () => {
    const entropy = '000102030405060708090A0B0C0D0E0F101112131415161718191A1B1C1D1E1F';
    const mnemonic = await entropyToMnemonic(entropy);
    expect(mnemonic.split(' ').length).toBe(24);
    expect(await mnemonicToEntropy(mnemonic)).toBe(entropy.toLowerCase());
  });

  it('keeps the official PBKDF2-HMAC-SHA512 seed derivation vector', async () => {
    const mnemonic = Array(11).fill('abandon').concat('about').join(' ');
    expect(await mnemonicToSeedHex(mnemonic, 'TREZOR')).toBe(
      'c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04'
    );
  });

  it('rejects a changed checksum, unknown words, and malformed entropy', async () => {
    const phrase = Array(11).fill('abandon').concat('about').join(' ');
    const altered = Array(11).fill('abandon').concat('above').join(' ');
    expect(await validateMnemonic(phrase)).toBeTrue();
    expect(await validateMnemonic(altered)).toBeFalse();
    expect(await validateMnemonic(phrase.replace('abandon', 'notaword'))).toBeFalse();
    await expectAsync(entropyToMnemonic('abc')).toBeRejected();
    await expectAsync(mnemonicToEntropy(altered)).toBeRejected();
  });
});
