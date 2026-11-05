import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { secureEndpoint } from './endpoint-policy';
import officialNodeRegistry from '../../assets/nodes.json';
import * as url from 'url';
import { TranslocoService, getBrowserCultureLang, getBrowserLang } from '@jsverse/transloco';

export type WalletStore = 'localStorage'|'none';
export type PoWSource = 'server'|'clientCPU'|'clientWebGL'|'best'|'custom';
export type LedgerConnectionType = 'usb'|'bluetooth';

export interface RpcServerOption {
  name: string;
  value: string;
  api: string | null;
  ws: string | null;
  auth: string | null;
  shouldRandom: boolean;
  allowFailover?: boolean;
  failoverTarget?: boolean;
  work?: string;
  supportsRepresentativesOnline?: boolean;
  isLocal?: boolean;
}

export interface AppSettings {
  language: string;
  displayDenomination: string;
  // displayPrefix: string | null;
  walletStore: string;
  displayCurrency: string;
  defaultRepresentative: string | null;
  lockOnClose: number;
  lockInactivityMinutes: number;
  ledgerReconnect: LedgerConnectionType;
  powSource: PoWSource;
  multiplierSource: number;
  customWorkServer: string;
  pendingOption: string;
  decentralizedAliasesOption: string;
  serverName: string;
  serverAPI: string | null;
  serverWS: string | null;
  serverAuth: string | null;
  minimumReceive: string | null;
  walletVersion: number | null;
  lightModeEnabled: boolean;
  identiconsStyle: string;
}

@Injectable()
export class AppSettingsService {
  storeKey = `nanovault-appsettings`;
  readonly serverFailover$ = new Subject<{ previousName: string; nextName: string }>();
  // Explicit best-mode completion is not a failure and must not show a failover warning.
  readonly serverBestSelected$ = new Subject<void>();

  settings: AppSettings = {
    language: '',
    displayDenomination: 'mnano',
    // displayPrefix: 'xrb',
    walletStore: 'localStorage',
    displayCurrency: 'USD',
    defaultRepresentative: null,
    lockOnClose: 1,
    lockInactivityMinutes: 30,
    ledgerReconnect: 'usb',
    powSource: 'server',
    multiplierSource: 1,
    customWorkServer: '',
    pendingOption: 'amount',
    decentralizedAliasesOption: 'disabled',
    serverName: 'twister32-rsnano',
    serverAPI: null,
    serverWS: null,
    serverAuth: null,
    minimumReceive: '0.000001',
    walletVersion: 1,
    lightModeEnabled: false,
    identiconsStyle: 'nanoidenticons',
  };

  // GitHub is the source of truth for this read-only registry. Angular packages
  // nodes.json with the app, so first launch does not depend on GitHub or Apache.
  private readonly officialNodes: RpcServerOption[] = (officialNodeRegistry as RpcServerOption[])
    .filter(server => {
      try {
        // Public registry nodes require both RPC and WSS so automatic
        // selection never produces a wallet with no confirmation stream.
        return !!server.name && !!server.value && !!server.api && !!server.ws &&
          secureEndpoint(server.api, 'rpc') === server.api &&
          secureEndpoint(server.ws, 'ws') === server.ws &&
          (!server.work || secureEndpoint(server.work, 'rpc') === server.work);
      } catch (_) { return false; }
    });
  private readonly localNodeStoreKey = 'nanovault-rpc-local-nodes';
  private localNodes: RpcServerOption[] = [];
  private rankedEndpoints: string[] | null = null;
  private pendingBestStartupSelection = false;
  serverOptions: RpcServerOption[] = this.buildServerOptions();

  private buildServerOptions(): RpcServerOption[] {
    return [
      { name: 'The best', value: 'random', api: null, ws: null, auth: null, shouldRandom: false },
      ...this.officialNodes,
      ...this.localNodes,
      { name: 'New', value: 'custom', api: null, ws: null, auth: null, shouldRandom: false },
      { name: 'Offline', value: 'offline', api: null, ws: null, auth: null, shouldRandom: false }
    ];
  }

  private loadLocalNodes(): void {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(this.localNodeStoreKey) || '[]');
      if (!Array.isArray(parsed)) throw new Error('Invalid local node list');
      this.localNodes = parsed.filter((node): node is RpcServerOption => {
        if (!node || typeof node !== 'object' || !node.isLocal ||
            typeof node.value !== 'string' || !/^local-[a-z0-9-]+$/.test(node.value) ||
            typeof node.name !== 'string' || !node.name.trim() ||
            typeof node.api !== 'string') return false;
        try {
          secureEndpoint(node.api, 'rpc');
          if (node.ws) secureEndpoint(node.ws, 'ws');
          return true;
        } catch (_) { return false; }
      }).map(node => ({
        name: node.name, value: node.value, api: node.api, ws: node.ws || null,
        auth: typeof node.auth === 'string' && node.auth.trim() ? node.auth : null,
        shouldRandom: false, isLocal: true,
        // Treat a configured local public-compatible node like an official
        // candidate, but NEVER probe or fail over to an authenticated RPC.
        allowFailover: !!node.ws && !node.auth
      }));
    } catch (_) { this.localNodes = []; }
    this.serverOptions = this.buildServerOptions();
  }

  saveLocalNode(name: string, api: string, ws: string | null, auth: string | null, existingId?: string): string {
    const rpc = secureEndpoint(api, 'rpc');
    const websocket = ws && ws.trim() ? secureEndpoint(ws, 'ws') : null;
    const id = existingId && this.localNodes.some(node => node.value === existingId)
      ? existingId : 'local-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    const entry: RpcServerOption = {
      name: name.trim() || new URL(rpc).hostname,
      value: id, api: rpc, ws: websocket, auth: auth || null,
      shouldRandom: false, isLocal: true,
      allowFailover: !!websocket && !auth
    };
    this.localNodes = [...this.localNodes.filter(node => node.value !== id), entry];
    localStorage.setItem(this.localNodeStoreKey, JSON.stringify(this.localNodes));
    this.serverOptions = this.buildServerOptions();
    return id;
  }

  removeLocalNode(id: string): void {
    this.localNodes = this.localNodes.filter(node => node.value !== id);
    localStorage.setItem(this.localNodeStoreKey, JSON.stringify(this.localNodes));
    this.serverOptions = this.buildServerOptions();
  }

  // Null means the background audit has not finished; [] means no healthy
  // candidates. Neither case authorizes random selection of stale nodes.
  setRankedEndpoints(endpoints: string[]): void {
    this.rankedEndpoints = [...endpoints];
    // If The best was persisted between sessions, start immediately on RsNano
    // while checks run. Apply the highest-ranked result once, without repeated
    // hopping during later network recovery scans.
    if (this.pendingBestStartupSelection && this.settings.serverName === 'random' && endpoints.length) {
      this.pendingBestStartupSelection = false;
      const best = this.serverOptions.find(node =>
        node.api === endpoints[0] && node.allowFailover && !!node.ws && !node.auth);
      if (best && this.settings.serverAPI !== best.api) {
        this.setAppSettings({ serverAPI: best.api, serverWS: best.ws, serverAuth: null });
        this.serverBestSelected$.next();
      }
    }
  }

  getRankedFallbackEndpoints(excluding: string): string[] | null {
    if (this.rankedEndpoints === null) return null;
    return this.rankedEndpoints.filter(endpoint => endpoint !== excluding &&
      this.serverOptions.some(node => node.api === endpoint && node.allowFailover &&
        node.failoverTarget !== false && !!node.ws && !node.auth));
  }

  // Simplified list for comparison in other classes
  knownApiEndpoints = this.serverOptions.reduce((acc, server) => {
    if (!server.api) return acc;
    acc.push( server.api.replace(/https?:\/\//g, '') );
    return acc;
  }, [] as string[]);

  constructor(
    private translate: TranslocoService
  ) { }

  loadAppSettings(systemLocale?: string | null) {
    let settings: AppSettings = this.settings;
    const settingsStore = localStorage.getItem(this.storeKey);
    if (settingsStore) {
      settings = JSON.parse(settingsStore);
      // Preserve explicit The best node selections independently of the
      // (unrelated) PoW "best" setting. The initial default is RsNano already,
      // so the old random+best legacy migration would now erase a real choice.
    }
    this.settings = Object.assign(this.settings, settings);
    this.loadLocalNodes();
    // Preserve pre-existing custom endpoints while making them persistent,
    // individually selectable local entries. No private node is published to GitHub.
    if (this.settings.serverName === 'custom' && this.settings.serverAPI) {
      try {
        const id = this.saveLocalNode('', this.settings.serverAPI, this.settings.serverWS, this.settings.serverAuth);
        this.settings.serverName = id;
        this.saveAppSettings();
      } catch (_) { /* Keep malformed legacy settings for manual correction. */ }
    }

    const supported = this.translate.getAvailableLangs().map(lang =>
      typeof lang === 'string' ? lang : lang.id
    );
    const fallback = this.translate.getDefaultLang(); // English
    const supportedLocale = (value: string | null | undefined): string | null => {
      if (!value || typeof value !== 'string') return null;
      const normalized = value.trim().toLowerCase().replace(/_/g, '-');
      const base = normalized.split('-')[0];
      return [normalized, base].find(lang => supported.includes(lang)) ?? null;
    };

    // A saved user choice takes precedence over the OS locale. Obsolete or
    // unsupported saved languages are explicitly reset to English.
    if (this.settings.language) {
      this.settings.language = supportedLocale(this.settings.language) ?? fallback;
    } else if (systemLocale && systemLocale.trim()) {
      // Electron provides the OS locale over the trusted read-only IPC bridge.
      // Do not silently choose the browser language when the OS locale is unsupported.
      this.settings.language = supportedLocale(systemLocale) ?? fallback;
    } else {
      // PWA (or unavailable Electron OS locale): use the browser language.
      this.settings.language = supportedLocale(getBrowserCultureLang())
        ?? supportedLocale(getBrowserLang()) ?? fallback;
    }

    // Persist normalization only for an existing saved preference, without
    // changing the user's server, PoW or wallet settings.
    if (settingsStore && settings.language !== this.settings.language) {
      localStorage.setItem(this.storeKey, JSON.stringify({
        ...settings, language: this.settings.language
      }));
    }

    this.loadServerSettings();

    return this.settings;
  }

  loadServerSettings() {
    const matching = this.serverOptions.find(node => node.value === this.settings.serverName);
    if (this.settings.serverName === 'random') {
      this.pendingBestStartupSelection = !this.rankedEndpoints?.length;
      const availableRank = this.getRankedFallbackEndpoints('');
      const best = this.serverOptions.find(node =>
        node.api === availableRank?.[0] && node.allowFailover && !!node.ws && !node.auth) ||
        this.officialNodes.find(node => node.value === 'twister32-rsnano');
      this.settings.serverAPI = best?.api || null;
      this.settings.serverWS = best?.ws || null;
      this.settings.serverAuth = null;
    } else if (matching?.isLocal) {
      this.pendingBestStartupSelection = false;
      this.settings.serverAPI = matching.api;
      this.settings.serverWS = matching.ws;
      this.settings.serverAuth = matching.auth;
    } else if (matching?.value === 'custom') {
      this.pendingBestStartupSelection = false;
      // An unsaved New form is not an active server.
      this.settings.serverAPI = null;
      this.settings.serverWS = null;
      this.settings.serverAuth = null;
    } else {
      this.pendingBestStartupSelection = false;
      // Unknown removed nodes go back to RsNano, never random selection.
      const selected = matching || this.officialNodes.find(node => node.value === 'twister32-rsnano');
      this.settings.serverName = selected?.value || 'offline';
      this.settings.serverAPI = selected?.api || null;
      this.settings.serverWS = selected?.ws || null;
      this.settings.serverAuth = null;
    }
  }

  // A successful RPC failover updates persisted settings and announces its
  // WebSocket endpoint. A stale in-flight request cannot undo another switch.
  // Never rotate a user-configured private RPC or Offline Mode.
  activateFailover(expectedName: string, expectedApi: string, nextApi: string): boolean {
    if (expectedName === 'custom' || expectedName === 'offline') return false;
    const previous = this.serverOptions.find(server => server.api === expectedApi &&
      server.allowFailover && (expectedName === 'random' || server.value === expectedName));
    const next = this.serverOptions.find(server => server.api === nextApi &&
      server.allowFailover && !!server.ws && !server.auth);
    if (!previous || !next || !next.api || previous.api === next.api ||
        (expectedName !== 'random' && previous.value !== expectedName) ||
        this.settings.serverName !== expectedName || this.settings.serverAPI !== expectedApi ||
        this.settings.serverAuth) return false;

    this.setAppSettings({ serverName: next.value, serverAPI: next.api, serverWS: next.ws, serverAuth: null });
    this.serverFailover$.next({ previousName: previous.name, nextName: next.name });
    return true;
  }

  // Only use a dedicated PoW endpoint when the explicitly selected server
  // advertises one. Preserve the existing RPC work_generate path for all
  // other servers and never use a previous custom PoW URL implicitly.
  getSelectedServerWorkUrl(): string {
    const selected = this.serverOptions.find(server => server.value === this.settings.serverName);
    return selected && selected.work ? selected.work : '';
  }

  saveAppSettings() {
    localStorage.setItem(this.storeKey, JSON.stringify(this.settings));
  }

  getAppSetting<K extends keyof AppSettings>(key: K): AppSettings[K] | null {
    return this.settings[key] || null;
  }

  setAppSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    this.settings[key] = value;
    this.saveAppSettings();
  }

  private assignSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    this.settings[key] = value;
  }

  setAppSettings(settingsObject: Partial<AppSettings>): void {
    for (const key of Object.keys(settingsObject) as Array<keyof AppSettings>) {
      // Reject unexpected keys from imported or legacy settings objects.
      if (!Object.prototype.hasOwnProperty.call(this.settings, key)) continue;
      const value = settingsObject[key];
      if (value !== undefined) this.assignSetting(key, value);
    }

    this.saveAppSettings();
  }

  clearAppSettings() {
    localStorage.removeItem(this.storeKey);
    localStorage.removeItem(this.localNodeStoreKey);
    this.localNodes = [];
    this.serverOptions = this.buildServerOptions();
    this.rankedEndpoints = null;
    this.pendingBestStartupSelection = false;
    this.settings = {
      language: '',
      displayDenomination: 'mnano',
      // displayPrefix: 'xrb',
      walletStore: 'localStorage',
      displayCurrency: 'USD',
      defaultRepresentative: null,
      lockOnClose: 1,
      lockInactivityMinutes: 30,
      ledgerReconnect: 'usb',
      powSource: 'server',
      multiplierSource: 1,
      customWorkServer: '',
      pendingOption: 'amount',
      decentralizedAliasesOption: 'disabled',
      serverName: 'twister32-rsnano',
      serverAPI: null,
      serverWS: null,
      serverAuth: null,
      minimumReceive: '0.000001',
      walletVersion: 1,
      lightModeEnabled: false,
      identiconsStyle: 'nanoidenticons',
    };
  }

  // Get the base URL part of the serverAPI, e.g. https://nanovault.io from https://nanovault.io/api/node-api.
  getServerApiBaseUrl(): string {
    if (!this.settings.serverAPI) return '';
    const u = url.parse(this.settings.serverAPI);
    u.pathname = '/';
    return url.format(u);
  }
}
