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


  it('holds paid PoW until unlock/skip, without blocking public sources', async () => {
    await vault.saveKey('nano-to', 'nano-TEST-KEY-1234567', pass);
    vault.lock();
    vault.beginStartupUnlockDecision();
    let settled = false;
    const waiting = vault.waitForStartupUnlockDecision('https://rpc.nano.to/')
      .then(() => { settled = true; });
    await vault.waitForStartupUnlockDecision('https://twister32.changeip.net/pow');
    await Promise.resolve();
    expect(settled).toBeFalse();
    await vault.unlock(pass);
    // Explicit resolution after successful unlock by the startup dialog.
    vault.resolveStartupUnlockDecision();
    await waiting;
    expect(settled).toBeTrue();
    expect(vault.hasKey('nano-to')).toBeTrue();
  });

  it('releases the paid PoW gate on Later and never stores a passphrase', async () => {
    await vault.saveKey('nano-to', 'nano-TEST-KEY-1234567', pass);
    vault.lock();
    vault.beginStartupUnlockDecision();
    let settled = false;
    const waiting = vault.waitForStartupUnlockDecision('https://rpc.nano.to/')
      .then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBeFalse();
    vault.resolveStartupUnlockDecision();
    await waiting;
    expect(settled).toBeTrue();
    expect(vault.isUnlocked).toBeFalse();
  });

  it('keeps two named Nano.to keys independently and persists the active selection', async () => {
    const first = 'nano-TEST-FIRST-KEY-98765';
    const second = 'nano-TEST-SECOND-KEY-54321';
    const firstId = await vault.saveKey('nano-to', first, pass, 'Main key');
    const secondId = await vault.saveKey('nano-to', second, pass, 'Test key');
    expect(firstId).not.toBe(secondId);
    expect(vault.getKeySummaries('nano-to').map(key => key.label))
      .toEqual(['Main key', 'Test key']);
    expect(vault.getKeySummaries('nano-to').filter(key => key.active).map(key => key.id))
      .toEqual([secondId]);
    expect(vault.getAuthorizedHeaders('https://rpc.nano.to/'))
      .toEqual({ Authorization: 'Bearer ' + second });

    vault.lock();
    const visible = vault.getKeySummaries();
    expect(visible.map(key => key.label)).toEqual(['Main key', 'Test key']);
    expect(JSON.stringify(visible)).not.toContain(first);
    expect(JSON.stringify(visible)).not.toContain(second);
    expect(localStorage.getItem(keyName)).not.toContain(first);
    expect(localStorage.getItem(keyName)).not.toContain(second);
    expect(vault.getAuthorizedHeaders('https://rpc.nano.to/')).toBeNull();

    await vault.unlock(pass);
    expect(vault.getAuthorizedHeaders('https://rpc.nano.to/'))
      .toEqual({ Authorization: 'Bearer ' + second });
    await vault.activateKey('nano-to', firstId, pass);
    expect(vault.getAuthorizedHeaders('https://rpc.nano.to/'))
      .toEqual({ Authorization: 'Bearer ' + first });
    vault.lock();
    await vault.unlock(pass);
    expect(vault.getKeySummaries('nano-to').find(key => key.active)?.id).toBe(firstId);
    await vault.removeKey('nano-to', pass, secondId);
    expect(vault.getKeySummaries('nano-to').map(key => key.label)).toEqual(['Main key']);
    expect(vault.getAuthorizedHeaders('https://rpc.nano.to/'))
      .toEqual({ Authorization: 'Bearer ' + first });
    expect(vault.hasVault).toBeTrue();
    await vault.removeKey('nano-to', pass, firstId);
    expect(vault.hasVault).toBeFalse();
    expect(vault.isUnlocked).toBeFalse();
  });

  it('deleting an active Nano.to key promotes another without affecting Nanswap', async () => {
    const firstId = await vault.saveKey('nano-to', 'FIRST-NANO-KEY-123456', pass, 'First');
    const secondId = await vault.saveKey('nano-to', 'SECOND-NANO-KEY-123456', pass, 'Second');
    await vault.saveKey('nanswap', 'NANSWAP-KEY-12345678', pass, 'Swap');
    await vault.removeKey('nano-to', pass, secondId);
    expect(vault.getKeySummaries('nano-to').find(key => key.active)?.id).toBe(firstId);
    expect(vault.getAuthorizedHeaders('https://rpc.nano.to/'))
      .toEqual({ Authorization: 'Bearer FIRST-NANO-KEY-123456' });
    expect(vault.getAuthorizedHeaders('https://nodes.nanswap.com/XNO'))
      .toEqual({ 'nodes-api-key': 'NANSWAP-KEY-12345678' });
  });

  it('migrates the original encrypted one-key-per-provider vault without losing secrets', async () => {
    const crypto = globalThis.crypto;
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass),
      'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600000 },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const originalKey = 'LEGACY-NANO-TO-KEY-12345678';
    const payload = new TextEncoder().encode(JSON.stringify({ 'nano-to': originalKey }));
    const cipher = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('nault:pow-api-keys:v1') },
      key, payload);
    const b64 = (value: Uint8Array) => btoa(String.fromCharCode(...value));
    localStorage.setItem(keyName, JSON.stringify({
      v: 1, salt: b64(salt), iv: b64(iv), data: b64(new Uint8Array(cipher))
    }));
    expect(vault.needsLegacyUnlock).toBeTrue();
    expect(vault.getKeySummaries()).toEqual([]);
    await vault.unlock(pass);
    const encrypted = localStorage.getItem(keyName) || '';
    expect(JSON.parse(encrypted).v).toBe(2);
    expect(encrypted).not.toContain(originalKey);
    expect(vault.getKeySummaries('nano-to').map(k => k.label)).toEqual(['Nano.to 1']);
    expect(vault.getAuthorizedHeaders('https://rpc.nano.to/'))
      .toEqual({ Authorization: 'Bearer ' + originalKey });
    await vault.saveKey('nano-to', 'ANOTHER-NANO-KEY-123456', pass, 'After migration');
    expect(vault.getKeySummaries('nano-to').length).toBe(2);
  });

  it('rejects altered cleartext key labels without releasing decrypted secrets', async () => {
    await vault.saveKey('nano-to', 'TEST-NANO-KEY-12345678', pass, 'Original');
    const stored = JSON.parse(localStorage.getItem(keyName) || '{}');
    stored.metadata[0].label = 'Malicious';
    localStorage.setItem(keyName, JSON.stringify(stored));
    vault.lock();
    await expectAsync(vault.unlock(pass)).toBeRejected();
    expect(vault.isUnlocked).toBeFalse();
    expect(vault.getAuthorizedHeaders('https://rpc.nano.to/')).toBeNull();
  });

  it('does not accidentally delete every key for a provider when a key ID is omitted', async () => {
    await vault.saveKey('nano-to', 'NANO-KEY-A-123456789', pass, 'A');
    await vault.saveKey('nano-to', 'NANO-KEY-B-123456789', pass, 'B');
    await expectAsync(vault.removeKey('nano-to', pass)).toBeRejected();
    expect(vault.getKeySummaries('nano-to').length).toBe(2);
    expect(vault.hasVault).toBeTrue();
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
