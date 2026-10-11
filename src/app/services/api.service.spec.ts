import { ApiService } from './api.service';
import { TxType } from './util.service';

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
      const payload = request.calls.mostRecent().args[1];
      expect(payload.block).toBe(block);
      expect(payload.watch_work).toBeUndefined();
    }
    expect(request).toHaveBeenCalledTimes(4);
  });
});
