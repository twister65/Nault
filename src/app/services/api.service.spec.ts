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
