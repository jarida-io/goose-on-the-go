jest.mock('../pond-trust', () => ({ assertPondTrust: jest.fn().mockResolvedValue(undefined) }));
import { PondApiClient } from '../api-client';
import { assertPondTrust } from '../pond-trust';
const response = () => new Response('{"ok":true}', { status: 200 });
beforeEach(() => { jest.clearAllMocks(); Object.defineProperty(globalThis, 'fetch', { value: jest.fn(), configurable: true, writable: true }); });
it('blocks plaintext before any request', () => {
  expect(() => new PondApiClient('http://pond.local:4000')).toThrow(); expect(fetch).not.toHaveBeenCalled();
});
it('requires native trust before credentials can leave', async () => {
  jest.mocked(assertPondTrust).mockRejectedValueOnce(new Error('untrusted'));
  const client = new PondApiClient('https://pond.local:4443'); client.setToken('secret');
  await expect(client.request('/api/v1/devices')).rejects.toThrow('untrusted'); expect(fetch).not.toHaveBeenCalled();
});
it('retries a read once at the recovered endpoint', async () => {
  jest.mocked(fetch).mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(response());
  const client = new PondApiClient('https://pond.local:4443'); const recover = jest.fn(async () => 'https://100.64.0.2:4443');
  client.setRecovery(recover); await client.request('/api/v1/devices');
  expect(fetch).toHaveBeenCalledTimes(2); expect(jest.mocked(fetch).mock.calls[1][0]).toBe('https://100.64.0.2:4443/api/v1/devices');
});
it.each(['POST', 'PUT', 'DELETE'])('does not replay an ambiguous %s', async (method) => {
  jest.mocked(fetch).mockRejectedValue(new TypeError('offline'));
  const client = new PondApiClient('https://pond.local:4443'); client.setRecovery(async () => 'https://100.64.0.2:4443');
  await expect(client.request('/api/v1/devices', { method })).rejects.toThrow(); expect(fetch).toHaveBeenCalledTimes(1);
});
it('does not replay refresh-token rotation', async () => {
  jest.mocked(fetch).mockRejectedValue(new TypeError('offline'));
  const client = new PondApiClient('https://pond.local:4443'); client.setRefreshToken('secret');
  const recover = jest.fn(); client.setRecovery(recover);
  await expect(client.handshakeRefresh()).rejects.toThrow(); expect(fetch).toHaveBeenCalledTimes(1); expect(recover).not.toHaveBeenCalled();
});
it('rejects redirects and marks requests for native enforcement', async () => {
  jest.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: 'https://other.test' } }));
  const client = new PondApiClient('https://pond.local:4443');
  await expect(client.request('/api/v1/devices')).rejects.toThrow('redirect');
  const init = jest.mocked(fetch).mock.calls[0][1]!;
  expect(init.redirect).toBe('error'); expect(new Headers(init.headers).get('X-Pond-Transport')).toBe('1');
});
