import { of, throwError } from 'rxjs';
import { RpcNodeRankingService } from './rpc-node-ranking.service';
import { RpcServerOption } from './app-settings.service';

describe('RpcNodeRankingService', () => {
  function setup(counts: Record<string, string | { count: string; cemented?: string } | null>) {
    const servers: RpcServerOption[] = Object.keys(counts).map(value => ({
      name: value, value, api: 'https://' + value + '.example/rpc',
      ws: value === 'rpc-only' ? null : 'wss://' + value + '.example/ws',
      auth: null, allowFailover: true, shouldRandom: false
    }));
    const settings = {
      serverOptions: [...servers,
        { name: 'Private', value: 'local-secret', api: 'https://private.example/rpc',
          ws: null, auth: 'secret', allowFailover: false, shouldRandom: false, isLocal: true }],
      setRankedEndpoints: jasmine.createSpy('setRankedEndpoints'),
      getRankedFallbackEndpoints: jasmine.createSpy('getRankedFallbackEndpoints')
    };
    const transport = {
      post: jasmine.createSpy('post').and.callFake((endpoint: string) => {
        const name = endpoint.match(/^https:\/\/([^.]*)/)?.[1];
        const count = name ? counts[name] : null;
        return count === null ? throwError({ status: 503 })
          : of(typeof count === 'string' ? { count } : count);
      })
    };
    const ranking = new RpcNodeRankingService(transport as any, settings as any);
    return { ranking, settings, transport };
  }

  it('compares peers and excludes lagging or unavailable nodes from ranked candidates', async () => {
    const { ranking, settings, transport } = setup({
      alpha: '200000000', beta: '200000001', gamma: '200000000',
      stale: '199900000', offline: null
    });
    await ranking.refresh();
    expect(ranking.ready).toBeTrue();
    expect(ranking.measurements.find(node => node.value === 'stale')?.health).toBe('lagging');
    expect(ranking.measurements.find(node => node.value === 'offline')?.health).toBe('unavailable');
    const rank = settings.setRankedEndpoints.calls.mostRecent().args[0] as string[];
    expect(rank.length).toBe(3);
    expect(rank).not.toContain('https://stale.example/rpc');
    expect(rank).not.toContain('https://offline.example/rpc');
    expect(transport.post.calls.allArgs().some(args => args[0] === 'https://private.example/rpc')).toBeFalse();
    expect(transport.post.calls.allArgs().every(args => args[1].action === 'block_count')).toBeTrue();
  });

  it('keeps SomeNano synchronized when its unconfirmed count differs but cemented matches peers', async () => {
    const { ranking, settings } = setup({
      somenano: { count: '226014800', cemented: '226014479' },
      rainstorm: { count: '226014474', cemented: '226014474' },
      nanoslo: { count: '226014477', cemented: '226014476' },
    });
    await ranking.refresh();
    expect(ranking.measurements.find(node => node.value === 'somenano')?.health).toBe('synchronized');
    expect(ranking.measurements.find(node => node.value === 'rainstorm')?.health).toBe('synchronized');
    expect(ranking.measurements.find(node => node.value === 'nanoslo')?.health).toBe('synchronized');
    const candidates = settings.setRankedEndpoints.calls.mostRecent().args[0] as string[];
    expect(candidates).toContain('https://somenano.example/rpc');
  });

  it('does not compare a count-only gateway against cemented counts from other peers', async () => {
    const { ranking } = setup({
      a: { count: '226015000', cemented: '226014480' },
      b: { count: '226014481', cemented: '226014481' },
      countonly: { count: '226014000' }
    });
    await ranking.refresh();
    expect(ranking.measurements.find(node => node.value === 'countonly')?.health).toBe('unverified');
  });

  it('marks a strongly higher outlier unverified rather than falsely lagging', async () => {
    const { ranking, settings } = setup({
      a: { count: '220000000', cemented: '220000000' },
      b: { count: '220000001', cemented: '220000001' },
      outlier: { count: '221000000', cemented: '221000000' }
    });
    await ranking.refresh();
    expect(ranking.measurements.find(node => node.value === 'outlier')?.health).toBe('unverified');
    const candidates = settings.setRankedEndpoints.calls.mostRecent().args[0] as string[];
    expect(candidates[candidates.length - 1]).toBe('https://outlier.example/rpc');
  });

  it('does not claim synchronization without sufficient peers', async () => {
    const { ranking, settings } = setup({ only: '12345', unavailable: null });
    await ranking.refresh();
    expect(ranking.measurements.find(node => node.value === 'only')?.health).toBe('unverified');
    expect(settings.setRankedEndpoints).toHaveBeenCalledOnceWith(['https://only.example/rpc']);
  });

  it('shows a locally saved WSS node in The best results without probing a duplicate URL twice', async () => {
    const { ranking, settings, transport } = setup({
      rainstorm: '226014480', 'nano-to': '226014480'
    });
    settings.serverOptions.push({
      name: 'Nano.to (local)', value: 'local-nano-to', isLocal: true,
      api: 'https://nano-to.example/rpc', ws: 'wss://nano-to.example/ws',
      auth: null, allowFailover: true, shouldRandom: false
    });
    await ranking.refresh();
    expect(transport.post.calls.count()).toBe(2);
    expect(ranking.measurements.find(node => node.value === 'local-nano-to')).toEqual(jasmine.objectContaining({
      name: 'Nano.to (local)', isLocal: true, health: 'synchronized'
    }));
    expect(ranking.measurements.length).toBe(3);
    const candidates = settings.setRankedEndpoints.calls.mostRecent().args[0] as string[];
    expect(candidates.length).toBe(2);
    expect(candidates).toContain('https://nano-to.example/rpc');
  });

  it('includes a distinct locally saved WSS endpoint in rankings', async () => {
    const { ranking, settings, transport } = setup({ rainstorm: '100', nanoslo: '100', localnode: '100' });
    settings.serverOptions = settings.serverOptions.filter(node => node.value !== 'localnode');
    settings.serverOptions.push({
      name: 'My Nano node', value: 'localnode', isLocal: true,
      api: 'https://localnode.example/rpc', ws: 'wss://localnode.example/ws',
      auth: null, allowFailover: true, shouldRandom: false
    });
    await ranking.refresh();
    expect(transport.post.calls.count()).toBe(3);
    expect(ranking.measurements.find(node => node.value === 'localnode')?.health).toBe('synchronized');
    expect(settings.setRankedEndpoints.calls.mostRecent().args[0]).toContain('https://localnode.example/rpc');
  });

  it('never probes or ranks a public node that has no WebSocket', async () => {
    const { ranking, settings, transport } = setup({
      alpha: '200000000', beta: '200000000', 'rpc-only': '200000000'
    });
    await ranking.refresh();
    expect(transport.post.calls.allArgs().some(args => args[0] === 'https://rpc-only.example/rpc')).toBeFalse();
    expect(settings.setRankedEndpoints.calls.mostRecent().args[0]).not.toContain('https://rpc-only.example/rpc');
    expect(ranking.measurements.some(node => node.value === 'rpc-only')).toBeFalse();
  });

  it('returns no candidates when every public node is unreachable', async () => {
    const { ranking, settings } = setup({ alpha: null, beta: null });
    await ranking.refresh();
    expect(ranking.ready).toBeTrue();
    expect(settings.setRankedEndpoints).toHaveBeenCalledOnceWith([]);
  });
});
