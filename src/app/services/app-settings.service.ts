import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import * as url from 'url';
import { TranslocoService, getBrowserCultureLang, getBrowserLang } from '@jsverse/transloco';

export type WalletStore = 'localStorage'|'none';
export type PoWSource = 'server'|'clientCPU'|'clientWebGL'|'best'|'custom';
export type LedgerConnectionType = 'usb'|'bluetooth';

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

  // Explicit optional capabilities preserve typing when no built-in server uses a flag.
  serverOptions: Array<{
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
  }> = [
    {
      name: 'Random',
      value: 'random',
      api: null,
      ws: null,
      auth: null,
      shouldRandom: false,
    },
    {
      name: 'Rainstorm City',
      value: 'rainstorm',
      api: 'https://rainstorm.city/api',
      ws: 'wss://rainstorm.city/websocket',
      auth: null,
      shouldRandom: true,
      allowFailover: true,
    },
    {
      name: 'NanOslo',
      value: 'nanoslo',
      api: 'https://nanoslo.0x.no/proxy',
      ws: 'wss://nanoslo.0x.no/websocket',
      auth: null,
      shouldRandom: true,
      allowFailover: true,
    },
    // SomeNano remains available for manual selection and as a fallback.
    {
      name: 'SomeNano',
      value: 'somenano',
      api: 'https://node.somenano.com/proxy',
      ws: 'wss://node.somenano.com/websocket',
      auth: null,
      shouldRandom: false,
      allowFailover: true,
    },
    {
      // Preferred personal RsNano node, not included in random rotation.
      name: 'Twister32 RsNano',
      value: 'twister32-rsnano',
      api: 'https://twister32.changeip.net/proxy',
      ws: 'wss://twister32.changeip.net/ws',
      // Separate PoW proxy; the RPC endpoint is not a substitute for /pow.
      work: 'https://twister32.changeip.net/pow',
      auth: null,
      shouldRandom: false,
      allowFailover: true,
    },
    {
      name: 'Custom',
      value: 'custom',
      api: null,
      ws: null,
      auth: null,
      shouldRandom: false,
    },
    {
      name: 'Offline Mode',
      value: 'offline',
      api: null,
      ws: null,
      auth: null,
      shouldRandom: false,
    }
  ];

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
      // Migrate only the legacy pair of defaults from pre-Twister32 installs.
      // Keep any other user-selected RPC or PoW preference unchanged.
      if (settings.serverName === 'random' && settings.powSource === 'best') {
        settings = { ...settings, serverName: 'twister32-rsnano', powSource: 'server' };
        localStorage.setItem(this.storeKey, JSON.stringify(settings));
      }
    }
    this.settings = Object.assign(this.settings, settings);

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
    // Credentials belong exclusively to the custom RPC configuration.
    if (this.settings.serverName !== 'custom') this.settings.serverAuth = null;
    const matchingServerOption = this.serverOptions.find(d => d.value === this.settings.serverName);

    if (this.settings.serverName === 'random' || !matchingServerOption) {
      const availableServers = this.serverOptions.filter(server => server.shouldRandom);
      const randomServerOption = availableServers[Math.floor(Math.random() * availableServers.length)];
      console.log('SETTINGS: Random', randomServerOption);

      this.settings.serverAPI = randomServerOption.api;
      this.settings.serverWS = randomServerOption.ws;
      this.settings.serverName = 'random';
    } else if (this.settings.serverName === 'custom') {
      console.log('SETTINGS: Custom');
    } else if (this.settings.serverName === 'offline') {
      console.log('SETTINGS: Offline Mode');
      this.settings.serverName = matchingServerOption.value;
      this.settings.serverAPI = matchingServerOption.api;
      this.settings.serverWS = matchingServerOption.ws;
    } else {
      console.log('SETTINGS: Found', matchingServerOption);
      this.settings.serverName = matchingServerOption.value;
      this.settings.serverAPI = matchingServerOption.api;
      this.settings.serverWS = matchingServerOption.ws;
    }
  }

  // A successful RPC failover updates persisted settings and announces its
  // WebSocket endpoint. A stale in-flight request cannot undo another switch.
  // Never rotate a user-configured private RPC or Offline Mode.
  activateFailover(expectedName: string, expectedApi: string, nextApi: string): boolean {
    if (expectedName === 'custom' || expectedName === 'offline') return false;
    const previous = this.serverOptions.find(server => server.api === expectedApi && server.allowFailover);
    const next = this.serverOptions.find(server => server.api === nextApi && server.allowFailover);
    if (!previous || !next || !next.api || previous.value === next.value ||
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
