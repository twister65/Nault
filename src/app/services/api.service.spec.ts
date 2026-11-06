import { ApiService } from './api.service';
import { TxType } from './util.service';
import { of, throwError, NEVER, Subject } from 'rxjs';
import { fakeAsync, tick } from '@angular/core/testing';

describe('ApiService.process', () => {
  it('submits a JSON block without double-encoding it', async () => {
    const service = new ApiService(null as any, null as any, null as any);
    const request = spyOn<any>(service, 'request').and.returnValue(Promise.resolve({ hash: 'hash' }));
    const block = {
      type: 'state',
      account: 'nano_test',
      previous: '0'.repeat(64),
      representative: 'nano_representative',
      balance: '100',
      link: '0'.repeat(64),
      signature: 'A'.repeat(128),
      work: 'A'.repeat(16)
    };

    for (const subtype of [TxType.send, TxType.receive, TxType.open, TxType.change]) {
      const result = await service.process(block, subtype);
      expect(result).toEqual({ hash: 'hash' });
      expect(request).toHaveBeenCalledWith('process', {
        json_block: 'true',
        block,
        subtype: TxType[subtype]
      }, false);
      const payload = request.calls.mostRecent().args[1] as any;
      expect(payload.block).toBe(block);
      expect(payload.watch_work).toBeUndefined();
    }
    expect(request).toHaveBeenCalledTimes(4);
  });
});


describe('ApiService block contents compatibility', () => {
  const block = { type: 'state', balance: '100', representative: 'nano_representative' };

  it('normalizes RsNano object contents in blocks_info', async () => {
    const service = new ApiService(null as any, null as any, null as any);
    const request = spyOn<any>(service, 'request').and.returnValue(Promise.resolve({
      blocks: { ABC: { amount: '1', contents: { ...block } } }
    }));

    const response = await service.blocksInfo(['ABC']);

    expect(request).toHaveBeenCalledWith('blocks_info', {
      hashes: ['ABC'], pending: true, source: true
    }, false);
    expect(typeof response.blocks.ABC.contents).toBe('string');
    expect(JSON.parse(response.blocks.ABC.contents)).toEqual(block);
    expect(response.blocks.ABC.amount).toBe('1');
  });

  it('preserves Nano Node string contents in blocks_info', async () => {
    const service = new ApiService(null as any, null as any, null as any);
    const contents = JSON.stringify(block);
    spyOn<any>(service, 'request').and.returnValue(Promise.resolve({
      blocks: { ABC: { contents } }
    }));

    const response = await service.blocksInfo(['ABC']);

    expect(response.blocks.ABC.contents).toBe(contents);
  });

  it('normalizes object contents in block_info', async () => {
    const service = new ApiService(null as any, null as any, null as any);
    const request = spyOn<any>(service, 'request').and.returnValue(Promise.resolve({
      contents: { ...block }, subtype: 'send'
    }));

    const response = await service.blockInfo('ABC');

    expect(request).toHaveBeenCalledWith('block_info', { hash: 'ABC' }, false);
    expect(JSON.parse(response.contents)).toEqual(block);
    expect(response.subtype).toBe('send');
  });
});


describe('ApiService receivable RPC compatibility', () => {
  it('uses accounts_receivable for all multi-account pending queries', async () => {
    const service = new ApiService(null as any, null as any, null as any);
    const request = spyOn<any>(service, 'request').and.returnValue(Promise.resolve({ blocks: {} }));
    const accounts = ['nano_test'];
    const base = { accounts, count: 50, source: true, include_only_confirmed: true };

    await service.accountsPending(accounts);
    expect(request).toHaveBeenCalledWith('accounts_receivable', base, false);

    await service.accountsPendingLimit(accounts, '100');
    expect(request).toHaveBeenCalledWith('accounts_receivable', { ...base, threshold: '100' }, false);

    await service.accountsPendingSorted(accounts);
    expect(request).toHaveBeenCalledWith('accounts_receivable', { ...base, sorting: true }, false);

    await service.accountsPendingLimitSorted(accounts, '100');
    expect(request).toHaveBeenCalledWith('accounts_receivable', { ...base, threshold: '100', sorting: true }, false);
    expect(request).toHaveBeenCalledTimes(4);
  });

  it('uses receivable for all single-account pending queries', async () => {
    const service = new ApiService(null as any, null as any, null as any);
    const request = spyOn<any>(service, 'request').and.returnValue(Promise.resolve({ blocks: {} }));
    const account = 'nano_test';
    const base = { account, count: 50, source: true, include_only_confirmed: true };

    await service.pending(account, 50);
    expect(request).toHaveBeenCalledWith('receivable', base, false);

    await service.pendingLimit(account, 50, '100');
    expect(request).toHaveBeenCalledWith('receivable', { ...base, threshold: '100' }, false);

    await service.pendingSorted(account, 50);
    expect(request).toHaveBeenCalledWith('receivable', { ...base, sorting: true }, false);

    await service.pendingLimitSorted(account, 50, '100');
    expect(request).toHaveBeenCalledWith('receivable', { ...base, threshold: '100', sorting: true }, false);
    expect(request).toHaveBeenCalledTimes(4);
  });
});


describe('ApiService RPC proxy fallback', () => {
  function setupProxy(
    refusedAction: string | null,
    serverName: string = 'custom',
    refusalMessage: string | null = null
  ) {
    const payloads: any[] = [];
    const http = {
      post: jasmine.createSpy('post').and.callFake((_url: string, payload: any) => {
        payloads.push({ ...payload });
        if (payload.action === refusedAction) {
          return throwError({
            status: 500,
            error: { error: refusalMessage || `Action ${refusedAction} not allowed` },
            isRpcError: true
          });
        }
        return of({ blocks: {} });
      })
    };
    const node = {
      node: { status: true },
      setOnline: jasmine.createSpy('setOnline'),
      setOffline: jasmine.createSpy('setOffline'),
      setLoading: jasmine.createSpy('setLoading')
    };
    const settings = {
      settings: {
        serverAPI: 'https://example.invalid/proxy',
        serverName,
        serverAuth: null
      },
      loadServerSettings: jasmine.createSpy('loadServerSettings')
    };
    return {
      api: new ApiService(http as any, node as any, settings as any),
      payloads, node, settings
    };
  }

  it('retries accounts_pending on a proxy denial without rotating a random server', async () => {
    const { api, payloads, node, settings } = setupProxy('accounts_receivable', 'random');

    const response = await api.accountsPendingLimitSorted(['nano_test'], '100');

    expect(response).toEqual({ blocks: {} });
    expect(payloads.map(p => p.action)).toEqual(['accounts_receivable', 'accounts_pending']);
    for (const payload of payloads) {
      expect(payload.accounts).toEqual(['nano_test']);
      expect(payload.threshold).toBe('100');
      expect(payload.count).toBe(50);
      expect(payload.source).toBe(true);
      expect(payload.sorting).toBe(true);
      expect(payload.include_only_confirmed).toBe(true);
    }
    expect(settings.loadServerSettings).not.toHaveBeenCalled();
    expect(node.setOffline).not.toHaveBeenCalled();
  });

  it('retries pending on a proxy denial of receivable', async () => {
    const { api, payloads } = setupProxy('receivable');

    await api.pendingLimitSorted('nano_test', 25, '100');

    expect(payloads.map(p => p.action)).toEqual(['receivable', 'pending']);
    for (const payload of payloads) {
      expect(payload.account).toBe('nano_test');
      expect(payload.count).toBe(25);
      expect(payload.threshold).toBe('100');
      expect(payload.source).toBe(true);
      expect(payload.sorting).toBe(true);
    }
  });

  it('uses accounts_receivable directly when the node supports it', async () => {
    const { api, payloads } = setupProxy(null);

    await api.accountsPendingSorted(['nano_test']);

    expect(payloads.map(p => p.action)).toEqual(['accounts_receivable']);
  });

  it('does not silently fall back on an unrelated HTTP 500 JSON-RPC action error', async () => {
    const { api, payloads, node } = setupProxy('accounts_receivable', 'custom', 'Internal server error');

    let error: any;
    try {
      await api.accountsPending(['nano_test']);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeDefined();
    expect(payloads.map(p => p.action)).toEqual(['accounts_receivable']);
    expect(node.setOffline).not.toHaveBeenCalled();
  });

  it('retries accounts_pending on HTTP 200 JSON action denial without switching servers', async () => {
    const { api, payloads, node, settings } = setupProxy(null, 'random');
    const http = (api as any).http;
    http.post.and.callFake((_url: string, payload: any) => {
      payloads.push({ ...payload });
      return of(payload.action === 'accounts_receivable'
        ? { error: 'Action accounts_receivable not allowed' }
        : { blocks: {} });
    });
    expect(await api.accountsPending(['nano_test'])).toEqual({ blocks: {} });
    expect(payloads.map(p => p.action)).toEqual(['accounts_receivable', 'accounts_pending']);
    expect(node.setOffline).not.toHaveBeenCalled();
    expect(settings.loadServerSettings).not.toHaveBeenCalled();
  });

  it('retries pending on HTTP 200 JSON action denial on the same node', async () => {
    const { api, payloads } = setupProxy(null);
    const http = (api as any).http;
    http.post.and.callFake((_url: string, payload: any) => {
      payloads.push({ ...payload });
      return of(payload.action === 'receivable'
        ? { error: 'Action receivable not allowed' }
        : { blocks: {} });
    });
    expect(await api.pending('nano_test', 5)).toEqual({ blocks: {} });
    expect(payloads.map(p => p.action)).toEqual(['receivable', 'pending']);
  });
});

describe('ApiService optional node statistics', () => {
  it('does not treat denied public block_count statistics as a node outage', async () => {
    const http = { post: jasmine.createSpy('post').and.returnValue(throwError({
      status: 500, isRpcError: true, error: { error: 'Action block_count not allowed' }
    })) };
    const node = {
      node: { status: true },
      setOffline: jasmine.createSpy('setOffline'),
      setOnline: jasmine.createSpy('setOnline')
    };
    const settings = {
      settings: { serverName: 'spynano', serverAPI: 'https://example.org/proxy' },
      serverOptions: [{ value: 'spynano', api: 'https://example.org/proxy', allowFailover: true }],
      activateFailover: jasmine.createSpy('activateFailover')
    };
    const api = new ApiService(http as any, node as any, settings as any);
    expect(await api.optionalBlockCount()).toBeNull();
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(node.setOffline).not.toHaveBeenCalled();
    expect(settings.activateFailover).not.toHaveBeenCalled();
  });

  it('does not display unavailable statistics from HTTP 200 JSON RPC denial', async () => {
    const http = { post: jasmine.createSpy('post').and.returnValue(of({ error: 'Action block_count not allowed' })) };
    const node = { node: { status: true }, setOffline: jasmine.createSpy('setOffline'), setOnline: jasmine.createSpy('setOnline') };
    const settings = { settings: { serverAPI: 'https://example.org/proxy', serverName: 'random' } };
    const api = new ApiService(http as any, node as any, settings as any);
    expect(await api.optionalBlockCount()).toBeNull();
    expect(node.setOffline).not.toHaveBeenCalled();
    expect(node.setOnline).not.toHaveBeenCalled();
  });

  it('keeps node health unchanged when optional statistics succeed', async () => {
    const http = { post: jasmine.createSpy('post').and.returnValue(of({
      count: '225972210', cemented: '225972210', unchecked: '0'
    })) };
    const node = {
      node: { status: false },
      setOnline: jasmine.createSpy('setOnline'),
      setOffline: jasmine.createSpy('setOffline'),
      setLoading: jasmine.createSpy('setLoading')
    };
    const settings = {
      settings: { serverAPI: 'https://twister32.changeip.net/proxy', serverName: 'twister32-rsnano' }
    };
    const api = new ApiService(http as any, node as any, settings as any);
    expect(await api.optionalBlockCount()).toEqual({
      count: '225972210', cemented: '225972210', unchecked: '0'
    } as any);
    expect(node.setOnline).not.toHaveBeenCalled();
    expect(node.setOffline).not.toHaveBeenCalled();
    expect(node.node.status).toBeFalse();
  });
});

describe('ApiService optional representative metadata', () => {
  const berryPay = 'https://xno-rpc.berrypay.org/proxy';
  const nanoSlo = 'https://nanoslo.0x.no/proxy';

  function setup(serverName: string, serverAPI: string) {
    const http = { post: jasmine.createSpy('post').and.returnValue(of({ representatives: { example: 'nano_rep' } })) };
    const node = {
      node: { status: true },
      setOnline: jasmine.createSpy('setOnline'),
      setOffline: jasmine.createSpy('setOffline'),
      setLoading: jasmine.createSpy('setLoading')
    };
    const settings = {
      settings: { serverName, serverAPI, serverAuth: null },
      serverOptions: [
        { value: 'berrypay', api: berryPay, supportsRepresentativesOnline: false },
        { value: 'nanoslo', api: nanoSlo, supportsRepresentativesOnline: true }
      ]
    };
    return { api: new ApiService(http as any, node as any, settings as any), http, node, settings };
  }

  it('skips an unsupported public proxy in both explicit and random modes', async () => {
    const { api, http, settings } = setup('berrypay', berryPay);

    expect(await api.representativesOnline()).toBeNull();
    settings.settings.serverName = 'random';
    expect(await api.representativesOnline()).toBeNull();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('still queries supported and explicitly configured custom endpoints', async () => {
    const { api, http, settings } = setup('nanoslo', nanoSlo);

    expect(await api.representativesOnline()).toEqual({ representatives: { example: 'nano_rep' } });
    settings.settings.serverName = 'custom';
    settings.settings.serverAPI = berryPay;
    expect(await api.representativesOnline()).toEqual({ representatives: { example: 'nano_rep' } });
    expect(http.post).toHaveBeenCalledTimes(2);
    expect(http.post.calls.allArgs().map(args => args[1])).toEqual([
      { action: 'representatives_online' },
      { action: 'representatives_online' }
    ]);
  });

  it('does not mark the node offline when optional representative RPC returns HTTP 400', async () => {
    const { api, http, node } = setup('nanoslo', nanoSlo);
    http.post.and.returnValue(throwError({ status: 400 }));

    expect(await api.representativesOnline()).toBeNull();
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(node.setOffline).not.toHaveBeenCalled();
  });
});

describe('ApiService bounded secure requests', () => {
  function setup(serverName = 'random') {
    const http = { post: jasmine.createSpy('post').and.returnValue(throwError({ status: 503 })) };
    const node = {
      node: { status: true },
      internetRecoveryPending: false,
      internetInterruptionGeneration: 0,
      markInternetInterrupted() {
        if (!this.internetRecoveryPending) this.internetInterruptionGeneration++;
        this.internetRecoveryPending = true;
      },
      setOnline: jasmine.createSpy(), setOffline: jasmine.createSpy(), setLoading: jasmine.createSpy()
    };
    const settings = {
      settings: { serverName, serverAPI: 'https://a.invalid/rpc', serverAuth: 'test-secret' },
      serverOptions: ['a', 'b', 'b', 'c', 'd'].map(host => ({
        api: `https://${host}.invalid/rpc`, ws: `wss://${host}.invalid/ws`,
        value: host === 'a' && serverName === 'spynano' ? 'spynano' : host,
        auth: null as string | null, shouldRandom: true, allowFailover: true,
        failoverTarget: undefined as boolean | undefined
      })),
      activateFailover: jasmine.createSpy('activateFailover').and.returnValue(true),
      getRankedFallbackEndpoints: jasmine.createSpy('getRankedFallbackEndpoints').and.returnValue(null)
    };
    const api = new ApiService(http as any, node as any, settings as any);
    return { http, node, settings, api };
  }
  it('uses the best ranked fallback instead of choosing one at random', async () => {
    const { api, http, settings } = setup();
    settings.getRankedFallbackEndpoints.and.returnValue([
      'https://c.invalid/rpc', 'https://b.invalid/rpc'
    ]);
    http.post.and.returnValues(throwError({ status: 503 }), of({ balances: {} }));
    expect(await api.accountsBalances([])).toEqual({ balances: {} });
    expect(http.post.calls.allArgs().map(args => args[0])).toEqual([
      'https://a.invalid/rpc', 'https://c.invalid/rpc'
    ]);
    expect(settings.activateFailover).toHaveBeenCalledOnceWith(
      'random', 'https://a.invalid/rpc', 'https://c.invalid/rpc'
    );
  });

  it('never retries the selected node or duplicated/disabled/unsafe fallback targets', async () => {
    const { api, http, settings } = setup('spynano');
    settings.serverOptions.push(
      { api: 'https://a.invalid/rpc', ws: 'wss://a.invalid/ws', auth: null, value: 'duplicate', shouldRandom: false, allowFailover: true, failoverTarget: undefined },
      { api: 'https://spy.invalid/proxy', ws: 'wss://spy.invalid/ws', auth: null, value: 'spynano', shouldRandom: false, allowFailover: true, failoverTarget: false },
      { api: 'http://192.0.2.10:7076', ws: 'ws://192.0.2.10:7078', auth: null, value: 'unsafe', shouldRandom: false, allowFailover: true, failoverTarget: undefined }
    );
    await expectAsync(api.accountsBalances([])).toBeRejected();
    expect(http.post.calls.allArgs().map(args => args[0])).toEqual([
      'https://a.invalid/rpc', 'https://b.invalid/rpc', 'https://c.invalid/rpc'
    ]);
    expect(settings.activateFailover).not.toHaveBeenCalled();
  });

  it('tries the next ranked node after the best one fails', async () => {
    const { api, http, settings } = setup();
    settings.getRankedFallbackEndpoints.and.returnValue([
      'https://c.invalid/rpc', 'https://d.invalid/rpc'
    ]);
    http.post.and.returnValues(
      throwError({ status: 0 }), throwError({ status: 503 }), of({ balances: {} })
    );
    expect(await api.accountsBalances([])).toEqual({ balances: {} });
    expect(http.post.calls.allArgs().map(args => args[0])).toEqual([
      'https://a.invalid/rpc', 'https://c.invalid/rpc', 'https://d.invalid/rpc'
    ]);
    expect(settings.activateFailover).toHaveBeenCalledOnceWith(
      'random', 'https://a.invalid/rpc', 'https://d.invalid/rpc'
    );
  });

  it('uses the best ranked node for the existing SpyNano health-check failover', async () => {
    const { api, http, settings } = setup('spynano');
    settings.getRankedFallbackEndpoints.and.returnValue([
      'https://d.invalid/rpc', 'https://b.invalid/rpc'
    ]);
    // Backups are constructed as cold Observables in ranked order. Both
    // appear in the transport spy, but the lower-ranked one is never subscribed
    // after the best candidate succeeds.
    http.post.and.returnValues(
      throwError({ status: 502 }), of({ count: '240000000' }), NEVER
    );
    await api.checkNodeAvailability(true);
    expect(http.post.calls.allArgs().map(args => args[0])).toEqual([
      'https://a.invalid/rpc', 'https://d.invalid/rpc', 'https://b.invalid/rpc'
    ]);
    expect(settings.activateFailover).toHaveBeenCalledOnceWith(
      'spynano', 'https://a.invalid/rpc', 'https://d.invalid/rpc'
    );
  });

  it('never falls back to nodes excluded as out-of-sync by the background scan', async () => {
    const { api, http, settings } = setup();
    settings.getRankedFallbackEndpoints.and.returnValue([]);
    await expectAsync(api.accountsBalances([])).toBeRejected();
    expect(http.post.calls.allArgs().map(args => args[0])).toEqual(['https://a.invalid/rpc']);
    expect(settings.activateFailover).not.toHaveBeenCalled();
  });

  it('stops after three distinct endpoints and never forwards custom credentials in random mode', async () => {
    const { api, http, node } = setup();
    await expectAsync(api.accountsBalances([])).toBeRejected();
    expect(http.post.calls.allArgs().map(args => args[0])).toEqual([
      'https://a.invalid/rpc', 'https://b.invalid/rpc', 'https://c.invalid/rpc'
    ]);
    http.post.calls.allArgs().forEach(args => expect(args[2].headers).toBeUndefined());
    expect(node.setOffline).toHaveBeenCalled();
  });
  it('does not retry authorization failures or malformed responses', async () => {
    const { api, http } = setup();
    http.post.and.returnValue(throwError({ status: 401 }));
    await expectAsync(api.accountsBalances([])).toBeRejected();
    expect(http.post).toHaveBeenCalledTimes(1);
    http.post.calls.reset();
    http.post.and.returnValue(of({ work: 'invalid' }));
    await expectAsync(api.workGenerate('hash', 'difficulty')).toBeRejected();
    expect(http.post).toHaveBeenCalledTimes(1);
  });
  it('never automatically replays a signed transaction after a network error', async () => {
    const { api, http } = setup();
    await expectAsync(api.process({ signature: 'test' }, TxType.send)).toBeRejected();
    expect(http.post).toHaveBeenCalledTimes(1);
  });
  it('rejects insecure saved settings before sending credentials or data', async () => {
    const { api, http, settings } = setup('custom');
    settings.settings.serverAPI = 'http://192.0.2.10:7076';
    await expectAsync(api.accountsBalances([])).toBeRejected();
    expect(http.post).not.toHaveBeenCalled();
  });
  it('never switches servers when Electron reports Internet disconnected', async () => {
    const { api, http, settings, node } = setup('spynano');
    (api as any).desktop = { isNetworkOnline: () => Promise.resolve(false) };
    http.post.and.returnValue(throwError({ status: 0 }));
    await expectAsync(api.checkNodeAvailability(true)).toBeRejectedWith(
      jasmine.objectContaining({ isInternetDisconnected: true })
    );
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(settings.activateFailover).not.toHaveBeenCalled();
    expect((node as any).internetRecoveryPending).toBe(true);
  });

  it('ignores a successful RPC response from before an airplane-mode interruption', async () => {
    const { api, http, node, settings } = setup('spynano');
    const pending = new Subject<any>();
    http.post.and.returnValue(pending);
    const read = api.accountsBalances(['nano_test']);

    // The old response arrives after the network generation has changed.
    node.markInternetInterrupted();
    pending.next({ balances: {} });
    pending.complete();

    await expectAsync(read).toBeRejectedWith(jasmine.objectContaining({ isStaleFailover: true }));
    expect(node.setOnline).not.toHaveBeenCalled();
    expect(node.setOffline).not.toHaveBeenCalled();
    expect(settings.activateFailover).not.toHaveBeenCalled();
    expect(http.post).toHaveBeenCalledTimes(1);
  });

  it('still returns a signed process result from the pre-outage node without replaying it', async () => {
    const { api, http, node } = setup('spynano');
    const pending = new Subject<any>();
    http.post.and.returnValue(pending);
    const signed = api.process({ signature: 'test' }, TxType.send);

    node.markInternetInterrupted();
    pending.next({ hash: 'published_block_hash' });
    pending.complete();

    expect(await signed).toEqual({ hash: 'published_block_hash' });
    expect(http.post).toHaveBeenCalledTimes(1);
  });

  it('ignores a stale RPC failure after a concurrent request switched the node', async () => {
    const { api, http, node, settings } = setup('spynano');
    const pending = new Subject<any>();
    http.post.and.returnValue(pending);
    const read = api.accountsBalances(['nano_test']);

    // The selected node has already changed through another healthy request.
    settings.settings.serverName = 'b';
    settings.settings.serverAPI = 'https://b.invalid/rpc';
    pending.error({ status: 0 });

    await expectAsync(read).toBeRejectedWith(jasmine.objectContaining({ isStaleFailover: true }));
    expect(node.setOnline).not.toHaveBeenCalled();
    expect(node.setOffline).not.toHaveBeenCalled();
    expect(settings.activateFailover).not.toHaveBeenCalled();
    expect(http.post).toHaveBeenCalledTimes(1);
  });

  it('reports an RPC timeout as an RPC timeout after link recovery, never as a new Internet outage', fakeAsync(() => {
    const { api, http, node, settings } = setup('rainstorm');
    node.internetRecoveryPending = true;
    node.internetInterruptionGeneration = 1;
    http.post.and.returnValue(NEVER);
    let error: any = null;
    const interrupted = spyOn(node, 'markInternetInterrupted').and.callThrough();
    api.checkNodeAvailability(true, false).catch(reason => { error = reason; });
    tick(5000);
    expect(error?.name).toBe('TimeoutError');
    expect(node.internetRecoveryPending).toBe(true);
    expect(node.internetInterruptionGeneration).toBe(1);
    expect(interrupted).not.toHaveBeenCalled();
    expect(settings.activateFailover).not.toHaveBeenCalled();
    expect(http.post).toHaveBeenCalledTimes(1);
  }));

  it('does not activate delayed fallback after a cable-offline event', fakeAsync(() => {
    const { api, http, settings, node } = setup('spynano');
    const late = new Subject<any>();
    http.post.and.returnValues(throwError({ status: 0 }), late, NEVER, NEVER);
    let rejected = false;
    api.checkNodeAvailability(true).catch(() => { rejected = true; });
    tick(0);
    expect(http.post).toHaveBeenCalledTimes(4);
    // The network returned and the original server was restored before the
    // previously scheduled backup completed: generation still invalidates it.
    (node as any).internetInterruptionGeneration = 1;
    (node as any).internetRecoveryPending = false;
    late.next({ count: '123456789' });
    late.complete();
    tick(0);
    expect(rejected).toBe(true);
    expect(settings.activateFailover).not.toHaveBeenCalled();
    expect(node.internetRecoveryPending).toBe(false); // Late reply must not mark a fresh outage.
    expect(node.setOffline).not.toHaveBeenCalled();
  }));

  it('uses lightweight RPC metadata for a walletless DNS failover on Windows', async () => {
    const { api, http, settings } = setup('spynano');
    // Regression from Windows HAR: accounts_balances timed out on Rainstorm,
    // NanOslo, SomeNano and Twister32, but Rainstorm block_count returned 200.
    http.post.and.returnValues(throwError({ status: 0 }), of({ count: '225964139' }), NEVER, NEVER);
    await api.checkNodeAvailability(true);
    expect(http.post).toHaveBeenCalledTimes(4);
    for (const [, payload] of http.post.calls.allArgs()) {
      expect(payload).toEqual({ action: 'block_count', include_cemented: 'true' });
    }
    expect(settings.activateFailover).toHaveBeenCalledOnceWith(
      'spynano', 'https://a.invalid/rpc', 'https://b.invalid/rpc'
    );
  });

  it('keeps a working selected RPC even when its WebSocket is unavailable', async () => {
    const { api, http, settings } = setup('spynano');
    http.post.and.returnValue(of({ count: '225964139' }));
    await api.checkNodeAvailability(true);
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(settings.activateFailover).not.toHaveBeenCalled();
  });

  it('rejects malformed block_count without choosing a new node', async () => {
    const { api, http, settings } = setup('spynano');
    http.post.and.returnValue(of({ count: 'not-a-number' }));
    await expectAsync(api.checkNodeAvailability(true)).toBeRejected();
    expect(settings.activateFailover).not.toHaveBeenCalled();
  });

  it('limits authentication to the configured custom RPC, not an explicit PoW server', async () => {
    const { api, http } = setup('custom');
    http.post.and.returnValue(of({ work: 'A'.repeat(16) }));
    await api.accountsBalances([]);
    expect(http.post.calls.mostRecent().args[2].headers.get('Authorization')).toBe('test-secret');
    await api.workGenerate('hash', 'difficulty', 'https://work.invalid');
    expect(http.post.calls.mostRecent().args[2].headers).toBeUndefined();
    await api.workGenerate('hash', 'difficulty', 'https://a.invalid/rpc');
    expect(http.post.calls.mostRecent().args[2].headers).toBeUndefined();
  });
  it('times out stalled reads within the 45 second total budget', fakeAsync(() => {
    const { api, http, node } = setup();
    http.post.and.returnValue(NEVER);
    let rejected = false;
    api.accountsBalances([]).catch(() => { rejected = true; });
    tick(44999);
    expect(rejected).toBe(false);
    tick(1);
    expect(rejected).toBe(true);
    expect(http.post).toHaveBeenCalledTimes(3);
    expect(node.setOffline).toHaveBeenCalled();
  }));
  it('keeps RPC node status unchanged when PoW fails on the current or an external work server', async () => {
    const { api, http, node, settings } = setup();
    http.post.and.returnValue(throwError({ status: 503, error: 'PoW gateway unavailable' }));
    await expectAsync(api.workGenerate('A'.repeat(64), 'fffffff800000000')).toBeRejected();
    await expectAsync(api.workGenerate('A'.repeat(64), 'fffffff800000000', 'https://work.invalid')).toBeRejected();
    expect(node.setOffline).not.toHaveBeenCalled();
    expect(node.setOnline).not.toHaveBeenCalled();
    expect(settings.activateFailover).not.toHaveBeenCalled();
    expect(http.post.calls.count()).toBe(2);
  });

  it('does not infer wallet RPC health from successful PoW', async () => {
    const { api, http, node } = setup();
    http.post.and.returnValue(of({ work: 'ABCDEF0123456789' }));
    expect((await api.workGenerate('A'.repeat(64), 'fffffff800000000')).work)
      .toBe('ABCDEF0123456789');
    expect(node.setOnline).not.toHaveBeenCalled();
    expect(node.setOffline).not.toHaveBeenCalled();
  });

  it('supports bounded PoW requests before considering another work server', fakeAsync(() => {
    const { api, http } = setup();
    http.post.and.returnValue(NEVER);
    let failed = false;
    api.workGenerate('A'.repeat(64), 'fffffff800000000', 'https://work.invalid', 20000)
      .catch(() => { failed = true; });
    tick(19999);
    expect(failed).toBeFalse();
    tick(1);
    expect(failed).toBeTrue();
    expect(http.post.calls.count()).toBe(1);
  }));

  it('gives PoW one bounded two-minute attempt', fakeAsync(() => {
    const { api, http } = setup();
    http.post.and.returnValue(NEVER);
    let rejected = false;
    api.workGenerate('hash', 'difficulty').catch(() => { rejected = true; });
    tick(119999);
    expect(rejected).toBe(false);
    tick(1);
    expect(rejected).toBe(true);
    expect(http.post).toHaveBeenCalledTimes(1);
  }));
  it('does not show an offline error on an unconfigured wallet health probe', async () => {
    const { api, http, node } = setup('spynano');
    http.post.and.returnValue(throwError({ status: 0 }));
    await expectAsync(api.checkNodeAvailability(true)).toBeRejected();
    expect(http.post).toHaveBeenCalledTimes(4);
    expect(node.setOffline).toHaveBeenCalledWith(null);
  });

  it('still shows a node error on an explicit or configured-wallet health probe', async () => {
    const { api, http, node } = setup('spynano');
    http.post.and.returnValue(throwError({ status: 0 }));
    await expectAsync(api.checkNodeAvailability()).toBeRejected();
    expect(node.setOffline).toHaveBeenCalled();
    expect(node.setOffline.calls.mostRecent().args[0]).not.toBeNull();
  });

  it('checks all distinct public candidates during an empty-wallet DNS outage', async () => {
    const { api, http, settings } = setup('spynano');
    http.post.and.returnValues(
      throwError({ status: 0 }), throwError({ status: 502 }), throwError({ status: 503 }), of({ count: '225964139' })
    );
    await api.checkNodeAvailability(true);
    expect(http.post.calls.allArgs().map(args => args[0])).toEqual([
      'https://a.invalid/rpc', 'https://b.invalid/rpc', 'https://c.invalid/rpc', 'https://d.invalid/rpc'
    ]);
    expect(settings.activateFailover).toHaveBeenCalledOnceWith(
      'spynano', 'https://a.invalid/rpc', 'https://d.invalid/rpc'
    );
  });

  it('keeps the three-attempt limit for normal wallet reads despite additional health candidates', async () => {
    const { api, http } = setup('spynano');
    await expectAsync(api.accountsBalances([])).toBeRejected();
    expect(http.post).toHaveBeenCalledTimes(3);
  });

  it('ignores a healthy fallback result if the active node changed during the request', async () => {
    const { api, http, settings } = setup('spynano');
    http.post.and.returnValues(throwError({ status: 0 }), of({ count: '225964139' }), NEVER, NEVER);
    settings.activateFailover.and.returnValue(false);
    await expectAsync(api.checkNodeAvailability(true)).toBeRejected();
    expect(settings.activateFailover).toHaveBeenCalledTimes(1);
  });

  it('keeps the ordered health-probe attempts within a bounded deadline', fakeAsync(() => {
    const { api, http } = setup('spynano');
    http.post.and.returnValue(NEVER);
    let rejected = false;
    api.checkNodeAvailability().catch(() => { rejected = true; });
    expect(http.post).toHaveBeenCalledTimes(1);
    tick(4999);
    expect(http.post).toHaveBeenCalledTimes(1);
    tick(1);
    expect(http.post).toHaveBeenCalledTimes(4);
    // Primary 5s + three 3s sequential probes = 14s. This finishes
    // before the outer 15s safety deadline, not exactly at that deadline.
    tick(8999);
    expect(rejected).toBe(false);
    tick(1);
    expect(rejected).toBe(true);
    expect(http.post).toHaveBeenCalledTimes(4);
  }));

  it('accepts a public fallback responding after three seconds and aborts slower candidates', fakeAsync(() => {
    const { api, http, settings } = setup('spynano');
    const late = new Subject<any>();
    http.post.and.returnValues(
      throwError({ status: 0 }), NEVER, late, NEVER
    );
    let completed = false;
    api.checkNodeAvailability().then(() => { completed = true; });
    tick(0); // Allow the first DNS error to schedule ordered backup probes.
    expect(http.post).toHaveBeenCalledTimes(4);
    tick(4500);
    late.next({ count: '225964139' });
    late.complete();
    tick(0);
    expect(completed).toBe(true);
    expect(settings.activateFailover).toHaveBeenCalledOnceWith(
      'spynano', 'https://a.invalid/rpc', 'https://c.invalid/rpc'
    );
  }));

  it('moves to a working fallback after the first timed-out health probe', fakeAsync(() => {
    const { api, http, settings } = setup('spynano');
    http.post.and.returnValues(NEVER, of({ count: '225964139' }), NEVER, NEVER);
    let completed = false;
    api.checkNodeAvailability().then(() => { completed = true; });
    tick(5000);
    expect(completed).toBe(true);
    expect(http.post).toHaveBeenCalledTimes(4);
    expect(settings.activateFailover).toHaveBeenCalledOnceWith(
      'spynano', 'https://a.invalid/rpc', 'https://b.invalid/rpc'
    );
  }));

  it('shares a pending availability check from WS and manual server save', async () => {
    const { api, http } = setup('spynano');
    const subject = new Subject<any>();
    http.post.and.returnValue(subject);
    const first = api.checkNodeAvailability();
    const second = api.checkNodeAvailability();
    expect(first).toBe(second);
    expect(http.post).toHaveBeenCalledTimes(1);
    subject.next({ count: '225964139' });
    subject.complete();
    await first;
    // A completed Subject cannot emit a response for a subsequent new request.
    // Use a fresh, valid RPC response to test that the completed check is
    // evicted from the in-flight cache.
    http.post.and.returnValue(of({ count: '225964139' }));
    await api.checkNodeAvailability();
    expect(http.post).toHaveBeenCalledTimes(2);
  });

  it('uses wallet-independent RPC metadata after WS failure even with a configured wallet', async () => {
    const { api, http, settings } = setup('spynano');
    // The synthetic burn account is not a connectivity oracle: a healthy RPC
    // proxy may reject accounts_balances or answer slowly after minutes of use.
    http.post.and.returnValues(throwError({ status: 504 }), of({ count: '225964139' }), NEVER, NEVER);
    await api.checkNodeAvailability(false);
    const calls = http.post.calls.allArgs();
    expect(calls.length).toBe(4);
    calls.forEach(args => expect(args[1]).toEqual({
      action: 'block_count', include_cemented: 'true'
    }));
    expect(settings.activateFailover).toHaveBeenCalledOnceWith(
      'spynano', 'https://a.invalid/rpc', 'https://b.invalid/rpc'
    );
  });

  it('does not accept a successful HTTP response with invalid RPC data', async () => {
    const { api, http, settings } = setup('spynano');
    http.post.and.returnValues(throwError({ status: 504 }),
      of({ random_field: true }), of({ random_field: true }), of({ random_field: true }));
    await expectAsync(api.checkNodeAvailability()).toBeRejected();
    expect(settings.activateFailover).not.toHaveBeenCalled();
  });

  it('activates a successful RPC fallback for persistence by settings', async () => {
    const { api, http, settings } = setup();
    http.post.and.returnValues(throwError({ status: 503 }), of({ balances: {} }));
    expect(await api.accountsBalances([])).toEqual({ balances: {} });
    expect(settings.activateFailover).toHaveBeenCalledOnceWith('random', 'https://a.invalid/rpc', 'https://b.invalid/rpc');
    expect(http.post).toHaveBeenCalledTimes(2);
  });
  it('never selects a fallback node on an HTTP 200 JSON-RPC error response', async () => {
    const { api, http, settings } = setup();
    http.post.and.returnValues(throwError({ status: 503 }), of({ error: 'Action accounts_balances not allowed' }), of({ balances: {} }));
    await expectAsync(api.accountsBalances([])).toBeRejectedWith(jasmine.objectContaining({ isRpcError: true }));
    expect(http.post).toHaveBeenCalledTimes(2);
    expect(settings.activateFailover).not.toHaveBeenCalled();
  });

  it('does not switch a built-in node on a JSON-RPC error with HTTP 500', async () => {
    const { api, http, settings } = setup('a');
    http.post.and.returnValues(throwError({
      status: 500, error: { error: 'Action accounts_balances not allowed' }, isRpcError: true
    }), of({ balances: {} }));
    await expectAsync(api.accountsBalances([])).toBeRejected();
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(settings.activateFailover).not.toHaveBeenCalled();
  });
  it('does not let an older failed wallet read override a newer healthy RPC result', async () => {
    const { api, http, node, settings } = setup('custom');
    const delayed = new Subject<any>();
    http.post.and.callFake((_endpoint: string, payload: any) =>
      payload.action === 'accounts_balances' ? delayed : of({ frontiers: {} }));
    const oldRead = api.accountsBalances([]);
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(await api.accountsFrontiers([])).toEqual({ frontiers: {} });
    expect(node.setOnline).toHaveBeenCalled();
    delayed.error({ status: 503 }); // The old request times out/fails after the success.
    await expectAsync(oldRead).toBeRejected();
    expect(node.setOffline).not.toHaveBeenCalled();
    expect(settings.activateFailover).not.toHaveBeenCalled();
  });

  it('continues warning for a genuine current RPC outage without newer success', async () => {
    const { api, http, node } = setup('custom');
    http.post.and.returnValue(throwError({ status: 503 }));
    await expectAsync(api.accountsBalances([])).toBeRejected();
    expect(node.setOffline).toHaveBeenCalled();
  });

  it('does not claim an RPC outage after an HTTP 400 or invalid application response', async () => {
    const { api, http, node } = setup('custom');
    http.post.and.returnValues(throwError({ status: 400 }), of({ balances: [] }));
    await expectAsync(api.accountsBalances([])).toBeRejected();
    await expectAsync((api as any).request('accounts_balances', { accounts: [] }, false, '', (res: { balances: unknown }) =>
      ({ err: Array.isArray(res.balances) ? 'invalid balances' : null }))).toBeRejected();
    expect(node.setOffline).not.toHaveBeenCalled();
  });

  it('ignores a delayed transport timeout through a ten-minute tablet idle simulation', fakeAsync(() => {
    const { api, http, node } = setup('custom');
    http.post.and.callFake((_url: string, payload: any) =>
      payload.action === 'accounts_balances' ? NEVER : of({ frontiers: {} }));
    let rejected = false;
    api.accountsBalances([]).catch(() => { rejected = true; });
    api.accountsFrontiers([]).then(() => {});
    tick(16000);
    expect(rejected).toBeTrue();
    expect(node.setOnline).toHaveBeenCalled();
    expect(node.setOffline).not.toHaveBeenCalled();
    tick(10 * 60 * 1000); // Simulate a full ten-minute idle tablet session.
    expect(node.setOffline).not.toHaveBeenCalled();
  }));

  it('does not rotate a custom server', async () => {
    const { api, http, settings } = setup('custom');
    await expectAsync(api.accountsBalances([])).toBeRejected();
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(settings.activateFailover).not.toHaveBeenCalled();
  });
  it('counts legacy fallback against the same total attempt budget', async () => {
    const { api, http } = setup();
    http.post.and.callFake((_url, payload) => throwError(payload.action === 'receivable'
      ? { status: 500, error: { error: 'Action receivable not allowed' } } : { status: 503 }));
    await expectAsync(api.pending('nano_test', 5)).toBeRejected();
    expect(http.post).toHaveBeenCalledTimes(3);
    expect(http.post.calls.allArgs().map(args => args[1].action)).toEqual(['receivable', 'pending', 'receivable']);
  });
});
