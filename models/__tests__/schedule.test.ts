/**
 * The Schedule screen's own rules on top of the Pond's types: which tasks are
 * rules, the order schedules show in, the cron a one-off becomes, and how a
 * run time reads.
 */

import { formatScheduleTime, isRule, isSixFieldCron, oneOffCron, timedSchedules } from '@/models/schedule';
import type { Schedule } from '@/services/types';

function schedule(overrides: Partial<Schedule>): Schedule {
  return {
    id: 'id',
    label: 'Label',
    cron: '0 0 7 * * *',
    fire_at: null,
    timezone: 'UTC',
    kind: { type: 'agent_prompt', prompt: 'p' },
    paused: false,
    currently_running: false,
    last_run: null,
    next_run: null,
    created_at: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

const RULE_KIND: Schedule['kind'] = {
  type: 'sensor_trigger',
  source: { kind: 'sensor' },
  actions: [{ type: 'notify', title: 't', body: 'b' }],
};

describe('timedSchedules', () => {
  /** `GET /schedules` returns rules too, stored as `@event`; they have their own tab. */
  it('leaves the rules out', () => {
    const rule = schedule({ id: 'rule', cron: '@event', kind: RULE_KIND });
    const timed = schedule({ id: 'timed' });

    expect(isRule(rule)).toBe(true);
    expect(timedSchedules([rule, timed]).map((s) => s.id)).toEqual(['timed']);
  });

  it('puts the soonest first, and ones with no next run last by name', () => {
    const list = [
      schedule({ id: 'paused-b', label: 'B' }),
      schedule({ id: 'later', next_run: '2026-10-06T09:00:00Z' }),
      schedule({ id: 'paused-a', label: 'A' }),
      schedule({ id: 'sooner', next_run: '2026-10-06T07:00:00Z' }),
    ];

    expect(timedSchedules(list).map((s) => s.id)).toEqual(['sooner', 'later', 'paused-a', 'paused-b']);
  });

  it('does not reorder the list it was given', () => {
    const list = [schedule({ id: 'b', label: 'B' }), schedule({ id: 'a', label: 'A' })];
    timedSchedules(list);
    expect(list.map((s) => s.id)).toEqual(['b', 'a']);
  });
});

describe('cron', () => {
  /** The Pond's parser is seconds-first; the usual five-field form is refused. */
  it('accepts six fields and refuses five', () => {
    expect(isSixFieldCron('0 0 9 * * 1-5')).toBe(true);
    expect(isSixFieldCron('  0 0 9 * *   1-5 ')).toBe(true);
    expect(isSixFieldCron('0 9 * * 1-5')).toBe(false);
  });

  /** Anything but one literal second runs the agent several times a minute. */
  it('takes a single second, 0 to 59, in the seconds field', () => {
    expect(isSixFieldCron('30 0 9 * * *')).toBe(true);
    expect(isSixFieldCron('59 0 9 * * *')).toBe(true);
    expect(isSixFieldCron('*/15 * * * * *')).toBe(false);
    expect(isSixFieldCron('* 0 9 * * *')).toBe(false);
    expect(isSixFieldCron('0-30 0 9 * * *')).toBe(false);
    expect(isSixFieldCron('0,30 0 9 * * *')).toBe(false);
    expect(isSixFieldCron('60 0 9 * * *')).toBe(false);
  });

  /** Without the year, a date a year or more out would match a year early. */
  it('pins a one-off to its second, minute, hour, day, month and year', () => {
    expect(oneOffCron({ year: 2027, month: 12, day: 24 }, { hour: 18, minute: 5 })).toBe('0 5 18 24 12 * 2027');
  });
});

describe('formatScheduleTime', () => {
  const now = new Date(2026, 9, 5, 12, 0);

  it.each([
    ['today', new Date(2026, 9, 5, 18, 30), /^Today /],
    ['tomorrow', new Date(2026, 9, 6, 7, 0), /^Tomorrow /],
    ['yesterday', new Date(2026, 9, 4, 23, 59), /^Yesterday /],
  ])('says %s by name', (_, when, expected) => {
    expect(formatScheduleTime(when.toISOString(), now)).toMatch(expected);
  });

  it('gives a date further out', () => {
    expect(formatScheduleTime(new Date(2026, 9, 20, 9, 0).toISOString(), now)).not.toMatch(
      /^(Today|Tomorrow|Yesterday) /,
    );
  });

  it('says nothing for a timestamp it cannot read', () => {
    expect(formatScheduleTime('soon', now)).toBe('');
  });
});
