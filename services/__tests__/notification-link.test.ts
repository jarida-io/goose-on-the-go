/**
 * The open-link check. A notification can only open Uber or a maps app: any
 * other scheme or host, or a Google URL outside its maps path, is refused.
 */

import {
  allowedUrl,
  linkFromData,
  openRouteFromData,
  rideOfferFromData,
  screenPath,
} from '@/services/notification-link';

const UBER =
  'https://m.uber.com/ul/?action=setPickup&pickup=my_location' +
  '&dropoff[latitude]=-1.319167&dropoff[longitude]=36.927500';

describe('linkFromData', () => {
  it('reads a ride link', () => {
    expect(linkFromData({ action: 'open_url', kind: 'ride', url: UBER, label: 'Open Uber' })).toEqual({
      kind: 'ride',
      url: UBER,
      label: 'Open Uber',
    });
  });

  it('reads a directions link and fills in a missing label', () => {
    const url = 'https://maps.apple.com/?daddr=Kisumu&dirflg=d';
    expect(linkFromData({ action: 'open_url', kind: 'directions', url })).toEqual({
      kind: 'directions',
      url,
      label: 'Open directions',
    });
  });

  it('ignores data with no open_url action', () => {
    expect(linkFromData(undefined)).toBeNull();
    expect(linkFromData({ url: UBER })).toBeNull();
    expect(linkFromData({ action: 'open_app', url: UBER })).toBeNull();
  });

  it('refuses a link on a host it does not know', () => {
    expect(linkFromData({ action: 'open_url', kind: 'ride', url: 'https://evil.example/ul' })).toBeNull();
  });
});

describe('allowedUrl', () => {
  it('accepts the three hosts over https', () => {
    expect(allowedUrl(UBER)).toBe(UBER);
    expect(allowedUrl('https://maps.apple.com/?daddr=Kisumu')).not.toBeNull();
    expect(
      allowedUrl('https://www.google.com/maps/dir/?api=1&destination=Kisumu&travelmode=driving'),
    ).not.toBeNull();
  });

  it('refuses plain http, other schemes and look-alike hosts', () => {
    expect(allowedUrl('http://m.uber.com/ul/')).toBeNull();
    expect(allowedUrl('uber://?action=setPickup')).toBeNull();
    expect(allowedUrl('javascript:alert(1)')).toBeNull();
    expect(allowedUrl('https://m.uber.com.evil.example/ul/')).toBeNull();
    expect(allowedUrl('not a url')).toBeNull();
    expect(allowedUrl(42)).toBeNull();
  });

  it('refuses a google.com link outside maps', () => {
    expect(allowedUrl('https://www.google.com/search?q=x')).toBeNull();
  });

  // Checked as m.uber.com, but iOS opens the raw string on evil.example.
  it('returns the URL it checked, not the string it was given', () => {
    expect(allowedUrl('https://m.uber.com\\@evil.example/')).toBe('https://m.uber.com/@evil.example/');
  });
});

describe('rideOfferFromData', () => {
  const offer = {
    action: 'ride_offer',
    provider: 'uber',
    dropoff: { name: 'JKIA', latitude: -1.319167, longitude: 36.9275 },
    label: 'Get a fare',
  };

  it('reads a ride offer', () => {
    expect(rideOfferFromData(offer)).toEqual({
      provider: 'uber',
      dropoff: { name: 'JKIA', latitude: -1.319167, longitude: 36.9275 },
    });
  });

  it('ignores other actions and malformed drop-offs', () => {
    expect(rideOfferFromData({ ...offer, action: 'open_url' })).toBeNull();
    expect(rideOfferFromData({ ...offer, dropoff: { name: '', latitude: 1, longitude: 1 } })).toBeNull();
    expect(rideOfferFromData({ ...offer, dropoff: { name: 'X', latitude: 91, longitude: 0 } })).toBeNull();
    expect(rideOfferFromData({ ...offer, dropoff: { name: 'X', latitude: 0, longitude: 0 } })).toBeNull();
    expect(rideOfferFromData({ ...offer, dropoff: { name: 'X', latitude: '1', longitude: 2 } })).toBeNull();
    expect(rideOfferFromData(undefined)).toBeNull();
  });
});

describe('openRouteFromData', () => {
  const SCHEDULE = 'timer-6f1c2a9e-3b4d-4e5f-8a9b-0c1d2e3f4a5b';
  const RUN = '0c1d2e3f-4a5b-4e5f-8a9b-6f1c2a9e3b4d';

  it('reads a schedule route with its ids', () => {
    expect(openRouteFromData({ open: 'schedule', schedule_id: SCHEDULE, run_id: RUN })).toEqual({
      open: 'schedule',
      scheduleId: SCHEDULE,
      runId: RUN,
    });
  });

  it('reads the devices and chat routes', () => {
    expect(openRouteFromData({ open: 'devices' })).toEqual({ open: 'devices' });
    expect(openRouteFromData({ open: 'reminders', reminder_id: 'r-1' })).toEqual({ open: 'reminders' });
    expect(openRouteFromData({ open: 'chat', proposal_id: 'p-1', rationale: 'why' })).toEqual({ open: 'chat' });
  });

  it('reads the models, extensions and remote access routes the Pond names', () => {
    expect(openRouteFromData({ open: 'models', kind: 'disk_low' })).toEqual({ open: 'models' });
    expect(openRouteFromData({ open: 'extensions' })).toEqual({ open: 'extensions' });
    expect(openRouteFromData({ open: 'remote_access' })).toEqual({ open: 'remote_access' });
    expect(openRouteFromData({ open: 'my_pond' })).toEqual({ open: 'my_pond' });
    expect(openRouteFromData({ open: 'ideas' })).toEqual({ open: 'ideas' });
    expect(openRouteFromData({ open: 'ideas', idea_id: 'idea-1' })).toEqual({ open: 'ideas', ideaId: 'idea-1' });
    expect(openRouteFromData({ open: 'goose_activity' })).toEqual({ open: 'goose_activity' });
  });

  it('keeps the schedule screen but drops an id that is not a Pond id', () => {
    expect(openRouteFromData({ open: 'schedule', schedule_id: '../settings', run_id: 7 })).toEqual({
      open: 'schedule',
    });
    expect(openRouteFromData({ open: 'schedule', schedule_id: 'x'.repeat(129) })).toEqual({ open: 'schedule' });
  });

  it('opens the conversation a Pond chat hint names, and the wall without a usable one', () => {
    expect(openRouteFromData({ open: 'chat', session_id: RUN, long_task_id: 't-1' })).toEqual({
      open: 'conversation',
      sessionId: RUN,
    });
    expect(openRouteFromData({ open: 'chat', session_id: '../settings' })).toEqual({ open: 'chat' });
    expect(openRouteFromData({ open: 'chat', session_id: '' })).toEqual({ open: 'chat' });
    expect(openRouteFromData({ open: 'chat', session_id: 42 })).toEqual({ open: 'chat' });
  });

  it('reads the conversation a finished reply names, and lands on the wall without one', () => {
    expect(openRouteFromData({ open: 'conversation', session_id: RUN })).toEqual({ open: 'conversation', sessionId: RUN });
    expect(openRouteFromData({ open: 'conversation', session_id: '../settings' })).toEqual({ open: 'chat' });
    expect(openRouteFromData({ open: 'conversation' })).toEqual({ open: 'chat' });
  });

  it('ignores a screen outside the allow-list, and data with no open', () => {
    expect(openRouteFromData({ open: 'settings-advanced' })).toBeNull();
    expect(openRouteFromData({ open: '/(stack)/developer' })).toBeNull();
    // The app's route name is not the Pond's hint; only `remote_access` is.
    expect(openRouteFromData({ open: 'remote-access' })).toBeNull();
    expect(openRouteFromData({ open: 'Models' })).toBeNull();
    expect(openRouteFromData({ open: ['chat'] })).toBeNull();
    expect(openRouteFromData({ action: 'open_url' })).toBeNull();
    expect(openRouteFromData(null)).toBeNull();
  });
});

describe('screenPath', () => {
  it('maps each route to its screen', () => {
    expect(screenPath({ open: 'devices' })).toBe('/(stack)/devices');
    expect(screenPath({ open: 'chat' })).toBe('/(tabs)/chat');
    expect(screenPath({ open: 'models' })).toBe('/(stack)/models');
    expect(screenPath({ open: 'reminders' })).toBe('/(stack)/reminders');
    expect(screenPath({ open: 'extensions' })).toBe('/(stack)/extensions');
    expect(screenPath({ open: 'remote_access' })).toBe('/(stack)/remote-access');
    expect(screenPath({ open: 'my_pond' })).toBe('/(stack)/pond');
    expect(screenPath({ open: 'conversation', sessionId: 's-1' })).toEqual({
      pathname: '/conversation',
      params: { session: 's-1' },
    });
    expect(screenPath({ open: 'ideas' })).toBe('/(stack)/goose-ideas');
    expect(screenPath({ open: 'goose_activity' })).toBe('/(stack)/goose-activity');
  });

  it('opens the schedules list on the schedule the notification names', () => {
    expect(screenPath({ open: 'schedule', scheduleId: 'sched-1', runId: 'run-9' })).toEqual({
      pathname: '/(stack)/schedule',
      params: { schedule_id: 'sched-1' },
    });
  });

  /** A malformed id was dropped by openRouteFromData; the list is still the place to land. */
  it('opens the list alone when there is no schedule id', () => {
    expect(screenPath({ open: 'schedule' })).toBe('/(stack)/schedule');
  });
});

describe('a watch notice', () => {
  it('opens the watch it names, or the list for a digest', () => {
    const { openRouteFromData, screenPath } = jest.requireActual('@/services/notification-link');
    expect(openRouteFromData({ open: 'watch', watch_id: 'w-1' })).toEqual({ open: 'watch', watchId: 'w-1' });
    expect(screenPath({ open: 'watch', watchId: 'w-1' })).toEqual({ pathname: '/(stack)/web-watch', params: { id: 'w-1' } });
    expect(openRouteFromData({ open: 'watch' })).toEqual({ open: 'watch' });
    expect(screenPath({ open: 'watch' })).toBe('/(stack)/web-watches');
    expect(openRouteFromData({ open: 'watch', watch_id: '../etc' })).toEqual({ open: 'watch' });
  });
});

describe('a news notice', () => {
  it('opens the news list for the digest the Pond names, and still opens a story by its id', () => {
    const digest = openRouteFromData({ open: 'news', digest_id: 'd1' });
    expect(digest).toEqual({ open: 'news', digestId: 'd1' });
    expect(screenPath(digest!)).toBe('/(stack)/goose-news');
    const story = openRouteFromData({ open: 'news', story_id: 's1', digest_id: 'd1' });
    expect(screenPath(story!)).toEqual({ pathname: '/(stack)/goose-story', params: { id: 's1' } });
    expect(openRouteFromData({ open: 'news', digest_id: '../x' })).toEqual({ open: 'news' });
  });
});

describe('a phone asking to pair', () => {
  it('opens the page that answers it, not the devices list', () => {
    const route = openRouteFromData({ action: 'pairing_request', request_id: 'req-1', open: 'devices' });
    expect(route).toEqual({ open: 'pairing', requestId: 'req-1' });
    expect(screenPath(route!)).toBe('/(stack)/pairing-lock');
  });

  it('keeps the page and drops a request id that is not a Pond id', () => {
    expect(openRouteFromData({ action: 'pairing_request', request_id: 'a/b', open: 'devices' })).toEqual({ open: 'pairing' });
    expect(openRouteFromData({ open: 'devices' })).toEqual({ open: 'devices' });
  });
});

describe('an idea card notice', () => {
  it('opens the cards under either spelling, and ignores any id it carries', () => {
    expect(openRouteFromData({ open: 'idea_cards' })).toEqual({ open: 'idea_cards' });
    expect(openRouteFromData({ open: 'cards', card_id: '../x' })).toEqual({ open: 'idea_cards' });
    expect(screenPath({ open: 'idea_cards' })).toBe('/(stack)/goose-cards');
  });
});
