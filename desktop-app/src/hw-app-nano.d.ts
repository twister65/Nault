// Type declarations for the untyped upstream Ledger Nano application package.
// This contract is limited to the methods invoked from the Electron main process.
declare module 'hw-app-nano' {
  import type Transport from '@ledgerhq/hw-transport';
  export default class Nano {
    constructor(transport: Transport);
    getAppConfiguration(): Promise<unknown>;
    getAddress(path: string, showOnScreen?: boolean): Promise<Record<string, unknown>>;
    cacheBlock(path: string, data: unknown, signature: unknown): Promise<Record<string, unknown>>;
    signBlock(path: string, data: unknown): Promise<Record<string, unknown>>;
  }
}
