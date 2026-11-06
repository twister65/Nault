import { ComponentTestModule, isolateConstructorIO } from '../../testing/component-test.module';
import { TestBed, inject } from '@angular/core/testing';

import { PowService, workState } from './pow.service';
import { AppSettingsService } from './app-settings.service';

describe('PowService', () => {
  beforeEach(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
      providers: [PowService]
    });
  });

  it('should be created', inject([PowService], (service: PowService) => {
    expect(service).toBeTruthy();
  }));
  it('routes selected Twister32 proof of work to /pow rather than /proxy', inject(
    [PowService, AppSettingsService],
    async (service: PowService, settings: AppSettingsService) => {
      settings.settings.powSource = 'server';
      settings.settings.serverName = 'twister32-rsnano';
      const getHashServer = spyOn(service, 'getHashServer').and.returnValue(Promise.resolve('0000000000000001'));
      const hash = 'A'.repeat(64);

      const result = await service.getPow(hash, 1);
      expect(result.state).toBe(workState.success);
      expect(getHashServer).toHaveBeenCalledWith(hash, 1, 'https://twister32.changeip.net/pow');
    }
  ));

  it('leaves public, random, and custom work routing unchanged', inject(
    [PowService, AppSettingsService],
    async (service: PowService, settings: AppSettingsService) => {
      const getHashServer = spyOn(service, 'getHashServer').and.returnValue(Promise.resolve('0000000000000001'));
      settings.settings.powSource = 'server';
      for (const name of ['berrypay', 'random']) {
        settings.settings.serverName = name;
        const hash = (name === 'berrypay' ? 'B' : 'C').repeat(64);
        await service.getPow(hash, 1);
        expect(getHashServer).toHaveBeenCalledWith(hash, 1, '');
      }

      settings.settings.powSource = 'custom';
      settings.settings.serverName = 'twister32-rsnano';
      settings.settings.customWorkServer = 'https://twister32.changeip.net/pow';
      const hash = 'D'.repeat(64);
      await service.getPow(hash, 1);
      expect(getHashServer).toHaveBeenCalledWith(hash, 1, 'https://twister32.changeip.net/pow');
    }
  ));

  it('falls back from a healthy-RPC, unavailable-PoW server to ranked RsNano /pow without switching wallet RPC', inject(
    [PowService, AppSettingsService],
    async (service: PowService, app: AppSettingsService) => {
      app.settings.powSource = 'server';
      app.settings.serverName = 'random';
      app.settings.serverAPI = 'https://rainstorm.city/api';
      app.settings.serverAuth = null;
      const activate = spyOn(app, 'activateFailover').and.callThrough();
      spyOn(app, 'getRankedFallbackEndpoints').and.returnValue(['https://twister32.changeip.net/proxy']);
      const generate = spyOn(service, 'getHashServer').and.callFake(async (_hash, _multiplier, endpoint) =>
        endpoint === 'https://twister32.changeip.net/pow' ? '0123456789ABCDEF' : null);

      const result = await service.getPow('F'.repeat(64), 1);
      expect(result.state).toBe(workState.success);
      expect(generate.calls.allArgs().map(args => args[2])).toEqual([
        'https://rainstorm.city/api', 'https://twister32.changeip.net/pow'
      ]);
      expect(generate.calls.allArgs().map(args => args[3])).toEqual([30000, 20000]);
      expect(app.settings.serverAPI).toBe('https://rainstorm.city/api');
      expect(app.settings.serverName).toBe('random');
      expect(activate).not.toHaveBeenCalled();
    }
  ));

  it('never forwards a private local RPC or its credentials to fallback work servers', inject(
    [PowService, AppSettingsService],
    async (service: PowService, app: AppSettingsService) => {
      app.serverOptions.push({
        name: 'Private', value: 'local-private', api: 'https://private.example/rpc',
        ws: 'wss://private.example/ws', auth: 'secret', isLocal: true,
        shouldRandom: false, allowFailover: false
      });
      app.settings.serverName = 'local-private';
      app.settings.serverAPI = 'https://private.example/rpc';
      app.settings.serverAuth = 'secret';
      app.settings.powSource = 'server';
      const generate = spyOn(service, 'getHashServer').and.returnValue(Promise.resolve(null));
      await expectAsync(service.getPow('E'.repeat(64), 1)).toBeRejectedWith(
        jasmine.objectContaining({ state: workState.error }));
      expect(generate).toHaveBeenCalledOnceWith('E'.repeat(64), 1, '');
    }
  ));

  it('does not automatically rotate an explicit custom PoW server', inject(
    [PowService, AppSettingsService],
    async (service: PowService, app: AppSettingsService) => {
      app.settings.serverName = 'random';
      app.settings.serverAPI = 'https://rainstorm.city/api';
      app.settings.powSource = 'custom';
      app.settings.customWorkServer = 'https://private-work.example/pow';
      const generate = spyOn(service, 'getHashServer').and.returnValue(Promise.resolve(null));
      await expectAsync(service.getPow('D'.repeat(64), 1)).toBeRejectedWith(
        jasmine.objectContaining({ state: workState.error }));
      expect(generate.calls.count()).toBe(1);
      expect(generate.calls.first().args[2]).toBe('https://private-work.example/pow');
    }
  ));

});
