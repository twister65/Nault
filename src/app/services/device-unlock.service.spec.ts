import { DeviceUnlockService, isWindowsWebDeviceUnlockDisabled } from './device-unlock.service';

// The browser performs the platform authenticator ceremony; these tests
// exercise only our local PRF-derived authenticated envelope and bindings.
class MockAuthenticatorUnlock extends DeviceUnlockService {
  prf = new Uint8Array(32).fill(11);
  credentialId = new Uint8Array(32).fill(17);
  available = true;
  authenticated = true;
  async isSupported(): Promise<boolean> { return this.available; }
  protected async createCredential(): Promise<Credential | null> { return this.credential(); }
  protected async getCredential(): Promise<Credential | null> {
    return this.authenticated ? this.credential() : null;
  }
  private credential(): Credential {
    const id = this.credentialId.slice().buffer;
    const output = this.prf.slice().buffer;
    return {
      rawId: id, getClientExtensionResults: () => ({ prf: { results: { first: output } } })
    } as unknown as Credential;
  }
}

describe('WebAuthn PRF local device unlock', () => {
  it('blocks Windows browsers/PWAs but preserves Android, ChromeOS, Linux and macOS', () => {
    expect(isWindowsWebDeviceUnlockDisabled('Win32', 'Mozilla/5.0')).toBeTrue();
    expect(isWindowsWebDeviceUnlockDisabled('Win64', 'Mozilla/5.0')).toBeTrue();
    expect(isWindowsWebDeviceUnlockDisabled(
      'Linux x86_64', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    )).toBeTrue();
    expect(isWindowsWebDeviceUnlockDisabled(
      'Linux armv8l', 'Mozilla/5.0 (Linux; Android 14; Pixel)'
    )).toBeFalse();
    expect(isWindowsWebDeviceUnlockDisabled(
      'Linux x86_64', 'Mozilla/5.0 (X11; CrOS x86_64 16000.0.0)'
    )).toBeFalse();
    expect(isWindowsWebDeviceUnlockDisabled('MacIntel', 'Mozilla/5.0 (Macintosh)')).toBeFalse();
  });

  let service: MockAuthenticatorUnlock;
  beforeEach(() => {
    service = new MockAuthenticatorUnlock();
    service.remove('pow');
    service.remove('wallet');
  });
  afterEach(() => {
    service.remove('pow');
    service.remove('wallet');
  });

  it('stores only AES-GCM ciphertext and decrypts on a verified device', async () => {
    const password = 'Test vault password 1234';
    await service.enroll('pow', password, 'vault-salt-v2');
    const stored = localStorage.getItem('nault-device-unlock-prf-v1-pow') || '';
    expect(stored).not.toContain(password);
    expect(stored).not.toContain('vault-salt-v2');
    expect(JSON.parse(stored).v).toBe(1);
    expect(await service.unlock('pow', 'vault-salt-v2')).toBe(password);
  });

  it('separates wallet and PoW credentials and refuses changed ciphertext', async () => {
    await service.enroll('wallet', 'Correct wallet password', 'seed:encrypted-wallet-v2');
    await service.enroll('pow', 'Correct vault password', 'pow-salt-v2');
    expect(await service.unlock('wallet', 'seed:encrypted-wallet-v2')).toBe('Correct wallet password');
    expect(await service.unlock('pow', 'pow-salt-v2')).toBe('Correct vault password');
    await expectAsync(service.unlock('wallet', 'seed:changed-after-password-rotation')).toBeRejected();
    await expectAsync(service.unlock('pow', 'new-vault-salt')).toBeRejected();
  });

  it('rejects a missing/incorrect PRF and a cancelled device prompt', async () => {
    await service.enroll('wallet', 'Test software wallet password', 'wallet-cipher');
    service.prf.fill(12);
    await expectAsync(service.unlock('wallet', 'wallet-cipher')).toBeRejected();
    service.authenticated = false;
    await expectAsync(service.unlock('wallet', 'wallet-cipher')).toBeRejected();
    expect(service.has('wallet')).toBeTrue(); // password fallback remains available
  });

  it('refuses unsupported device auth without writing a record', async () => {
    service.available = false;
    await expectAsync(service.enroll('pow', 'my vault password', 'vault')).toBeRejected();
    expect(service.has('pow')).toBeFalse();
  });

  it('rejects malformed storage and does not leak another origin or purpose', async () => {
    localStorage.setItem('nault-device-unlock-prf-v1-wallet', '{"v":1,"id":"bad"}');
    expect(service.has('wallet')).toBeFalse();
    await expectAsync(service.unlock('wallet', 'anything')).toBeRejected();
    expect(service.has('pow')).toBeFalse();
  });

  it('disables Windows device operations without removing an existing enrollment', async () => {
    await service.enroll('pow', 'vault passphrase', 'vault-v2');
    const existingRecord = localStorage.getItem('nault-device-unlock-prf-v1-pow');
    expect(existingRecord).toBeTruthy();

    spyOnProperty(navigator, 'platform', 'get').and.returnValue('Win32');
    const windowsService = new DeviceUnlockService();
    expect(await windowsService.isSupported()).toBeFalse();
    await expectAsync(windowsService.enroll('pow', 'other password', 'vault-v2'))
      .toBeRejectedWithError('Secure device unlock is not available');
    await expectAsync(windowsService.unlock('pow', 'vault-v2'))
      .toBeRejectedWithError('Secure device unlock is not available');
    expect(localStorage.getItem('nault-device-unlock-prf-v1-pow')).toBe(existingRecord);
  });

  it('removes only the requested per-purpose local enrollment', async () => {
    await service.enroll('pow', 'vault passphrase', 'vault-v2');
    await service.enroll('wallet', 'wallet passphrase', 'seed:wallet-v2');
    service.remove('pow');
    expect(service.has('pow')).toBeFalse();
    expect(service.has('wallet')).toBeTrue();
    expect(await service.unlock('wallet', 'seed:wallet-v2')).toBe('wallet passphrase');
  });
});
