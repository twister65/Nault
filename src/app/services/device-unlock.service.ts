import { Injectable } from '@angular/core';

/**
 * Optional, per-origin quick unlock using WebAuthn's PRF extension.
 *
 * A platform authenticator must perform user verification AND release a
 * credential-specific PRF result. A simple "biometric succeeded" boolean is
 * not a decryption key and must never unlock the wallet by itself.
 *
 * The existing wallet/vault password remains the recovery method. Only an
 * AES-GCM ciphertext of that password is persisted, not the password, seed,
 * API keys or an unprotected reusable encryption key.
 */
export type DeviceUnlockPurpose = 'wallet' | 'pow';

interface WrappedPassword {
  v: 1;
  id: string;
  salt: string;
  iv: string;
  binding: string;
  data: string;
}
interface PrfOutputs {
  prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } };
}
type PrfExtensions = AuthenticationExtensionsClientInputs & {
  prf: { eval: { first: Uint8Array<ArrayBuffer> } };
};
const PREFIX = 'nault-device-unlock-prf-v1-';
const MAX_STORAGE_LENGTH = 4096;

function secureCrypto(): Crypto {
  if (!globalThis.crypto?.subtle || !globalThis.crypto.getRandomValues) {
    throw new Error('Secure WebCrypto context required');
  }
  return globalThis.crypto;
}
function randomBytes(size: number): Uint8Array<ArrayBuffer> {
  return secureCrypto().getRandomValues(new Uint8Array(size));
}
function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unbase64url(input: string): Uint8Array<ArrayBuffer> {
  if (typeof input !== 'string' || !/^[A-Za-z0-9_-]{2,1400}$/.test(input)) {
    throw new Error('Invalid device unlock record');
  }
  const encoded = input.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  if (base64url(bytes) !== input) throw new Error('Invalid device unlock record');
  return bytes;
}
function keyName(purpose: DeviceUnlockPurpose): string {
  if (purpose !== 'wallet' && purpose !== 'pow') throw new Error('Invalid unlock purpose');
  return PREFIX + purpose;
}
function readRecord(purpose: DeviceUnlockPurpose): WrappedPassword | null {
  const stored = localStorage.getItem(keyName(purpose));
  if (!stored) return null;
  if (stored.length > MAX_STORAGE_LENGTH) throw new Error('Invalid device unlock record');
  try {
    const record = JSON.parse(stored) as WrappedPassword;
    if (record?.v !== 1 || typeof record.binding !== 'string' ||
        !/^[0-9a-f]{64}$/.test(record.binding) ||
        unbase64url(record.id).length < 16 ||
        unbase64url(record.salt).length !== 32 ||
        unbase64url(record.iv).length !== 12 ||
        unbase64url(record.data).length < 17 ||
        unbase64url(record.data).length > 1024) {
      throw new Error();
    }
    return record;
  } catch {
    throw new Error('Invalid device unlock record');
  }
}
function prfValue(credential: PublicKeyCredential): Uint8Array<ArrayBuffer> | null {
  const results = (credential.getClientExtensionResults() as PrfOutputs).prf?.results;
  const value = results?.first;
  if (!value || value.byteLength !== 32) return null;
  return new Uint8Array(value);
}
async function wrappingKey(output: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return secureCrypto().subtle.importKey('raw', output, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function bindingDigest(purpose: DeviceUnlockPurpose, binding: string): Promise<string> {
  if (!binding) throw new Error('No encrypted data to unlock');
  const bytes = new TextEncoder().encode('nault:device-unlock:binding:v1:' + purpose + ':' + binding);
  const digest = await secureCrypto().subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
function additionalData(purpose: DeviceUnlockPurpose, digest: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode('nault:device-unlock:v1:' + location.origin + ':' + purpose + ':' + digest);
}

@Injectable({ providedIn: 'root' })
export class DeviceUnlockService {
  static removeStored(purpose: DeviceUnlockPurpose): void {
    localStorage.removeItem(keyName(purpose));
  }

  remove(purpose: DeviceUnlockPurpose): void {
    DeviceUnlockService.removeStored(purpose);
  }

  has(purpose: DeviceUnlockPurpose): boolean {
    try { return readRecord(purpose) !== null; } catch { return false; }
  }

  async isSupported(): Promise<boolean> {
    // file:// and custom schemes do not provide a reliable WebAuthn RP ID.
    if (!window.isSecureContext || !['https:', 'http:'].includes(location.protocol) ||
        (location.protocol === 'http:' &&
         !['localhost', '127.0.0.1'].includes(location.hostname)) ||
        !navigator.credentials?.create || !navigator.credentials?.get ||
        typeof PublicKeyCredential === 'undefined' ||
        typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') {
      return false;
    }
    try {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch { return false; }
  }

  // Separate methods permit deterministic authenticator mocks in unit tests.
  protected createCredential(options: PublicKeyCredentialCreationOptions): Promise<Credential | null> {
    return navigator.credentials.create({ publicKey: options });
  }
  protected getCredential(options: PublicKeyCredentialRequestOptions): Promise<Credential | null> {
    return navigator.credentials.get({ publicKey: options });
  }

  private async evaluate(id: string, salt: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
    const assertion = await this.getCredential({
      challenge: randomBytes(32),
      allowCredentials: [{ id: unbase64url(id), type: 'public-key', transports: ['internal'] }],
      userVerification: 'required',
      timeout: 60000,
      extensions: { prf: { eval: { first: salt } } } as PrfExtensions
    }) as PublicKeyCredential | null;
    if (!assertion || base64url(new Uint8Array(assertion.rawId)) !== id) {
      throw new Error('Device verification was not completed');
    }
    const output = prfValue(assertion);
    if (!output) throw new Error('Device does not support secure PRF unlock');
    return output;
  }

  async enroll(purpose: DeviceUnlockPurpose, password: string, binding: string): Promise<void> {
    if (!await this.isSupported()) throw new Error('Secure device unlock is not available');
    if (!password || !binding) throw new Error('Unlock with the password first');
    const digest = await bindingDigest(purpose, binding);
    const salt = randomBytes(32);
    const created = await this.createCredential({
      challenge: randomBytes(32),
      rp: { name: 'Nault' },
      user: { id: randomBytes(32), name: 'Nault local unlock', displayName: 'Nault local unlock' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: {
        authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred'
      },
      attestation: 'none',
      timeout: 60000,
      extensions: { prf: { eval: { first: salt } } } as PrfExtensions
    }) as PublicKeyCredential | null;
    if (!created?.rawId) throw new Error('Device credential not created');
    const id = base64url(new Uint8Array(created.rawId));
    const output = prfValue(created) || await this.evaluate(id, salt);
    const iv = randomBytes(12);
    const encrypted = await secureCrypto().subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: additionalData(purpose, digest) },
      await wrappingKey(output), new TextEncoder().encode(password)
    );
    const record: WrappedPassword = {
      v: 1, id, salt: base64url(salt), iv: base64url(iv),
      binding: digest, data: base64url(new Uint8Array(encrypted))
    };
    if (JSON.stringify(record).length > MAX_STORAGE_LENGTH) throw new Error('Invalid unlock record');
    // Enrollment must only be triggered after a verified password unlock.
    // Existing enrollment is never overwritten unless all steps succeed.
    localStorage.setItem(keyName(purpose), JSON.stringify(record));
  }

  async unlock(purpose: DeviceUnlockPurpose, binding: string): Promise<string> {
    if (!await this.isSupported()) throw new Error('Secure device unlock is not available');
    const record = readRecord(purpose);
    if (!record) throw new Error('Device unlock is not configured');
    const digest = await bindingDigest(purpose, binding);
    if (record.binding !== digest) throw new Error('Encrypted data changed; use the password');
    const snapshot = localStorage.getItem(keyName(purpose));
    const output = await this.evaluate(record.id, unbase64url(record.salt));
    if (localStorage.getItem(keyName(purpose)) !== snapshot) {
      throw new Error('Device unlock configuration changed');
    }
    try {
      const plaintext = await secureCrypto().subtle.decrypt(
        { name: 'AES-GCM', iv: unbase64url(record.iv), additionalData: additionalData(purpose, digest) },
        await wrappingKey(output), unbase64url(record.data)
      );
      const password = new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
      if (!password) throw new Error('Empty password');
      return password;
    } catch {
      throw new Error('Unable to decrypt device unlock password');
    }
  }
}
