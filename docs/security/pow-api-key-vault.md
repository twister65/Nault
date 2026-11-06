# Encrypted Nano PoW API-key vault — PR #86

## Scope

Nault supports two opt-in **work_generate-only** credential providers:

| Provider | Exact HTTPS PoW endpoint | Authentication |
| --- | --- | --- |
| Nano.to | `https://rpc.nano.to/` | `Authorization: Bearer <key>` |
| Nanswap | `https://nodes.nanswap.com/XNO` | `nodes-api-key: <key>` |

Only the **PoW service** may read decrypted credentials, and only after the user
unlocks the local vault. No wallet RPC reads, signed `process` request, WebSocket,
node-probe, backup QR code or saved AppSettings receive a credential.

Never put an API key in a URL, custom server string, source control, issue, log,
browser console, screenshot or exported Nault configuration.

## Persistence and unlock

- Each origin/profile has its own encrypted localStorage envelope under
  `nault-pow-provider-keys-v1`. No plaintext or password is stored there.
- WebCrypto AES-256-GCM with 96-bit random IV, 128-bit authentication tag and
  authenticated context binds the ciphertext to the PoW key vault.
- PBKDF2-HMAC-SHA256 with 600,000 iterations and 128-bit random salt derives
  the key from a separate passphrase of at least 12 characters.
- Credentials are decrypted **into memory only after explicit unlock** and
  cleared on Lock or application reload. A fresh Android PWA / Electron launch
  **does not auto-unlock**; unauthenticated/default PoW remains available.
- Change the key by entering the API key and passphrase again. Removing the last
  provider deletes the ciphertext entirely.

## Network and trust boundaries

- Only the two strict HTTPS URL/path matches can receive a credential.
  Requests use `POST`, `redirect: error`, `credentials: omit`,
  `referrerPolicy: no-referrer`, and an abort timeout.
- Never place credentials in query strings or URL userinfo. The settings UI
  refuses credential-bearing URLs for the supported providers.
- A provider's `work_generate` reply is validated locally against the
  requested PoW root and difficulty before use.
- A failed PoW can trigger bounded work-only fallbacks. The **wallet's RPC
  server and any signed block submission remain unchanged**.
- The existing fallback policy pins authenticated/local RPC settings and
  private network endpoints. Never forward private RPC authentication to
  public PoW services.
- Authenticated requests from a browser require the provider's CORS policy
  to permit the required custom request header. Successful **production**
  Android/desktop hardware tests are needed before considering the feature
  ready.

## Security limitations

A passphrase-derived local vault protects keys **at rest** from simple
localStorage leakage. It does **not** prevent malware, injected scripts,
compromised same-origin JavaScript, malicious browser extensions, devtools or
a compromised running device from accessing keys while the vault is unlocked.

For secrets that must **never** be accessible to the browser, use a separately
authenticated private server-side proxy with a proper access policy, quota
limits and CSRF protections; merely hiding a key in an Angular build or
unprotected Apache reverse proxy is not protection.

Users should obtain **dedicated, restricted, revocable and usage-limited API
keys** and revoke a key immediately if exposed. Never reuse their wallet seed
or wallet-unlock password as a PoW provider key.
