jest.mock('react-native', () => ({ Platform: { OS: 'android' }, NativeModules: { PondTls: { configure: jest.fn(async () => undefined) } } }));
import { NativeModules, Platform } from 'react-native';
import { configurePondTrust, assertPondTrust } from '../pond-trust';
const pin = `sha256/${'A'.repeat(43)}=`;
afterEach(async () => { Platform.OS = 'android'; await configurePondTrust([]); jest.clearAllMocks(); });
it('uses the native trust bridge on iOS as well as Android', async () => {
  Platform.OS = 'ios';
  await configurePondTrust([{ url: 'https://pond.local:4443', pin }]);
  await expect(assertPondTrust('https://pond.local:4443')).resolves.toBeUndefined();
  expect(NativeModules.PondTls.configure).toHaveBeenCalledWith([{ url: 'https://pond.local:4443', pin }]);
});
it('does not pretend browsers can provide native certificate pinning', async () => {
  Platform.OS = 'web';
  await expect(configurePondTrust([{ url: 'https://pond.local:4443', pin }])).rejects.toThrow();
  expect(NativeModules.PondTls.configure).not.toHaveBeenCalled();
});
it('does not expose trust until native installation finishes', async () => {
  let finish!: () => void;
  NativeModules.PondTls.configure.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  const pending = configurePondTrust([{ url: 'https://pond.local:4443', pin }]);
  let ready = false; const check = assertPondTrust('https://pond.local:4443').then(() => { ready = true; });
  await Promise.resolve(); await Promise.resolve(); expect(ready).toBe(false);
  finish(); await pending; await check; expect(ready).toBe(true);
});
it('failed staging does not install a replacement in JavaScript', async () => {
  await configurePondTrust([{ url: 'https://pond.local:4443', pin }]);
  NativeModules.PondTls.configure.mockRejectedValueOnce(new Error('native failed'));
  await expect(configurePondTrust([{ url: 'https://other.local:4443', pin }])).rejects.toThrow();
  await expect(assertPondTrust('https://other.local:4443')).rejects.toThrow();
  await configurePondTrust([{ url: 'https://pond.local:4443', pin }]);
  await expect(assertPondTrust('https://pond.local:4443')).resolves.toBeUndefined();
});
it('clearing staged trust denies further requests', async () => {
  await configurePondTrust([{ url: 'https://pond.local:4443', pin }]); await configurePondTrust([]);
  await expect(assertPondTrust('https://pond.local:4443')).rejects.toThrow();
});
it('rejects plaintext even with a valid pin', async () => {
  expect(() => configurePondTrust([{ url: 'http://pond.local:4000', pin }])).toThrow();
  expect(NativeModules.PondTls.configure).not.toHaveBeenCalled();
});
