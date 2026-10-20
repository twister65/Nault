/* SystemJS module definition */
declare var module: NodeModule;
interface NodeModule {
  id: string;
}

// The preload exposes only the desktop messages needed by the web renderer.
interface NaultDesktopBridge {
  on(channel: string, listener: (...args: any[]) => void): boolean;
  send(channel: string, ...args: any[]): boolean;
}

interface Window {
  naultDesktop?: NaultDesktopBridge;
}

// nanoidenticons is a bundled CommonJS JavaScript asset without TypeScript declarations.
// Preserve its runtime import while declaring the canvas creation contract.
declare module '*nanoidenticons.min.js' {
  export function createIcon(options: { seed: string; scale: number }): HTMLCanvasElement;
}
