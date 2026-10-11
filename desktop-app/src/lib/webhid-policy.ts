// Deliberately independent of Electron so policy can be unit-tested with Node.
export const LEDGER_USB_VENDOR_ID = 0x2c97;

// Ledger documents Nano S Plus as product 0x50. Firmware/app modes may expose
// the extended 0x5000..0x501f IDs; 0x0005 bootloader is NOT accepted.
export function isNanoSPlusHidDevice(device: unknown): device is {
  vendorId: number;
  productId: number;
  deviceId: string;
} {
  if (!device || typeof device !== 'object') {
    return false;
  }
  const candidate = device as {
    vendorId?: unknown;
    productId?: unknown;
    deviceId?: unknown;
  };
  if (candidate.vendorId !== LEDGER_USB_VENDOR_ID ||
      typeof candidate.deviceId !== 'string' || !candidate.deviceId) {
    return false;
  }
  const productId = candidate.productId;
  return productId === 0x50 ||
    (typeof productId === 'number' && Number.isInteger(productId) &&
     productId >= 0x5000 && productId <= 0x501f);
}

// Chromium may serialize the root of an app:// origin with a final '/'.
// Only these two literal forms are accepted: no arbitrary paths, queries,
// credentials, ports, subdomains, or opaque ("null") origins.
export function isTrustedWebHidOrigin(candidate: string | undefined, trusted: string): boolean {
  return candidate === trusted || candidate === trusted + '/';
}

// Diagnostics never expose URLs, hardware serial numbers or device IDs.
// An unexpected value remains denied and can be investigated by its category.
export function describeWebHidOrigin(candidate: string | undefined, trusted: string): string {
  if (candidate === trusted) return 'exact';
  if (candidate === trusted + '/') return 'trailing-slash';
  if (candidate === 'null') return 'opaque-null';
  if (candidate === undefined) return 'missing';
  return 'different';
}


// Sanitized diagnostics for Electron's two different HID entry points.
// A rejection may be for an unrelated connected HID device, not the Ledger.
// Never log raw USB identifiers, interface GUIDs, serials or deviceId strings.
export function describeNanoSPlusHidDevice(device: unknown): {
  vendorMatchesLedger: boolean;
  productMatchesNanoSPlus: boolean;
  deviceIdPresent: boolean;
  interfaceGuidPresent: boolean;
} {
  const candidate = device && typeof device === 'object' ? device as {
    vendorId?: unknown;
    productId?: unknown;
    deviceId?: unknown;
    guid?: unknown;
  } : {};
  const pid = candidate.productId;
  return {
    vendorMatchesLedger: candidate.vendorId === LEDGER_USB_VENDOR_ID,
    productMatchesNanoSPlus: pid === 0x50 ||
      (typeof pid === 'number' && Number.isInteger(pid) &&
        pid >= 0x5000 && pid <= 0x501f),
    deviceIdPresent: typeof candidate.deviceId === 'string' &&
      candidate.deviceId.length > 0,
    interfaceGuidPresent: typeof candidate.guid === 'string' &&
      candidate.guid.length > 0
  };
}
