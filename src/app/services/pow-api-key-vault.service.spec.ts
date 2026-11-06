import { TestBed } from '@angular/core/testing';
import { PoWApiKeyVaultService } from './pow-api-key-vault.service';

describe('PoWApiKeyVaultService encrypted local credentials', () => {
  let vault: PoWApiKeyVaultService;
  let original: string | null;
  const keyName = 'nault-pow-provider-keys-v1';
  const pass = 'a strong local PoW passphrase';
  beforeEach(() => {
    original = localStorage.getItem(keyName);
    localStorage.removeItem(keyName);
    TestBed.configureTestingModule({});
    vault = TestBed.inject(PoWApiKeyVaultService);
    vault.lock();
  });
  afterEach(() => {
    vault.lock();
    if (original === null) localStorage.removeItem(keyName);
    else localStorage.setItem(keyName, original);
  });
  it('encrypts AES-GCM at rest and requires an explicit unlock after restart', async () => {
    const secret = 'nano-TEST-KEY-987654321';
    await vault.saveKey('nano-to', secret, pass);
    const encrypted = localStorage.getItem(keyName) || '';
    expect(encrypted).not.toContain(secret);
    expect(encrypted).not.toContain(pass);
    const parsed = JSON.parse(encrypted);
    expect(parsed.v).toBe(1);
    expect(parsed.salt).toBeTruthy();
    expect(parsed.iv).toBeTruthy();
    expect(vault.getAuthorizedHeaders('https://rpc.nano.to/'))
      .toEqual({ Authorization: 'Bearer ' + secret });
    vault.lock();
    expect(vault.getAuthorizedHeaders('https://rpc.nano.to/')).toBeNull();
    await expectAsync(vault.unlock('incorrect passphrase')).toBeRejected();
    expect(vault.isUnlocked).toBeFalse();
    await vault.unlock(pass);
    expect(vault.getAuthorizedHeaders('https://rpc.nano.to/'))
      .toEqual({ Authorization: 'Bearer ' + secret });
    expect(vault.getAuthorizedHeaders('https://evil.example/')).toBeNull();
    expect(vault.getAuthorizedHeaders('https://rpc.nano.to.evil.example/')).toBeNull();
    expect(vault.getAuthorizedHeaders('https://rpc.nano.to/?key=x')).toBeNull();
  });

  it('keeps provider secrets isolated and rejects URL credentials and redirects', async () => {
    await vault.saveKey('nanswap', 'nanswap-TEST-KEY-987654321', pass);
    expect(vault.getAuthorizedHeaders('https://nodes.nanswap.com/XNO'))
      .toEqual({ 'nodes-api-key': 'nanswap-TEST-KEY-987654321' });
    expect(vault.getAuthorizedHeaders('https://nodes.nanswap.com/XNO/')).toBeNull();
    expect(vault.getAuthorizedHeaders('https://nodes.nanswap.com/XNO?api_key=fake')).toBeNull();
    expect(vault.getAuthorizedHeaders('https://user:pass@nodes.nanswap.com/XNO')).toBeNull();
    expect(vault.getAuthorizedHeaders('https://rpc.nano.to/')).toBeNull();
    await vault.removeKey('nanswap', pass);
    expect(vault.hasVault).toBeFalse();
    expect(vault.isUnlocked).toBeFalse();
  });

  it('refuses weak passphrases and never replaces encrypted keys on wrong unlock', async () => {
    await expectAsync(vault.saveKey('nano-to', 'valid-TEST-KEY', 'short'))
      .toBeRejected();
    await vault.saveKey('nano-to', 'valid-TEST-KEY', pass);
    const previous = localStorage.getItem(keyName);
    await expectAsync(vault.saveKey('nanswap', 'second-TEST-KEY', 'wrong passphrase'))
      .toBeRejected();
    expect(localStorage.getItem(keyName)).toBe(previous);
  });
});
