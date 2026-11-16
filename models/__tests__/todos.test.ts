/**
 * To-dos and their hooks, read defensively: an unknown state stays open, a hook of a kind the phone
 * does not know keeps its spec so an edit sends it back unchanged, and a hook is said in plain words.
 */

import {
  draftOf,
  hookOnSource,
  hookPhrase,
  hookWrite,
  inOrder,
  isAsking,
  pickerSeedOf,
  placesWatched,
  readHookSources,
  readTodo,
  replaceHook,
  readTodoOffers,
  readTodos,
  todoWrite,
  type Hook,
} from '@/models/todos';

const todo = {
  id: 't-1',
  kind: 'todo',
  text: 'Send the slides',
  notes: null,
  state: 'open',
  due_at: '2026-11-12T14:00:00Z',
  hooks: [
    { id: 'h-1', kind: 'place', label: 'When you leave the office', spec: { place_id: 'p-office', transition: 'leave' }, next_fire_at: null, last_fired_at: null },
    { id: 'h-2', kind: 'time', label: '', spec: { at: '2026-11-10T15:00:00Z' }, next_fire_at: '2026-11-10T15:00:00Z', last_fired_at: null },
  ],
  ask: true,
  source: 'chat',
  last_asked_at: '2026-11-09T08:00:00Z',
  asked: 1,
  snoozed_until: null,
  created_at: '2026-11-07T08:00:00Z',
  done_at: null,
};

const sources = readHookSources({
  places: [
    { id: 'p-home', label: 'Home', lat: -1.29, lng: 36.78, radius_m: 150 },
    { id: 'p-office', label: 'the office', lat: -1.26, lng: 36.8, radius_m: 20 },
    { id: 'bad', label: 'Nowhere', lat: 200, lng: 0 },
  ],
  sources: [
    { id: 'presence-e', kind: 'presence', label: 'Emmanuel', events: [{ id: 'arrive', label: 'gets home' }] },
    { id: 'c-gmail', kind: 'connector', label: 'Gmail', events: [{ id: 'from', label: 'gets an email from someone you name' }] },
    { id: 'z', kind: 'satellite', label: 'Orbit', events: [{ id: 'x', label: 'y' }] },
    { id: 'quiet', kind: 'device', label: 'TV', events: [] },
  ],
});

describe('reading a to-do', () => {
  it('keeps its hooks with their specs', () => {
    const read = readTodo(todo);
    expect(read?.hooks.map((h) => h.spec)).toEqual([
      { kind: 'place', placeId: 'p-office', transition: 'leave' },
      { kind: 'time', at: '2026-11-10T15:00:00Z' },
    ]);
    expect(read).toMatchObject({ kind: 'todo', ask: true, asked: 1, source: 'chat' });
  });

  it('keeps an unknown state open, an unknown kind a to-do, and an unknown source as the member’s', () => {
    expect(readTodo({ ...todo, state: 'archived', kind: 'chore', source: 'satellite' })).toMatchObject({ state: 'open', kind: 'todo', source: 'you' });
  });

  it('keeps a hook of an unknown kind and sends it back as it came', () => {
    const odd = readTodo({ ...todo, hooks: [{ id: 'h-9', kind: 'weather', label: 'When it rains', spec: { when: 'rain' } }] });
    expect(odd?.hooks[0].spec).toEqual({ kind: 'other', rawKind: 'weather', raw: { when: 'rain' } });
    expect(hookWrite(odd!.hooks[0])).toEqual({ kind: 'weather', spec: { when: 'rain' } });
  });

  it('drops a hook whose spec is unusable and a to-do with no words', () => {
    expect(readTodo({ ...todo, hooks: [{ kind: 'time', spec: { at: 'soon' } }, { kind: 'place', spec: {} }] })?.hooks).toEqual([]);
    expect(readTodos({ todos: [todo, { id: 'x', text: '' }] })).toHaveLength(1);
  });

  it('writes a draft back as the contract takes it', () => {
    const draft = draftOf(readTodo(todo));
    expect(todoWrite({ ...draft, notes: '  ' })).toEqual({
      kind: 'todo',
      text: 'Send the slides',
      notes: null,
      due_at: '2026-11-12T14:00:00Z',
      ask: true,
      hooks: [
        { kind: 'place', spec: { place_id: 'p-office', transition: 'leave' } },
        { kind: 'time', spec: { at: '2026-11-10T15:00:00Z' } },
      ],
    });
  });
});

describe('what Goose is asking', () => {
  const now = new Date('2026-11-09T09:00:00Z');
  it('is an open, asked to-do that is not snoozed', () => {
    const t = readTodo(todo)!;
    expect(isAsking(t, now)).toBe(true);
    expect(isAsking({ ...t, snoozedUntil: '2026-11-09T10:00:00Z' }, now)).toBe(false);
    expect(isAsking({ ...t, snoozedUntil: '2026-11-09T08:30:00Z' }, now)).toBe(true);
    expect(isAsking({ ...t, asked: 0 }, now)).toBe(false);
    expect(isAsking({ ...t, state: 'done' }, now)).toBe(false);
  });

  it('orders to-dos by when they next come up', () => {
    const a = readTodo({ ...todo, id: 'a', due_at: null, hooks: [] })!;
    const b = readTodo({ ...todo, id: 'b', due_at: '2026-11-20T00:00:00Z', hooks: [] })!;
    const c = readTodo(todo)!;
    expect(inOrder([a, b, c]).map((t) => t.id)).toEqual(['t-1', 'b', 'a']);
  });

  it('knows which places the open to-dos wait on', () => {
    expect([...placesWatched([readTodo(todo)!, readTodo({ ...todo, id: 'x', state: 'done', hooks: [{ kind: 'place', spec: { place_id: 'p-home', transition: 'arrive' } }] })!])]).toEqual(['p-office']);
  });
});

describe('hook sources and phrases', () => {
  it('keeps places on earth with a sensible radius, and sources the phone can write back', () => {
    expect(sources.places.map((p) => [p.id, p.radiusM])).toEqual([
      ['p-home', 150],
      ['p-office', 100],
    ]);
    expect(sources.sources.map((s) => s.id)).toEqual(['presence-e', 'c-gmail']);
  });

  it('says home as a household would', () => {
    const arrive = hookPhrase({ id: '', label: '', spec: { kind: 'place', placeId: 'p-home', transition: 'arrive' }, nextFireAt: null, lastFiredAt: null }, sources);
    expect(arrive).toEqual({ key: 'goose.hook.getHome', params: {} });
    const leave = hookPhrase({ id: '', label: '', spec: { kind: 'place', placeId: 'p-office', transition: 'leave' }, nextFireAt: null, lastFiredAt: null }, sources);
    expect(leave).toEqual({ key: 'goose.hook.leave', params: { place: 'the office' } });
  });

  it('makes a connector’s event a connector hook and anything else an event hook', () => {
    expect(hookOnSource(sources.sources[1], 'from').spec).toEqual({ kind: 'connector', connectorId: 'c-gmail', event: 'from', filter: null });
    expect(hookOnSource(sources.sources[0], 'arrive').spec).toEqual({ kind: 'event', sourceId: 'presence-e', event: 'arrive' });
    expect(hookPhrase(hookOnSource(sources.sources[0], 'arrive'), sources)).toEqual({ key: 'goose.hook.event', params: { source: 'Emmanuel', event: 'gets home' } });
  });

  it('says a repeat by its days', () => {
    const phrase = hookPhrase({ id: '', label: '', spec: { kind: 'repeat', every: 'week', at: '09:00', days: [6] }, nextFireAt: null, lastFiredAt: null }, sources, 'en-GB');
    expect(phrase).toEqual({ key: 'goose.hook.everyWeekOn', params: { days: 'Saturday', at: '09:00' } });
  });
});

describe('offers from chats', () => {
  it('keeps an offer with its words and an unknown time as null', () => {
    expect(readTodoOffers({ offers: [{ reminder_id: 'r1', text: 'Call the garage', when_said: 'on Friday', due_at: 'friday', said_at: '2026-11-09T08:00:00Z' }, { text: 'no id' }] })).toEqual([
      { reminderId: 'r1', text: 'Call the garage', whenSaid: 'on Friday', dueAt: null, saidAt: '2026-11-09T08:00:00Z' },
    ]);
  });
});

describe('changing a hook in place', () => {
  const hook = (spec: Hook['spec'], label = ''): Hook => ({ id: 'h', label, spec, nextFireAt: null, lastFiredAt: null });

  it('swaps only the chosen hook and drops the old Pond sentence', () => {
    const first = hook({ kind: 'time', at: '2026-11-13T16:00:00.000Z' }, 'On Friday 13 November at 19:00');
    const second = hook({ kind: 'place', placeId: 'p1', transition: 'arrive' }, 'When you get home');
    const next = hook({ kind: 'time', at: '2026-11-13T15:00:00.000Z' }, 'stale');
    const out = replaceHook([first, second], 0, next);
    expect(out).toHaveLength(2);
    expect(out[0].spec).toEqual(next.spec);
    expect(out[0].label).toBe('');
    expect(out[1]).toBe(second);
  });

  it('reads a time back into the day and clock it was set at, in the phone zone', () => {
    const at = new Date(2026, 10, 13, 19, 0);
    expect(pickerSeedOf(hook({ kind: 'time', at: at.toISOString() }))).toEqual({
      kind: 'time',
      date: { year: 2026, month: 11, day: 13 },
      time: { hour: 19, minute: 0 },
    });
  });

  it('reads a repeat back, and a place keeps its arrive or leave', () => {
    expect(pickerSeedOf(hook({ kind: 'repeat', every: 'week', at: '07:30', days: [1, 3] }))).toEqual({ kind: 'repeat', every: 'week', days: [1, 3], time: { hour: 7, minute: 30 } });
    expect(pickerSeedOf(hook({ kind: 'place', placeId: 'p', transition: 'leave' }))).toEqual({ kind: 'place', transition: 'leave' });
  });

  it('opens events and connectors on the event list, and leaves an unknown kind remove-only', () => {
    expect(pickerSeedOf(hook({ kind: 'connector', connectorId: 'c', event: 'e', filter: null }))?.kind).toBe('event');
    expect(pickerSeedOf(hook({ kind: 'other', rawKind: 'future', raw: {} }))).toBeNull();
  });
});
