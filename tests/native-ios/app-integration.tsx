/** Alternate simulator-only bundle entry. The production app never imports this file. */
import React, { useEffect, useState } from 'react';
import { AppState, Text, ScrollView } from 'react-native';
import { registerRootComponent } from 'expo';
import { fetch as expoFetch } from 'expo/fetch';
import { configurePondTrust } from '@/services/pond-trust';
import { NotificationStream } from '@/services/notification-stream';
import { commitPairedProfile, loadPairedProfile, type SavedPond } from '@/services/paired-profile';
import { SecureStorage } from '@/services/secure-storage';
import { PondApiClient } from '@/services/api-client';

const origin = process.env.EXPO_PUBLIC_POND_TEST_ORIGIN ?? '';
const pin = process.env.EXPO_PUBLIC_POND_TEST_PIN ?? '';
const expiredOrigin = process.env.EXPO_PUBLIC_POND_TEST_EXPIRED_ORIGIN ?? '';
const incorrect = `sha256/${'A'.repeat(43)}=`;
const headers = { 'X-Pond-Transport': '1', Authorization: 'Bearer scratch-fixture' };
interface Result { name: string; passed: boolean; error?: string }
const results: Result[] = [];
function assert(value: unknown, reason: string): asserts value { if (!value) throw new Error(reason); }

async function check(name: string, action: () => Promise<void>) {
  try { await action(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: String(error) }); }
}
async function rejected(action: () => Promise<unknown>) {
  let failed = false;
  try { await action(); } catch { failed = true; }
  assert(failed, 'Request unexpectedly succeeded');
}
function xhr(path: string, base = origin): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('GET', base + path);
    Object.entries(headers).forEach(([key, value]) => request.setRequestHeader(key, value));
    request.timeout = 5000;
    request.onload = () => request.status === 200 ? resolve(request.responseText) : reject(new Error(`HTTP ${request.status}`));
    request.onerror = () => reject(new Error('XHR transport rejected'));
    request.ontimeout = () => reject(new Error('XHR timed out'));
    request.send();
  });
}

async function run(): Promise<Result[]> {
  assert(origin.startsWith('https://127.0.0.1:'), 'Only the local simulator fixture is allowed');
  await configurePondTrust([{ url: origin, pin }]);
  let previous = await loadPairedProfile();
  // Simulator Keychain items can survive uninstall; discard only a prior test run's identity.
  if (previous.saved?.identity.id === 'simulator-fixture' && previous.saved.identity.pin !== pin) {
    await SecureStorage.remove('pondIdentity');
    previous = { saved: null, upgrade: false };
  }
  if (previous.saved) {
    await check('secure profile survives app restart', async () => {
      assert(previous.saved?.identity.pin === pin && previous.saved.identity.session === 'scratch-fixture', 'Restored identity differs');
      const response = await expoFetch(origin + '/restart', { headers });
      assert(response.status === 200, 'Restored trust cannot connect');
    });
  } else {
    await check('Expo fetch uses pinned native transport', async () => {
      const response = await expoFetch(origin + '/fetch', { headers });
      assert(response.status === 200 && await response.text() === 'ok', 'Fetch response differs');
    });
    await check('React Native XHR uses pinned native transport', async () => { assert(await xhr('/xhr') === 'ok', 'XHR response differs'); });
    await check('notification SSE is incremental and deduplicated', async () => {
      await new Promise<void>((resolve, reject) => {
        const ids: string[] = [];
        const timeout = setTimeout(() => { stream.stop(); reject(new Error('SSE timed out')); }, 5000);
        const stream = new NotificationStream({ baseUrl: origin, deviceId: 'scratch-phone', token: 'scratch-fixture',
          onNotification: (notification) => {
            ids.push(notification.id);
            if (notification.id === 'second') {
              clearTimeout(timeout); stream.stop();
              if (ids.join(',') === 'first,second') resolve(); else reject(new Error('Duplicate notification escaped'));
            }
          },
          onDisconnect: () => { clearTimeout(timeout); stream.stop(); reject(new Error('SSE disconnected')); },
        });
        stream.start();
      });
    });
    await configurePondTrust([{ url: origin, pin: incorrect }]);
    await check('wrong pin blocks Expo fetch before HTTP', () => rejected(() => expoFetch(origin + '/wrong-fetch', { headers })));
    await check('wrong pin blocks XHR before HTTP', () => rejected(() => xhr('/wrong-xhr')));
    await check('wrong pin blocks the notification stream', async () => {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => { stream.stop(); reject(new Error('Wrong-pin SSE did not reject')); }, 5000);
        const stream = new NotificationStream({ baseUrl: origin, deviceId: 'wrong-pin-phone', token: 'scratch-fixture',
          onNotification: () => { clearTimeout(timeout); stream.stop(); reject(new Error('Wrong-pin SSE received data')); },
          onDisconnect: () => { clearTimeout(timeout); stream.stop(); resolve(); },
        });
        stream.start();
      });
    });
    const hostname = origin.replace('127.0.0.1', 'localhost');
    await configurePondTrust([{ url: hostname, pin }, { url: origin, pin }]);
    await check('hostname mismatch is rejected', () => rejected(() => expoFetch(hostname + '/wrong-host', { headers })));
    await check('XHR hostname mismatch is rejected', () => rejected(() => xhr('/wrong-host-xhr', hostname)));
    await configurePondTrust([{ url: origin, pin }, { url: expiredOrigin, pin }]);
    await check('expired certificate blocks Expo fetch', () => rejected(() => expoFetch(expiredOrigin + '/expired-fetch', { headers })));
    await check('expired certificate blocks XHR', () => rejected(() => xhr('/expired-xhr', expiredOrigin)));
    await check('redirect is rejected before destination request', () => rejected(() => expoFetch(origin + '/redirect', { headers })));
    await check('plaintext is rejected', () => rejected(() => expoFetch(origin.replace('https:', 'http:') + '/plaintext', { headers })));
    await configurePondTrust([]);
    await check('cleared trust blocks retained clients', () => rejected(() => xhr('/cleared')));
    await configurePondTrust([{ url: origin, pin }]);
    await check('secure profile commits atomically', async () => {
      const saved: SavedPond = { identity: { id: 'simulator-fixture', pin, session: 'scratch-fixture', refresh: 'scratch-refresh' },
        profile: { version: 2, host: '127.0.0.1', port: Number(new URL(origin).port), localUrls: [origin] } };
      await commitPairedProfile(null, saved);
      assert((await loadPairedProfile()).saved?.identity.pin === pin, 'Secure profile was not saved');
      assert(await SecureStorage.get('pondIdentity'), 'SecureStore is unavailable');
    });
    await check('scene background and foreground preserve pinned transport', async () => {
      await new Promise<void>((resolve, reject) => {
        let background = false;
        const timeout = setTimeout(() => { subscription.remove(); reject(new Error('AppState resume timed out')); }, 15_000);
        const subscription = AppState.addEventListener('change', (state) => {
          if (state === 'background') background = true;
          if (background && state === 'active') {
            clearTimeout(timeout); subscription.remove(); resolve();
          }
        });
        void expoFetch(origin + '/lifecycle-ready', { headers }).catch((error) => {
          clearTimeout(timeout); subscription.remove(); reject(error);
        });
      });
      assert((await expoFetch(origin + '/resumed', { headers })).status === 200, 'Pinned transport failed after resume');
    });
    await check('real scratch Pond pairing, authenticated REST, refresh and SSE', async () => {
      const configResponse = await expoFetch(origin + '/pond-config', { headers });
      const pond = await configResponse.json() as { url: string; pin: string; code: string };
      await configurePondTrust([{ url: origin, pin }, { url: pond.url, pin: pond.pin }]);
      const client = new PondApiClient(pond.url);
      const paired = await client.pair({ clientId: 'ios-scratch-phone', pairingCode: pond.code, deviceName: 'iOS transport verification' });
      assert(paired.accepted && paired.session_token, 'Scratch Pond pairing failed');
      const refreshed = await client.handshakeRefresh();
      assert(refreshed?.accepted && refreshed.session_token, 'Scratch Pond refresh failed');
      const authorization = `Bearer ${refreshed.session_token}`;
      const response = await expoFetch(pond.url + '/api/v1/devices', { headers: { ...headers, Authorization: authorization } });
      assert(response.status === 200, `Authenticated REST failed: HTTP ${response.status} ${await response.text()}`);
      await new Promise<void>((resolve, reject) => {
        const stream = new XMLHttpRequest();
        const timeout = setTimeout(() => { stream.abort(); reject(new Error('Scratch Pond SSE timed out')); }, 25_000);
        stream.open('GET', pond.url + '/api/v1/notifications/stream?device_id=ios-scratch-phone');
        stream.setRequestHeader('X-Pond-Transport', '1');
        stream.setRequestHeader('Authorization', authorization);
        stream.onprogress = () => {
          if (stream.status === 200 && stream.responseText.length > 0) { clearTimeout(timeout); stream.abort(); resolve(); }
        };
        stream.onerror = () => { clearTimeout(timeout); reject(new Error('Scratch Pond SSE failed')); };
        stream.send();
      });
    });
  }
  await configurePondTrust([{ url: origin, pin }]);
  await expoFetch(origin + '/report', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(results) });
  return results;
}

function TestApp() {
  const [output, setOutput] = useState('Running native transport integration tests');
  useEffect(() => { void run().then((value) => setOutput(JSON.stringify(value, null, 2))).catch((error) => setOutput(String(error))); }, []);
  return <ScrollView contentContainerStyle={{ padding: 24 }}><Text selectable>{output}</Text></ScrollView>;
}
registerRootComponent(TestApp);
