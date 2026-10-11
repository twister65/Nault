import * as path from 'path';
import { URL } from 'url';

export const APP_WALLET_URL = 'nault-app://wallet/index.html';

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
