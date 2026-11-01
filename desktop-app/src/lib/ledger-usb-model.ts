// Only non-secret, allowlisted USB model identifiers cross the native HID worker boundary.
// A model hint is not proof of wallet ownership: Angular still verifies account #0.
export type LedgerUsbModel = 'nanoS' | 'nanoSPlus' | 'nanoX';

export function normalizeLedgerUsbModel(value: unknown): LedgerUsbModel | null {
  if (value === 'nanoS') return 'nanoS';
  if (value === 'nanoSP' || value === 'nanoSPlus') return 'nanoSPlus';
  if (value === 'nanoX') return 'nanoX';
  return null;
}

export function identifyNativeLedgerUsbModel(transport: {
  deviceModel?: { id?: unknown } | null;
  device?: { getDeviceInfo?: () => { vendorId?: number; productId?: number } | null } | null;
} | null): LedgerUsbModel | null {
  const known = normalizeLedgerUsbModel(transport?.deviceModel?.id);
  if (known) return known;

  // Older node-hid transport versions may not resolve the product name.
  // Inspect the already-open HID handle rather than selecting another device.
  try {
    const info = transport?.device?.getDeviceInfo?.();
    if (!info || info.vendorId !== 0x2c97 || typeof info.productId !== 'number') return null;
    const code = info.productId > 0xff ? (info.productId >> 8) & 0xff : info.productId;
    if (code === 0x10) return 'nanoS';
    if (code === 0x50) return 'nanoSPlus';
    if (code === 0x40) return 'nanoX';
  } catch (_error) {
    // Unknown is safer than guessing a Ledger's transport capabilities.
  }
  return null;
}
