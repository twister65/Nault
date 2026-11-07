import { TestBed } from '@angular/core/testing';
import { PoWApiKeyVaultService } from './pow-api-key-vault.service';

describe('PoWApiKeyVaultService encrypted local credentials', () => {
  let vault: PoWApiKeyVaultService;
  let original: string | null;
  const keyName = 'nault-pow-provider-keys-v2';
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
    expect(parsed.v).toBe(2);
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

  it('never sends Nano.to credentials to a different endpoint or accepts removed providers', async () => {
    await vault.saveKey('nano-to', 'nano-TEST-KEY-987654321', pass);
    expect(vault.getAuthorizedHeaders('https://rpc.nano.to/'))
      .toEqual({ Authorization: 'Bearer nano-TEST-KEY-987654321' });
    expect(vault.getAuthorizedHeaders('https://rainstorm.city/api')).toBeNull();
    expect(vault.getAuthorizedHeaders('https://rpc.nano.to/XNO')).toBeNull();
    expect(vault.getAuthorizedHeaders('http://rpc.nano.to/')).toBeNull();
    expect(vault.getAuthorizedHeaders('https://rpc.nano.to/?key=secret')).toBeNull();
    await expectAsync(vault.saveKey('unknown-provider' as any, 'FORBIDDEN-KEY-12345678', pass))
      .toBeRejected();
    expect(vault.getKeySummaries().map(key => key.provider)).toEqual(['nano-to']);
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
    await vault.activateKey('nano-to', firstId);
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

  it('activates an existing Nano.to key without a new passphrase while unlocked', async () => {
    const first = 'NANO-ACTIVATION-KEY-11111111';
    const second = 'NANO-ACTIVATION-KEY-22222222';
    const firstId = await vault.saveKey('nano-to', first, pass, 'Primary');
    const secondId = await vault.saveKey('nano-to', second, '', 'Secondary');
    const previous = JSON.parse(localStorage.getItem(keyName)!);

    await vault.activateKey('nano-to', firstId);
    const updated = JSON.parse(localStorage.getItem(keyName)!);
    expect(vault.isUnlocked).toBeTrue();
    expect(updated.salt).toBe(previous.salt);
    expect(updated.iv).not.toBe(previous.iv);
    expect(updated.data).not.toContain(first);
    expect(updated.data).not.toContain(second);
    expect(vault.getKeySummaries('nano-to').find(entry => entry.active)?.id).toBe(firstId);
    expect(vault.getAuthorizedHeaders('https://rpc.nano.to/'))
      .toEqual({ Authorization: 'Bearer ' + first });

    vault.lock();
    await expectAsync(vault.activateKey('nano-to', secondId)).toBeRejected();
    expect(vault.isUnlocked).toBeFalse();
    await vault.unlock(pass);
    expect(vault.getKeySummaries('nano-to').find(entry => entry.active)?.id).toBe(firstId);
    await vault.activateKey('nano-to', secondId);
    expect(vault.getAuthorizedHeaders('https://rpc.nano.to/'))
      .toEqual({ Authorization: 'Bearer ' + second });
  });

  it('preserves unlocked vault and encrypted keys if activation fails', async () => {
    const first = 'NANO-ACTIVATION-KEY-33333333';
    const id = await vault.saveKey('nano-to', first, pass, 'Primary');
    const before = localStorage.getItem(keyName);
    await expectAsync(vault.activateKey('nano-to', 'unknown-id')).toBeRejected();
    expect(vault.isUnlocked).toBeTrue();
    expect(localStorage.getItem(keyName)).toBe(before);
    expect(vault.getKeySummaries('nano-to').find(entry => entry.active)?.id).toBe(id);

    const modified = JSON.parse(before!);
    modified.metadata[0].label = 'Unexpected other-session update';
    localStorage.setItem(keyName, JSON.stringify(modified));
    await expectAsync(vault.activateKey('nano-to', id)).toBeRejected();
    expect(vault.isUnlocked).toBeTrue(); // No implicit re-unlock or session loss.
    expect(localStorage.getItem(keyName)).toBe(JSON.stringify(modified));
  });

  it('deleting an active Nano.to key promotes a saved key of the same provider', async () => {
    const firstId = await vault.saveKey('nano-to', 'FIRST-NANO-KEY-123456', pass, 'First');
    const secondId = await vault.saveKey('nano-to', 'SECOND-NANO-KEY-123456', pass, 'Second');
    const thirdId = await vault.saveKey('nano-to', 'THIRD-NANO-KEY-123456', pass, 'Third');
    await vault.removeKey('nano-to', pass, thirdId);
    expect(vault.getKeySummaries('nano-to').find(key => key.active)?.id).toBe(firstId);
    expect(vault.getKeySummaries('nano-to').map(key => key.id)).toEqual([firstId, secondId]);
    expect(vault.getAuthorizedHeaders('https://rpc.nano.to/'))
      .toEqual({ Authorization: 'Bearer FIRST-NANO-KEY-123456' });
  });
  it('deletes the active Nano.to key after unlocking without another key or passphrase', async () => {
    const firstId = await vault.saveKey('nano-to', 'NANO-FIRST-KEY-12345678', pass, 'Original');
    const activeId = await vault.saveKey('nano-to', 'NANO-ACTIVE-KEY-12345678', pass, 'Active');
    await vault.removeKey('nano-to', null, activeId);
    expect(vault.isUnlocked).toBeTrue();
    expect(vault.getKeySummaries('nano-to')).toEqual([
      { id: firstId, provider: 'nano-to', label: 'Original', active: true }
    ]);
    expect(vault.getAuthorizedHeaders('https://rpc.nano.to/'))
      .toEqual({ Authorization: 'Bearer NANO-FIRST-KEY-12345678' });
    expect(localStorage.getItem(keyName)).not.toContain('NANO-FIRST-KEY-12345678');
    vault.lock();
    await vault.unlock(pass);
    expect(vault.getKeySummaries('nano-to').find(key => key.active)?.id).toBe(firstId);
    await vault.removeKey('nano-to', null, firstId);
    expect(vault.hasVault).toBeFalse();
  });
  it('deleting the last key after unlocking destroys the encrypted vault', async () => {
    const id = await vault.saveKey('nano-to', 'ONE-NANO-KEY-12345678', pass, 'Last');
    await vault.removeKey('nano-to', null, id);
    expect(vault.hasVault).toBeFalse();
    expect(vault.isUnlocked).toBeFalse();
    expect(localStorage.getItem(keyName)).toBeNull();
    expect(vault.getAuthorizedHeaders('https://rpc.nano.to/')).toBeNull();
  });

  it('requires unlock for a passphrase-free delete and detects concurrent vault changes', async () => {
    const id = await vault.saveKey('nano-to', 'NANO-KEY-123456789', pass, 'First');
    vault.lock();
    await expectAsync(vault.removeKey('nano-to', null, id)).toBeRejected();
    await vault.unlock(pass);
    const original = localStorage.getItem(keyName)!;
    const modified = JSON.parse(original);
    modified.metadata[0].label = 'Changed in another tab';
    localStorage.setItem(keyName, JSON.stringify(modified));
    await expectAsync(vault.removeKey('nano-to', null, id)).toBeRejected();
    expect(localStorage.getItem(keyName)).toBe(JSON.stringify(modified));
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


  it('clears encrypted Nano.to keys, labels and in-memory credentials without a passphrase', async () => {
    const first = await vault.saveKey('nano-to', 'TEST-KEY-ONE-12345678', pass, 'Testing');
    await vault.saveKey('nano-to', 'TEST-KEY-TWO-12345678', pass, 'Another');
    expect(vault.hasVault).toBeTrue();
    expect(vault.isUnlocked).toBeTrue();
    expect(vault.getKeySummaries().length).toBe(2);
    expect(first).toBeTruthy();
    vault.clearVault();
    expect(localStorage.getItem(keyName)).toBeNull();
    expect(vault.hasVault).toBeFalse();
    expect(vault.isUnlocked).toBeFalse();
    expect(vault.getKeySummaries()).toEqual([]);
    expect(vault.getAuthorizedHeaders('https://rpc.nano.to/')).toBeNull();
    await expectAsync(vault.unlock(pass)).toBeRejected();
  });
  it('deletes a locked vault and releases the pending paid-PoW startup decision', async () => {
    await vault.saveKey('nano-to', 'TEST-KEY-ONE-12345678', pass, 'Testing');
    vault.lock();
    vault.beginStartupUnlockDecision();
    let released = false;
    const waiting = vault.waitForStartupUnlockDecision('https://rpc.nano.to/')
      .then(() => { released = true; });
    await Promise.resolve();
    expect(released).toBeFalse();
    vault.clearVault();
    await waiting;
    expect(released).toBeTrue();
    expect(localStorage.getItem(keyName)).toBeNull();
    expect(vault.getKeySummaries()).toEqual([]);
  });
  it('adds a key to an unlocked vault without re-entering or changing its passphrase', async () => {
    const first = 'NANO-FIRST-SECRET-KEY-123';
    const second = 'NANO-SECOND-SECRET-KEY-456';
    const firstId = await vault.saveKey('nano-to', first, pass, 'Primary');
    const original = JSON.parse(localStorage.getItem(keyName)!);
    const secondId = await vault.saveKey('nano-to', second, '', 'Secondary');
    // A stray value in the passphrase field must not rekey or lock an
    // authenticated session while another API key is being added.
    const third = 'NANO-THIRD-SECRET-KEY-789';
    const thirdId = await vault.saveKey('nano-to', third, 'a different unused passphrase', 'Third');
    const updated = JSON.parse(localStorage.getItem(keyName)!);

    expect(vault.isUnlocked).toBeTrue();
    expect(updated.salt).toBe(original.salt); // No silent passphrase change.
    expect(updated.iv).not.toBe(original.iv); // Unique AES-GCM IV on re-seal.
    expect(JSON.stringify(updated)).not.toContain(first);
    expect(JSON.stringify(updated)).not.toContain(second);
    expect(JSON.stringify(updated)).not.toContain(third);
    expect(vault.getKeySummaries('nano-to').map(entry => entry.id))
      .toEqual([firstId, secondId, thirdId]);
    expect(vault.getKeySummaries('nano-to').find(entry => entry.active)?.id).toBe(thirdId);
    expect(vault.getAuthorizedHeaders('https://rpc.nano.to/'))
      .toEqual({ Authorization: 'Bearer ' + third });

    vault.lock();
    await vault.unlock(pass);
    expect(vault.getKeySummaries('nano-to').map(entry => entry.label))
      .toEqual(['Primary', 'Secondary', 'Third']);
    expect(vault.getAuthorizedHeaders('https://rpc.nano.to/'))
      .toEqual({ Authorization: 'Bearer ' + third });
  });

  it('keeps a decrypted vault open after invalid key entries or duplicate labels', async () => {
    await vault.saveKey('nano-to', 'NANO-EXISTING-KEY-123456', pass, 'Primary');
    const before = localStorage.getItem(keyName);

    await expectAsync(vault.saveKey('nano-to', 'too-short', '', 'Primary'))
      .toBeRejected(); // Duplicate label, not a password prompt.
    await expectAsync(vault.saveKey('nano-to', 'bad', '', 'Invalid'))
      .toBeRejected(); // Invalid API key must not lock the session.
    expect(vault.isUnlocked).toBeTrue();
    expect(localStorage.getItem(keyName)).toBe(before);
    expect(vault.getAuthorizedHeaders('https://rpc.nano.to/'))
      .toEqual({ Authorization: 'Bearer NANO-EXISTING-KEY-123456' });
  });

  it('requires unlocking an existing vault before adding another key', async () => {
    await expectAsync(vault.saveKey('nano-to', 'NANO-NEW-KEY-12345678', 'short'))
      .toBeRejected();
    await vault.saveKey('nano-to', 'NANO-EXISTING-KEY-123456', pass, 'Primary');
    const before = localStorage.getItem(keyName);
    vault.lock();

    await expectAsync(vault.saveKey('nano-to', 'NANO-SECOND-KEY-123456', pass, 'Secondary'))
      .toBeRejected(); // The add-key action never attempts an implicit unlock.
    expect(vault.isUnlocked).toBeFalse();
    expect(localStorage.getItem(keyName)).toBe(before);

    await vault.unlock(pass);
    await vault.saveKey('nano-to', 'NANO-SECOND-KEY-123456', '', 'Secondary');
    expect(vault.isUnlocked).toBeTrue();
    expect(vault.getKeySummaries('nano-to').map(entry => entry.label))
      .toEqual(['Primary', 'Secondary']);
  });
});
