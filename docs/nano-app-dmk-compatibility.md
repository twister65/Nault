# Nano hardware application and Ledger Wallet DMK compatibility

Status: design contract / security audit only. No DMK code is installed or
executed by this document. The existing WebHID account-0 probe on
`feature/webhid` still uses LedgerJS and `hw-app-nano` for validation.

## Authoritative implementation and references

1. Nano on-device application: https://github.com/LedgerHQ/app-nano
   - Firmware APDU specification:
     https://github.com/LedgerHQ/app-nano/blob/master/doc/nano.md
   - Dispatch constants:
     https://github.com/LedgerHQ/app-nano/blob/master/src/libn_apdu_constants.h
   - Signing and predecessor-block cache:
     https://github.com/LedgerHQ/app-nano/blob/master/src/libn_apdu_sign_block.c
     https://github.com/LedgerHQ/app-nano/blob/master/src/libn_apdu_cache_block.c
   - Coin properties and units:
     https://github.com/LedgerHQ/app-nano/blob/master/src/coins.c
     https://github.com/LedgerHQ/app-nano/blob/master/Makefile
2. Current Nano LedgerJS command wrapper:
   https://github.com/roosmaa/hw-app-nano/blob/master/src/api.js
3. Ledger Wallet's DMK and compatibility bridge (current develop branch):
   https://github.com/LedgerHQ/ledger-live/blob/develop/libs/live-dmk-desktop/src/hooks/useDeviceManagementKit.tsx
   https://github.com/LedgerHQ/ledger-live/blob/develop/libs/live-dmk-shared/src/transport/DmkCompatTransport.ts
4. Future Nano integration:
   https://github.com/LedgerHQ/ledger-live/blob/develop/libs/coin-modules/README.md
   https://github.com/LedgerHQ/ledger-live/blob/develop/domain/entity/currency-crypto/src/currencies/nano.ts

**The embedded Nano app is not DMK itself.** It understands APDUs; DMK
owns the computer-side device discovery, transport and session lifecycle.
Compatibility means transmitting the exact APDUs, decoding responses, and
preserving the firmware's confirmation and predecessor-cache protocol.

## Nano application APDU contract

| Operation | CLA | INS | P1 | P2 | Expected successful response |
|---|---|---|---|---|---|
| Get app configuration | `A1` | `01` | `00` | `00` | 3 version bytes, coin-name length + name |
| Get address | `A1` | `02` | `00` or `01` (display) | `00` | 32-byte public key, address length + text |
| Cache predecessor block | `A1` | `03` | `00` | `00` | No data |
| Sign state block | `A1` | `04` | `00` | Address-prefix bit flags | 32-byte block hash + 64-byte signature |
| Sign authentication nonce | `A1` | `05` | `00` | `00` | 64-byte signature |

Status words must be interpreted explicitly: `9000` success, `6982`
locked/busy, `6985` user declined, `6A80` invalid data, `6A81`
invalid signature, `6A82` predecessor cache miss, `6B00` bad P1/P2.
Never classify an explicit refusal as a broken device.

The Ledger app is configured for Ed25519 and the hardened Nano prefix
`44'/165'`; Nault uses `44'/165'/accountIndex'` (account zero:
`44'/165'/0'`). APDU paths are count-prefixed with 32-bit **big-endian**
components. Confirm the returned app name is `Nano` rather than a
different app compiled from the same source code (Banano/NOS variants).
The firmware's `getAddress` P1=`01` requires on-device confirmation.

Amounts and balances are in Nano **raw** on the network and encoded as
16-byte integers in the Nano state-block APDUs. The firmware explicitly
defines `1 NANO = 10^30 raw` in `src/coins.c`. The current Ledger Wallet
Nano currency declaration has `magnitude: 8`; this **must be reconciled
to 30** for any live account integration, with unit conversion tests
before accounts or funds are displayed. Do not silently change upstream
Ledger Wallet as part of this Nault experiment.

## Preferred migration route: retain Nano protocol, replace only transport

```text
            Ledger Nano S Plus / Nano app (APDU CLA A1)
                            |
                      WebHID / DMK
                            |
     DeviceManagementKit (discover, connect, session, disconnect)
                            |
         DmkCompatTransport / equivalent audited adapter
                            |
          hw-app-nano getAppConfiguration / getAddress
                       cacheBlock / signBlock
                            |
              Nano account module / Ledger Wallet
```

Ledger Wallet already has `DmkCompatTransport`, a `hw-transport`
compatible wrapper around `dmk.sendApdu({ sessionId, apdu, abortTimeout })`.
It reconstructs the LedgerJS response by appending DMK's two status-code
bytes to the returned data. Thus **we can test reusing hw-app-nano**
against an established DMK session, instead of rewriting all five
commands immediately. This bridge is a project-internal implementation;
check licensing, exported package APIs, versions and Angular/TypeScript
compatibility before importing it into Nault.

A direct DMK Nano signer remains an option once the behavior has been
proven equivalent. DMK does **not** automatically implement the Nano
APDU commands or blockchain accounting.

### Session invariants

- Only one owner of the Ledger HID handle: legacy native worker, the
  existing LedgerJS WebHID probe, or DMK, never two simultaneously.
- Explicit user-initiated connection and device permission. Preserve
  strict Electron main-frame/origin restrictions, sandbox and IPC
  validation. Do not persist permission or expose APDU/seed data.
- Confirm Nano app identity and version before reading account data.
- Close the DMK session on exit/error/disconnect; do not assume that
  closing a LedgerJS compatibility wrapper closes the DMK session.
- Serialize APDU exchanges; handle device removal, user rejection,
  application switch and timeouts without retrying signing blindly.

## Signing security: Nano state-block predecessor cache

`signBlock` compares the new block's `previous` against the cached
predecessor hash. If it is nonzero and the block is not cached, the
app returns `6A82`. The cached balance/representative determine what
the Ledger displays: receive vs send, amount, representative changes.

**Important firmware audit observation:** in the reviewed
`src/libn_apdu_cache_block.c` implementation, the input contains a
64-byte signature field, but the visible code copies it without calling
a signature verification routine before storing the predecessor's
hash, balance and representative. Do not treat the presence of the
signature field as proof the predecessor was authenticated on-device.

The wallet-side Nano integration must therefore independently validate
the predecessor's account/public key, canonical block hash,
signature (if required/available), and the relationship to the
account's trusted frontier before issuing `cacheBlock`.
Care is needed when the source is an untrusted or stale RPC node.
Also validate the proposed block's link/recipient, amount, balance,
representative, source and previous fields against the intended
transaction, and show the user the destination on the physical
device. No signing tests using real funds at this stage.

## Test plan and release gates

**Gate 1: existing experiment (LedgerJS WebHID) — PASSED manually 2026-10-11**
- Confirmed Chromium secure origin, consent and Nano S Plus chooser selection on Linux.
- Confirmed in-app `getDevices()`, open/close, and `getAddress("44'/165'/0'", true)`.
- The user reports the returned `nano_` address matches the Ledger's physical screen.
- This is a maintainer-run hardware test, not CI or a DMK test; keep the native worker isolated.

**Gate 2: DMK transport and app identity**
- Pin a DMK version supporting Electron 44 and available build tooling.
- Open an explicit DMK session with WebHID and read app name/version
  (`A1 01`), then account-zero address (`A1 02`).
- Exercise `DmkCompatTransport` (or a narrowly equivalent adapter)
  with the existing `hw-app-nano`; compare result bytes to LedgerJS
  using the *same* Ledger, app and account path, **sequentially**.
- Mock tests for path hardening, APDU byte order, response layout,
  status word parsing, refusal, unplug and session cleanup.

**Gate 3: blockchain and transaction correctness**
- Build a Nano coin-module proof of concept with a dedicated RPC/network
  layer, state-block model, raw conversion (30 decimals), sync and
  receive/send history. Never couple untrusted RPC responses directly
  to the signing/device layer.
- Validate `cacheBlock` + `signBlock` sequence using auditable
  offline fixtures before any test network / low-value transaction.
- Test previous-block cache miss, wrong predecessor, malicious
  representative/recipient, out-of-order calls, user refusal,
  disconnection and a different application open on the device.
- Integrate with the currently documented Ledger Wallet Coin Module
  and device-intent APIs only after these checks. Native account
  support is independent from merely registering the currency.

No wallet data should be migrated, and no production transfer should be
performed, as part of the early WebHID/DMK transport tests.
