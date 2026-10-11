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
