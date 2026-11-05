import { ComponentTestModule, isolateConstructorIO } from '../../testing/component-test.module';
import { TestBed, inject } from '@angular/core/testing';

import { AppSettingsService } from './app-settings.service';

describe('AppSettingsService', () => {
  beforeEach(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
      providers: [AppSettingsService]
    });
  });

  it('should be created', inject([AppSettingsService], (service: AppSettingsService) => {
    expect(service).toBeTruthy();
  }));

  it('defaults to the OS French language only when there is no saved choice', inject([AppSettingsService], (service: AppSettingsService) => {
    const saved = localStorage.getItem(service.storeKey);
    try {
      localStorage.removeItem(service.storeKey);
      service.settings.language = '';
      service.loadAppSettings('fr-FR');
      expect(service.settings.language).toBe('fr');
      service.settings.language = 'es';
      service.loadAppSettings('fr-FR');
      expect(service.settings.language).toBe('es');
    } finally {
      if (saved === null) localStorage.removeItem(service.storeKey);
      else localStorage.setItem(service.storeKey, saved);
    }
  }));

  it('restores the OS-language default after clearing application settings', inject([AppSettingsService], (service: AppSettingsService) => {
    const saved = localStorage.getItem(service.storeKey);
    try {
      service.clearAppSettings();
      expect(service.settings.language).toBe('');
      service.loadAppSettings('fr_FR');
      expect(service.settings.language).toBe('fr');
    } finally {
      if (saved === null) localStorage.removeItem(service.storeKey);
      else localStorage.setItem(service.storeKey, saved);
    }
  }));

  it('uses German and regional language codes from the OS locale', inject([AppSettingsService], (service: AppSettingsService) => {
    const saved = localStorage.getItem(service.storeKey);
    try {
      localStorage.removeItem(service.storeKey);
      for (const [locale, expected] of [['de-DE', 'de'], ['de_AT', 'de'], ['es-MX', 'es'], ['fr-CA', 'fr']]) {
        service.settings.language = '';
        service.loadAppSettings(locale);
        expect(service.settings.language).toBe(expected);
      }
    } finally {
      if (saved === null) localStorage.removeItem(service.storeKey);
      else localStorage.setItem(service.storeKey, saved);
    }
  }));

  it('defaults to English for an unsupported OS locale instead of choosing the browser language', inject([AppSettingsService], (service: AppSettingsService) => {
    const saved = localStorage.getItem(service.storeKey);
    try {
      localStorage.removeItem(service.storeKey);
      service.settings.language = '';
      service.loadAppSettings('it-IT');
      expect(service.settings.language).toBe('en');
      service.settings.language = '';
      service.loadAppSettings('ja-JP');
      expect(service.settings.language).toBe('en');
    } finally {
      if (saved === null) localStorage.removeItem(service.storeKey);
      else localStorage.setItem(service.storeKey, saved);
    }
  }));

  it('preserves a supported saved language over the OS locale', inject([AppSettingsService], (service: AppSettingsService) => {
    const saved = localStorage.getItem(service.storeKey);
    try {
      localStorage.setItem(service.storeKey, JSON.stringify({ ...service.settings, language: 'es' }));
      service.loadAppSettings('de-DE');
      expect(service.settings.language).toBe('es');
    } finally {
      if (saved === null) localStorage.removeItem(service.storeKey);
      else localStorage.setItem(service.storeKey, saved);
    }
  }));

  it('normalizes an obsolete saved language to English without losing other settings', inject([AppSettingsService], (service: AppSettingsService) => {
    const saved = localStorage.getItem(service.storeKey);
    try {
      localStorage.setItem(service.storeKey, JSON.stringify({
        ...service.settings, language: 'it-IT', displayCurrency: 'EUR'
      }));
      service.loadAppSettings('de-DE');
      expect(service.settings.language).toBe('en');
      expect(service.settings.displayCurrency).toBe('EUR');
      const restored = JSON.parse(localStorage.getItem(service.storeKey) || '{}');
      expect(restored.language).toBe('en');
      expect(restored.displayCurrency).toBe('EUR');
    } finally {
      if (saved === null) localStorage.removeItem(service.storeKey);
      else localStorage.setItem(service.storeKey, saved);
    }
  }));

  it("normalizes a saved German regional variant without ignoring the user preference", inject([AppSettingsService], (service: AppSettingsService) => {
    const saved = localStorage.getItem(service.storeKey);
    try {
      localStorage.setItem(service.storeKey, JSON.stringify({ ...service.settings, language: 'de-CH' }));
      service.loadAppSettings('fr-FR');
      expect(service.settings.language).toBe('de');
      expect(JSON.parse(localStorage.getItem(service.storeKey) || '{}').language).toBe('de');
    } finally {
      if (saved === null) localStorage.removeItem(service.storeKey);
      else localStorage.setItem(service.storeKey, saved);
    }
  }));

  it('lists Twister32 RsNano as the first-launch default', inject([AppSettingsService], (service: AppSettingsService) => {
    const server = service.serverOptions.find(option => option.value === 'twister32-rsnano');
    expect(server).toBeTruthy();
    if (!server) throw new Error('Twister32 RsNano must be listed in serverOptions');
    expect(server.api).toBe('https://twister32.changeip.net/proxy');
    expect(server.ws).toBe('wss://twister32.changeip.net/ws');
    expect(server.work).toBe('https://twister32.changeip.net/pow');
    expect(server.shouldRandom).toBe(false);
  }));

  it('uses the dedicated PoW URL only for the explicitly selected Twister32 server', inject([AppSettingsService], (service: AppSettingsService) => {
    service.settings.serverName = 'twister32-rsnano';
    expect(service.getSelectedServerWorkUrl()).toBe('https://twister32.changeip.net/pow');

    ['rainstorm', 'nanoslo', 'random', 'custom', 'offline'].forEach(serverName => {
      service.settings.serverName = serverName;
      expect(service.getSelectedServerWorkUrl()).toBe('');
    });
  }));

  it('keeps the former random flags without using random selection', inject([AppSettingsService], (service: AppSettingsService) => {
    const active = service.serverOptions.filter(server => server.shouldRandom).map(server => server.value);
    expect(active).toEqual(['rainstorm', 'nanoslo']);
    expect(service.serverOptions.some(server => server.value === 'berrypay')).toBe(false);
    expect(active).not.toContain('twister32-rsnano');
    expect(service.serverOptions.some(server => server.value === 'twister32-rsnano')).toBe(true);
  }));

  it('retains SomeNano while removing the temporary SpyNano test server from production', inject([AppSettingsService], (service: AppSettingsService) => {
    const someNano = service.serverOptions.find(option => option.value === 'somenano');
    expect(someNano?.name).toBe('SomeNano');
    expect(someNano?.api).toBe('https://node.somenano.com/proxy');
    expect(someNano?.shouldRandom).toBe(false);
    expect(someNano?.allowFailover).toBe(true);
    expect(service.serverOptions.some(option => option.value === 'spynano')).toBe(false);
    expect(service.serverOptions.some(option => option.api === 'https://node.spynano.org/proxy')).toBe(false);
  }));

  it('persists a failover, WebSocket endpoint and notification event only once', inject([AppSettingsService], (service: AppSettingsService) => {
    service.settings.serverName = 'twister32-rsnano';
    service.loadServerSettings();
    const previous = service.settings.serverAPI!;
    const onFailover = jasmine.createSpy('onFailover');
    service.serverFailover$.subscribe(onFailover);
    expect(service.activateFailover('twister32-rsnano', previous, 'https://rainstorm.city/api')).toBe(true);
    expect(service.settings.serverName).toBe('rainstorm');
    expect(service.settings.serverAPI).toBe('https://rainstorm.city/api');
    expect(service.settings.serverWS).toBe('wss://rainstorm.city/websocket');
    expect(service.settings.serverAuth).toBeNull();
    expect(JSON.parse(localStorage.getItem(service.storeKey)!).serverName).toBe('rainstorm');
    expect(onFailover).toHaveBeenCalledWith({ previousName: 'Twister32 RsNano', nextName: 'Rainstorm City' });
    expect(service.activateFailover('twister32-rsnano', previous, 'https://nanoslo.0x.no/proxy')).toBe(false);
    expect(onFailover).toHaveBeenCalledTimes(1);
  }));

  it('never switches a custom RPC or explicit offline selection', inject([AppSettingsService], (service: AppSettingsService) => {
    service.settings.serverName = 'custom';
    service.settings.serverAPI = 'https://private.invalid/rpc';
    service.settings.serverAuth = 'secret';
    expect(service.activateFailover('custom', 'https://private.invalid/rpc', 'https://rainstorm.city/api')).toBe(false);
    service.settings.serverName = 'offline';
    expect(service.activateFailover('offline', 'https://private.invalid/rpc', 'https://rainstorm.city/api')).toBe(false);
    expect(service.settings.serverAPI).toBe('https://private.invalid/rpc');
  }));

  it('removes Berry Pay and falls back safely for previously saved selections', inject([AppSettingsService], (service: AppSettingsService) => {
    for (const removedServer of ['berrypay']) {
      expect(service.serverOptions.some(server => server.value === removedServer)).toBe(false);

      service.settings.serverName = removedServer;
      service.loadServerSettings();

      expect(service.settings.serverName).toBe('twister32-rsnano');
      expect(service.settings.serverAPI).toBe('https://twister32.changeip.net/proxy');
    }

    expect(service.knownApiEndpoints).toContain('node.somenano.com/proxy');
    expect(service.knownApiEndpoints).not.toContain('xno-rpc.berrypay.org/proxy');
  }));
  it('never waits for ranking or changes RsNano on a fresh first start', inject([AppSettingsService], (service: AppSettingsService) => {
    const previous = localStorage.getItem(service.storeKey);
    try {
      localStorage.removeItem(service.storeKey);
      service.loadAppSettings('en');
      expect(service.settings.serverName).toBe('twister32-rsnano');
      expect(service.settings.serverAPI).toBe('https://twister32.changeip.net/proxy');
    } finally {
      if (previous === null) localStorage.removeItem(service.storeKey);
      else localStorage.setItem(service.storeKey, previous);
    }
  }));

  it('uses the fastest validated candidate only when The best is selected', inject([AppSettingsService], (service: AppSettingsService) => {
    service.setRankedEndpoints(['https://nanoslo.0x.no/proxy', 'https://rainstorm.city/api']);
    service.settings.serverName = 'random'; // persisted legacy identifier
    service.loadServerSettings();
    expect(service.settings.serverAPI).toBe('https://nanoslo.0x.no/proxy');
    expect(service.getRankedFallbackEndpoints('https://nanoslo.0x.no/proxy'))
      .toEqual(['https://rainstorm.city/api']);
  }));

  it('stores New nodes locally across reloads and never makes them automatic fallback candidates', inject([AppSettingsService], (service: AppSettingsService) => {
    const id = service.saveLocalNode('My node', 'https://mine.example/rpc', 'wss://mine.example/ws', null);
    try {
      service.setAppSettings({ serverName: id });
      service.loadAppSettings();
      expect(service.settings.serverName).toBe(id);
      expect(service.settings.serverAPI).toBe('https://mine.example/rpc');
      expect(service.serverOptions.find(node => node.value === id)?.isLocal).toBeTrue();
      expect(service.serverOptions.find(node => node.value === id)?.allowFailover).not.toBeTrue();
      service.removeLocalNode(id);
      expect(service.serverOptions.some(node => node.value === id)).toBeFalse();
    } finally {
      service.removeLocalNode(id);
    }
  }));
});
