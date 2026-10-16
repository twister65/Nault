// Shared by settings and the network boundary, including previously saved settings.
export function secureEndpoint(value: string, kind: 'rpc' | 'ws'): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Missing server address.');
  const endpoint = new URL(value.trim());
  const secure = kind === 'rpc' ? 'https:' : 'wss:';
  const local = kind === 'rpc' ? 'http:' : 'ws:';
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
  if (endpoint.username || endpoint.password || endpoint.hash ||
      (endpoint.protocol !== secure && !(endpoint.protocol === local && loopback))) {
    throw new Error('Use HTTPS/WSS. HTTP/WS is allowed only for localhost, 127.0.0.1 or [::1].');
  }
  return endpoint.href;
}
