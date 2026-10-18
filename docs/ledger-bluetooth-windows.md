# Ledger Nano X Web Bluetooth on Windows (experimental)

Nault Desktop on Windows uses Chromium Web Bluetooth for the Nano X.
The native HID worker remains the USB route. A successful GATT connection
and service discovery do not prove that Bluetooth pairing has succeeded.

## First connection and authentication

1. Close Nault, unplug Ledger USB, charge and unlock the Nano X.
2. Check **Windows Settings > Bluetooth & devices**. If a previous Nano X
   pairing is present but no longer works, remove that device.
3. Keep Bluetooth enabled on the Nano X and use its home screen for initial
   pairing. Confirm only if the numeric codes match on both displays.
4. Open the Nano application on the Ledger and use Nault's **Connect via
   Bluetooth** button to select your device.
5. If Windows pairing stays inconsistent, **Reset pairings** is available
   in Nano X Control Center > Security. WARNING: this forgets all Ledger
   Bluetooth pairings, including phones and other computers. It does not
   erase the wallet. Re-pair other devices as needed.

Do not bypass the numeric comparison or allow an automatic pairing of an
unrecognized device. Don't enter the wallet recovery phrase on the PC.

## Diagnostic: `Authentication failed`

On some Windows systems, `device.gatt.connect()`,
`getPrimaryServices()`, and the Ledger characteristic lookups succeed,
but `startNotifications()` fails with `NetworkError: Authentication failed`.
This is an OS/Bluetooth authentication failure, not an MTU handshake
failure. Do not keep retrying MTU or ignore the authentication error.

Nault's Electron main-process log is normally at:

`%APPDATA%\nault\logs\main.log`

Look only for `[Ledger BLE pairing]` entries. These record pairing type,
document/frame authorization, prior device selection, and user confirmation.
They do NOT record the device identifier, pairing PIN, wallet addresses,
signatures, or APDU bytes. These entries distinguish:

- No pairing request: Windows may not have requested an Electron pairing
  dialog; check Windows' stored device associations.
- Request denied by policy: look for `trustedFrame`,
  `previouslySelected`, `knownKind`, and `validPin` flags.
- Request confirmed but GATT still unauthenticated: recheck the Windows
  Bluetooth bond, the Nano X pairing state, and Windows Bluetooth driver.

The **Reset Bluetooth session** button addresses a different problem:
Linux / Chromium stops dispatching GATT notifications after a radio loss.
It is not a substitute for Windows pairing authentication.

## Test protocol

Confirm that USB still works. For Bluetooth, test selecting, pairing,
account 0 address verification on the Ledger display, rejection and
approval of a small transfer, disconnection and manual reconnect. Check
account history before repeating any interrupted transfer. Never
automatically replay a transaction.
