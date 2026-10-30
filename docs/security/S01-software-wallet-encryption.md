# S-01 — Software wallet encryption (proposal under review)

**Source:** Preliminary audit of October 12, 2026, finding S-01 (high severity).
**Branch:** fix/security-s01-wallet-encryption — do not merge without testing and authorization.
**Scope:** Nano seed, private key, and expanded private key. Out of scope: Ledger, MuSig, RPC, IPC.

## Threat model and cryptographic choices

The legacy `CryptoJS.AES.encrypt(secret, password)` format uses a low-cost password derivation method and does not authenticate the ciphertext. A copy of local storage enables offline attacks.

New writes use a versioned `nault:v2:<base64(JSON)>` envelope with a random 16-byte salt, PBKDF2-HMAC-SHA-256 with **600,000 iterations**, AES-256-GCM via WebCrypto, a random 12-byte nonce, and a 128-bit authentication tag. The wallet type (`seed`, `privateKey`, `expandedKey`) is included in the authenticated data. The passphrase must be **at least 12 characters long**; recommend a long, unique passphrase.

If secure WebCrypto is unavailable, parameters are unknown, the password is too short, data is corrupted, the ciphertext is malformed, or the wallet type is incorrect: **fail closed**, without writing plaintext or creating new legacy-encrypted data.

## Compatibility and migration

1. Legacy CryptoJS/OpenSSL backups remain readable with their original password. Unlocking a legacy wallet does **not** migrate it automatically.
2. New software wallets are encrypted as v2 **before** a success notification is displayed. Backups triggered while accounts are being discovered must not write secrets in plaintext.
3. Explicitly importing a legacy backup preserves its ciphertext; changing its password afterward allows migration to the new format.
4. Rotating the password of a legacy wallet requires confirmation that a **verified recovery backup** exists and replaces only local storage. Earlier exports retain their old password.
5. A key-derivation, encryption, or storage-write error must not replace the previous copy. Derived accounts and addresses remain unchanged.
6. Never use a real seed in tests, logs, screenshots, HAR files, comments, or examples.

Backup confirmation is a user declaration, **not** cryptographic verification. Plan a restore test using a dummy copy and an out-of-browser backup procedure before any real deployment.

## Mandatory validation plan

- Karma/Jasmine tests: distinct salts/nonces, dummy-secret round trip, incorrect password, tampered ciphertext, incorrect type, unknown version, legacy compatibility, no plaintext writes, and rollback after failure.
- Dummy migration: legacy backup → unlock → unchanged export → explicitly confirmed password rotation → v2 storage → restart → same accounts/addresses → restoration of the v1 backup using its original password.
- Formats: `seed`, `privateKey`, `expandedKey`, multiple account indices, URL/QR. Check QR code size.
- Platforms: ChromeOS, offline PWA, Android, Electron on Linux and Windows, macOS x64/arm64 builds. Verify `crypto.subtle` availability.
- Gates: Angular 22 build, lint, Karma/Jasmine, CodeQL Advanced v4, restoration tests, security review, and green CI. No deployment or merge without validation and approval.

## Limitations and rollback

This protection applies to the seed at rest; the secret remains in RAM while the hot wallet is unlocked. It does not protect against malware, active XSS, or keyloggers. Ledger seeds are unaffected.

Keep an offline recovery seed or an **actually verified** legacy export before migration. Do not delete the legacy export after password rotation; an older Nault version cannot read v2 and must never overwrite that storage. If needed, restore the legacy backup using a compatible version.

## S01-04 test report — ChromeOS (October 29, 2026)

**Status: 7/7 manual tests passed on ChromeOS, using an entirely dummy backup and seed.** The original report label said “Android,” but the user explicitly clarified that these steps were performed on **ChromeOS**. Do not count this scenario as Android validation.

1. Import of a legacy CryptoJS/OpenSSL v1 backup in JSON format: passed.
2. Two Nano accounts at indices 0 and 1 recovered: passed. Public addresses provided for reference, abbreviated in this document: index 0 `nano_3se9n8su…jwxyrkh`, index 1 `nano_181gqshx…35ipz`.
3. Locking, reloading, and unlocking the legacy backup without implicit migration: passed; export still started with `U2FsdGVkX1`.
4. Voluntary password rotation with explicit confirmation: passed.
5. Export of the migrated wallet: `nault:v2:` prefix confirmed; account addresses at indices 0 and 1 unchanged.
6. After migration, the old password was rejected for the v2 wallet, and the new password was accepted: passed.
7. Restoration of the original v1 backup with its legacy password, recovering the same accounts: passed.

**Remaining work:** Actual Android/PWA checks; separate private-key/expanded-key and URL/QR scenarios if not already covered; and a final cryptographic risk review before any potential merge into `master`. Android-test was deployed at commit `7fcb8b0` with the user's explicit approval. This report does not authorize a merge into `master`.
