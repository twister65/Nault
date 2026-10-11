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

// Compare exact canonical origins; never accept arbitrary URLs or subdomains.
export function isTrustedWebHidOrigin(candidate: string | undefined, trusted: string): boolean {
  return typeof candidate === 'string' && candidate === trusted;
}
