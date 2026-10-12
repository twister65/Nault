import { AccountPipe } from './account.pipe';

describe('AccountPipe', () => {
  it('create an instance', () => {
    const pipe = new AccountPipe(null as any, null as any);
    expect(pipe).toBeTruthy();
  });
});
