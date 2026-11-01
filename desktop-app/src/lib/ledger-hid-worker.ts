import { parentPort } from 'worker_threads';
import TransportNodeHidNoEvents from '@ledgerhq/hw-transport-node-hid-noevents';
import HID from 'node-hid';
import { identifyNativeLedgerUsbModel, selectLedgerHidDescriptor } from './ledger-usb-model';

// Own the native HID handle on a dedicated Node.js worker thread. The
// node-hid 2.1.1 asynchronous read callback fails under Electron 44.
// Bounded synchronous reads are safe here because they cannot block the
// Electron main process. Never log HID packets, APDUs, keys, or addresses.
const port = (() => {
  if (!parentPort) throw new Error('Ledger HID worker requires a parent port');
  return parentPort;
})();

type WorkerRequest =
  | { type: 'exchange'; id: number; apdu: number[] }
  | { type: 'close' };

let transport: TransportNodeHidNoEvents | null = null;
let closing = false;
let queue: Promise<void> = Promise.resolve();

function errorMessage(error: any): string {
  return error && error.message ? String(error.message) : String(error);
}

port.on('message', (message: WorkerRequest) => {
  if (message.type === 'close') {
    closing = true;
    queue = queue.then(async () => {
      if (transport) {
        await transport.close();
        transport = null;
      }
    }).catch(() => {}).then(() => {
      port.close();
    });
    return;
  }

  if (message.type !== 'exchange' || closing) return;

  queue = queue.then(async () => {
    try {
      if (!transport) throw new Error('Ledger HID worker is not ready');
      const reply = await transport.exchange(Buffer.from(message.apdu));
      port.postMessage({ type: 'result', id: message.id, data: Array.from(reply) });
    } catch (error) {
      port.postMessage({ type: 'error', id: message.id, message: errorMessage(error) });
    }
  });
});

async function initialize() {
  try {
    // Reuse Ledger's own HID interface filter, but retain the chosen USB
    // descriptor: node-hid's opened handle can omit model/product metadata.
    // Open the *same* path, never infer a model from an unrelated device.
    const selected = selectLedgerHidDescriptor(HID.devices(0x2c97, 0), process.platform);
    const opened = await TransportNodeHidNoEvents.open(selected ? selected.path : null);
    const device: any = opened.device;
    (opened as any).readHID = (): Promise<Buffer> =>
      new Promise<Buffer>((resolve, reject) => {
        const started = Date.now();
        const poll = () => {
          if (closing) return reject(new Error('Ledger HID worker closing'));
          if (Date.now() - started >= 30000) {
            return reject(new Error('Ledger HID read timed out'));
          }
          try {
            const packet: number[] = device.readTimeout(100);
            if (packet && packet.length > 0) {
              return resolve(Buffer.from(packet));
            }
            setImmediate(poll);
          } catch (error) {
            reject(error);
          }
        };
        setImmediate(poll);
      });

    if (closing) {
      await opened.close();
      port.close();
      return;
    }

    transport = opened;
    const usbModel = identifyNativeLedgerUsbModel(opened, selected);
    console.info('[Ledger USB] HID model identified', { model: usbModel || 'unknown' });
    // Send only the allowlisted model, never HID paths or USB identifiers.
    port.postMessage({ type: 'ready', usbModel });
  } catch (error) {
    port.postMessage({ type: 'fatal', message: errorMessage(error) });
    port.close();
  }
}

initialize();
