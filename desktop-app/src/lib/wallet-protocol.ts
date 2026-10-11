import { net, protocol } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL, URL } from 'url';

// Separate from the OS-level "nano:" deep link schemes.
const WALLET_SCHEME = 'nault-app';
const WALLET_HOST = 'wallet';
export const APP_WALLET_URL = `${WALLET_SCHEME}://${WALLET_HOST}/index.html`;

// Must run before app.ready. Never bypass CSP or enable Service Workers.
export function registerWalletScheme(): void {
  protocol.registerSchemesAsPrivileged([{
    scheme: WALLET_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }]);
}

// Only the exact index page may use Ledger IPC; #hash routes are fine.
export function isTrustedWalletDocument(candidate: string, expected: string): boolean {
  try {
    const parsed = new URL(candidate);
    parsed.hash = '';
    return parsed.href === expected;
  } catch (_error) {
    return false;
  }
}

// Perform this check on canonical (realpath) paths to deny symlink escape.
export function isPathInsideRoot(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return relative !== '' &&
    relative !== '..' &&
    !relative.startsWith('..' + path.sep) &&
    !path.isAbsolute(relative);
}

// Only serve regular bundled dist/ files under nault-app://wallet.
// Installed after app.ready, before BrowserWindow.loadURL().
export function registerWalletFileProtocol(distDirectory: string): void {
  const root = path.resolve(distDirectory);
  const realRoot = fs.promises.realpath(root);

  protocol.handle(WALLET_SCHEME, async request => {
    try {
      const requested = new URL(request.url);
      if (requested.protocol !== WALLET_SCHEME + ':' ||
          requested.hostname !== WALLET_HOST ||
          requested.username || requested.password || requested.port) {
        return new Response('Forbidden', { status: 403 });
      }

      const relativeFile = decodeURIComponent(requested.pathname.slice(1));
      if (!relativeFile || relativeFile.includes('\\') || relativeFile.includes('\0')) {
        return new Response('Not found', { status: 404 });
      }

      const realFile = await fs.promises.realpath(path.resolve(root, relativeFile));
      if (!isPathInsideRoot(await realRoot, realFile)) {
        return new Response('Forbidden', { status: 403 });
      }
      const fileInfo = await fs.promises.stat(realFile);
      if (!fileInfo.isFile()) {
        return new Response('Not found', { status: 404 });
      }

      return net.fetch(pathToFileURL(realFile).toString());
    } catch (_error) {
      return new Response('Not found', { status: 404 });
    }
  });
}
