// Only non-secret, allowlisted USB model identifiers cross the native HID worker boundary.
// A model hint is not proof of wallet ownership: Angular still verifies the saved account.
export type LedgerUsbModel = 'nanoS' | 'nanoSPlus' | 'nanoX';

export interface LedgerHidDescriptor {
  vendorId?: number;
  productId?: number;
  path?: string;
  interface?: number;
  usagePage?: number;
}

export function normalizeLedgerUsbModel(value: unknown): LedgerUsbModel | null {
  if (value === 'nanoS') return 'nanoS';
  if (value === 'nanoSP' || value === 'nanoSPlus') return 'nanoSPlus';
  if (value === 'nanoX') return 'nanoX';
  return null;
}

// Use the same interface selection as Ledger's node-hid-noevents transport.
// The returned *exact path* must be passed into open(path), avoiding any
// device-swap race between enumeration and opening the HID handle.
export function selectLedgerHidDescriptor(
  devices: readonly LedgerHidDescriptor[], platform: string
): LedgerHidDescriptor | null {
  return devices.find(device =>
    device.vendorId === 0x2c97 && !!device.path &&
    (platform === 'win32' || platform === 'darwin'
      ? device.usagePage === 0xffa0
      : device.interface === 0)
  ) || null;
}

function usbDescriptorModel(info: {vendorId?: number; productId?: number} | null | undefined): LedgerUsbModel | null {
  if (!info || info.vendorId !== 0x2c97 || typeof info.productId !== 'number') return null;
  const code = info.productId > 0xff ? (info.productId >> 8) & 0xff : info.productId;
  if (code === 0x10) return 'nanoS';
  if (code === 0x50) return 'nanoSPlus';
  if (code === 0x40) return 'nanoX';
  return null;
}

export function identifyNativeLedgerUsbModel(transport: {
  deviceModel?: { id?: unknown } | null;
  device?: { getDeviceInfo?: () => { vendorId?: number; productId?: number } | null } | null;
} | null, selectedDescriptor?: LedgerHidDescriptor | null): LedgerUsbModel | null {
  // The path is shared with open(path): this descriptor belongs to the
  // *actually selected* HID interface, not just an arbitrary attached Ledger.
  const selected = usbDescriptorModel(selectedDescriptor);
  if (selected) return selected;

  const known = normalizeLedgerUsbModel(transport?.deviceModel?.id);
  if (known) return known;

  // Some Linux node-hid versions omit the model from getDeviceInfo(), or
  // expose no product string for Ledger's identifyProductName() path.
  try {
    return usbDescriptorModel(transport?.device?.getDeviceInfo?.());
  } catch (_error) {
    return null;
  }
}
