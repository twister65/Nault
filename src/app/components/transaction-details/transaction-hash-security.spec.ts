import { TransactionDetailsComponent } from './transaction-details.component';

describe('TransactionDetailsComponent RPC block hash validation', () => {
  const makeComponent = (hash: string, blocksInfo: (hashes: string[]) => Promise<any>) =>
    new TransactionDetailsComponent(
      { wallet: { accounts: [] } } as any,
      { snapshot: { params: { transaction: hash } } } as any,
      {} as any,
      { getAccountName: () => null } as any,
      { blocksInfo } as any,
      {} as any,
      {} as any,
      { translate: () => 'Account' } as any
    );

  it('rejects prototype property names without requesting remote data', async () => {
    const request = jasmine.createSpy('blocksInfo').and.returnValue(Promise.resolve({ blocks: {} }));
    const component = makeComponent('__proto__', request);
    await component.loadTransaction();
    expect(request).not.toHaveBeenCalled();
    expect(component.transaction).toBeNull();
    expect(component.loadingBlock).toBeFalse();
  });

  it('rejects inherited properties in the RPC blocks map', async () => {
    const hash = 'A'.repeat(64);
    const inherited = { [hash]: { contents: '{}' } };
    const blocks = Object.create(inherited);
    const request = jasmine.createSpy('blocksInfo').and.returnValue(Promise.resolve({ blocks }));
    const component = makeComponent(hash, request);
    await component.loadTransaction();
    expect(component.transaction).toBeNull();
  });

  it('parses a valid block into a new object without modifying the RPC record', async () => {
    const hash = 'B'.repeat(64);
    const contents = JSON.stringify({
      type: 'state', previous: '0'.repeat(64), balance: '0', representative: 'nano_rep', link: '0'.repeat(64)
    });
    const source = { contents, confirmed: 'true', height: '1', block_account: 'nano_account' };
    const blocks = { [hash]: source };
    const request = jasmine.createSpy('blocksInfo').and.returnValue(Promise.resolve({ blocks }));
    const component = makeComponent(hash, request);
    await component.loadTransaction();
    expect(request).toHaveBeenCalledWith([hash]);
    expect(component.blockType).toBe('open');
    expect(component.transaction.contents.type).toBe('state');
    expect(component.transaction).not.toBe(source);
    expect(source.contents).toBe(contents);
    expect(component.loadingBlock).toBeFalse();
  });

  it('rejects unsafe previous-block keys without issuing a second RPC request', async () => {
    const hash = 'C'.repeat(64);
    const request = jasmine.createSpy('blocksInfo').and.returnValue(Promise.resolve({
      blocks: { [hash]: { contents: JSON.stringify({ type: 'state', previous: '__proto__', balance: '0' }) } }
    }));
    const component = makeComponent(hash, request);
    await component.loadTransaction();
    expect(request).toHaveBeenCalledTimes(1);
    expect(component.transaction).toBeNull();
  });
});
