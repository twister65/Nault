import * as CryptoJS from 'crypto-js';

/**
 * S-01: Software-wallet secrets at rest. Ledger device seeds never pass here.
 * Legacy CryptoJS/OpenSSL payloads are READ ONLY; new writes are authenticated v2.
 */
export type SoftwareWalletKind = 'seed' | 'privateKey' | 'expandedKey';

export const MIN_WALLET_PASSWORD_LENGTH = 12;
const PREFIX = 'nault:v2:';
const ITERATIONS = 600_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const MAX_PAYLOAD_LENGTH = 4096;

interface EncryptedSecretV2 {
  v: 2;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  cipher: 'AES-256-GCM';
  iv: string;
  data: string;
}

function encode64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decode64(value: string): Uint8Array {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error('Invalid encrypted wallet encoding');
  }
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  if (encode64(bytes) !== value) throw new Error('Invalid encrypted wallet encoding');
  return bytes;
}

function assertSecret(secret: string): void {
  if (typeof secret !== 'string' || !/^[0-9a-fA-F]{64}$/.test(secret)) {
    throw new Error('Invalid software wallet secret');
  }
}

export function isStrongWalletPassword(password: string): boolean {
  return typeof password === 'string' && password.trim().length >= MIN_WALLET_PASSWORD_LENGTH;
}

export function isLegacyWalletCiphertext(value: string): boolean {
  return typeof value === 'string' && value.startsWith('U2FsdGVkX1');
}

export function isModernWalletCiphertext(value: string): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  if (!globalThis.crypto?.subtle) throw new Error('Secure WebCrypto context required');
  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

function authenticatedContext(kind: SoftwareWalletKind): Uint8Array {
  return new TextEncoder().encode('nault-wallet:v2:' + kind);
}

/** Never call with a Ledger secret. Outputs a versioned, salted AEAD envelope. */
export async function encryptWalletSecret(
  secret: string, password: string, kind: SoftwareWalletKind
): Promise<string> {
  assertSecret(secret);
  if (!isStrongWalletPassword(password)) throw new Error('Weak wallet password');
  if (!globalThis.crypto?.subtle) throw new Error('Secure WebCrypto context required');

  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: authenticatedContext(kind), tagLength: 128 },
    key, new TextEncoder().encode(secret)
  );
  const envelope: EncryptedSecretV2 = {
    v: 2, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: encode64(salt),
    cipher: 'AES-256-GCM', iv: encode64(iv), data: encode64(new Uint8Array(ciphertext))
  };
  return PREFIX + encode64(new TextEncoder().encode(JSON.stringify(envelope)));
}

/**
 * Reads v2 and historic CryptoJS/OpenSSL backups. Does not rewrite legacy data.
 * Errors deliberately do not distinguish incorrect passwords from corrupted data.
 */
export async function decryptWalletSecret(
  stored: string, password: string, kind: SoftwareWalletKind
): Promise<string> {
  if (typeof stored !== 'string' || stored.length > MAX_PAYLOAD_LENGTH ||
      typeof password !== 'string' || !password) throw new Error('Invalid encrypted wallet');

  if (stored.startsWith(PREFIX)) {
    const json = new TextDecoder('utf-8', { fatal: true }).decode(decode64(stored.slice(PREFIX.length)));
    const envelope = JSON.parse(json) as EncryptedSecretV2;
    if (!envelope || envelope.v !== 2 || envelope.kdf !== 'PBKDF2-SHA256' ||
        envelope.iterations !== ITERATIONS || envelope.cipher !== 'AES-256-GCM') {
      throw new Error('Unsupported encrypted wallet format');
    }
    const salt = decode64(envelope.salt);
    const iv = decode64(envelope.iv);
    const data = decode64(envelope.data);
    if (salt.length !== SALT_LENGTH || iv.length !== IV_LENGTH ||
        data.length !== 80) throw new Error('Invalid encrypted wallet');
    const key = await deriveKey(password, salt);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: authenticatedContext(kind), tagLength: 128 },
      key, data
    );
    const secret = new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
    assertSecret(secret);
    return secret;
  }

  // Unknown versions must not silently fall through to the unauthenticated reader.
  if (!isLegacyWalletCiphertext(stored)) throw new Error('Unsupported encrypted wallet format');
  try {
    const bytes = CryptoJS.AES.decrypt(stored, password);
    const secret = bytes.toString(CryptoJS.enc.Utf8);
    assertSecret(secret);
    return secret;
  } catch {
    throw new Error('Invalid encrypted wallet');
  }
}
