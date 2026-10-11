import Transport from '@ledgerhq/hw-transport';
import { Worker } from 'worker_threads';
import * as path from 'path';

interface ExchangePending {
  resolve: (response: Buffer) => void;
  reject: (error: Error) => void;
}

type WorkerResponse =
  | { type: 'ready' }
  | { type: 'result'; id: number; data: number[] }
  | { type: 'error'; id: number; message: string }
  | { type: 'fatal'; message: string };

/**
 * Proxy the Ledger transport through a Node.js worker thread.
 *
 * The worker owns the HID handle and executes bounded readTimeout() calls.
 * The Electron main process performs no blocking HID reads, and no APDU
 * contents are written to the application logs.
 */
export default class LedgerHidWorkerTransport extends Transport {
  private readonly worker: Worker;
  private readonly startup: Promise<void>;
  private resolveStartup: () => void = () => {};
  private rejectStartup: (error: Error) => void = () => {};
  private readonly pending = new Map<number, ExchangePending>();
  private nextId = 0;
  private ready = false;
  private failed = false;
  private closed = false;

  private constructor(worker: Worker) {
    super();
    this.worker = worker;
    this.startup = new Promise<void>((resolve, reject) => {
      this.resolveStartup = resolve;
      this.rejectStartup = reject;
    });

    worker.on('message', (message: WorkerResponse) => {
      if (message.type === 'ready') {
        if (!this.failed && !this.closed) {
          this.ready = true;
          this.resolveStartup();
        }
      } else if (message.type === 'fatal') {
        this.fail(new Error(message.message));
      } else if (message.type === 'result' || message.type === 'error') {
        const request = this.pending.get(message.id);
        if (!request) return;
        this.pending.delete(message.id);
        if (message.type === 'result') {
          request.resolve(Buffer.from(message.data));
        } else {
          request.reject(new Error(message.message));
        }
      }
    });
    worker.on('error', error => this.fail(error));
    worker.on('exit', code => {
      if (!this.closed) {
        this.fail(new Error('Ledger HID worker exited (code ' + code + ')'));
      }
    });
  }

  static async open(): Promise<LedgerHidWorkerTransport> {
    const worker = new Worker(path.join(__dirname, 'ledger-hid-worker.js'));
    const transport = new LedgerHidWorkerTransport(worker);
    let timeout: NodeJS.Timeout | null = null;
    try {
      await Promise.race([
        transport.startup,
        new Promise<void>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error('Ledger HID worker startup timed out')), 15000);
        })
      ]);
      return transport;
    } catch (error) {
      await worker.terminate();
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private fail(error: Error) {
    if (this.failed) return;
    this.failed = true;
    if (!this.ready) this.rejectStartup(error);
    this.pending.forEach(request => request.reject(error));
    this.pending.clear();
    if (this.ready && !this.closed) this.emit('disconnect');
  }

  exchange(apdu: Buffer): Promise<Buffer> {
    // Retain Ledger's exchange lock and ordering semantics.
    return this.exchangeAtomicImpl(() => new Promise<Buffer>((resolve, reject) => {
      if (!this.ready || this.failed || this.closed) {
        reject(new Error('Ledger HID worker is not connected'));
        return;
      }
      const id = ++this.nextId;
      this.pending.set(id, { resolve, reject });
      try {
        // Structured cloning copies the APDU to the worker. Never log it.
        this.worker.postMessage({ type: 'exchange', id, apdu: Array.from(apdu) });
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    })).then(response => response as Buffer);
  }

  // Matches the no-events HID transport; Ledger framing is handled inside
  // the worker and needs no additional scramble key.
  setScrambleKey(_key: string): void {}

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.pending.forEach(request => request.reject(new Error('Ledger HID transport closed')));
    this.pending.clear();

    if (this.worker.threadId === -1) return;
    await new Promise<void>(resolve => {
      const timeout = setTimeout(resolve, 1500);
      this.worker.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
      try {
        this.worker.postMessage({ type: 'close' });
      } catch (_error) {
        clearTimeout(timeout);
        resolve();
      }
    });

    // Fall back to termination only if the worker did not close gracefully.
    if (this.worker.threadId !== -1) {
      await this.worker.terminate();
    }
  }
}
