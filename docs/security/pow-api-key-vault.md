# Encrypted Nano PoW API-key vault — PR #86

## Scope

Nault optionally integrates **Nano.to** for authenticated `work_generate` requests only.

| Third-party provider | Exact HTTPS PoW endpoint | Authentication |
| --- | --- | --- |
| Nano.to | `https://rpc.nano.to/` | `Authorization: Bearer <key>` |

This integration is compatible with **Nault's MIT-licensed source code**, but
Nano.to is an **independent third-party service**, not part of Nault and not
licensed by Nault's MIT license. The service has its own contractual and privacy
terms. Nault does not claim sponsorship, endorsement or affiliation.

- [Nano.to privacy policy](https://rpc.nano.to/privacy)
- [Nano.to terms of service](https://rpc.nano.to/terms)
- [Nano.to API key management](https://rpc.nano.to/account/api-keys)
- [Nault MIT license](https://github.com/twister65/Nault/blob/master/LICENSE)

Users obtain and manage their own Nano.to API keys. The settings screen links
to the key management page and both third-party policy pages. API keys are
entered into the encrypted local vault, **never** into a URL.

Only the **PoW service** may read decrypted credentials, and only after explicit
unlock. The chosen key is sent exclusively in an HTTPS `Authorization: Bearer`
header to `https://rpc.nano.to/` when generating `work_generate`; no wallet RPC
reads, signed `process` request, WebSocket, node-probe, backup QR code,
other provider endpoint or saved AppSettings receive any credential.

Never put an API key in a URL, custom server string, source control, issue, log,
browser console, screenshot or exported Nault configuration.

## Persistence and unlock

- Each origin/profile has its own encrypted localStorage envelope under
  `nault-pow-provider-keys-v2`. No plaintext or password is stored there.
- WebCrypto AES-256-GCM with 96-bit random IV, 128-bit authentication tag and
  authenticated context binds the ciphertext to the PoW key vault.
- PBKDF2-HMAC-SHA256 with 600,000 iterations and 128-bit random salt derives
  the key from a separate passphrase of at least 12 characters.
- Credentials are decrypted **into memory only after explicit unlock** and
  cleared on Lock or application reload. A fresh Android PWA / Electron launch
  **does not auto-unlock**; unauthenticated/default PoW remains available.
- Nano.to may have multiple encrypted named API keys, with a single **active**
  key used for `work_generate`. Creating a key adds it and makes it active.
  Switching the active key requires the vault passphrase. Deleting a selected
  key requires an unlocked vault and explicit confirmation, but not a new API
  key or re-entry of the passphrase.
- The version 2 vault stores Nano.to credentials only. Removing an active
  key selects another saved Nano.to key when available.
- Key labels, provider names and the active flag are **public non-secret metadata**
  visible while the vault is locked, and authenticated on unlock through AES-GCM
  associated data; API-key values stay encrypted.
- Removing the last saved key deletes the ciphertext entirely.
- After confirmation, both **Advanced options → Delete wallet data** and
  **Delete all data** erase the PoW API-key vault (v2), labels
  and active-key metadata from localStorage and clear decrypted keys from
  memory. These operations do not require the passphrase to destroy the
  local ciphertext; the confirmation dialog warns that saved API keys are
  deleted as well. Cancel preserves the vault. **Clear PoW work cache**
  intentionally does not delete the credential vault.

## Network and trust boundaries

- Only the exact Nano.to HTTPS URL/path match can receive a credential.
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
- Nano.to authenticated requests from a browser require its CORS policy
  to permit the Authorization header. Successful **production**
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
