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
    expect(server.api).toBe('https://twister32.changeip.net/proxy');
    expect(server.ws).toBe('wss://twister32.changeip.net/ws');
    expect(server.work).toBe('https://twister32.changeip.net/pow');
    expect(server.shouldRandom).toBe(false);
  }));

  it('uses the dedicated PoW URL only for the explicitly selected Twister32 server', inject([AppSettingsService], (service: AppSettingsService) => {
    service.settings.serverName = 'twister32-rsnano';
    expect(service.getSelectedServerWorkUrl()).toBe('https://twister32.changeip.net/pow');

    ['berrypay', 'rainstorm', 'nanoslo', 'random', 'custom', 'offline'].forEach(serverName => {
      service.settings.serverName = serverName;
      expect(service.getSelectedServerWorkUrl()).toBe('');
    });
  }));

  it('only rotates among tested public nodes', inject([AppSettingsService], (service: AppSettingsService) => {
    const active = service.serverOptions.filter(server => server.shouldRandom).map(server => server.value);
    expect(active).toEqual(['berrypay', 'rainstorm', 'nanoslo']);
    ['somenano', 'spynano', 'twister32-rsnano'].forEach(name => {
      expect(active).not.toContain(name);
      expect(service.serverOptions.some(server => server.value === name)).toBe(true);
    });
  }));
});
