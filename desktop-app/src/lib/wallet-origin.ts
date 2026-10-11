import * as path from 'path';
import { URL } from 'url';

// Do not use new URL(APP_WALLET_URL).origin: Node's WHATWG URL parser
// returns "null" for custom schemes, even when Electron registers them
// as secure/standard Chromium origins.
export const APP_WALLET_ORIGIN = 'nault-app://wallet';
export const APP_WALLET_URL = APP_WALLET_ORIGIN + '/index.html';

export function isTrustedWalletDocument(candidate: string, expected: string): boolean {
  try {
    const parsed = new URL(candidate);
    parsed.hash = '';
    return parsed.href === expected;
  } catch (_error) {
    return false;
  }
}

export function isPathInsideRoot(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return relative !== '' &&
    relative !== '..' &&
    !relative.startsWith('..' + path.sep) &&
    !path.isAbsolute(relative);
}
