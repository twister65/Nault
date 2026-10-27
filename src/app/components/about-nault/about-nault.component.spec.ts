import { AboutNaultComponent, readBuildCommit } from './about-nault.component';

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

  it('can render About without fetching a revision file or a network request', () => {
    const component = new AboutNaultComponent();
    expect(() => component.ngOnInit()).not.toThrow();
    if (component.commitShort !== null) {
      expect(component.commitShort).toMatch(/^[0-9a-f]{7}$/);
      expect(component.commitUrl).toContain('/commit/');
    } else {
      expect(component.commitUrl).toBeNull();
    }
  });
});
