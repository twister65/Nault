import { readBuildCommit } from './about-nault.component';

describe('Nault build commit', () => {
  it('accepts a full commit SHA and normalizes its case', () => {
    const fullSha = 'ABCDEF1234567890ABCDEF1234567890ABCDEF12';
    expect(readBuildCommit({ commit: fullSha })).toBe(fullSha.toLowerCase());
  });

  it('never creates a GitHub URL from missing or malformed metadata', () => {
    expect(readBuildCommit({ commit: 'f655b11' })).toBeNull();
    expect(readBuildCommit({ commit: 'javascript:alert(1)' })).toBeNull();
    expect(readBuildCommit(null)).toBeNull();
    expect(readBuildCommit({})).toBeNull();
  });
});
