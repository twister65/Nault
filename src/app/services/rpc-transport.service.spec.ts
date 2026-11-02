import { RpcTransportService } from './rpc-transport.service';
import { HttpHeaders } from '@angular/common/http';
import { ApiService } from './api.service';

describe('RPC network boundary', () => {
  it('forbids redirects and ambient credentials and aborts on unsubscribe', () => {
    const fetchSpy = spyOn(window, 'fetch').and.returnValue(new Promise(() => {}));
    const subscription = new RpcTransportService().post('https://example.org/rpc', { action: 'version' }, {
      headers: new HttpHeaders().set('Authorization', 'test-only')
    }).subscribe();
    const options = fetchSpy.calls.mostRecent().args[1];
    // The spy must capture explicit Fetch options; keep security assertions strict.
    if (!options) throw new Error('RPC fetch must receive RequestInit options');
    expect(options.redirect).toBe('error');
    expect(options.credentials).toBe('omit');
    expect(options.referrerPolicy).toBe('no-referrer');
    expect((options.headers as Headers).get('Authorization')).toBe('test-only');
    subscription.unsubscribe();
    const signal = options.signal;
    if (!(signal instanceof AbortSignal)) throw new Error('RPC fetch must use an AbortSignal');
    expect(signal.aborted).toBe(true);
  });


  it('normalizes DNS fetch rejections as retryable status 0 without an HTTP response', async () => {
    spyOn(window, 'fetch').and.returnValue(Promise.reject(new TypeError('Failed to fetch')));
    await expectAsync(new RpcTransportService()
      .post('https://node.spynano.org/proxy', { action: 'accounts_balances' }, {})
      .toPromise()).toBeRejectedWith(jasmine.objectContaining({ status: 0 }));
  });

  it('normalizes non-TypeError connection failures as status 0', async () => {
    const dnsError = new Error('net::ERR_NAME_NOT_RESOLVED');
    spyOn(window, 'fetch').and.returnValue(Promise.reject(dnsError));
    try {
      await new RpcTransportService().post('https://node.spynano.org/proxy', {}, {}).toPromise();
      fail('DNS failure must reject');
    } catch (error) {
      expect(error).toEqual(jasmine.objectContaining({ status: 0, cause: dnsError }));
    }
  });

  it('fails over after a DNS error on the first POST without waiting for another WS error', async () => {
    const firstError = new Error('net::ERR_NAME_NOT_RESOLVED');
    const fetchSpy = spyOn(window, 'fetch').and.callFake(input => {
      if (String(input) === 'https://node.spynano.org/proxy') {
        return Promise.reject(firstError);
      }
      if (String(input) === 'https://rainstorm.city/api') {
        return Promise.resolve(new Response(JSON.stringify({ balances: {} }), { status: 200 }));
      }
      return Promise.reject(new Error('Unexpected RPC node'));
    });
    const node = {
      node: { status: true },
      setOnline: jasmine.createSpy('setOnline'),
      setOffline: jasmine.createSpy('setOffline'),
      setLoading: jasmine.createSpy('setLoading'),
    };
    const settings = {
      settings: { serverName: 'spynano', serverAPI: 'https://node.spynano.org/proxy', serverAuth: null },
      serverOptions: [
        { value: 'spynano', api: 'https://node.spynano.org/proxy', allowFailover: true, failoverTarget: false },
        { value: 'rainstorm', api: 'https://rainstorm.city/api', allowFailover: true },
      ],
      activateFailover: jasmine.createSpy('activateFailover').and.returnValue(true),
    };
    await new ApiService(new RpcTransportService(), node as any, settings as any).checkNodeAvailability();
    expect(fetchSpy.calls.allArgs().map(args => String(args[0]))).toEqual([
      'https://node.spynano.org/proxy', 'https://rainstorm.city/api'
    ]);
    expect(settings.activateFailover).toHaveBeenCalledOnceWith(
      'spynano', 'https://node.spynano.org/proxy', 'https://rainstorm.city/api'
    );
    expect(node.setOnline).toHaveBeenCalled();
  });


  it('treats gateway JSON error bodies as HTTP failures, not Nano RPC action errors', async () => {
    let gatewayStatus = 502;
    let gatewayMessage = 'Bad Gateway';
    spyOn(window, 'fetch').and.callFake(() => Promise.resolve(
      new Response(JSON.stringify({ error: gatewayMessage }), {
        status: gatewayStatus, headers: { 'Content-Type': 'application/json' }
      })
    ));
    for (const [status, message] of [
      [502, 'Bad Gateway'],
      [503, 'Service Unavailable'],
      [504, 'Gateway Timeout'],
      [500, 'upstream connect error']
    ] as Array<[number, string]>) {
      gatewayStatus = status;
      gatewayMessage = message;
      await expectAsync(new RpcTransportService()
        .post('https://node.somenano.com/proxy', { action: 'accounts_balances' }, {})
        .toPromise()).toBeRejectedWith(
        jasmine.objectContaining({ status, isRpcError: false })
      );
    }
  });

  it('fails over from SomeNano on the FIRST HTTP 502 JSON Bad Gateway response', async () => {
    const fetchSpy = spyOn(window, 'fetch').and.callFake(input => {
      if (String(input) === 'https://node.somenano.com/proxy') {
        return Promise.resolve(new Response(JSON.stringify({ error: 'Bad Gateway' }), { status: 502 }));
      }
      if (String(input) === 'https://nanoslo.0x.no/proxy') {
        return Promise.resolve(new Response(JSON.stringify({ balances: {} }), { status: 200 }));
      }
      return Promise.reject(new Error('Unexpected endpoint'));
    });
    const node = {
      node: { status: true },
      setOnline: jasmine.createSpy('setOnline'),
      setOffline: jasmine.createSpy('setOffline'),
      setLoading: jasmine.createSpy('setLoading')
    };
    const settings = {
      settings: { serverName: 'somenano', serverAPI: 'https://node.somenano.com/proxy', serverAuth: null },
      serverOptions: [
        { value: 'somenano', api: 'https://node.somenano.com/proxy', allowFailover: true },
        { value: 'nanoslo', api: 'https://nanoslo.0x.no/proxy', allowFailover: true }
      ],
      activateFailover: jasmine.createSpy('activateFailover').and.returnValue(true)
    };
    await new ApiService(new RpcTransportService(), node as any, settings as any).checkNodeAvailability();
    expect(fetchSpy.calls.allArgs().map(args => String(args[0]))).toEqual([
      'https://node.somenano.com/proxy', 'https://nanoslo.0x.no/proxy'
    ]);
    expect(settings.activateFailover).toHaveBeenCalledOnceWith(
      'somenano', 'https://node.somenano.com/proxy', 'https://nanoslo.0x.no/proxy'
    );
    expect(node.setOnline).toHaveBeenCalled();
    expect(node.setOffline).not.toHaveBeenCalled();
  });

  it('keeps a legacy Nano action refusal on SomeNano even with HTTP 502', async () => {
    const fetchSpy = spyOn(window, 'fetch').and.callFake((_url, options) => {
      const action = JSON.parse(String(options?.body)).action;
      if (action === 'accounts_receivable') {
        return Promise.resolve(new Response(JSON.stringify({
          error: 'Action accounts_receivable not allowed'
        }), { status: 502 }));
      }
      if (action === 'accounts_pending') {
        return Promise.resolve(new Response(JSON.stringify({ blocks: {} }), { status: 200 }));
      }
      return Promise.reject(new Error('Unexpected RPC action'));
    });
    const node = {
      node: { status: true },
      setOnline: jasmine.createSpy('setOnline'),
      setOffline: jasmine.createSpy('setOffline'),
      setLoading: jasmine.createSpy('setLoading')
    };
    const settings = {
      settings: { serverName: 'somenano', serverAPI: 'https://node.somenano.com/proxy', serverAuth: null },
      serverOptions: [
        { value: 'somenano', api: 'https://node.somenano.com/proxy', allowFailover: true },
        { value: 'nanoslo', api: 'https://nanoslo.0x.no/proxy', allowFailover: true }
      ],
      activateFailover: jasmine.createSpy('activateFailover')
    };
    const api = new ApiService(new RpcTransportService(), node as any, settings as any);
    expect(await api.accountsPending(['nano_test'])).toEqual({ blocks: {} });
    expect(fetchSpy.calls.allArgs().map(args => String(args[0]))).toEqual([
      'https://node.somenano.com/proxy', 'https://node.somenano.com/proxy'
    ]);
    expect(settings.activateFailover).not.toHaveBeenCalled();
    expect(node.setOffline).not.toHaveBeenCalled();
  });

  it('does not treat an unrelated Nano JSON error as a gateway outage', async () => {
    spyOn(window, 'fetch').and.returnValue(Promise.resolve(new Response(
      JSON.stringify({ error: 'Block not found' }), { status: 502 }
    )));
    await expectAsync(new RpcTransportService().post('https://node.somenano.com/proxy', {}, {})
      .toPromise()).toBeRejectedWith(jasmine.objectContaining({ status: 502, isRpcError: true }));
  });

  it('preserves HTTP 500/502/503/504 even if the proxy responds with HTML', async () => {
    let status = 500;
    spyOn(window, 'fetch').and.callFake(() => Promise.resolve(new Response(
      '<html>gateway error</html>', { status, headers: { 'Content-Type': 'text/html' } }
    )));
    for (status of [500, 502, 503, 504]) {
      try {
        await new RpcTransportService().post('https://example.org/proxy', {}, {}).toPromise();
        fail('HTTP gateway error should reject');
      } catch (error) {
        expect(error).toEqual(jasmine.objectContaining({ status }));
        expect((error as { isValidationFailure?: boolean }).isValidationFailure).not.toBe(true);
      }
    }
  });

  it('fails over on the first HTTP 504 HTML response, not the next WebSocket retry', async () => {
    const fetchSpy = spyOn(window, 'fetch').and.callFake((input) => {
      if (String(input) === 'https://node.spynano.org/proxy') {
        return Promise.resolve(new Response('<html>Gateway Timeout</html>', { status: 504 }));
      }
      if (String(input) === 'https://rainstorm.city/api') {
        return Promise.resolve(new Response(JSON.stringify({ balances: {} }), { status: 200 }));
      }
      return Promise.reject(new Error('Unexpected endpoint'));
    });
    const node = {
      node: { status: true },
      setOnline: jasmine.createSpy('setOnline'),
      setOffline: jasmine.createSpy('setOffline'),
      setLoading: jasmine.createSpy('setLoading')
    };
    const settings = {
      settings: { serverName: 'spynano', serverAPI: 'https://node.spynano.org/proxy', serverAuth: null },
      serverOptions: [
        { value: 'spynano', api: 'https://node.spynano.org/proxy', allowFailover: true, failoverTarget: false },
        { value: 'rainstorm', api: 'https://rainstorm.city/api', allowFailover: true }
      ],
      activateFailover: jasmine.createSpy('activateFailover').and.returnValue(true)
    };
    await new ApiService(new RpcTransportService(), node as any, settings as any).checkNodeAvailability();
    expect(fetchSpy.calls.allArgs().map(args => String(args[0]))).toEqual([
      'https://node.spynano.org/proxy', 'https://rainstorm.city/api'
    ]);
    expect(settings.activateFailover).toHaveBeenCalledOnceWith(
      'spynano', 'https://node.spynano.org/proxy', 'https://rainstorm.city/api'
    );
    expect(node.setOnline).toHaveBeenCalled();
  });

  it('does not rotate after HTTP 200 with invalid JSON', async () => {
    const fetchSpy = spyOn(window, 'fetch').and.returnValue(Promise.resolve(
      new Response('<html>invalid RPC response</html>', { status: 200 })
    ));
    const node = {
      node: { status: true },
      setOnline: jasmine.createSpy('setOnline'),
      setOffline: jasmine.createSpy('setOffline'),
      setLoading: jasmine.createSpy('setLoading')
    };
    const settings = {
      settings: { serverName: 'spynano', serverAPI: 'https://node.spynano.org/proxy', serverAuth: null },
      serverOptions: [
        { value: 'spynano', api: 'https://node.spynano.org/proxy', allowFailover: true },
        { value: 'rainstorm', api: 'https://rainstorm.city/api', allowFailover: true }
      ],
      activateFailover: jasmine.createSpy('activateFailover')
    };
    await expectAsync(new ApiService(new RpcTransportService(), node as any, settings as any)
      .checkNodeAvailability()).toBeRejected();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(settings.activateFailover).not.toHaveBeenCalled();
  });

  it('marks JSON RPC action denials as application errors even with HTTP 500', async () => {
    spyOn(window, 'fetch').and.returnValue(Promise.resolve(new Response(
      JSON.stringify({ error: 'Action accounts_receivable not allowed' }), { status: 500 }
    )));
    await expectAsync(new RpcTransportService()
      .post('https://example.org/proxy', {}, {}).toPromise()).toBeRejectedWith(
        jasmine.objectContaining({ status: 500, isRpcError: true })
      );
  });

  it('preserves proxy refusal bodies for the legacy compatibility fallback', async () => {
    spyOn(window, 'fetch').and.returnValue(Promise.resolve(new Response(
      JSON.stringify({ error: 'Action receivable not allowed' }), { status: 500 }
    )));
    try {
      await new RpcTransportService().post('https://example.org', {}, {}).toPromise();
      fail('must reject');
    } catch (error) {
      expect(error).toEqual(jasmine.objectContaining({
        status: 500,
        error: jasmine.objectContaining({ error: 'Action receivable not allowed' })
      }));
    }
  });
});
