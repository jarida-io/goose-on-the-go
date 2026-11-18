/**
 * The link a Pond notification asks the phone to open: a ride in Uber, or
 * directions in a maps app.
 *
 * The Pond puts it in `Notification.data` as
 * `{ action: "open_url", kind: "ride" | "directions", url, label }`. Only
 * https links on the hosts below are accepted, so a notification can open the
 * ride or maps app and nothing else. The check runs twice: when the
 * notification arrives, and again when it is tapped, because the tap reads
 * back data that has been stored in the phone's notification shade.
 */

/** Hosts whose links open Uber, Google Maps or Apple Maps. */
const ALLOWED_HOSTS = new Set(['m.uber.com', 'www.google.com', 'maps.apple.com']);

export type LinkKind = 'ride' | 'directions';

export interface NotificationLink {
  kind: LinkKind;
  url: string;
  /** Shown as the notification's call to action, e.g. "Open Uber". */
  label: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The URL if it is https on an allowed host, else null. */
export function allowedUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) return null;
  // Google's host serves far more than maps; only its directions path is a maps link.
  if (parsed.hostname === 'www.google.com' && !parsed.pathname.startsWith('/maps')) return null;
  // What was checked is the parse, so the parse is what gets stored and opened. iOS reads
  // a backslash differently: `https://m.uber.com\@evil.example/` passes here as m.uber.com,
  // and opened as written it goes to evil.example.
  return parsed.href;
}

/** The link in a notification's `data`, or null when it carries none or one we refuse. */
export function linkFromData(data: unknown): NotificationLink | null {
  if (!isRecord(data) || data.action !== 'open_url') return null;
  const url = allowedUrl(data.url);
  if (!url) return null;
  const kind: LinkKind = data.kind === 'ride' ? 'ride' : 'directions';
  const label =
    typeof data.label === 'string' && data.label.trim()
      ? data.label.trim()
      : kind === 'ride'
        ? 'Open ride'
        : 'Open directions';
  return { kind, url, label };
}

/**
 * A ride the Pond offers after a member asked for one: where to, and with which company.
 * Sent as `{ action: "ride_offer", provider, dropoff: { name, latitude, longitude }, label }`.
 * Nothing is booked by it; the ride screen asks for a fare from the phone's own location.
 */
export interface RideOffer {
  provider: string;
  dropoff: { name: string; latitude: number; longitude: number };
}

function onEarth(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)
  );
}

/** The ride offer in a notification's `data`, or null when it carries none or a malformed one. */
export function rideOfferFromData(data: unknown): RideOffer | null {
  if (!isRecord(data) || data.action !== 'ride_offer' || !isRecord(data.dropoff)) return null;
  const { name, latitude, longitude } = data.dropoff;
  if (typeof name !== 'string' || !name.trim() || !onEarth(latitude, longitude)) return null;
  const provider = typeof data.provider === 'string' && data.provider ? data.provider : 'uber';
  return { provider, dropoff: { name: name.trim(), latitude, longitude: longitude as number } };
}

/**
 * The app screen a Pond notification asks a tap to open. The Pond puts it in
 * `Notification.data` as `{ open: "schedule", schedule_id, run_id }`, as
 * `{ open: "chat", session_id }` (the conversation a long task was started from,
 * or a reminder was heard in; `session_id` is left out when there is none), or as
 * `{ open: "devices" }`, `"models"`, `"extensions"`, `"remote_access"` or
 * `"my_pond"` (the
 * Pond's `OpenScreen` in pond-core's `mcp/ports/notification.rs`; the contract
 * is "Route hints" in the Pond's `docs/architecture/notifications.md`). The
 * phone's own notice that a reply finished names
 * `{ open: "conversation", session_id }`, and a Pond `chat` hint with a
 * conversation becomes the same route. A phone asking to pair arrives as
 * `{ action: "pairing_request", request_id, open: "devices" }` and opens the
 * page that answers it, not the devices list.
 *
 * Only these screens are accepted, and only ids of the shape the Pond
 * mints, so a notification can open one of them and nothing else. An older Pond
 * sends no `open`, and the tap opens the app where it was, as before; a value
 * this app does not know does the same.
 */
export type OpenRoute =
  | { open: 'schedule'; scheduleId?: string; runId?: string }
  | { open: 'devices' }
  | { open: 'chat' }
  | { open: 'models' }
  | { open: 'extensions' }
  | { open: 'remote_access' }
  | { open: 'my_pond' }
  | { open: 'conversation'; sessionId: string }
  | { open: 'watch'; watchId?: string }
  | { open: 'todos'; todoId?: string }
  | { open: 'reminders' }
  | { open: 'news'; storyId?: string; digestId?: string }
  | { open: 'cart'; cartId?: string }
  | { open: 'ideas'; ideaId?: string }
  | { open: 'goose_activity' }
  | { open: 'pairing'; requestId?: string }
  | { open: 'anchor'; anchorId?: string }
  | { open: 'deliverable'; deliverableId?: string }
  | { open: 'questions'; batchId?: string; anchorId?: string }
  | { open: 'idea_cards' }
  /** Never named by the Pond: where a tapped specialist offer opens. */
  | { open: 'specialists' };

/** A Pond id: a UUID, optionally prefixed (`timer-...`). Nothing that could be a path. */
const POND_ID = /^[A-Za-z0-9_-]{1,128}$/;

function pondId(raw: unknown): string | undefined {
  return typeof raw === 'string' && POND_ID.test(raw) ? raw : undefined;
}

/**
 * The screen in a notification's `data`, or null when it names none or one we
 * do not open. A malformed schedule or run id is dropped, not the screen: the
 * schedules list is still the right place to land.
 */
export function openRouteFromData(data: unknown): OpenRoute | null {
  if (!isRecord(data)) return null;
  if (data.action === 'pairing_request') {
    const requestId = pondId(data.request_id);
    return requestId ? { open: 'pairing', requestId } : { open: 'pairing' };
  }
  switch (data.open) {
    case 'schedule': {
      const route: OpenRoute = { open: 'schedule' };
      const scheduleId = pondId(data.schedule_id);
      const runId = pondId(data.run_id);
      if (scheduleId) route.scheduleId = scheduleId;
      if (runId) route.runId = runId;
      return route;
    }
    case 'devices':
      return { open: 'devices' };
    case 'chat': {
      // A Pond older than the conversation hint sends none, and a malformed id is dropped: the
      // wall is still the right place to land.
      const sessionId = pondId(data.session_id);
      return sessionId ? { open: 'conversation', sessionId } : { open: 'chat' };
    }
    case 'models':
      return { open: 'models' };
    case 'extensions':
      return { open: 'extensions' };
    case 'remote_access':
      return { open: 'remote_access' };
    case 'my_pond':
      return { open: 'my_pond' };
    case 'watch': {
      // A digest across several watches names none: the list is still the right place to land.
      const watchId = pondId(data.watch_id);
      return watchId ? { open: 'watch', watchId } : { open: 'watch' };
    }
    case 'conversation': {
      // Without a conversation it can open, the wall is still where it was about.
      const sessionId = pondId(data.session_id);
      return sessionId ? { open: 'conversation', sessionId } : { open: 'chat' };
    }
    // My Goose's hub: a reminder or a check-in, a story or the digest, a price that moved. A
    // malformed id drops the id, not the screen.
    case 'reminders':
      return { open: 'reminders' };
    case 'todos': {
      const todoId = pondId(data.todo_id);
      return todoId ? { open: 'todos', todoId } : { open: 'todos' };
    }
    case 'news': {
      // The Pond names the digest it wrote; a story id is an older hint, kept.
      const storyId = pondId(data.story_id);
      const digestId = pondId(data.digest_id);
      if (storyId) return { open: 'news', storyId };
      return digestId ? { open: 'news', digestId } : { open: 'news' };
    }
    case 'cart': {
      const cartId = pondId(data.cart_id);
      return cartId ? { open: 'cart', cartId } : { open: 'cart' };
    }
    case 'ideas': {
      const ideaId = pondId(data.idea_id);
      return ideaId ? { open: 'ideas', ideaId } : { open: 'ideas' };
    }
    // What Goose did by itself: the list, where the newest entry is the one the notice is about.
    case 'goose_activity':
      return { open: 'goose_activity' };
    // The idea engine: a plan, a piece of work made for one, or Goose's questions. Without a valid
    // id the plans, or every open question, are still the right place to land.
    case 'anchor': {
      const anchorId = pondId(data.anchor_id);
      return anchorId ? { open: 'anchor', anchorId } : { open: 'anchor' };
    }
    case 'deliverable': {
      const deliverableId = pondId(data.deliverable_id);
      return deliverableId ? { open: 'deliverable', deliverableId } : { open: 'deliverable' };
    }
    case 'questions': {
      const route: OpenRoute = { open: 'questions' };
      const batchId = pondId(data.batch_id);
      const anchorId = pondId(data.anchor_id);
      if (batchId) route.batchId = batchId;
      if (anchorId) route.anchorId = anchorId;
      return route;
    }
    // A pushed idea card: the set it belongs to, where it can be done, saved or waved off. `cards`
    // is an earlier spelling of the hint, kept since no other link uses it.
    case 'idea_cards':
    case 'cards':
      return { open: 'idea_cards' };
    default:
      return null;
  }
}

/**
 * Goose offering a specialist, answered from the notification (`agent_offer`, with Turn on). Only
 * the specialists the Pond ships are accepted. Null for anything else.
 */
export interface AgentOffer {
  action: 'agent_offer';
  agent: 'budget' | 'trip' | 'work' | 'hunt';
  label: string;
}

const OFFERED_AGENTS: readonly AgentOffer['agent'][] = ['budget', 'trip', 'work', 'hunt'];

export function agentOfferFromData(data: unknown): AgentOffer | null {
  if (!isRecord(data) || data.action !== 'agent_offer') return null;
  const agent = OFFERED_AGENTS.find((a) => a === data.agent);
  if (!agent) return null;
  const label = typeof data.label === 'string' ? data.label.trim().slice(0, 30) : '';
  return { action: 'agent_offer', agent, label };
}

/**
 * Something the member can answer from the notification itself: Goose asking whether a to-do is
 * done (`todo_checkin`, with Done and Not yet), or a dated mention from a chat offered as a to-do
 * (`todo_offer`, with Add and No). Null for anything else, or an id of the wrong shape.
 */
export type TodoPrompt =
  | { action: 'todo_checkin'; todoId: string; text: string }
  | { action: 'todo_offer'; reminderId: string; text: string; whenSaid: string };

export function todoPromptFromData(data: unknown): TodoPrompt | null {
  if (!isRecord(data)) return null;
  const text = typeof data.text === 'string' ? data.text.trim() : '';
  if (data.action === 'todo_checkin') {
    const todoId = pondId(data.todo_id);
    return todoId ? { action: 'todo_checkin', todoId, text } : null;
  }
  if (data.action === 'todo_offer') {
    const reminderId = pondId(data.reminder_id);
    const whenSaid = typeof data.when_said === 'string' ? data.when_said.trim() : '';
    return reminderId ? { action: 'todo_offer', reminderId, text, whenSaid } : null;
  }
  return null;
}

/** Where a route opens: an expo-router path, with the schedule's id when it names one. */
type ScreenHref =
  | '/(stack)/schedule'
  | { pathname: '/(stack)/schedule'; params: { schedule_id: string } }
  | '/(stack)/devices'
  | '/(tabs)/chat'
  | '/(stack)/models'
  | '/(stack)/extensions'
  | '/(stack)/remote-access'
  | '/(stack)/pond'
  | '/(stack)/goose-activity'
  | { pathname: '/conversation'; params: { session: string } }
  | '/(stack)/web-watches'
  | { pathname: '/(stack)/web-watch'; params: { id: string } }
  | '/(stack)/goose-todos'
  | '/(stack)/reminders'
  | '/(stack)/goose-news'
  | { pathname: '/(stack)/goose-story'; params: { id: string } }
  | '/(stack)/goose-cart'
  | { pathname: '/(stack)/goose-cart-item'; params: { id: string } }
  | '/(stack)/goose-ideas'
  | '/(stack)/pairing-lock'
  | '/(stack)/goose-plans'
  | { pathname: '/(stack)/goose-anchor'; params: { id: string } }
  | { pathname: '/(stack)/goose-deliverable'; params: { id: string } }
  | { pathname: '/(stack)/goose-questions'; params: { batch?: string; anchor?: string } }
  | '/(stack)/goose-specialists'
  | '/(stack)/goose-cards';

/**
 * The expo-router location a route opens. A schedule notification names the
 * schedule that ran, so the list is opened with its `schedule_id` and can go on
 * to that schedule. The id is already one `openRouteFromData` accepted; without
 * one the list opens as it is. A list that does not read the param ignores it.
 */
export function screenPath(route: OpenRoute): ScreenHref {
  switch (route.open) {
    case 'schedule':
      return route.scheduleId
        ? { pathname: '/(stack)/schedule', params: { schedule_id: route.scheduleId } }
        : '/(stack)/schedule';
    case 'devices':
      return '/(stack)/devices';
    case 'chat':
      return '/(tabs)/chat';
    case 'models':
      return '/(stack)/models';
    case 'extensions':
      return '/(stack)/extensions';
    case 'remote_access':
      return '/(stack)/remote-access';
    case 'my_pond':
      return '/(stack)/pond';
    case 'conversation':
      return { pathname: '/conversation', params: { session: route.sessionId } };
    case 'watch':
      return route.watchId ? { pathname: '/(stack)/web-watch', params: { id: route.watchId } } : '/(stack)/web-watches';
    case 'todos':
      return '/(stack)/goose-todos';
    case 'reminders':
      return '/(stack)/reminders';
    case 'news':
      return route.storyId ? { pathname: '/(stack)/goose-story', params: { id: route.storyId } } : '/(stack)/goose-news';
    case 'cart':
      return route.cartId ? { pathname: '/(stack)/goose-cart-item', params: { id: route.cartId } } : '/(stack)/goose-cart';
    case 'ideas':
      return '/(stack)/goose-ideas';
    case 'goose_activity':
      return '/(stack)/goose-activity';
    case 'pairing':
      return '/(stack)/pairing-lock';
    case 'anchor':
      return route.anchorId ? { pathname: '/(stack)/goose-anchor', params: { id: route.anchorId } } : '/(stack)/goose-plans';
    case 'deliverable':
      return route.deliverableId ? { pathname: '/(stack)/goose-deliverable', params: { id: route.deliverableId } } : '/(stack)/goose-plans';
    case 'questions':
      return {
        pathname: '/(stack)/goose-questions',
        params: { ...(route.batchId ? { batch: route.batchId } : {}), ...(route.anchorId ? { anchor: route.anchorId } : {}) },
      };
    case 'specialists':
      return '/(stack)/goose-specialists';
    case 'idea_cards':
      return '/(stack)/goose-cards';
  }
}
