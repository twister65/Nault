/* SystemJS module definition */
declare var module: NodeModule;
interface NodeModule {
  id: string;
}

// The preload exposes only the desktop messages needed by the web renderer.
interface NaultDesktopBridge {
  on(channel: string, listener: (...args: any[]) => void): boolean;
  send(channel: string, ...args: any[]): boolean;
  releaseLedgerUsb(): Promise<boolean>;
}

interface Window {
  naultDesktop?: NaultDesktopBridge;
}

// nanoidenticons is a bundled CommonJS JavaScript asset without TypeScript declarations.
// Preserve its runtime import while declaring the canvas creation contract.
declare module '*nanoidenticons.min.js' {
  export function createIcon(options: { seed: string; scale: number }): HTMLCanvasElement;
}

// hw-app-nano@1.3.0 is distributed as JavaScript with Flow annotations only.
// These method signatures follow roosmaa/hw-app-nano/src/Nano.js and src/api.js.
// This declaration does not change Ledger APDUs, transport selection or signing.
declare module 'hw-app-nano' {
  import type Transport from '@ledgerhq/hw-transport';

  export interface NanoLedgerBlockData {
    representative: string;
    balance: string;
    previousBlock?: string | null;
    sourceBlock?: string | null;
    recipient?: string | null;
  }

  export default class Nano {
    constructor(transport: Transport);
    getAppConfiguration(): Promise<{version: string; coinName: string}>;
    getAddress(path: string, boolDisplay?: boolean): Promise<{publicKey: string; address: string}>;
    cacheBlock(path: string, blockData: NanoLedgerBlockData, signature: string): Promise<unknown>;
    signBlock(path: string, blockData: NanoLedgerBlockData): Promise<{blockHash: string; signature: string}>;
  }
}
