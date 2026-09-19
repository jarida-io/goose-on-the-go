jest.mock('../storage', () => ({ Storage: { get: jest.fn(), set: jest.fn() } }));
jest.mock('../secure-storage', () => ({ SecureStorage: { get: jest.fn(), set: jest.fn() } }));
import { Storage } from '../storage';
import { SecureStorage } from '../secure-storage';
import { commitPairedProfile, loadPairedProfile, SavedPond } from '../paired-profile';
const old: SavedPond = { identity: { id: 'old', pin: `sha256/${'A'.repeat(43)}=`, session: 'old-session', refresh: 'old-refresh' },
  profile: { version: 2, host: 'old.local', port: 4443, localUrls: ['https://old.local:4443'] } };
let plain: Record<string, string>; let secure: string | null;
beforeEach(() => {
  plain = { connectionProfile: JSON.stringify({ old: old.profile }) }; secure = JSON.stringify(old.identity);
  jest.mocked(Storage.get).mockImplementation(async (key) => plain[key] ?? null);
  jest.mocked(Storage.set).mockImplementation(async (key, value) => { plain[key] = value; });
  jest.mocked(SecureStorage.get).mockImplementation(async () => secure);
  jest.mocked(SecureStorage.set).mockImplementation(async (_key, value) => { secure = value; });
});
it('migrates old HTTP pairings to a rescan state without inventing trust', async () => {
  secure = null; plain = { serverUrl: 'http://pond.local:4000' };
  expect(await loadPairedProfile()).toEqual({ saved: null, upgrade: true });
});
it('preserves the previous profile if the secure commit fails', async () => {
  jest.mocked(SecureStorage.set).mockRejectedValueOnce(new Error('disk unavailable'));
  await expect(commitPairedProfile(old, { ...old, identity: { ...old.identity, id: 'new', session: 'new-session' } })).rejects.toThrow();
  expect((await loadPairedProfile()).saved).toEqual(old);
});
it('loads credentials only with their matching address profile', async () => {
  plain.connectionProfile = JSON.stringify({ different: old.profile });
  expect(await loadPairedProfile()).toEqual({ saved: null, upgrade: true });
});
it('commits a successful new identity and never puts credentials in address storage', async () => {
  const next = { ...old, identity: { ...old.identity, id: 'new', session: 'new-session' } };
  await commitPairedProfile(old, next);
  expect((await loadPairedProfile()).saved).toEqual(next);
  expect(plain.connectionProfile).not.toContain('session'); expect(plain.connectionProfile).not.toContain('sha256');
});
