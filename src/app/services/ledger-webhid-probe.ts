import Nano from 'hw-app-nano';
import TransportHID from '@ledgerhq/hw-transport-webhid';

// Temporary, read-only diagnostic for the existing Nano APDU app, used
// solely in the opt-in Electron WebHID test profile. The transport is
// created by a user click and closed immediately after the account read.
// A future Ledger Live Nano coin module will use a separate DMK adapter.
export async function readNanoAccountZeroWebHid(): Promise<string> {
  const transport = await TransportHID.create(3000, 30000);
  try {
    const nanoApp = new Nano(transport);
    // showOnScreen=true: user can verify the destination account on Ledger.
    const response = await nanoApp.getAddress("44'/165'/0'", true);
    if (!response || typeof response.address !== 'string' ||
        !response.address.startsWith('nano_')) {
      throw new Error('Nano app returned no valid-looking account 0 address.');
    }
    return response.address;
  } finally {
    // Never leave an HID handle held when returning to native Ledger IPC.
    await transport.close();
  }
}
