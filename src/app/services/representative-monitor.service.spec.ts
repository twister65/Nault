import { of, throwError } from 'rxjs';
import { RepresentativeMonitorService } from './representative-monitor.service';

describe('RepresentativeMonitorService', () => {
  const address = 'nano_3hn3r6bnnmcy39gu6fgtisgnqh384gmt5mnh71a5xo4cb1d38ps16p8sg5c3';
  const data = (takenAt = Math.floor(Date.now() / 1000)) => ({
    takenAt,
    representatives: [{
      account: address, name: 'Twister32', online: true, principal: false,
      weight: 1353.3, share: 0.000015, verdict: 'couldBeBetter',
      node: null, outdated: null, crowded: false
    }]
  });

  it('requests only the global list once and shares its cached response', async () => {
    const http = { get: jasmine.createSpy('get').and.returnValue(of(data())) };
    const service = new RepresentativeMonitorService(http as any);
    const [first, second] = await Promise.all([service.getSnapshot(), service.getSnapshot()]);
    expect(http.get).toHaveBeenCalledTimes(1);
    expect(http.get).toHaveBeenCalledWith('https://nanonode.de/api/v1/representatives');
    expect(first?.byAccount[address]?.name).toBe('Twister32');
    expect(first?.byAccount[address]?.online).toBeTrue();
    expect(first?.byAccount[address]?.node).toBeNull();
    expect(second).toBe(first);
    expect(await service.getSnapshot()).toBe(first);
    expect(http.get).toHaveBeenCalledTimes(1);
  });

  it('rejects data older than five minutes rather than reporting false offline', async () => {
    const http = {get: jasmine.createSpy('get').and.returnValue(of(data(Math.floor(Date.now() / 1000) - 900)))};
    const service = new RepresentativeMonitorService(http as any);
    expect(await service.getSnapshot()).toBeNull();
    expect(await service.getSnapshot()).toBeNull();
    expect(http.get).toHaveBeenCalledTimes(1);
  });

  it('keeps external status unknown on CORS/network failures', async () => {
    const http = {get: () => throwError(() => new Error('CORS'))};
    const service = new RepresentativeMonitorService(http as any);
    expect(await service.getSnapshot()).toBeNull();
  });

  it('does not interpret missing RsNano telemetry or outdated:null as good health', async () => {
    const snapshot = data();
    (snapshot.representatives[0] as any).node = {implementation:'rsnano',version:'3.1',inSync:null};
    const service = new RepresentativeMonitorService({get: () => of(snapshot)} as any);
    const rep = (await service.getSnapshot())?.byAccount[address];
    expect(rep?.outdated).toBeNull();
    expect(rep?.node?.inSync).toBeNull();
    expect(rep?.verdict).toBe('couldBeBetter');
  });
});
