import { Injectable } from '@angular/core';
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

  serverOptions = [
    {
      name: 'Random',
      value: 'random',
      api: null,
      ws: null,
      auth: null,
      shouldRandom: false,
    },
    {
      name: 'Berry Pay',
      value: 'berrypay',
      api: 'https://xno-rpc.berrypay.org/proxy',
      ws: 'wss://xno-rpc.berrypay.org/ws',
      auth: null,
      shouldRandom: true,
      // This public proxy rejects representatives_online (HTTP 400).
      supportsRepresentativesOnline: false,
    },
    {
      name: 'Rainstorm City',
      value: 'rainstorm',
      api: 'https://rainstorm.city/api',
      ws: 'wss://rainstorm.city/websocket',
      auth: null,
      shouldRandom: true,
    },
    {
      name: 'NanOslo',
      value: 'nanoslo',
      api: 'https://nanoslo.0x.no/proxy',
      ws: 'wss://nanoslo.0x.no/websocket',
      auth: null,
      shouldRandom: true,
    },
    {
      name: 'SomeNano',
      value: 'somenano',
      api: 'https://node.somenano.com/proxy',
      ws: 'wss://node.somenano.com/websocket',
      auth: null,
      shouldRandom: false,
    },
    {
      name: 'SpyNano (New Node - Use with caution)',
      value: 'spynano',
      api: 'https://node.spynano.org/proxy',
      ws: 'wss://node.spynano.org/websocket',
      auth: null,
      shouldRandom: false,
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
  }, [
    'node.somenano.com'
  ]);

  constructor(
    private translate: TranslocoService
  ) { }

  loadAppSettings() {
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

    if (!this.settings.language) {
      const browserCultureLang = getBrowserCultureLang();
      const browserLang = getBrowserLang();

      const availableLanguages = this.translate.getAvailableLangs();
      const available = (language: string) => availableLanguages.some(
        item => typeof item === 'string' ? item === language : item.id === language
      );
      if (browserCultureLang && available(browserCultureLang)) {
        this.settings.language = browserCultureLang;
      } else if (browserLang && available(browserLang)) {
        this.settings.language = browserLang;
      } else {
        this.settings.language = this.translate.getDefaultLang();
      }

      console.log('No language configured, setting to: ' + this.settings.language);
      console.log('Browser culture language: ' + browserCultureLang);
      console.log('Browser language: ' + browserLang);
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
      language: 'en',
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
