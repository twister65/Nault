import { secureEndpoint } from './endpoint-policy';

describe('Endpoint transport policy', () => {
  it('accepts TLS and loopback IPv4/IPv6 only for plaintext', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      expect(secureEndpoint(`http://${host}:7076`, 'rpc')).toContain(host);
      expect(secureEndpoint(`ws://${host}:7078`, 'ws')).toContain(host);
    }
    expect(secureEndpoint('https://example.org/rpc', 'rpc')).toBe('https://example.org/rpc');
    expect(secureEndpoint('wss://example.org/ws', 'ws')).toBe('wss://example.org/ws');
  });
  it('rejects LAN, remote plaintext, credentials, fragments, deceptive hosts and wrong schemes', () => {
    for (const address of ['http://192.0.2.10:7076', 'http://example.org',
      'http://localhost.example.org', 'http://127.0.0.1.example.org', 'http://[::ffff:192.0.2.10]',
      'https://user:password@example.org', 'https://example.org/#secret', 'file:///tmp/rpc',
      'javascript:alert(1)', 'ws://localhost:7078', 'garbage']) {
      expect(() => secureEndpoint(address, 'rpc')).toThrow();
    }
    expect(() => secureEndpoint('ws://192.0.2.10:7078', 'ws')).toThrow();
    expect(() => secureEndpoint('https://example.org', 'ws')).toThrow();
  });
});
