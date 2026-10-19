import { RpcTransportService } from './rpc-transport.service';
import { HttpHeaders } from '@angular/common/http';

describe('RPC network boundary', () => {
  it('forbids redirects and ambient credentials and aborts on unsubscribe', () => {
    const fetchSpy = spyOn(window, 'fetch').and.returnValue(new Promise(() => {}));
    const subscription = new RpcTransportService().post('https://example.org/rpc', { action: 'version' }, {
      headers: new HttpHeaders().set('Authorization', 'test-only')
    }).subscribe();
    const options = fetchSpy.calls.mostRecent().args[1];
    expect(options.redirect).toBe('error');
    expect(options.credentials).toBe('omit');
    expect(options.referrerPolicy).toBe('no-referrer');
    expect((options.headers as Headers).get('Authorization')).toBe('test-only');
    subscription.unsubscribe();
    expect(options.signal.aborted).toBe(true);
  });
  it('preserves proxy refusal bodies for the legacy compatibility fallback', async () => {
    spyOn(window, 'fetch').and.returnValue(Promise.resolve(new Response(
      JSON.stringify({ error: 'Action receivable not allowed' }), { status: 500 }
    )));
    try {
      await new RpcTransportService().post('https://example.org', {}, {}).toPromise();
      fail('must reject');
    } catch (error) {
      expect(error.status).toBe(500);
      expect(error.error.error).toBe('Action receivable not allowed');
    }
  });
});
