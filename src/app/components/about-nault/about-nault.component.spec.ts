import { AboutNaultComponent, readBuildCommit, readBuildVersion } from './about-nault.component';

describe('Nault build commit', () => {
  it('accepts a full commit SHA and normalizes its case', () => {
    const fullSha = 'ABCDEF1234567890ABCDEF1234567890ABCDEF12';
    expect(readBuildCommit({ commit: fullSha })).toBe(fullSha.toLowerCase());
  });

  it('accepts only valid embedded release versions', () => {
    expect(readBuildVersion({ version: '1.18.6' })).toBe('1.18.6');
    expect(readBuildVersion({ version: '1.18.6-rc.1' })).toBe('1.18.6-rc.1');
    expect(readBuildVersion({ version: 'javascript:alert(1)' })).toBeNull();
    expect(readBuildVersion({ version: '<script>' })).toBeNull();
    expect(readBuildVersion({ version: 1186 })).toBeNull();
    expect(readBuildVersion(null)).toBeNull();
  });

  it('never creates a GitHub URL from missing or malformed metadata', () => {
    expect(readBuildCommit({ commit: 'f655b11' })).toBeNull();
    expect(readBuildCommit({ commit: 'javascript:alert(1)' })).toBeNull();
    expect(readBuildCommit(null)).toBeNull();
    expect(readBuildCommit({})).toBeNull();
  });

  it('can render About without fetching a revision file or a network request', () => {
    const component = new AboutNaultComponent();
    expect(() => component.ngOnInit()).not.toThrow();
    if (component.releaseVersion !== null) {
      expect(component.releaseVersion).toMatch(/^\d+\.\d+\.\d+/);
    }
    if (component.commitShort !== null) {
      expect(component.commitShort).toMatch(/^[0-9a-f]{7}$/);
      expect(component.commitUrl).toContain('/commit/');
    } else {
      expect(component.commitUrl).toBeNull();
    }
  });
});
