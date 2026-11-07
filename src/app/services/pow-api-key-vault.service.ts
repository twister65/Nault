import { Injectable } from '@angular/core';

/**
 * Credential vault for optional, public Nano PoW services only.
 * Never store plaintext keys in AppSettings, wallet exports, URL parameters,
 * browser sessionStorage, logs, or Electron IPC. PWA credentials can only be
 * used after the user unlocks them once in the current runtime session.
 */
export type PoWApiProvider = 'nano-to' | 'nanswap';
type CredentialMap = Partial<Record<PoWApiProvider, string>>;

interface VaultEnvelope {
  v: 1;
  salt: string;
  iv: string;
  data: string;
}

const VAULT_KEY = 'nault-pow-provider-keys-v1';
const ITERATIONS = 600_000;
const AAD = new TextEncoder().encode('nault:pow-api-keys:v1');
const SUPPORTED: PoWApiProvider[] = ['nano-to', 'nanswap'];

function encodeBase64(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}
function decodeBase64(encoded: string): Uint8Array<ArrayBuffer> {
  if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error('Invalid encrypted credentials');
  }
  const value = atob(encoded);
  const result = new Uint8Array(value.length);
  for (let i = 0; i < result.length; i++) result[i] = value.charCodeAt(i);
  if (encodeBase64(result) !== encoded) throw new Error('Invalid encrypted credentials');
  return result;
}
function getCrypto(): Crypto {
  if (!globalThis.crypto?.subtle || !globalThis.crypto.getRandomValues) {
    throw new Error('Secure WebCrypto context required');
  }
  return globalThis.crypto;
}
async function keyFromPassphrase(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const crypto = getCrypto();
  const base = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}
function readEnvelope(): VaultEnvelope | null {
  const stored = localStorage.getItem(VAULT_KEY);
  if (!stored) return null;
  if (stored.length > 12000) throw new Error('Invalid encrypted credentials');
  try {
    const envelope = JSON.parse(stored) as VaultEnvelope;
    if (!envelope || envelope.v !== 1 ||
        decodeBase64(envelope.salt).length !== 16 ||
        decodeBase64(envelope.iv).length !== 12 ||
        decodeBase64(envelope.data).length < 17 ||
        decodeBase64(envelope.data).length > 4096) throw new Error();
    return envelope;
  } catch (_) { throw new Error('Invalid encrypted credentials'); }
}
function checkKeys(value: unknown): CredentialMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid encrypted credentials');
  }
  const parsed = value as Record<string, unknown>;
  if (Object.keys(parsed).some(key => !SUPPORTED.includes(key as PoWApiProvider))) {
    throw new Error('Invalid encrypted credentials');
  }
  const keys: CredentialMap = {};
  for (const provider of SUPPORTED) {
    const secret = parsed[provider];
    if (secret === undefined) continue;
    if (typeof secret !== 'string' || secret.length < 8 || secret.length > 1024 ||
        /[\r\n\x00-\x1f]/.test(secret)) throw new Error('Invalid encrypted credentials');
    keys[provider] = secret;
  }
  return keys;
}
function checkPassphrase(passphrase: string): void {
  if (typeof passphrase !== 'string' || passphrase.trim().length < 12) {
    throw new Error('A vault passphrase of at least 12 characters is required');
  }
}

@Injectable({ providedIn: 'root' })
export class PoWApiKeyVaultService {
  private keys: CredentialMap = {};
  private unlocked = false;
  // A one-shot boot gate prevents restored-wallet work precomputation from
  // declaring an encrypted paid PoW source unavailable before the user has
  // answered the optional vault prompt. No passphrase is held in the gate.
  private startupDecision: Promise<void> | null = null;
  private finishStartupDecision: (() => void) | null = null;

  beginStartupUnlockDecision(): void {
    if (!this.hasVault || this.unlocked || this.startupDecision) return;
    this.startupDecision = new Promise<void>(resolve => {
      this.finishStartupDecision = resolve;
    });
  }
  resolveStartupUnlockDecision(): void {
    const finish = this.finishStartupDecision;
    this.finishStartupDecision = null;
    this.startupDecision = null;
    finish?.();
  }
  async waitForStartupUnlockDecision(url: string): Promise<void> {
    if (PoWApiKeyVaultService.providerForUrl(url) && this.startupDecision) {
      await this.startupDecision;
    }
  }

  get hasVault(): boolean { return localStorage.getItem(VAULT_KEY) !== null; }
  get isUnlocked(): boolean { return this.unlocked; }
  hasKey(provider: PoWApiProvider): boolean {
    return this.unlocked && !!this.keys[provider];
  }
  unlockedProviders(): PoWApiProvider[] {
    return this.unlocked ? SUPPORTED.filter(provider => !!this.keys[provider]) : [];
  }
  // Never return keys for other hosts, alternate paths, redirects or URL auth.
  static providerForUrl(url: string): PoWApiProvider | null {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
          parsed.search || parsed.hash || parsed.port) return null;
      if (parsed.hostname === 'rpc.nano.to' && parsed.pathname === '/') return 'nano-to';
      if (parsed.hostname === 'nodes.nanswap.com' && parsed.pathname === '/XNO') return 'nanswap';
    } catch (_) { /* Invalid URL: never attach credentials. */ }
    return null;
  }
  getAuthorizedHeaders(url: string): Record<string, string> | null {
    const provider = PoWApiKeyVaultService.providerForUrl(url);
    if (!provider || !this.unlocked || !this.keys[provider]) return null;
    return provider === 'nano-to'
      ? { Authorization: 'Bearer ' + this.keys[provider] }
      : { 'nodes-api-key': this.keys[provider]! };
  }
  lock(): void {
    this.keys = {};
    this.unlocked = false;
  }
  async unlock(passphrase: string): Promise<void> {
    this.lock();
    const envelope = readEnvelope();
    if (!envelope) throw new Error('No API keys have been saved');
    try {
      const salt = decodeBase64(envelope.salt);
      const key = await keyFromPassphrase(passphrase, salt);
      const plaintext = await getCrypto().subtle.decrypt(
        { name: 'AES-GCM', iv: decodeBase64(envelope.iv), additionalData: AAD },
        key, decodeBase64(envelope.data)
      );
      const keys = checkKeys(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext)));
      this.keys = keys;
      this.unlocked = true;
    } catch (_) {
      this.lock();
      throw new Error('Incorrect passphrase or corrupted credential vault');
    }
  }
  private async seal(keys: CredentialMap, passphrase: string): Promise<void> {
    checkPassphrase(passphrase);
    const crypto = getCrypto();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await keyFromPassphrase(passphrase, salt);
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: AAD, tagLength: 128 },
      key, new TextEncoder().encode(JSON.stringify(keys))
    );
    const envelope: VaultEnvelope = {
      v: 1, salt: encodeBase64(salt), iv: encodeBase64(iv),
      data: encodeBase64(new Uint8Array(ciphertext))
    };
    localStorage.setItem(VAULT_KEY, JSON.stringify(envelope));
    this.keys = keys;
    this.unlocked = true;
  }
  async saveKey(provider: PoWApiProvider, rawKey: string, passphrase: string): Promise<void> {
    if (!SUPPORTED.includes(provider)) throw new Error('Unknown PoW API provider');
    const value = rawKey?.trim();
    if (!value || value.length < 8 || value.length > 1024 ||
        /[\r\n\x00-\x1f]/.test(value)) throw new Error('Invalid API key');
    checkPassphrase(passphrase);
    if (this.hasVault) await this.unlock(passphrase);
    await this.seal({ ...this.keys, [provider]: value }, passphrase);
  }
  async removeKey(provider: PoWApiProvider, passphrase: string): Promise<void> {
    if (!SUPPORTED.includes(provider)) throw new Error('Unknown PoW API provider');
    checkPassphrase(passphrase);
    if (this.hasVault) await this.unlock(passphrase);
    const keys = { ...this.keys };
    delete keys[provider];
    if (Object.keys(keys).length === 0) {
      localStorage.removeItem(VAULT_KEY);
      this.lock();
    } else {
      await this.seal(keys, passphrase);
    }
  }
}
