# Optional device unlock (WebAuthn PRF) — security design and test plan

Status: **PWA implementation validated on real Android and ChromeOS devices.**
Native OS-backed unlock for Electron Desktop is outside this scope. The normal
password flow remains available on all platforms.

## Motivation / reference

Natrium uses Flutter's `local_auth` package to let the operating system validate
biometrics (see [BiometricUtil](https://github.com/appditto/natrium_wallet_flutter/blob/master/lib/util/biometrics.dart)
and [lock_screen.dart](https://github.com/appditto/natrium_wallet_flutter/blob/master/lib/ui/lock_screen.dart)).
That API cannot be used unchanged by Nault's Angular PWA and Electron renderer.

Nault uses an explicit user-verifying **platform authenticator with WebAuthn PRF**.
A successful biometric/PIN prompt *alone* is not permission to decrypt the wallet:
the PRF output is an actual cryptographic key that unwraps the existing password.
The platform may allow fingerprint, face recognition or its own PIN; Nault does not
claim to enforce biometrics-only authentication.

- WebAuthn specification: https://w3c.github.io/webauthn/#prf-extension
- MDN: https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API/WebAuthn_extensions#prf
- Electron API limitations: https://www.electronjs.org/docs/latest/api/app#appconfigurewebauthnoptions-macos

## Scope

- **PoW Nano.to vault**: after a successful password unlock or initial save,
  the user can explicitly opt in to device unlock. It is offered in the
  startup vault dialog and in PoW settings. The original PoW AES-GCM/PBKDF2
  ciphertext and three-wrong-password destructive policy remain unchanged.
- **Software wallets** (`seed`, `privateKey`, `expandedKey`): the user must
  first unlock the software wallet with its normal password and explicitly
  enroll. Subsequent locked-wallet prompts can offer device unlock.
  Existing `nault:v2:` wallet ciphertext is not re-encrypted or replaced.
- **Ledger wallets**: excluded. No Ledger seed is extracted, cached or bypassed;
  WebHID/BLE and transaction confirmations remain independent.
- Enrollment is **per origin/browser profile, per purpose and per encrypted
  secret**. PoW and software-wallet quick-unlock records are independent.

## Stored format and threat model

`DeviceUnlockService` creates a dedicated discoverable/preferred platform
WebAuthn credential with `userVerification: required` and requests the
`prf` extension. Registration is rejected if the device cannot produce a
PRF result, including a follow-up assertion if creation did not return one.

Each local record (`nault-device-unlock-prf-v1-{wallet|pow}`) contains:
the credential ID, a random 32-byte PRF salt, a random 12-byte AES-GCM IV,
a SHA-256 digest of the encrypted-resource identity, and AES-256-GCM
ciphertext of the existing password. The AES key is non-extractable and
imported from the PRF output only for the current operation. AES-GCM AAD binds
it to the current origin, purpose and encrypted-resource digest.

It does **not** store a plain password, a seed, a PoW API key, a reusable PRF
output, a decrypted AES key, or WebAuthn data in an export, URL, network
request, service worker, Electron IPC or logs. WebAuthn is initiated only by
a local user gesture. Browser/OS security settings mediate verification.

The software-wallet binding is the wallet type plus its encrypted ciphertext;
password rotation, migration, replacing the wallet or changes to ciphertext
invalidate any old device unlock. The PoW binding uses the vault's random
PBKDF2 salt, which persists when adding/removing individual keys but changes
on vault recreation. Destroying either stored secret also removes its
device-unlock record. No auto-registration occurs.

A malicious script/extension running in the same origin can still access
*already unlocked* secrets. WebAuthn PRF is **not** protection against XSS,
a compromised device, malicious browser extensions, or malicious OS
accessibility/credential-provider software. The local record and authenticator
must both remain available for device unlock to work. System PIN fallback and
passkey sync policies are controlled by the platform.

## Limitations and fallback

This implementation **does not promise support on every biometric-capable
device**. The UI first checks for a secure HTTPS/localhost WebAuthn context
and a user-verifying platform authenticator. Actual `prf` support is tested
during enrollment; unsupported credentials fail closed with the existing
password path still available.

Electron cannot reliably expose the same APIs in all environments.
In particular, its macOS platform-passkey authenticator currently does not
support PRF, and Touch ID setup requires explicit entitlements/configuration
on supported Electron versions. Desktop `file://` origins are intentionally
not advertised as supported, even where the device has fingerprints/Face ID.
Native OS-keychain implementations for macOS, Windows Hello and Linux are
a separate security-reviewed scope; **do not** replace PRF with a boolean
`authenticate()` result followed by an unprotected password read.

Deleting browser data, changing deployment hostname, replacing a device,
removing the system passkey, or updating the wallet/vault password may remove
quick unlock. **Keep the normal wallet password, vault password and an offline
seed backup**. There is no remote recovery path.

### Temporary Windows browser/PWA restriction (November 2026)

Until the Windows WebAuthn PRF interoperability issue is addressed upstream,
**device unlock is disabled in Nault's Windows web runtime** (installed PWA
and regular HTTPS browser tab). A centralized guard in
`DeviceUnlockService.isSupported()` suppresses wallet and PoW vault device
unlock controls and prevents enrollment or assertion even when a local
credential was previously registered. Windows is detected from the browser's
platform and Windows NT user agent; no Windows Hello capability probing or
WebAuthn prompt is attempted.

Normal software-wallet and PoW vault password unlock remain functional.
Existing encrypted device-unlock records are **not deleted**; they remain
unusable on Windows until the workaround is removed. Android, ChromeOS, Linux
and macOS web runtimes retain their existing capability-based behavior.
Electron Desktop remains outside the current WebAuthn PRF scope.

Regression checks: a Windows Chrome/Edge PWA must not offer the option in
wallet settings, the unlock modal, PoW settings, or the startup vault prompt.
Check a pre-enrolled profile, and verify password fallback; repeat supported
device-unlock workflows on Android and ChromeOS.

## Validation evidence (PR #89)

The staging build at `https://nault-tablet-css-test.vercel.app/` was
manually tested against commit
[`ab0074e`](https://github.com/twister65/Nault/commit/ab0074ef12548d412a404c41daed1dc99c3908a2).
The finalized implementation at `5a23f43` has the same file contents.

- **Android smartphone:** platform fingerprint unlock tested successfully
  for the Nano.to PoW vault and a software wallet; the wallet was unlocked
  for a test send and a receive after locking.
- **Android tablet without a fingerprint sensor:** system unlock pattern
  tested successfully with both the PoW vault and software wallet. The user
  also confirmed failure and recovery scenarios on this tablet.
- **ChromeOS PWA:** a platform passkey unlocked by PIN was accepted.
  The available report does not establish every individual failure/recovery
  permutation on ChromeOS.
- **Automated gates:** Angular 22 validation, linting, regression/unit tests,
  CodeQL, dependency audit, Electron packaging and the Merge Gate passed.
  Automated packaging does not replace manual hardware tests.

No claim is made that Electron Desktop supports device unlock. Additional
manual checks on unsupported authenticators, Linux/Windows/macOS Desktop
password fallback, Ledger hardware and edge-case storage lifecycles are
tracked as follow-up regression work, not recorded as completed.

## Additional security regression checklist

Automated tests: PRF-derived AES-GCM round-trip; record contains neither
password nor resource identity in clear; wrong PRF; cancelled prompt; unsupported
platform; purpose separation; tamper/malformed record; key rotation; disabled
feature; Ledger guard; PoW unlock-counter semantics. Review CSP and storage
lifecycle, and run all Angular/ESLint/CodeQL/Electron/RPC/PoW workflows.

Manual tests **must use test-only seed and API key**:

1. Android PWA: enroll PoW with fingerprint, lock, restart Chrome, unlock via
   device, generate PoW; dismiss at startup and verify public fallback.
2. Android PWA: enroll seed wallet, lock, restart, use device unlock, check
   account identity and perform a tiny *test* transaction (do not automate
   confirmation), then lock again.
3. Android without biometrics/PIN, disabled biometrics, declined prompt, failed
   attempt, OS re-enrollment, device without PRF: no bypass; password still works.
4. Two distinct enrolled secrets: reset PoW only, replace wallet only, rotate
   wallet password, delete one API key, delete final key, recreate vault.
   Confirm separation and invalidation.
5. ChromeOS PWA and desktop Chrome: check WebAuthn PRF support and that the
   feature never appears if unsupported; test restarts and offline mode.
6. Windows Electron, Linux Electron and macOS Electron: verify disabled/fallback
   when secure PRF is unavailable; no breaking changes to Ledger WebHID/BLE.
7. Verify Ledger Nano S Plus and Nano X connect, disconnect/reconnect, reject
   0x6985 and sign with on-device confirmation; no biometric bypass.
8. Check UI and keyboard accessibility on phone/tablet/desktop, plus EN/FR/
   DE/ES translations; no unexpected prompts on first-run/empty wallet.
9. Check corrupted ciphertext, concurrent tabs, storage wipes, interrupted
   registration, missing PRF result and credential mismatch. Never count a
   cancelled device prompt as an incorrect vault password.
10. Inspect localStorage, wallet exports, console and network traces to confirm
    plaintext passwords/seeds/API keys and PRF outputs are not leaked.

**Security boundary:** a successful system prompt by itself does not unlock
anything; the platform PRF must unwrap an authenticated AES-GCM password
ciphertext. Device compromise/XSS and OS passkey-sync policies remain risks.
The open manual test cases above must not be mistaken for completed checks.
Do not ship Desktop biometric claims until a separate native integration
has undergone security review and hardware testing.
