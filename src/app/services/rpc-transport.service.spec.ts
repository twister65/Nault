import { RpcTransportService } from './rpc-transport.service';
import { HttpHeaders } from '@angular/common/http';

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
