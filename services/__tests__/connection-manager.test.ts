import { ConnectionManager } from '../connection-manager';
import { ConnectionProfile } from '@/models/connection';
const profile: ConnectionProfile = { version: 2, host: 'pond.local', port: 4443,
  localUrls: ['https://192.168.1.2:4443'], remoteUrl: 'https://100.64.0.2:4443' };
const pin = `sha256/${'A'.repeat(43)}=`;
const fixture = () => {
  const deps = { probe: jest.fn(async () => true), discover: jest.fn(async () => null),
    trust: jest.fn(async () => undefined), changed: jest.fn() };
  return { deps, manager: new ConnectionManager(deps) };
};
afterEach(() => jest.useRealTimers());
it('coalesces simultaneous REST and SSE recovery', async () => {
  const { deps, manager } = fixture(); await manager.configure(profile, pin);
  const first = manager.recover(); const second = manager.recover();
  expect(first).toBe(second); expect(await first).toBe(profile.localUrls[0]);
  expect(deps.probe).toHaveBeenCalledTimes(1); manager.environment(false, false);
});
it('uses tailnet on cellular and returns to LAN', async () => {
  const { deps, manager } = fixture(); await manager.configure(profile, pin);
  manager.environment(true, true); await manager.recover();
  expect(manager.current).toEqual({ state: 'remote', url: profile.remoteUrl });
  manager.environment(false, true); await manager.recover();
  expect(manager.current.state).toBe('local');
  expect(deps.probe.mock.calls).toHaveLength(2); manager.environment(false, false);
});
it('rejects an old network result after backgrounding', async () => {
  const { deps, manager } = fixture(); let finish!: (ok: boolean) => void;
  deps.probe.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  await manager.configure(profile, pin); const recovery = manager.recover();
  manager.environment(false, false); finish(true); expect(await recovery).toBeNull();
  expect(manager.current.url).toBeNull();
});
it('continues after a pin-rejected candidate but never changes the pin', async () => {
  const { deps, manager } = fixture();
  deps.probe.mockRejectedValueOnce(new Error('pin mismatch'));
  await manager.configure(profile, pin); expect(await manager.recover()).toBe(profile.remoteUrl);
  expect(deps.trust).toHaveBeenCalledWith([...profile.localUrls, profile.remoteUrl], pin);
  manager.environment(false, false);
});
it('bounds failed recovery and pauses all timers in the background', async () => {
  jest.useFakeTimers(); const { deps, manager } = fixture(); deps.probe.mockResolvedValue(false);
  await manager.configure(profile, pin); await manager.recover();
  await jest.advanceTimersByTimeAsync(300_000);
  expect(deps.probe).toHaveBeenCalledTimes(12);
  manager.environment(false, false); expect(jest.getTimerCount()).toBe(0);
});
it('returns to LAN when a temporary local outage clears on the same Wi-Fi', async () => {
  jest.useFakeTimers(); const { deps, manager } = fixture();
  deps.probe.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  await manager.configure(profile, pin); await manager.recover();
  expect(manager.current.state).toBe('remote');
  await jest.advanceTimersByTimeAsync(30_000);
  expect(manager.current.state).toBe('local'); manager.environment(false, false);
});
