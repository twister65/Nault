/**
 * BIP39 English mnemonics for Angular's native browser/Vite build.
 *
 * The legacy bip39 package uses Node's create-hash -> stream.Transform,
 * which is not available in browsers without a Node polyfill. Keep its
 * authoritative 2048-word English list, but use native WebCrypto SHA-256
 * for the BIP39 checksum. No seed or mnemonic is logged or stored here.
 *
 * See BIP-39: https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki
 */
import englishWords from 'bip39/src/wordlists/english.json';

const words: readonly string[] = englishWords;
const wordIndexes = new Map<string, number>(words.map((word, index) => [word, index]));

function assertWordlist(): void {
  if (words.length !== 2048 || wordIndexes.size !== 2048) {
    throw new Error('Invalid BIP39 English wordlist');
  }
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  if (!/^[a-fA-F0-9]+$/.test(hex) || hex.length < 32 || hex.length > 64 ||
      hex.length % 8 !== 0) {
    throw new Error('Invalid BIP39 entropy');
  }
  return Uint8Array.from(hex.match(/../g)!, pair => parseInt(pair, 16));
}

function byteBits(bytes: Uint8Array): string {
  return Array.from(bytes, value => value.toString(2).padStart(8, '0')).join('');
}

async function checksumBits(entropy: Uint8Array<ArrayBuffer>): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Secure WebCrypto context required');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', entropy));
  return byteBits(digest).slice(0, entropy.length / 4);
}

/** Convert 128-256 bits of entropy to the original BIP39 English words. */
export async function entropyToMnemonic(entropyHex: string): Promise<string> {
  assertWordlist();
  const entropy = hexToBytes(entropyHex);
  const bits = byteBits(entropy) + await checksumBits(entropy);
  const result: string[] = [];
  for (let pos = 0; pos < bits.length; pos += 11) {
    result.push(words[parseInt(bits.slice(pos, pos + 11), 2)]);
  }
  return result.join(' ');
}

/** Restore original entropy only after verifying the BIP39 SHA-256 checksum. */
export async function mnemonicToEntropy(mnemonic: string): Promise<string> {
  assertWordlist();
  if (typeof mnemonic !== 'string') throw new Error('Invalid BIP39 mnemonic');
  const input = mnemonic.normalize('NFKD').split(' ');
  if (![12, 15, 18, 21, 24].includes(input.length)) {
    throw new Error('Invalid BIP39 mnemonic length');
  }

  const indexes = input.map(word => wordIndexes.get(word));
  if (indexes.some(index => index === undefined)) {
    throw new Error('Unknown BIP39 mnemonic word');
  }

  const bits = indexes.map(index => index!.toString(2).padStart(11, '0')).join('');
  const entropyBitLength = (bits.length / 33) * 32;
  const entropyBits = bits.slice(0, entropyBitLength);
  const checksum = bits.slice(entropyBitLength);
  const entropy = new Uint8Array(entropyBitLength / 8);
  for (let i = 0; i < entropy.length; i++) {
    entropy[i] = parseInt(entropyBits.slice(i * 8, (i + 1) * 8), 2);
  }
  if (checksum !== await checksumBits(entropy)) {
    throw new Error('Invalid BIP39 mnemonic checksum');
  }
  return Array.from(entropy, value => value.toString(16).padStart(2, '0')).join('');
}

export async function validateMnemonic(mnemonic: string): Promise<boolean> {
  try {
    await mnemonicToEntropy(mnemonic);
    return true;
  } catch {
    return false;
  }
}

/**
 * BIP39 mnemonic + optional passphrase -> 64-byte derivation.
 * Preserve Nault's previous UTF-8 input handling so historical imported
 * wallets derive the same accounts, including for non-ASCII inputs.
 * The KDF is PBKDF2-HMAC-SHA512, 2048 rounds, exactly as before.
 */
export async function mnemonicToSeedHex(mnemonic: string, password = ''): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Secure WebCrypto context required');
  const encoder = new TextEncoder();
  const material = await crypto.subtle.importKey(
    'raw', encoder.encode(mnemonic), 'PBKDF2', false, ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-512', iterations: 2048, salt: encoder.encode('mnemonic' + password) },
    material, 512
  );
  return Array.from(new Uint8Array(derived), value => value.toString(16).padStart(2, '0')).join('');
}
