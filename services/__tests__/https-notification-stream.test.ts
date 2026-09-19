jest.mock('../pond-trust', () => ({ assertPondTrust: jest.fn().mockResolvedValue(undefined) }));
import { NotificationStream, NotificationDeduplicator } from '../notification-stream';
import { assertPondTrust } from '../pond-trust';
class FakeXHR {
  static instances: FakeXHR[] = [];
  headers: Record<string, string> = {}; responseText = ''; status = 200;
  onprogress = () => {}; onerror = () => {}; onload = () => {}; ontimeout = () => {};
  open = jest.fn(); send = jest.fn(); abort = jest.fn();
  setRequestHeader(name: string, value: string) { this.headers[name] = value; }
  constructor() { FakeXHR.instances.push(this); }
}
beforeEach(() => { FakeXHR.instances = []; jest.clearAllMocks(); global.XMLHttpRequest = FakeXHR as unknown as typeof XMLHttpRequest; });
it('waits for trust and shares deduplication across endpoint changes', async () => {
  const emitted = jest.fn(); const deduplicator = new NotificationDeduplicator();
  const make = (baseUrl: string) => new NotificationStream({ baseUrl, token: 'session', deviceId: 'phone', onNotification: emitted, deduplicator });
  const local = make('https://pond.local:4443'); local.start();
  expect(FakeXHR.instances).toHaveLength(0); await Promise.resolve();
  const a = FakeXHR.instances[0]; expect(a.headers['X-Pond-Transport']).toBe('1');
  a.responseText = 'data: {"id":"once"}\n\n'; a.onprogress(); local.stop();
  const remote = make('https://100.64.0.2:4443'); remote.start(); await Promise.resolve();
  const b = FakeXHR.instances[1]; b.responseText = a.responseText; b.onprogress();
  expect(emitted).toHaveBeenCalledTimes(1); remote.stop();
});
it('never creates XHR when native trust is unavailable', async () => {
  jest.mocked(assertPondTrust).mockRejectedValueOnce(new Error('untrusted'));
  const disconnected = jest.fn();
  const stream = new NotificationStream({ baseUrl: 'https://pond.local:4443', token: 'secret', deviceId: 'phone', onNotification: jest.fn(), onDisconnect: disconnected });
  stream.start(); await Promise.resolve(); expect(FakeXHR.instances).toHaveLength(0); expect(disconnected).toHaveBeenCalledTimes(1); stream.stop();
});
