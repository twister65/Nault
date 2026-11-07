import { ComponentTestModule, isolateConstructorIO } from '../../testing/component-test.module';
import { TestBed, inject } from '@angular/core/testing';

import { PowService, workState } from './pow.service';
import { AppSettingsService } from './app-settings.service';
import { RpcNodeRankingService } from './rpc-node-ranking.service';
import { PoWApiKeyVaultService } from './pow-api-key-vault.service';

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
      expect(getHashServer).toHaveBeenCalledWith(hash, 1, 'https://twister32.changeip.net/pow', 30000);
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
      // A public custom URL now has bounded independent PoW fallback.
      expect(getHashServer).toHaveBeenCalledWith(hash, 1, 'https://twister32.changeip.net/pow', 30000);
    }
  ));

  it('uses Twister32 rather than unreliable wallet RPC nodes for PoW', inject(
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
      expect(generate.calls.allArgs().map(args => args[2]))
        .toEqual(['https://twister32.changeip.net/pow']);
      expect(generate.calls.allArgs().map(args => args[3])).toEqual([30000]);
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

  it('fails over a public custom work endpoint to RsNano /pow without changing wallet RPC or saved PoW settings', inject(
    [PowService, AppSettingsService, RpcNodeRankingService],
    async (service: PowService, app: AppSettingsService, ranking: RpcNodeRankingService) => {
      app.settings.serverName = 'rainstorm';
      app.settings.serverAPI = 'https://rainstorm.city/api';
      app.settings.serverAuth = null;
      app.settings.powSource = 'custom';
      app.settings.customWorkServer = 'https://proxy.nanos.cc/proxy';
      ranking.ready = false;
      const generate = spyOn(service, 'getHashServer').and.callFake(async (_hash, _multiplier, endpoint) =>
        endpoint === 'https://twister32.changeip.net/pow' ? '0123456789ABCDEF' : null);
      const activate = spyOn(app, 'activateFailover');
      const result = await service.getPow('1'.repeat(64), 1);
      expect(result.state).toBe(workState.success);
      expect(generate.calls.allArgs().map(args => args[2])).toEqual([
        'https://proxy.nanos.cc/proxy', 'https://twister32.changeip.net/pow'
      ]);
      expect(generate.calls.allArgs().map(args => args[3])).toEqual([30000, 30000]);
      expect(service.activeProvider$.value.name).toBe('Twister32 RsNano');
      expect(service.activeProvider$.value.status).toBe('available');
      expect(app.settings.serverName).toBe('rainstorm');
      expect(app.settings.serverAPI).toBe('https://rainstorm.city/api');
      expect(app.settings.powSource).toBe('custom');
      expect(app.settings.customWorkServer).toBe('https://proxy.nanos.cc/proxy');
      expect(activate).not.toHaveBeenCalled();
    }
  ));

  it('does not fail over a custom work URL when RPC credentials are configured', inject(
    [PowService, AppSettingsService],
    async (service: PowService, app: AppSettingsService) => {
      app.settings.serverName = 'local-private';
      app.settings.serverAPI = 'https://private.example/rpc';
      app.settings.serverAuth = 'secret';
      app.settings.powSource = 'custom';
      app.settings.customWorkServer = 'https://proxy.nanos.cc/proxy';
      const generate = spyOn(service, 'getHashServer').and.returnValue(Promise.resolve(null));
      await expectAsync(service.getPow('2'.repeat(64), 1)).toBeRejectedWith(
        jasmine.objectContaining({ state: workState.error }));
      expect(generate).toHaveBeenCalledOnceWith('2'.repeat(64), 1, 'https://proxy.nanos.cc/proxy');
    }
  ));

  it('does not continue public custom PoW retries after a settings change', inject(
    [PowService, AppSettingsService, RpcNodeRankingService],
    async (service: PowService, app: AppSettingsService, ranking: RpcNodeRankingService) => {
      app.settings.serverName = 'rainstorm';
      app.settings.serverAPI = 'https://rainstorm.city/api';
      app.settings.serverAuth = null;
      app.settings.powSource = 'custom';
      app.settings.customWorkServer = 'https://proxy.nanos.cc/proxy';
      ranking.ready = false;
      const generate = spyOn(service, 'getHashServer').and.callFake(async () => {
        app.settings.customWorkServer = 'https://changed.example/pow';
        return null;
      });
      await expectAsync(service.getPow('3'.repeat(64), 1)).toBeRejectedWith(
        jasmine.objectContaining({ state: workState.error }));
      expect(generate.calls.count()).toBe(1);
      expect(app.settings.serverAPI).toBe('https://rainstorm.city/api');
    }
  ));

  it('bounds custom PoW retries to Twister32 when both servers fail', inject(
    [PowService, AppSettingsService, RpcNodeRankingService],
    async (service: PowService, app: AppSettingsService, ranking: RpcNodeRankingService) => {
      app.settings.serverName = 'rainstorm';
      app.settings.serverAPI = 'https://rainstorm.city/api';
      app.settings.serverAuth = null;
      app.settings.powSource = 'custom';
      app.settings.customWorkServer = 'https://proxy.nanos.cc/proxy';
      ranking.ready = false;
      const generate = spyOn(service, 'getHashServer').and.returnValue(Promise.resolve(null));
      await expectAsync(service.getPow('4'.repeat(64), 1)).toBeRejectedWith(
        jasmine.objectContaining({ state: workState.error }));
      expect(generate.calls.allArgs().map(args => args[2])).toEqual([
        'https://proxy.nanos.cc/proxy', 'https://twister32.changeip.net/pow'
      ]);
      expect(generate.calls.count()).toBe(2);
      expect(generate.calls.allArgs().map(args => args[3])).toEqual([30000, 30000]);
      expect(app.settings.serverName).toBe('rainstorm');
      expect(app.settings.serverAPI).toBe('https://rainstorm.city/api');
    }
  ));

  it('uses bearer authentication exclusively on the Nano.to work endpoint', inject(
    [PowService, AppSettingsService, PoWApiKeyVaultService],
    async (pow: PowService, app: AppSettingsService, vault: PoWApiKeyVaultService) => {
      app.settings.serverAPI = 'https://rainstorm.city/api';
      const headersSpy = spyOn(vault, 'getAuthorizedHeaders').and.returnValue({
        Authorization: 'Bearer TEST-KEY-ONLY'
      });
      const fetchSpy = spyOn(window, 'fetch').and.returnValue(Promise.resolve({
        ok: true, json: async () => ({ work: '0123456789ABCDEF' })
      } as Response));
      spyOn<any>((pow as any).util.nano, 'validateWork').and.returnValue(true);
      const result = await pow.getHashServer('A'.repeat(64), 1, 'https://rpc.nano.to/', 15000);
      expect(result).toBe('0123456789ABCDEF');
      expect(headersSpy).toHaveBeenCalledWith('https://rpc.nano.to/');
      expect(fetchSpy.calls.count()).toBe(1);
      const [url, options] = fetchSpy.calls.mostRecent().args;
      expect(url).toBe('https://rpc.nano.to/');
      const opts = options as RequestInit;
      expect(opts.credentials).toBe('omit');
      expect(opts.redirect).toBe('error');
      expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer TEST-KEY-ONLY');
      expect(JSON.parse(opts.body as string).action).toBe('work_generate');
      expect(app.settings.serverAPI).toBe('https://rainstorm.city/api');
    }
  ));

  it('refuses credential-bearing provider URLs and never sends them to the network', inject(
    [PowService],
    async (pow: PowService) => {
      const network = spyOn<any>((pow as any).api, 'workGenerate');
      const fetchSpy = spyOn(window, 'fetch');
      const work = await pow.getHashServer(
        'C'.repeat(64), 1, 'https://rpc.nano.to/?api_key=DO-NOT-LOG', 15000);
      expect(work).toBeNull();
      expect(network).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  ));


  it('waits for the paid startup decision before selecting PoW fallback', inject(
    [PowService, AppSettingsService, PoWApiKeyVaultService],
    async (pow: PowService, app: AppSettingsService, vault: PoWApiKeyVaultService) => {
      app.settings.powSource = 'server';
      app.settings.serverName = 'nano-to';
      app.settings.serverAPI = 'https://rpc.nano.to/';
      app.settings.serverAuth = null;
      spyOnProperty(vault, 'hasVault', 'get').and.returnValue(true);
      vault.beginStartupUnlockDecision();
      const generate = spyOn(pow, 'getHashServer').and.resolveTo('0000000000000001');
      const request = pow.getPow('D'.repeat(64), 1);
      await Promise.resolve();
      expect(generate).not.toHaveBeenCalled();
      expect(app.settings.powSource).toBe('server');
      expect(app.settings.serverAPI).toBe('https://rpc.nano.to/');
      vault.resolveStartupUnlockDecision();
      expect((await request).state).toBe(workState.success);
      expect(generate).toHaveBeenCalled();
      expect(app.settings.serverAPI).toBe('https://rpc.nano.to/');
    }
  ));

  it('does not block free Twister32 PoW while vault unlock is pending', inject(
    [PowService, AppSettingsService, PoWApiKeyVaultService],
    async (pow: PowService, app: AppSettingsService, vault: PoWApiKeyVaultService) => {
      app.settings.powSource = 'server';
      app.settings.serverName = 'twister32-rsnano';
      app.settings.serverAPI = 'https://twister32.changeip.net/proxy';
      spyOnProperty(vault, 'hasVault', 'get').and.returnValue(true);
      vault.beginStartupUnlockDecision();
      const generate = spyOn(pow, 'getHashServer').and.resolveTo('0000000000000001');
      expect((await pow.getPow('E'.repeat(64), 1)).state).toBe(workState.success);
      expect(generate).toHaveBeenCalled();
      vault.resolveStartupUnlockDecision();
    }
  ));
  it('never sends anonymous work_generate to a locked paid provider', inject(
    [PowService, AppSettingsService, PoWApiKeyVaultService],
    async (pow: PowService, app: AppSettingsService, vault: PoWApiKeyVaultService) => {
      vault.lock();
      app.settings.serverAPI = 'https://rpc.nano.to/';
      const request = spyOn<any>((pow as any).api, 'workGenerate');
      const fetchSpy = spyOn(window, 'fetch');
      const result = await pow.getHashServer('E'.repeat(64), 1, 'https://rpc.nano.to/', 15000);
      expect(result).toBeNull();
      expect(request).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(app.settings.serverAPI).toBe('https://rpc.nano.to/');
    }
  ));

  it('after Later uses free RsNano work without contacting locked Nano.to or changing wallet RPC', inject(
    [PowService, AppSettingsService, RpcNodeRankingService, PoWApiKeyVaultService],
    async (pow: PowService, app: AppSettingsService, ranking: RpcNodeRankingService,
      vault: PoWApiKeyVaultService) => {
      vault.lock();
      // Simulate a previously encrypted vault, not an empty first launch.
      spyOnProperty(vault, 'hasVault', 'get').and.returnValue(true);
      vault.beginStartupUnlockDecision();
      app.settings.powSource = 'server';
      app.settings.serverName = 'nano-to';
      app.settings.serverAPI = 'https://rpc.nano.to/';
      app.settings.serverAuth = null;
      ranking.ready = false;
      spyOn(app, 'getRankedFallbackEndpoints').and.returnValue([]);
      const switchRpc = spyOn(app, 'activateFailover');
      const generate = spyOn(pow, 'getHashServer').and.callFake(async (_hash, _multiplier, endpoint) =>
        endpoint === 'https://twister32.changeip.net/pow' ? '0123456789ABCDEF' : null);

      const request = pow.getPow('8'.repeat(64), 1);
      await Promise.resolve();
      expect(generate).not.toHaveBeenCalled(); // Startup unlock decision pending.
      vault.resolveStartupUnlockDecision(); // User selects "Later".
      const result = await request;
      expect(result.state).toBe(workState.success);
      expect(generate).toHaveBeenCalledOnceWith(
        '8'.repeat(64), 1, 'https://twister32.changeip.net/pow', 30000);
      expect(pow.activeProvider$.value.name).toBe('Twister32 RsNano');
      expect(pow.activeProvider$.value.status).toBe('available');
      expect(app.settings.serverName).toBe('nano-to');
      expect(app.settings.serverAPI).toBe('https://rpc.nano.to/');
      expect(switchRpc).not.toHaveBeenCalled();
    }
  ));

  it('ignores the ranked NanoOslo RPC and only uses Twister32 after Later', inject(
    [PowService, AppSettingsService, RpcNodeRankingService, PoWApiKeyVaultService],
    async (pow: PowService, app: AppSettingsService, ranking: RpcNodeRankingService,
      vault: PoWApiKeyVaultService) => {
      vault.lock();
      app.settings.powSource = 'server';
      app.settings.serverName = 'nano-to';
      app.settings.serverAPI = 'https://rpc.nano.to/';
      app.settings.serverAuth = null;
      ranking.ready = true;
      spyOn(ranking, 'getExternalPoWTargets').and.returnValue([
        { api: 'https://nanoslo.0x.no/proxy', workUrl: 'https://nanoslo.0x.no/proxy' }
      ]);
      // A node excluded from RPC sync ranking must still be eligible for work.
      spyOn(app, 'getRankedFallbackEndpoints').and.returnValue([]);
      const generate = spyOn(pow, 'getHashServer').and.callFake(async (_hash, _multiplier, endpoint) =>
        endpoint === 'https://twister32.changeip.net/pow' ? '0123456789ABCDEF' : null);

      const result = await pow.getPow('9'.repeat(64), 1);
      expect(result.state).toBe(workState.success);
      expect(generate.calls.allArgs().map(args => args[2]))
        .toEqual(['https://twister32.changeip.net/pow']);
      expect(generate.calls.allArgs().map(args => args[3])).toEqual([30000]);
      expect(pow.activeProvider$.value.name).toBe('Twister32 RsNano');
      expect(pow.activeProvider$.value.status).toBe('available');
      expect(app.settings.serverAPI).toBe('https://rpc.nano.to/');
    }
  ));

  it('never tries unproven RPC nodes when Nano.to is locked and Twister32 fails', inject(
    [PowService, AppSettingsService, RpcNodeRankingService, PoWApiKeyVaultService],
    async (pow: PowService, app: AppSettingsService, ranking: RpcNodeRankingService,
      vault: PoWApiKeyVaultService) => {
      vault.lock();
      app.settings.powSource = 'server';
      app.settings.serverName = 'nano-to';
      app.settings.serverAPI = 'https://rpc.nano.to/';
      app.settings.serverAuth = null;
      ranking.ready = false;
      const switchRpc = spyOn(app, 'activateFailover');
      const generate = spyOn(pow, 'getHashServer').and.resolveTo(null);

      await expectAsync(pow.getPow('A'.repeat(64), 1)).toBeRejectedWith(
        jasmine.objectContaining({ state: workState.error }));
      const endpoints = generate.calls.allArgs().map(args => args[2]);
      expect(endpoints).toEqual(['https://twister32.changeip.net/pow']);
      expect(endpoints).not.toContain('https://rpc.nano.to/');
      expect(generate.calls.allArgs().map(args => args[3])).toEqual([30000]);
      expect(app.settings.serverName).toBe('nano-to');
      expect(app.settings.serverAPI).toBe('https://rpc.nano.to/');
      expect(switchRpc).not.toHaveBeenCalled();
    }
  ));

  it('never selects a locked paid provider for PoW fallback or marks it unavailable', inject(
    [PowService, AppSettingsService, RpcNodeRankingService, PoWApiKeyVaultService],
    async (pow: PowService, app: AppSettingsService, ranking: RpcNodeRankingService,
      vault: PoWApiKeyVaultService) => {
      vault.lock();
      app.settings.powSource = 'server';
      app.settings.serverName = 'nano-to';
      app.settings.serverAPI = 'https://rpc.nano.to/';
      app.settings.serverAuth = null;
      const marked = spyOn(ranking, 'recordPoWResult');
      const generate = spyOn(pow, 'getHashServer').and.returnValue(Promise.resolve(null));
      await expectAsync(pow.getPow('F'.repeat(64), 1)).toBeRejectedWith(
        jasmine.objectContaining({ state: workState.error }));
      // If no anonymous PoW works, the disabled provider is not evidence of
      // a failed Nano.to RPC endpoint. Other public PoW attempts may fail.
      expect(marked.calls.allArgs().every(args => args[0] !== 'https://rpc.nano.to/')).toBeTrue();
      expect(generate).toHaveBeenCalled();
      expect(app.settings.serverAPI).toBe('https://rpc.nano.to/');
    }
  ));

  it('does not attach Nano.to API keys to an unrelated external PoW endpoint', inject(
    [PowService, PoWApiKeyVaultService],
    async (pow: PowService, vault: PoWApiKeyVaultService) => {
      await vault.saveKey('nano-to', 'NANO-ONLY-TEST-KEY-123456', 'valid vault phrase');
      expect(vault.getAuthorizedHeaders('https://rainstorm.city/api')).toBeNull();
      const fetchSpy = spyOn(window, 'fetch');
      const ordinary = spyOn<any>((pow as any).api, 'workGenerate')
        .and.returnValue(Promise.resolve({ work: '0123456789ABCDEF' }));
      spyOn<any>((pow as any).util.nano, 'validateWork').and.returnValue(true);
      const result = await pow.getHashServer(
        'B'.repeat(64), 1, 'https://rainstorm.city/api', 15000);
      expect(result).toBe('0123456789ABCDEF');
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(ordinary).toHaveBeenCalled();
    }
  ));
  it('uses only Twister32 for automatic external PoW on installed Android PWA', inject(
    [PowService, AppSettingsService, RpcNodeRankingService],
    async (service: PowService, app: AppSettingsService, ranking: RpcNodeRankingService) => {
      spyOn<any>(service, 'isAndroidInstalledPwa').and.returnValue(true);
      spyOn(ranking, 'refresh').and.returnValue(Promise.resolve());
      // The asynchronous provider discovery has completed before this work.
      ranking.ready = true;
      spyOn(ranking, 'getExternalPoWTargets').and.returnValue([
        { api: 'https://nanoslo.0x.no/proxy', workUrl: 'https://nanoslo.0x.no/proxy' },
        { api: 'https://twister32.changeip.net/proxy', workUrl: 'https://twister32.changeip.net/pow' }
      ]);
      app.settings.powSource = 'server';
      app.settings.serverName = 'random';
      app.settings.serverAPI = 'https://rainstorm.city/api';
      app.settings.serverAuth = null;
      const generate = spyOn(service, 'getHashServer').and.callFake(async (_hash, _multiplier, workUrl) =>
        workUrl === 'https://twister32.changeip.net/pow' ? '0123456789ABCDEF' : null);
      const selectedBefore = { ...app.settings };
      const result = await service.getPow('B'.repeat(64), 1);
      expect(result.state).toBe(workState.success);
      expect(generate.calls.allArgs().map(args => args[2]))
        .toEqual(['https://twister32.changeip.net/pow']);
      expect(generate.calls.allArgs().map(args => args[3])).toEqual([30000]);
      expect(app.settings.serverAPI).toBe('https://rainstorm.city/api');
      expect(app.settings.serverName).toBe(selectedBefore.serverName);
    }
  ));

  it('uses the configured RsNano /pow immediately while Android provider discovery is pending', inject(
    [PowService, AppSettingsService, RpcNodeRankingService],
    async (service: PowService, app: AppSettingsService, ranking: RpcNodeRankingService) => {
      spyOn<any>(service, 'isAndroidInstalledPwa').and.returnValue(true);
      // Simulate the first work request after a wallet was imported into an
      // otherwise empty PWA session: the ranking has not completed yet.
      spyOn(ranking, 'refresh').and.returnValue(new Promise<void>(() => {}));
      ranking.ready = false;
      app.settings.powSource = 'server';
      app.settings.serverName = 'twister32-rsnano';
      app.settings.serverAPI = 'https://twister32.changeip.net/proxy';
      app.settings.serverAuth = null;
      const generate = spyOn(service, 'getHashServer')
        .and.returnValue(Promise.resolve('0123456789ABCDEF'));
      const work = await service.getPow('9'.repeat(64), 1);
      expect(work.state).toBe(workState.success);
      expect(generate).toHaveBeenCalledWith(
        '9'.repeat(64), 1, 'https://twister32.changeip.net/pow', 30000
      );
      expect(app.settings.serverAPI).toBe('https://twister32.changeip.net/proxy');
    }
  ));

  it('does not preselect external PoW in non-Android or non-installed browsers', inject(
    [PowService, RpcNodeRankingService],
    async (service: PowService, ranking: RpcNodeRankingService) => {
      spyOn<any>(service, 'isAndroidInstalledPwa').and.returnValue(false);
      const refresh = spyOn(ranking, 'refresh').and.returnValue(Promise.resolve());
      await service.initializeAndroidPwaExternalPoW();
      expect(refresh).not.toHaveBeenCalled();
    }
  ));

  it('preserves an explicit custom work server even on Android PWA', inject(
    [PowService, AppSettingsService, RpcNodeRankingService],
    async (service: PowService, app: AppSettingsService, ranking: RpcNodeRankingService) => {
      spyOn<any>(service, 'isAndroidInstalledPwa').and.returnValue(true);
      const refresh = spyOn(ranking, 'refresh').and.returnValue(Promise.resolve());
      const generate = spyOn(service, 'getHashServer').and.returnValue(Promise.resolve('0123456789ABCDEF'));
      app.settings.powSource = 'custom';
      app.settings.customWorkServer = 'https://private-work.example/pow';
      const work = await service.getPow('C'.repeat(64), 1);
      expect(work.state).toBe(workState.success);
      expect(generate.calls.mostRecent().args[2]).toBe('https://private-work.example/pow');
      expect(refresh).not.toHaveBeenCalled();
    }
  ));

});


describe('PoW provider display and first-launch defaults', () => {
  beforeEach(() => {
    isolateConstructorIO();
    TestBed.configureTestingModule({
      imports: [ComponentTestModule],
      providers: [PowService]
    });
  });

  it('shows Twister32 RsNano /pow without starting an automatic scan', inject(
    [PowService, AppSettingsService, RpcNodeRankingService],
    (pow: PowService, app: AppSettingsService, ranking: RpcNodeRankingService) => {
      app.settings.serverName = 'twister32-rsnano';
      app.settings.serverAPI = 'https://twister32.changeip.net/proxy';
      app.settings.powSource = 'server';
      const scan = spyOn(ranking, 'refresh');
      pow.syncProviderFromSettings(true);
      expect(pow.activeProvider$.value).toEqual({
        source: 'server', name: 'Twister32 RsNano',
        endpoint: 'https://twister32.changeip.net/pow', status: 'unverified'
      });
      expect(scan).not.toHaveBeenCalled();
    }
  ));

  it('updates the displayed source after work fallback without changing the wallet RPC', inject(
    [PowService, AppSettingsService],
    async (pow: PowService, app: AppSettingsService) => {
      app.settings.powSource = 'best';
      app.settings.serverName = 'random';
      app.settings.serverAPI = 'https://rainstorm.city/api';
      app.settings.serverAuth = null;
      spyOn(app, 'getRankedFallbackEndpoints').and.returnValue(['https://twister32.changeip.net/proxy']);
      spyOn(pow, 'getHashServer').and.callFake(async (_hash, _multiplier, url) =>
        url === 'https://twister32.changeip.net/pow' ? '0123456789ABCDEF' : null);
      const observed: string[] = [];
      const sub = pow.activeProvider$.subscribe(provider =>
        observed.push(provider.name + ':' + provider.status));
      try {
        expect((await pow.getPow('1'.repeat(64), 1)).state).toBe(workState.success);
        expect(observed).not.toContain('Rainstorm City:unavailable');
        expect(observed).toContain('Twister32 RsNano:available');
        expect(pow.activeProvider$.value.name).toBe('Twister32 RsNano');
        expect(pow.activeProvider$.value.status).toBe('available');
        expect(app.settings.serverName).toBe('random');
        expect(app.settings.serverAPI).toBe('https://rainstorm.city/api');
      } finally { sub.unsubscribe(); }
    }
  ));

  it('retains successful PoW fallback status when reopening settings', inject(
    [PowService, AppSettingsService],
    (pow: PowService, app: AppSettingsService) => {
      app.settings.powSource = 'best';
      app.settings.serverAPI = 'https://rainstorm.city/api';
      pow.syncProviderFromSettings(true);
      const state = pow.activeProvider$.value;
      expect(state.name).toBe('Rainstorm City');
      pow.syncProviderFromSettings();
      expect(pow.activeProvider$.value).toEqual(state);
    }
  ));
});
