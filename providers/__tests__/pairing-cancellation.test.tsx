import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ServerProvider, useServer } from '../server-provider';
import { configurePondTrust } from '@/services/pond-trust';
import { findPondByHost } from '@/services/discovery';

jest.mock('@react-native-community/netinfo', () => ({
  configure: jest.fn(), addEventListener: jest.fn(() => () => undefined),
  fetch: jest.fn(async () => ({ type: 'wifi' })),
}));
jest.mock('@/services/storage', () => ({ Storage: { set: jest.fn(), remove: jest.fn(), getJSON: jest.fn(async () => null), setJSON: jest.fn() }, purgeLegacyStorage: jest.fn() }));
jest.mock('@/services/secure-storage', () => ({ SecureStorage: { set: jest.fn(), remove: jest.fn(), getJSON: jest.fn(async () => null), setJSON: jest.fn() } }));
jest.mock('@/services/paired-profile', () => ({
  loadPairedProfile: jest.fn(async () => ({ saved: null, upgrade: false })), commitPairedProfile: jest.fn(),
}));
jest.mock('@/services/pond-trust', () => ({ configurePondTrust: jest.fn(async () => undefined), PondTrustError: class extends Error {} }));
jest.mock('@/services/discovery', () => ({ findPondByHost: jest.fn(async () => null) }));
jest.mock('@/services/api-client', () => ({
  api: { setRecovery: jest.fn(), setOnTokensRotated: jest.fn(), invalidateIdentity: jest.fn() },
  PondApiClient: jest.fn(),
}));

it('cannot install a staged pin after cancellation while clearing the old trust', async () => {
  // React 19 requires the explicit act environment when using its renderer directly.
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let server!: ReturnType<typeof useServer>;
  const Child = () => { server = useServer(); return null; };
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<ServerProvider><Child /></ServerProvider>); });
  jest.mocked(configurePondTrust).mockClear();
  let finishClear!: () => void;
  jest.mocked(configurePondTrust).mockImplementationOnce(() => new Promise<void>((resolve) => { finishClear = resolve; }));
  let staging!: Promise<unknown>;
  await act(async () => {
    staging = server.stagePairing({ version: 2, host: 'pond.local', port: 4443,
      localUrls: ['https://192.168.1.2:4443'] }, `sha256/${'A'.repeat(43)}=`).catch((error: Error) => error);
  });
  expect(finishClear).toBeDefined();
  await act(async () => { await server.cancelPairing(); finishClear(); await staging; });
  expect(configurePondTrust).toHaveBeenCalledTimes(2);
  expect(jest.mocked(configurePondTrust).mock.calls.every(([entries]) => entries.length === 0)).toBe(true);
  expect(findPondByHost).not.toHaveBeenCalled();
  await act(async () => { tree.unmount(); });
});

it('keeps data hooks waiting until native trust hydration completes', async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let finishTrust!: () => void;
  jest.mocked(configurePondTrust).mockImplementationOnce(() => new Promise<void>((resolve) => { finishTrust = resolve; }));
  let server!: ReturnType<typeof useServer>;
  const Child = () => { server = useServer(); return null; };
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(<ServerProvider><Child /></ServerProvider>); });
  expect(server.hydrated).toBe(false);
  await act(async () => { finishTrust(); });
  expect(server.hydrated).toBe(true);
  await act(async () => { tree.unmount(); });
});
