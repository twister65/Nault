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
    const node = { node: { status: true }, setOnline: jasmine.createSpy(), setOffline: jasmine.createSpy(), setLoading: jasmine.createSpy() };
    const settings = {
      settings: { serverName, serverAPI: 'https://a.invalid/rpc', serverAuth: 'test-secret' },
      serverOptions: ['a', 'b', 'b', 'c', 'd'].map(host => ({ api: `https://${host}.invalid/rpc`, value: host === 'a' && serverName === 'spynano' ? 'spynano' : host, shouldRandom: true, allowFailover: true, failoverTarget: undefined as boolean | undefined })),
      activateFailover: jasmine.createSpy('activateFailover').and.returnValue(true)
    };
    const api = new ApiService(http as any, node as any, settings as any);
    // Stable insertion order for existing tests; no global Math.random spy.
    const randomIndex = spyOn<any>(api, 'randomFallbackIndex').and.callFake((lastIndex: number) => lastIndex);
    return { http, node, settings, api, randomIndex };
  }
  it('selects a different first fallback when the random draw changes', async () => {
    const { api, http, settings } = setup();
    http.post.and.returnValues(throwError({ status: 503 }), of({ balances: {} }));
    expect(await api.accountsBalances([])).toEqual({ balances: {} });
    expect(settings.activateFailover).toHaveBeenCalledOnceWith('random', 'https://a.invalid/rpc', 'https://b.invalid/rpc');

    const alternative = setup();
    alternative.randomIndex.and.returnValue(0);
    alternative.http.post.and.returnValues(throwError({ status: 503 }), of({ balances: {} }));
    expect(await alternative.api.accountsBalances([])).toEqual({ balances: {} });
    // With [b, c, d] shuffled using zero draws, c is first.
    expect(alternative.settings.activateFailover).toHaveBeenCalledOnceWith(
      'random', 'https://a.invalid/rpc', 'https://c.invalid/rpc'
    );
  });

  it('never retries the selected node or duplicated/disabled/unsafe fallback targets', async () => {
    const { api, http, settings } = setup('spynano');
    settings.serverOptions.push(
      { api: 'https://a.invalid/rpc', value: 'duplicate', shouldRandom: false, allowFailover: true, failoverTarget: undefined },
      { api: 'https://spy.invalid/proxy', value: 'spynano', shouldRandom: false, allowFailover: true, failoverTarget: false },
      { api: 'http://192.0.2.10:7076', value: 'unsafe', shouldRandom: false, allowFailover: true, failoverTarget: undefined }
    );
    await expectAsync(api.accountsBalances([])).toBeRejected();
    expect(http.post.calls.allArgs().map(args => args[0])).toEqual([
      'https://a.invalid/rpc', 'https://b.invalid/rpc', 'https://c.invalid/rpc'
    ]);
    expect(settings.activateFailover).not.toHaveBeenCalled();
  });

  it('tries the next randomized candidate after a failure and persists only a healthy one', async () => {
    const { api, http, settings, randomIndex } = setup();
    randomIndex.and.returnValue(0);
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
    const { api, http, settings, randomIndex } = setup('spynano');
    randomIndex.and.callFake((lastIndex: number) => lastIndex);
    http.post.and.returnValues(
      throwError({ status: 0 }), throwError({ status: 502 }), throwError({ status: 503 }), of({ balances: {} })
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
    http.post.and.returnValues(throwError({ status: 0 }), of({ balances: {} }));
    settings.activateFailover.and.returnValue(false);
    await expectAsync(api.checkNodeAvailability(true)).toBeRejected();
    expect(settings.activateFailover).toHaveBeenCalledTimes(1);
  });

  it('limits WS-triggered health probes to three seconds per RPC candidate', fakeAsync(() => {
    const { api, http } = setup('spynano');
    http.post.and.returnValue(NEVER);
    let rejected = false;
    api.checkNodeAvailability().catch(() => { rejected = true; });
    expect(http.post).toHaveBeenCalledTimes(1);
    tick(2999);
    expect(http.post).toHaveBeenCalledTimes(1);
    tick(1);
    expect(http.post).toHaveBeenCalledTimes(2);
    tick(9000);
    expect(rejected).toBe(true);
    expect(http.post).toHaveBeenCalledTimes(4);
  }));

  it('moves to a working fallback after the first timed-out health probe', fakeAsync(() => {
    const { api, http, settings } = setup('spynano');
    http.post.and.returnValues(NEVER, of({ balances: {} }));
    let completed = false;
    api.checkNodeAvailability().then(() => { completed = true; });
    tick(3000);
    expect(completed).toBe(true);
    expect(http.post).toHaveBeenCalledTimes(2);
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
    subject.next({ balances: {} });
    subject.complete();
    await first;
    // A completed Subject cannot emit a response for a subsequent new request.
    // Use a fresh, valid RPC response to test that the completed check is
    // evicted from the in-flight cache.
    http.post.and.returnValue(of({ balances: {} }));
    await api.checkNodeAvailability();
    expect(http.post).toHaveBeenCalledTimes(2);
  });

  it('probes the public burn account when no wallet is configured', async () => {
    const { api, http, settings } = setup('spynano');
    // HTTP 504 from the selected node; a successful balances response from the
    // next candidate proves failover works without wallet accounts.
    http.post.and.returnValues(throwError({ status: 504 }), of({ balances: {} }));
    await api.checkNodeAvailability();
    const calls = http.post.calls.allArgs();
    expect(calls.length).toBe(2);
    expect(calls[0][1]).toEqual({ action: 'accounts_balances', accounts: [
      'nano_1111111111111111111111111111111111111111111111111111hifc8npp'
    ] });
    expect(settings.activateFailover).toHaveBeenCalledOnceWith('spynano', 'https://a.invalid/rpc', 'https://b.invalid/rpc');
  });

  it('does not accept a successful HTTP response with invalid RPC data', async () => {
    const { api, http, settings } = setup('spynano');
    http.post.and.returnValues(throwError({ status: 504 }), of({ random_field: true }));
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
