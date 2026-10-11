import { net, protocol } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL, URL } from 'url';
import { APP_WALLET_URL, isTrustedWalletDocument, isPathInsideRoot } from './wallet-origin';
export { APP_WALLET_URL, isTrustedWalletDocument } from './wallet-origin';

// Separate from the OS-level "nano:" deep link schemes.
const WALLET_SCHEME = 'nault-app';
const WALLET_HOST = 'wallet';
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
