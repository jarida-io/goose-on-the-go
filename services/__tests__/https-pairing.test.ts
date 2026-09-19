import { parsePairingPayload } from '@/models/pairing';
const pin = `sha256/${'A'.repeat(43)}=`;
const qr = (extra = '') => `pond://pair?v=2&scheme=https&host=pond.local&port=4443&code=123456&pin=${encodeURIComponent(pin)}${extra}`;
it('requires a versioned HTTPS payload with a public key pin', () => {
  expect(() => parsePairingPayload('pond://pair?host=pond.local&port=4000&code=123456')).toThrow();
  expect(parsePairingPayload(qr()).serverUrl).toBe('https://pond.local:4443');
});
it('rejects URL injection and duplicate trust fields', () => {
  expect(() => parsePairingPayload(qr('&host=evil.test'))).toThrow();
  expect(() => parsePairingPayload(qr().replace('pond.local', 'user%40evil.test'))).toThrow();
});
it('keeps remote endpoints out of initial pairing candidates', () => {
  const p = parsePairingPayload(qr('&ip=192.168.1.4&ts=100.64.0.4'));
  expect(p.profile.localUrls).not.toContain(p.remoteUrl);
  expect(p.pin).toBe(pin);
});
