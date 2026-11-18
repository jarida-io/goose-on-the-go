/**
 * What a tapped notification opens. The tap reads back the data stored in the
 * shade, so each case goes through the same listener a real tap does.
 */

import { Linking } from 'react-native';

import { presentLocally, watchLinkTaps } from '@/services/local-notifications';
import { noteDrained, noteFetched, resetWakeAlerts } from '@/services/wake-alert';

const mockPush = jest.fn();
const mockNavigate = jest.fn();
const mockSchedule = jest.fn().mockResolvedValue('id');
const mockSessionMessages = jest.fn().mockResolvedValue([]);
const mockOpened = jest.fn().mockResolvedValue(undefined);
jest.mock('@/services/api-client', () => {
  class ApiError extends Error {
    readonly status: number;
    constructor(mockStatus: number) {
      super(`HTTP ${mockStatus}`);
      this.status = mockStatus;
    }
  }
  return {
    ApiError,
    api: {
      listSessionMessages: (...args: unknown[]) => mockSessionMessages(...args),
      notificationOpened: (...args: unknown[]) => mockOpened(...args),
    },
  };
});
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ApiError: MockApiError } = require('@/services/api-client');
jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    navigate: (...args: unknown[]) => mockNavigate(...args),
  },
}));

let mockListener: ((response: unknown) => void) | null = null;
jest.mock('@/services/notifications-module', () => ({
  notifications: {
    addNotificationResponseReceivedListener: (fn: (response: unknown) => void) => {
      mockListener = fn;
      return { remove: jest.fn() };
    },
    getLastNotificationResponseAsync: () => Promise.resolve(null),
    clearLastNotificationResponse: jest.fn(),
    setNotificationHandler: jest.fn(),
    scheduleNotificationAsync: (...args: unknown[]) => mockSchedule(...args),
  },
}));

let next = 0;

/** Let the tap's check of the conversation settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Tap a notification carrying `data`, under an identifier no earlier tap used. */
function tap(data: Record<string, unknown>, identifier = `n-${next++}`): void {
  mockListener?.({ notification: { request: { identifier, content: { data } } } });
}

describe('openTapped', () => {
  let stop: () => void;
  beforeEach(() => {
    mockPush.mockClear();
    mockNavigate.mockClear();
    stop = watchLinkTaps();
  });
  afterEach(() => stop());

  it('opens the schedule a schedule notification names', () => {
    tap({ id: 'a', open: 'schedule', schedule_id: 'sched-1', run_id: 'run-9' });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(stack)/schedule', params: { schedule_id: 'sched-1' } });
  });

  it('opens the devices tab and the chat tab', () => {
    tap({ open: 'devices' });
    tap({ open: 'chat', proposal_id: 'p-1' });
    // A tab is gone back to rather than pushed, so the history holds one tab bar.
    expect(mockNavigate.mock.calls).toEqual([['/(tabs)/devices'], ['/(tabs)/chat']]);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('opens the models, extensions and remote access screens', () => {
    tap({ open: 'models', kind: 'model_downloaded' });
    tap({ open: 'extensions', kind: 'startup_problems' });
    tap({ open: 'remote_access', kind: 'remote_access_down' });
    expect(mockPush.mock.calls).toEqual([['/(stack)/models'], ['/(stack)/extensions'], ['/(stack)/remote-access']]);
  });

  it('opens Reminders for an offer from a conversation, and the to-dos for a check-in', () => {
    tap({ id: 'offer-1', action: 'todo_offer', reminder_id: 'rem-1', text: 'Daily Brief', when_said: 'every morning' });
    tap({ id: 'checkin-1', action: 'todo_checkin', todo_id: 'todo-1', text: 'Water the plants' });
    expect(mockPush.mock.calls).toEqual([['/(stack)/reminders'], ['/(stack)/goose-todos']]);
  });

  it('opens My Pond for the notice that the Pond was unlocked, not Devices', () => {
    tap({ open: 'my_pond' });
    expect(mockPush.mock.calls).toEqual([['/(stack)/pond']]);
  });

  it('opens a ready piece of work, a plan, and the questions a notice names', () => {
    tap({ id: 'd', open: 'deliverable', deliverable_id: 'del-1' });
    tap({ id: 'a', open: 'anchor', anchor_id: 'anc-1' });
    tap({ id: 'q', open: 'questions', batch_id: 'b-1', anchor_id: 'anc-1' });
    expect(mockPush.mock.calls).toEqual([
      [{ pathname: '/(stack)/goose-deliverable', params: { id: 'del-1' } }],
      [{ pathname: '/(stack)/goose-anchor', params: { id: 'anc-1' } }],
      [{ pathname: '/(stack)/goose-questions', params: { batch: 'b-1', anchor: 'anc-1' } }],
    ]);
  });

  it('opens the specialists for a Budget offer tapped rather than answered', () => {
    tap({ id: 'o', action: 'agent_offer', agent: 'budget', label: 'Turn on' });
    expect(mockPush.mock.calls).toEqual([['/(stack)/goose-specialists']]);
  });

  it('opens nothing for a screen outside the allow-list, or no hint at all', () => {
    tap({ open: '/(stack)/developer' });
    tap({ open: 'storage' });
    tap({ id: 'b', category: 'info' });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('still opens the ride screen for a ride offer', () => {
    tap({
      action: 'ride_offer',
      provider: 'uber',
      dropoff: { name: 'JKIA', latitude: -1.319167, longitude: 36.9275 },
    });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/ride',
      params: { name: 'JKIA', latitude: '-1.319167', longitude: '36.9275', provider: 'uber' },
    });
  });

  it('still opens a link with the system handler, not a screen', () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    tap({ action: 'open_url', kind: 'directions', url: 'https://maps.apple.com/?daddr=Kisumu', open: 'chat' });
    expect(open).toHaveBeenCalledWith('https://maps.apple.com/?daddr=Kisumu');
    expect(mockPush).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('opens the conversation a finished reply names', async () => {
    tap({ id: 'reply-r1', category: 'reply', open: 'conversation', session_id: 's-1' });
    await settle();
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/conversation', params: { session: 's-1' } });
  });

  it('opens the conversation a long task was started from', async () => {
    tap({ id: 'long-task-t1', category: 'info', open: 'chat', session_id: 'sess-embassies', long_task_id: 't1' });
    await settle();
    expect(mockSessionMessages).toHaveBeenLastCalledWith('sess-embassies', 1);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/conversation', params: { session: 'sess-embassies' } });
  });

  it('opens the chat wall when the Pond has no such conversation for this phone', async () => {
    mockSessionMessages.mockRejectedValueOnce(new MockApiError(404));
    tap({ open: 'chat', session_id: 'sess-deleted', proposal_id: 'p-1' });
    await settle();
    expect(mockPush.mock.calls).toEqual([['/(tabs)/chat']]);
  });

  it('still opens the conversation when the Pond cannot be asked', async () => {
    mockSessionMessages.mockRejectedValueOnce(new TypeError('Network request failed'));
    tap({ open: 'chat', session_id: 'sess-1' });
    await settle();
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/conversation', params: { session: 'sess-1' } });
  });

  it('acts on one tap once, however many times it is delivered', () => {
    tap({ open: 'devices' }, 'same');
    tap({ open: 'devices' }, 'same');
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('opens the page that answers a phone asking to pair', () => {
    tap({ id: 'pairing-request-r1', category: 'alert', action: 'pairing_request', request_id: 'r1', open: 'devices' });
    expect(mockPush.mock.calls).toEqual([['/(stack)/pairing-lock']]);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('telling the Pond a notice was opened', () => {
  let stop: () => void;
  beforeEach(() => {
    mockPush.mockClear();
    mockNavigate.mockClear();
    mockOpened.mockReset().mockResolvedValue(undefined);
    stop = watchLinkTaps();
  });
  afterEach(() => stop());

  it('says so once for a tapped notice, by the Pond\'s own id', () => {
    tap({ id: 'briefing:phone-1', category: 'info', open: 'devices' }, 'opened-once');
    tap({ id: 'briefing:phone-1', category: 'info', open: 'devices' }, 'opened-once');
    expect(mockOpened.mock.calls).toEqual([['briefing:phone-1']]);
  });

  it('says nothing for the phone\'s own reply notice, or a notice with no id', () => {
    tap({ id: 'reply-r1', category: 'reply', open: 'conversation', session_id: 's-1' });
    tap({ open: 'devices' });
    expect(mockOpened).not.toHaveBeenCalled();
  });

  it('still opens the screen when the Pond cannot be told', async () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    mockOpened.mockRejectedValue(new TypeError('Network request failed'));
    tap({ id: 'n-404', category: 'info', open: 'models' });
    await settle();
    expect(mockPush.mock.calls).toEqual([['/(stack)/models']]);
    info.mockRestore();
  });
});

// An iPhone's wake is one fixed line that names a notice and carries none of it.
describe('a tap on the iPhone wake line', () => {
  const wakeLine = (identifier: string) => ({
    notification: {
      request: {
        identifier,
        content: { title: 'Goose', body: 'Something new from your Pond.', data: null },
        trigger: {
          type: 'push',
          payload: { wake: '1', notification_id: 'briefing:phone-1', category: 'info', aps: { alert: { title: 'Goose' } } },
        },
      },
    },
  });
  const briefing = {
    id: 'briefing:phone-1', target: 'phone-1', category: 'info', title: 'Schedule: Daily Briefing', body: 'b', timestamp: '',
    data: { open: 'schedule', schedule_id: 'sched-1' },
  };
  const onWakeTap = jest.fn();
  let stop: () => void;
  beforeEach(() => {
    resetWakeAlerts();
    mockPush.mockClear();
    mockNavigate.mockClear();
    mockOpened.mockReset().mockResolvedValue(undefined);
    onWakeTap.mockClear();
    stop = watchLinkTaps(onWakeTap);
  });
  afterEach(() => stop());

  it('asks for a fetch, opens nothing itself, and says the notice it names was opened', () => {
    mockListener?.(wakeLine('wake-a'));
    expect(onWakeTap).toHaveBeenCalledTimes(1);
    expect(mockOpened.mock.calls).toEqual([['briefing:phone-1']]);
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('opens the one notice the fetch found', () => {
    mockListener?.(wakeLine('wake-b'));
    noteFetched([briefing]);
    noteDrained();
    expect(mockPush.mock.calls).toEqual([[{ pathname: '/(stack)/schedule', params: { schedule_id: 'sched-1' } }]]);
  });

  it('leaves the app where it is when the fetch found several, or none', () => {
    mockListener?.(wakeLine('wake-c'));
    noteFetched([briefing, { ...briefing, id: 'other:phone-1' }]);
    noteDrained();
    mockListener?.(wakeLine('wake-d'));
    noteDrained(Date.now() + 20_000);
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('presentLocally', () => {
  it('stores a checked screen hint for the tap, and nothing else the Pond sent', async () => {
    await presentLocally({
      id: 'n-1',
      target: 'broadcast',
      category: 'alert',
      title: 'Schedule: Daily Brief',
      body: 'Task failed',
      timestamp: '2026-10-19T08:00:00Z',
      data: { open: 'schedule', schedule_id: 'sched-1', run_id: '../x', extra: 'dropped' },
    });
    expect(mockSchedule.mock.calls[0][0].content.data).toEqual({
      id: 'n-1',
      category: 'alert',
      open: 'schedule',
      schedule_id: 'sched-1',
    });
  });
  it('keeps the ids the idea engine’s notices open, and the Budget offer with its Turn on button', async () => {
    mockSchedule.mockClear();
    await presentLocally({
      id: 'n-q',
      target: 'broadcast',
      category: 'action_required',
      title: 'Questions about Diani trip',
      body: '',
      timestamp: '2026-11-17T08:00:00Z',
      data: { open: 'questions', batch_id: 'b-1', anchor_id: 'a/b' },
    });
    await presentLocally({
      id: 'n-b',
      target: 'broadcast',
      category: 'action_required',
      title: 'Keep a record of what you spend?',
      body: 'You have sent three pictures of receipts.',
      timestamp: '2026-11-17T08:00:00Z',
      data: { action: 'agent_offer', agent: 'budget', label: 'Turn on' },
    });
    expect(mockSchedule.mock.calls[0][0].content.data).toEqual({ id: 'n-q', category: 'action_required', open: 'questions', batch_id: 'b-1' });
    expect(mockSchedule.mock.calls[1][0].content).toMatchObject({
      data: { id: 'n-b', category: 'action_required', action: 'agent_offer', agent: 'budget', label: 'Turn on' },
      categoryIdentifier: 'agent_offer',
    });
  });

  it('keeps the conversation a reply notice opens, under the run it reports on', async () => {
    await presentLocally({
      id: 'reply-r1',
      target: 'local',
      category: 'reply',
      title: 'Rain',
      body: 'Not today.',
      timestamp: '2026-10-23T10:00:00Z',
      data: { open: 'conversation', session_id: 's-1' },
    });
    const request = mockSchedule.mock.calls[mockSchedule.mock.calls.length - 1][0];
    expect(request.identifier).toBe('reply-r1');
    expect(request.content.data).toEqual({ id: 'reply-r1', category: 'reply', open: 'conversation', session_id: 's-1' });
  });
  it('shows a schedule answer as plain words, however the model marked it up', async () => {
    mockSchedule.mockClear();
    await presentLocally({
      id: 'n-md',
      target: 'broadcast',
      category: 'update',
      title: 'Schedule: Daily Brief',
      body: '**Weather**\nOvercast, *fifteen* degrees.\n1. **Sunday:** won',
      timestamp: '2026-11-06T08:31:00Z',
    });
    const { title, body } = mockSchedule.mock.calls[0][0].content;
    expect(title).toBe('Schedule: Daily Brief');
    expect(body).toBe('Weather\nOvercast, fifteen degrees.\n1. Sunday: won');
  });

  /** The shade keeps the Pond's own hint, so the tap reads back a value it accepts. */
  it('stores the remote access hint as the Pond sent it, and drops one it does not know', async () => {
    mockSchedule.mockClear();
    const base = { target: 'broadcast', category: 'alert', title: 'Remote access stopped', body: 'b', timestamp: '2026-10-27T08:00:00Z' } as const;
    await presentLocally({ ...base, id: 'n-2', data: { open: 'remote_access' } });
    await presentLocally({ ...base, id: 'n-3', data: { open: 'storage' } });
    expect(mockSchedule.mock.calls[0][0].content.data).toEqual({ id: 'n-2', category: 'alert', open: 'remote_access' });
    expect(mockSchedule.mock.calls[1][0].content.data).toEqual({ id: 'n-3', category: 'alert' });
  });

  it('says whether it reached the shade, so a pull only acknowledges what was shown', async () => {
    const notice = { id: 'n-2', target: 'phone', category: 'info', title: 't', body: 'b', timestamp: '' };
    await expect(presentLocally(notice)).resolves.toBe(true);

    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockSchedule.mockRejectedValueOnce(new Error('no permission'));
    await expect(presentLocally(notice)).resolves.toBe(false);
    warn.mockRestore();
  });
});

// Android shows a heads-up banner only for a HIGH-importance channel, and never raises the
// importance of a channel that already exists, so a change of importance needs a new id.
describe('notification channels', () => {
  // The tap tests above already loaded the module-level mock of notifications-module, and an
  // isolated require reuses a cached mock before it consults a fresh doMock factory.
  beforeEach(() => jest.resetModules());
  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  type Handler = { handleNotification: (n: unknown) => Promise<{ shouldPlaySound: boolean; shouldShowBanner: boolean; shouldShowList: boolean; shouldSetBadge: boolean }> };

  function configureOn(os: 'android' | 'ios') {
    const setNotificationChannelAsync = jest.fn(async (_id: string, _channel: unknown) => null);
    const deleteNotificationChannelAsync = jest.fn(async (_id: string) => undefined);
    const setNotificationHandler = jest.fn((_handler: Handler) => undefined);
    const fake = {
      AndroidImportance: { DEFAULT: 3, HIGH: 4 },
      setNotificationHandler,
      setNotificationChannelAsync,
      deleteNotificationChannelAsync,
      scheduleNotificationAsync: jest.fn(async () => 'id'),
    };
    let configure: () => Promise<void> = async () => undefined;
    let present: (n: unknown) => Promise<void> = async () => undefined;
    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({ Platform: { OS: os }, Linking: { openURL: jest.fn() } }));
      jest.doMock('expo-router', () => ({ router: { push: jest.fn() } }));
      jest.doMock('@/services/notifications-module', () => ({ notifications: fake }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ({ configureLocalNotifications: configure, presentLocally: present } = require('@/services/local-notifications'));
    });
    const handle = async (notification: unknown) => {
      await configure();
      const installed = setNotificationHandler.mock.calls[0][0];
      return installed.handleNotification(notification);
    };
    const handler = (category: unknown) => handle({ request: { content: { data: { category } } } });
    return { configure, present, handler, handle, fake, setNotificationChannelAsync, deleteNotificationChannelAsync };
  }

  function channel(calls: unknown[][], id: string) {
    return calls.find(([channelId]) => channelId === id)?.[1];
  }

  it('pops up alerts, requests and updates, and keeps replies in the shade', async () => {
    const { configure, setNotificationChannelAsync } = configureOn('android');
    await configure();
    const calls = setNotificationChannelAsync.mock.calls;
    expect(channel(calls, 'giap-alerts')).toEqual({
      name: 'Alerts',
      description: expect.any(String),
      importance: 4,
      vibrationPattern: [0, 250, 250, 250],
    });
    expect(channel(calls, 'giap-requests')).toEqual({
      name: 'Suggestions and questions',
      description: expect.any(String),
      importance: 4,
    });
    expect(channel(calls, 'giap-info-v2')).toEqual({ name: 'Updates', description: expect.any(String), importance: 4 });
    expect(channel(calls, 'giap-replies-v2')).toEqual({ name: 'Replies', description: expect.any(String), importance: 4 });
    expect(channel(calls, 'giap-info')).toBeUndefined();
  });

  it('deletes the old DEFAULT-importance Updates and Replies channels', async () => {
    const { configure, deleteNotificationChannelAsync } = configureOn('android');
    await configure();
    expect(deleteNotificationChannelAsync).toHaveBeenCalledWith('giap-info');
    // DEFAULT before 2026-11-09; a channel keeps its importance, so the replies moved to a new id.
    expect(deleteNotificationChannelAsync).toHaveBeenCalledWith('giap-replies');
  });

  it('posts each category on its own channel, and an unknown one as an update', async () => {
    const { present, fake } = configureOn('android');
    const base = { target: 'broadcast', title: 't', body: 'b', timestamp: '2026-11-04T08:00:00Z' };
    for (const [id, category] of [['1', 'alert'], ['2', 'action_required'], ['3', 'info'], ['4', 'reply'], ['5', 'news'], ['6', 'toString']]) {
      await present({ ...base, id, category });
    }
    const channels = fake.scheduleNotificationAsync.mock.calls.map((c: unknown[]) => (c[0] as { trigger: { channelId: string } }).trigger.channelId);
    expect(channels).toEqual(['giap-alerts', 'giap-requests', 'giap-info-v2', 'giap-replies-v2', 'giap-info-v2', 'giap-info-v2']);
  });

  // With the app open, a notice is popped up only if the handler lets it sound: Android never
  // pops up a notification expo-notifications posted silent, whatever its channel.
  it('lets every notice sound while the app is open, a finished reply too', async () => {
    const { handler } = configureOn('android');
    for (const category of ['alert', 'action_required', 'info', 'reply', 'news', undefined]) {
      expect(await handler(category)).toMatchObject({ shouldPlaySound: true, shouldShowBanner: true });
    }
  });

  // The stream brings the notice itself while the app is open, so the line would be a second one.
  it('draws nothing for an iPhone wake line that arrives while the app is open', async () => {
    const { handle } = configureOn('ios');
    const line = {
      request: {
        identifier: 'briefing:phone-1',
        content: { title: 'Goose', data: null },
        trigger: { type: 'push', payload: { wake: '1', notification_id: 'briefing:phone-1', category: 'alert', aps: { alert: {} } } },
      },
    };
    expect(await handle(line)).toEqual({ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false });
  });

  it('creates no channels on iOS', async () => {
    const { configure, setNotificationChannelAsync, deleteNotificationChannelAsync } = configureOn('ios');
    await configure();
    expect(setNotificationChannelAsync).not.toHaveBeenCalled();
    expect(deleteNotificationChannelAsync).not.toHaveBeenCalled();
  });
});
