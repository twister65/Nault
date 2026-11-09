import { ReceivablePushService } from './receivable-push.service';

describe('ReceivablePushService', () => {
  const configResponse = (body: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

  let service: ReceivablePushService;
  let store: Map<string, string>;
  let requestSubscription: jasmine.Spy;
  let unsubscribe: jasmine.Spy;
  let fetchSpy: jasmine.Spy;
  let wallet: any;

  beforeEach(() => {
    store = new Map();
    spyOn(localStorage, 'getItem').and.callFake(key => store.get(key) ?? null);
    spyOn(localStorage, 'setItem').and.callFake((key, value) => { store.set(key, value); });
    spyOn(localStorage, 'removeItem').and.callFake(key => { store.delete(key); });
    wallet = {
      isConfigured: () => true,
      wallet: { accounts: [{ id: 'nano_' + '1'.repeat(60) }] }
    };
    requestSubscription = jasmine.createSpy().and.resolveTo({
      endpoint: 'https://push.example.invalid/sub',
      toJSON: () => ({
        endpoint: 'https://push.example.invalid/sub',
        keys: { auth: 'test-auth', p256dh: 'test-p256dh' }
      })
    });
    unsubscribe = jasmine.createSpy().and.resolveTo(undefined);
    const swPush = {
      isEnabled: true,
      requestSubscription,
      unsubscribe,
      pushSubscriptionChanges: { subscribe: () => {} },
      subscription: { pipe: () => ({ subscribe: (observer: any) => {
        observer.next({ endpoint: 'https://push.example.invalid/sub' });
        observer.complete();
      } }) }
    } as any;
    service = new ReceivablePushService(
      swPush,
      wallet,
      { settings: { minimumReceive: '0.000001' } } as any,
      { nano: { mnanoToRaw: () => ({ toString: () => '1000000000000000000000000' }) } } as any
    );
    fetchSpy = spyOn(window, 'fetch').and.callFake(async () =>
      configResponse({ enabled: true, vapidPublicKey: 'A'.repeat(87) }));
  });

  it('does not request permission or contact a server in the constructor', () => {
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(requestSubscription).not.toHaveBeenCalled();
  });

  it('fails closed when no push backend is available', async () => {
    fetchSpy.and.resolveTo(configResponse({}, 404));
    await service.checkAvailability();
    expect(service.status).toBe('unavailable');
    expect(await service.enable()).toBeFalse();
    expect(requestSubscription).not.toHaveBeenCalled();
  });

  it('registers only from an explicit enable action and stores no wallet secrets', async () => {
    fetchSpy.and.callFake(async (url: string) =>
      url.endsWith('/config')
        ? configResponse({ enabled: true, vapidPublicKey: 'A'.repeat(87) })
        : configResponse({ id: 'id-1', managementToken: 'management-token' }));
    await service.checkAvailability();
    expect(requestSubscription).not.toHaveBeenCalled();
    expect(await service.enable()).toBeTrue();
    expect(requestSubscription).toHaveBeenCalledTimes(1);
    const registered = JSON.parse((fetchSpy.calls.mostRecent().args[1] as RequestInit).body as string);
    expect(registered.accounts.length).toBe(1);
    expect(registered.minimumReceiveRaw).toBe('1000000000000000000000000');
    expect(JSON.stringify(registered)).not.toContain('seed');
    expect(service.hasSubscription).toBeTrue();
  });

  it('does not erase the management token when server revocation fails', async () => {
    store.set('nault-receivable-push-v1', JSON.stringify({
      id: 'id-1', managementToken: 'secret', endpoint: 'endpoint', snapshot: '{}'
    }));
    fetchSpy.and.resolveTo(configResponse({}, 503));
    expect(await service.disable()).toBeFalse();
    expect(service.hasSubscription).toBeTrue();
    expect(unsubscribe).not.toHaveBeenCalled();
  });
});
