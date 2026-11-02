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

  it('lists Twister32 RsNano but never selects it at random', inject([AppSettingsService], (service: AppSettingsService) => {
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

  it('only rotates among tested public nodes', inject([AppSettingsService], (service: AppSettingsService) => {
    const active = service.serverOptions.filter(server => server.shouldRandom).map(server => server.value);
    expect(active).toEqual(['rainstorm', 'nanoslo']);
    expect(service.serverOptions.some(server => server.value === 'berrypay')).toBe(false);
    expect(active).not.toContain('twister32-rsnano');
    expect(service.serverOptions.some(server => server.value === 'twister32-rsnano')).toBe(true);
  }));

  it('retains SomeNano as a normal selectable node and SpyNano only as a test fixture', inject([AppSettingsService], (service: AppSettingsService) => {
    const someNano = service.serverOptions.find(option => option.value === 'somenano');
    expect(someNano?.name).toBe('SomeNano');
    expect(someNano?.api).toBe('https://node.somenano.com/proxy');
    expect(someNano?.shouldRandom).toBe(false);
    expect(someNano?.allowFailover).toBe(true);
    const spyNano = service.serverOptions.find(option => option.value === 'spynano');
    expect(spyNano?.shouldRandom).toBe(false);
    expect(spyNano?.allowFailover).toBe(true);
    expect(spyNano?.failoverTarget).toBe(false);
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
    const retainedPublicServers = ['rainstorm', 'nanoslo'];
    const retainedEndpoints = service.serverOptions
      .filter(server => retainedPublicServers.includes(server.value))
      .map(server => server.api);

    for (const removedServer of ['berrypay']) {
      expect(service.serverOptions.some(server => server.value === removedServer)).toBe(false);

      service.settings.serverName = removedServer;
      service.loadServerSettings();

      expect(service.settings.serverName).toBe('random');
      expect(retainedEndpoints).toContain(service.settings.serverAPI);
    }

    expect(service.knownApiEndpoints).toContain('node.somenano.com/proxy');
    expect(service.knownApiEndpoints).not.toContain('xno-rpc.berrypay.org/proxy');
  }));
});
