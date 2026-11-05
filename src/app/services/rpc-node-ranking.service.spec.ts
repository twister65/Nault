import { of, throwError } from 'rxjs';
import { RpcNodeRankingService } from './rpc-node-ranking.service';

describe('RpcNodeRankingService', () => {
  function setup(counts: Record<string, string | null>) {
    const servers = Object.keys(counts).map(value => ({
      name: value, value, api: 'https://' + value + '.example/rpc', ws: null,
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
        return count === null ? throwError({ status: 503 }) : of({ count });
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

  it('does not claim synchronization without sufficient peers', async () => {
    const { ranking, settings } = setup({ only: '12345', unavailable: null });
    await ranking.refresh();
    expect(ranking.measurements.find(node => node.value === 'only')?.health).toBe('unverified');
    expect(settings.setRankedEndpoints).toHaveBeenCalledOnceWith(['https://only.example/rpc']);
  });

  it('returns no candidates when every public node is unreachable', async () => {
    const { ranking, settings } = setup({ alpha: null, beta: null });
    await ranking.refresh();
    expect(ranking.ready).toBeTrue();
    expect(settings.setRankedEndpoints).toHaveBeenCalledOnceWith([]);
  });
});
