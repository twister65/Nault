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
