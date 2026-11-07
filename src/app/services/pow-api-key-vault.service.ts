import { Injectable } from '@angular/core';

/**
 * Optional PoW provider credentials. Secrets and the active-key selection
 * stay encrypted in a per-origin WebCrypto vault, never in AppSettings,
 * wallet exports, URLs, logs, service workers or Electron IPC.
 *
 * Non-secret provider/key labels are exposed as metadata for the locked UI.
 * They are authenticated together with the ciphertext when unlocking.
 */
export type PoWApiProvider = 'nano-to' | 'nanswap';
export interface PoWApiKeySummary {
  id: string;
  provider: PoWApiProvider;
  label: string;
  active: boolean;
}
interface StoredKey {
  id: string;
  provider: PoWApiProvider;
  label: string;
  secret: string;
}
interface VaultData {
  entries: StoredKey[];
  active: Partial<Record<PoWApiProvider, string>>;
}
interface VaultEnvelope {
  v: 1 | 2;
  salt: string;
  iv: string;
  data: string;
  metadata?: PoWApiKeySummary[];
}

const VAULT_KEY = 'nault-pow-provider-keys-v1'; // retain existing encrypted vaults
const ITERATIONS = 600_000;
const LEGACY_AAD = new TextEncoder().encode('nault:pow-api-keys:v1');
const SUPPORTED: PoWApiProvider[] = ['nano-to', 'nanswap'];
const MAX_KEYS = 16;
const MAX_LABEL = 64;

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
function newId(): string {
  return Array.from(getCrypto().getRandomValues(new Uint8Array(16)))
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function checkPassphrase(passphrase: string): void {
  if (typeof passphrase !== 'string' || passphrase.trim().length < 12) {
    throw new Error('A vault passphrase of at least 12 characters is required');
  }
}
function checkSecret(secret: unknown): string {
  if (typeof secret !== 'string' || secret.length < 8 || secret.length > 1024 ||
      /[\r\n\x00-\x1f]/.test(secret)) throw new Error('Invalid API key');
  return secret;
}
function checkLabel(label: unknown): string {
  if (typeof label !== 'string' || !label.trim() || label.trim().length > MAX_LABEL ||
      /[\x00-\x1f\x7f]/.test(label)) throw new Error('Invalid key label');
  return label.trim();
}
function checkMetadata(value: unknown): PoWApiKeySummary[] {
  if (!Array.isArray(value) || value.length > MAX_KEYS) {
    throw new Error('Invalid encrypted credentials');
  }
  const ids = new Set<string>();
  const activeProviders = new Set<string>();
  const seenProviders = new Set<string>();
  const entries: PoWApiKeySummary[] = [];
  for (const element of value) {
    if (!element || typeof element !== 'object' ||
        !/^[0-9a-f]{32}$/.test(element.id) ||
        !SUPPORTED.includes(element.provider) || typeof element.active !== 'boolean') {
      throw new Error('Invalid encrypted credentials');
    }
    const label = checkLabel(element.label);
    if (ids.has(element.id)) throw new Error('Duplicate key ID');
    ids.add(element.id);
    seenProviders.add(element.provider);
    if (element.active) {
      if (activeProviders.has(element.provider)) throw new Error('Duplicate active key');
      activeProviders.add(element.provider);
    }
    entries.push({ id: element.id, provider: element.provider, label, active: element.active });
  }
  if ([...seenProviders].some(provider => !activeProviders.has(provider))) {
    throw new Error('Missing active key');
  }
  return entries;
}
function checkLegacy(value: unknown): VaultData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid encrypted credentials');
  }
  const parsed = value as Record<string, unknown>;
  if (Object.keys(parsed).some(key => !SUPPORTED.includes(key as PoWApiProvider))) {
    throw new Error('Invalid encrypted credentials');
  }
  const entries: StoredKey[] = [];
  const active: VaultData['active'] = {};
  for (const provider of SUPPORTED) {
    if (parsed[provider] === undefined) continue;
    const id = newId();
    entries.push({ id, provider, label: (provider === 'nano-to' ? 'Nano.to' : 'Nanswap') + ' 1',
      secret: checkSecret(parsed[provider]) });
    active[provider] = id;
  }
  return { entries, active };
}
function summaries(data: VaultData): PoWApiKeySummary[] {
  return data.entries.map(({ id, provider, label }) => ({
    id, provider, label, active: data.active[provider] === id
  }));
}
function checkData(value: unknown): VaultData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid encrypted credentials');
  }
  const obj = value as Record<string, unknown>;
  if (!Array.isArray(obj.entries) || !obj.active || typeof obj.active !== 'object' ||
      Array.isArray(obj.active) || Object.keys(obj.active).some(key =>
        !SUPPORTED.includes(key as PoWApiProvider))) throw new Error('Invalid encrypted credentials');
  const entries: StoredKey[] = obj.entries.map((entry: StoredKey) => ({
    id: entry?.id, provider: entry?.provider, label: checkLabel(entry?.label),
    secret: checkSecret(entry?.secret)
  }));
  const active = obj.active as VaultData['active'];
  const verified = checkMetadata(entries.map(entry => ({
    id: entry.id, provider: entry.provider, label: entry.label, active: active[entry.provider] === entry.id
  })));
  if (verified.length !== entries.length || SUPPORTED.some(provider =>
      !!active[provider] !== entries.some(entry => entry.provider === provider))) {
    throw new Error('Invalid encrypted credentials');
  }
  return { entries, active: { ...active } };
}
function authenticatedMetadata(metadata: PoWApiKeySummary[]): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode('nault:pow-api-keys:v2:' + JSON.stringify(metadata));
}
function readEnvelope(): VaultEnvelope | null {
  const stored = localStorage.getItem(VAULT_KEY);
  if (!stored) return null;
  if (stored.length > 44000) throw new Error('Invalid encrypted credentials');
  try {
    const envelope = JSON.parse(stored) as VaultEnvelope;
    if (!envelope || (envelope.v !== 1 && envelope.v !== 2) ||
        decodeBase64(envelope.salt).length !== 16 ||
        decodeBase64(envelope.iv).length !== 12 ||
        decodeBase64(envelope.data).length < 17 ||
        decodeBase64(envelope.data).length > 32000) throw new Error();
    if (envelope.v === 2) {
      envelope.metadata = checkMetadata(envelope.metadata);
    }
    return envelope;
  } catch (_) { throw new Error('Invalid encrypted credentials'); }
}

@Injectable({ providedIn: 'root' })
export class PoWApiKeyVaultService {
  private data: VaultData = { entries: [], active: {} };
  private unlocked = false;
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
  get needsLegacyUnlock(): boolean {
    return this.hasVault && !this.unlocked && readEnvelope()?.v === 1;
  }
  getKeySummaries(provider?: PoWApiProvider): PoWApiKeySummary[] {
    const all = this.unlocked ? summaries(this.data) : (readEnvelope()?.metadata || []);
    return provider ? all.filter(entry => entry.provider === provider) : all;
  }
  hasKey(provider: PoWApiProvider): boolean {
    return this.unlocked && this.data.entries.some(entry =>
      entry.provider === provider && entry.id === this.data.active[provider]);
  }
  unlockedProviders(): PoWApiProvider[] {
    return this.unlocked ? SUPPORTED.filter(provider => this.hasKey(provider)) : [];
  }
  static providerForUrl(url: string): PoWApiProvider | null {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
          parsed.search || parsed.hash || parsed.port) return null;
      if (parsed.hostname === 'rpc.nano.to' && parsed.pathname === '/') return 'nano-to';
      if (parsed.hostname === 'nodes.nanswap.com' && parsed.pathname === '/XNO') return 'nanswap';
    } catch (_) { /* Never attach credentials to invalid URLs. */ }
    return null;
  }
  getAuthorizedHeaders(url: string): Record<string, string> | null {
    const provider = PoWApiKeyVaultService.providerForUrl(url);
    if (!provider || !this.unlocked) return null;
    const active = this.data.entries.find(entry =>
      entry.provider === provider && entry.id === this.data.active[provider]);
    if (!active) return null;
    return provider === 'nano-to'
      ? { Authorization: 'Bearer ' + active.secret }
      : { 'nodes-api-key': active.secret };
  }
  lock(): void {
    this.data = { entries: [], active: {} };
    this.unlocked = false;
  }
  // Deliberately destructive: only call after the user confirms an advanced
  // wallet-data/full-data reset. No passphrase is needed to erase ciphertext.
  // Remove both legacy v1 and current v2 via their shared storage key.
  clearVault(): void {
    try {
      localStorage.removeItem(VAULT_KEY);
    } finally {
      this.lock();
      // Do not leave a queued paid PoW request waiting on a now-deleted vault.
      this.resolveStartupUnlockDecision();
    }
  }
  async unlock(passphrase: string): Promise<void> {
    this.lock();
    const envelope = readEnvelope();
    if (!envelope) throw new Error('No API keys have been saved');
    try {
      const key = await keyFromPassphrase(passphrase, decodeBase64(envelope.salt));
      const plaintext = await getCrypto().subtle.decrypt(
        { name: 'AES-GCM', iv: decodeBase64(envelope.iv),
          additionalData: envelope.v === 1 ? LEGACY_AAD : authenticatedMetadata(envelope.metadata!) },
        key, decodeBase64(envelope.data)
      );
      const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
      const data = envelope.v === 1 ? checkLegacy(parsed) : checkData(parsed);
      if (envelope.v === 2 &&
          JSON.stringify(summaries(data)) !== JSON.stringify(envelope.metadata)) {
        throw new Error('Authenticated key labels do not match');
      }
      if (envelope.v === 1) {
        // Upgrade only after a successful legacy decrypt, keeping old keys.
        await this.seal(data, passphrase);
      } else {
        this.data = data;
        this.unlocked = true;
      }
    } catch (_) {
      this.lock();
      throw new Error('Incorrect passphrase or corrupted credential vault');
    }
  }
  private async seal(data: VaultData, passphrase: string): Promise<void> {
    checkPassphrase(passphrase);
    const checked = checkData(data);
    const metadata = summaries(checked);
    const crypto = getCrypto();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await keyFromPassphrase(passphrase, salt);
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: authenticatedMetadata(metadata), tagLength: 128 },
      key, new TextEncoder().encode(JSON.stringify(checked))
    );
    const envelope: VaultEnvelope = {
      v: 2, salt: encodeBase64(salt), iv: encodeBase64(iv),
      data: encodeBase64(new Uint8Array(ciphertext)), metadata
    };
    localStorage.setItem(VAULT_KEY, JSON.stringify(envelope));
    this.data = checked;
    this.unlocked = true;
  }
  async saveKey(provider: PoWApiProvider, rawKey: string, passphrase: string, label = ''): Promise<string> {
    if (!SUPPORTED.includes(provider)) throw new Error('Unknown PoW API provider');
    const secret = checkSecret(rawKey?.trim());
    checkPassphrase(passphrase);
    if (this.hasVault) await this.unlock(passphrase);
    if (this.data.entries.length >= MAX_KEYS) throw new Error('PoW key vault is full');
    const count = this.data.entries.filter(entry => entry.provider === provider).length;
    const base = provider === 'nano-to' ? 'Nano.to' : 'Nanswap';
    const proposed = label.trim() || base + ' ' + (count + 1);
    const name = checkLabel(proposed);
    if (this.data.entries.some(entry => entry.provider === provider &&
        entry.label.toLowerCase() === name.toLowerCase())) throw new Error('Duplicate key label');
    const id = newId();
    const entries = [...this.data.entries, { id, provider, label: name, secret }];
    await this.seal({ entries, active: { ...this.data.active, [provider]: id } }, passphrase);
    return id;
  }
  async activateKey(provider: PoWApiProvider, id: string, passphrase: string): Promise<void> {
    if (!SUPPORTED.includes(provider)) throw new Error('Unknown PoW API provider');
    checkPassphrase(passphrase);
    await this.unlock(passphrase);
    if (!this.data.entries.some(entry => entry.provider === provider && entry.id === id)) {
      throw new Error('Selected key not found');
    }
    await this.seal({
      entries: this.data.entries, active: { ...this.data.active, [provider]: id }
    }, passphrase);
  }
  async removeKey(provider: PoWApiProvider, passphrase: string, id?: string): Promise<void> {
    if (!SUPPORTED.includes(provider)) throw new Error('Unknown PoW API provider');
    checkPassphrase(passphrase);
    if (!this.hasVault) throw new Error('No API keys have been saved');
    await this.unlock(passphrase);
    const matches = this.data.entries.filter(entry => entry.provider === provider);
    const chosen = id || (matches.length === 1 ? matches[0].id : null);
    if (!chosen || !matches.some(entry => entry.id === chosen)) throw new Error('Select a key to delete');
    const entries = this.data.entries.filter(entry => entry.id !== chosen);
    if (!entries.length) {
      localStorage.removeItem(VAULT_KEY);
      this.lock();
      return;
    }
    const active = { ...this.data.active };
    if (active[provider] === chosen) {
      const next = entries.find(entry => entry.provider === provider);
      if (next) active[provider] = next.id;
      else delete active[provider];
    }
    await this.seal({ entries, active }, passphrase);
  }
}
