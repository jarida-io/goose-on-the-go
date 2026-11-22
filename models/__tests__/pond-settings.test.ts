/**
 * The catalogue is checked against the Pond's defaults because the Pond answers 200 to a patch with
 * an unknown key: a row naming a field the record lacks would save into nothing, unnoticed.
 */

import { SETTINGS_PAGES } from '@/constants/settings-pages';
import i18n from '@/services/i18n';
import {
  describeVoice,
  formatClock,
  formatRetentionOverrides,
  nextStop,
  pageKeys,
  paceWord,
  parseClock,
  parseRetentionOverrides,
  parseSettingNumber,
  postureOf,
  readSettings,
  SAMPLE_SETTINGS,
  sortVoices,
  splitCategories,
  tidyNumber,
  toolsOn,
  voiceInUse,
  zoneCity,
} from '@/models/pond-settings';

const lookup = i18n.t as unknown as (key: string) => string;

describe('the catalogue', () => {
  const pages = Object.values(SETTINGS_PAGES);
  const items = pages.flatMap((page) => page.sections.flatMap((section) => section.items));

  it('only edits fields the Pond holds', () => {
    const missing = pages.flatMap((page) => pageKeys(page)).filter((key) => !(key in SAMPLE_SETTINGS));
    expect(missing).toEqual([]);
  });

  it('gives each field the control its type needs', () => {
    const wrong = items.flatMap((item) => {
      if (!('key' in item)) return [];
      const value = SAMPLE_SETTINGS[item.key];
      const ok =
        item.kind === 'switch' ? typeof value === 'boolean'
          : item.kind === 'number' || item.kind === 'slider' ? typeof value === 'number'
            : item.kind === 'list' ? Array.isArray(value)
              : item.kind === 'text' ? typeof value === 'string' || value === null
                : typeof value === 'string';
      return ok ? [] : [`${item.kind} ${item.key}`];
    });
    expect(wrong).toEqual([]);
  });

  it('offers the default of every choice among its options', () => {
    const orphaned = items.flatMap((item) =>
      item.kind === 'choice' && !item.options.some((o) => o.value === SAMPLE_SETTINGS[item.key]) ? [item.key] : [],
    );
    expect(orphaned).toEqual([]);
  });

  it('starts every on/off text field on one of its two values', () => {
    const stray = items.flatMap((item) =>
      item.kind === 'toggle' && ![item.on, item.off].includes(SAMPLE_SETTINGS[item.key]) ? [item.key] : [],
    );
    expect(stray).toEqual([]);
  });

  it('switches search by meaning between the values the Pond reads, with no restart', () => {
    const item = items.find((i) => 'key' in i && i.key === 'embedding_provider');
    expect(item).toMatchObject({ kind: 'toggle', on: 'auto', off: 'none' });
    expect(item && 'restart' in item ? item.restart : undefined).toBeUndefined();
  });

  it('shows each field on one page only', () => {
    const keys = pages.flatMap((page) => pageKeys(page));
    expect(keys.filter((key, i) => keys.indexOf(key) !== i)).toEqual([]);
  });

  it('keeps every range a value can sit inside', () => {
    const outside = items.flatMap((item) => {
      if (item.kind !== 'number' && item.kind !== 'slider') return [];
      const value = SAMPLE_SETTINGS[item.key];
      return value < item.min || (item.max !== undefined && value > item.max) ? [item.key] : [];
    });
    expect(outside).toEqual([]);
  });

  it('resolves every label, hint and option it names', () => {
    const keys = items.flatMap((item) => {
      if (item.kind === 'special') return [];
      const own = [item.labelKey, item.hintKey, 'placeholderKey' in item ? item.placeholderKey : undefined];
      const options = item.kind === 'choice' ? item.options.flatMap((o) => [o.labelKey, o.hintKey]) : [];
      return [...own, ...options].filter((k): k is NonNullable<typeof k> => !!k);
    });
    const pageText = pages.flatMap((page) => [page.titleKey, page.descriptionKey]);
    expect([...keys, ...pageText].filter((key) => lookup(key) === key)).toEqual([]);
  });
});

// How notices reach phones, and who may set reminders by voice: the Pond's defaults, on the pages they belong to.
describe('the reliability settings', () => {
  const where = (key: string) => Object.values(SETTINGS_PAGES).find((page) => pageKeys(page).includes(key as never))?.id;

  it('start where the Pond starts them', () => {
    expect(SAMPLE_SETTINGS).toMatchObject({
      notices_wait_in_quiet_hours: true,
      speak_unfetched_reminders: true,
      unseen_phone_skip_days: 14,
      unseen_phone_remove_days: 30,
      lone_voice_sets_reminders: true,
    });
  });

  it('sit with quiet hours and the household', () => {
    expect(where('notices_wait_in_quiet_hours')).toBe('announcements');
    expect(where('speak_unfetched_reminders')).toBe('announcements');
    expect(where('unseen_phone_skip_days')).toBe('announcements');
    expect(where('unseen_phone_remove_days')).toBe('announcements');
    expect(where('lone_voice_sets_reminders')).toBe('household');
  });

  it('say what they do in the words the Pond uses', () => {
    expect(lookup('settings.field.notices_wait_in_quiet_hours.label')).toBe('Hold notices in quiet hours');
    expect(lookup('settings.field.speak_unfetched_reminders.label')).toBe('Say a reminder no phone picked up');
    expect(lookup('settings.field.unseen_phone_skip_days.label')).toBe('Stop notifying a phone not seen for');
    expect(lookup('settings.field.unseen_phone_remove_days.label')).toBe('Remove a phone not seen for');
    expect(lookup('settings.field.lone_voice_sets_reminders.label')).toBe('A voice the Pond does not know may set reminders');
  });

  it('let a phone go unseen from never up to a year', () => {
    const days = Object.values(SETTINGS_PAGES)
      .flatMap((page) => page.sections.flatMap((section) => section.items))
      .filter((item) => item.kind === 'number' && (item.key === 'unseen_phone_skip_days' || item.key === 'unseen_phone_remove_days'));
    expect(days).toHaveLength(2);
    for (const item of days) expect(item).toMatchObject({ min: 0, max: 365, step: 1 });
  });
});

describe('reading the record', () => {
  it('fills what an older Pond leaves out with the defaults', () => {
    const s = readSettings({ assistant_name: 'Kuku', voice_tts_speed: 1.25 });
    expect(s.assistant_name).toBe('Kuku');
    expect(s.voice_tts_speed).toBe(1.25);
    expect(s.network_mode).toBe(SAMPLE_SETTINGS.network_mode);
  });

  // 2026-11-18: dropped as unknown, so a Pond holding a phone's fix was read as a guess on every start.
  it('keeps where the home location came from', () => {
    expect(readSettings({ weather_location_source: 'device' }).weather_location_source).toBe('device');
  });

  it('answers the defaults for something that is not a record', () => {
    expect(readSettings(null)).toEqual(SAMPLE_SETTINGS);
    expect(readSettings('settings')).toEqual(SAMPLE_SETTINGS);
  });

  it('ignores keys it does not show', () => {
    expect(readSettings({ mesh_identity_secret: 'x' })).not.toHaveProperty('mesh_identity_secret');
  });

  it('shows a decimal the Pond widened as the one that was meant', () => {
    expect(tidyNumber(0.699999988079071)).toBe(0.7);
    expect(tidyNumber(4096)).toBe(4096);
  });
});

describe('stepping between stops', () => {
  const stops = [1, 2, 3, 5, 10, 15, 24, 30];

  it('moves to the next stop either way', () => {
    expect(nextStop(stops, 5, 1)).toBe(10);
    expect(nextStop(stops, 5, -1)).toBe(3);
  });

  it('lands on a stop from a value between two', () => {
    expect(nextStop(stops, 4, 1)).toBe(5);
    expect(nextStop(stops, 4, -1)).toBe(3);
  });

  it('stays put past either end', () => {
    expect(nextStop(stops, 30, 1)).toBe(30);
    expect(nextStop(stops, 1, -1)).toBe(1);
  });
});

describe('typed numbers', () => {
  const range = { min: 1, max: 500, step: 1 };

  it('accepts a whole number in range', () => {
    expect(parseSettingNumber('50', range)).toEqual({ value: 50 });
  });

  it('says why a number cannot be saved', () => {
    expect(parseSettingNumber('', range)).toEqual({ error: 'notNumber' });
    expect(parseSettingNumber('ten', range)).toEqual({ error: 'notNumber' });
    expect(parseSettingNumber('2.5', range)).toEqual({ error: 'whole' });
    expect(parseSettingNumber('0', range)).toEqual({ error: 'tooSmall' });
    expect(parseSettingNumber('501', range)).toEqual({ error: 'tooBig' });
  });

  it('takes a comma as the decimal point', () => {
    expect(parseSettingNumber('0,05', { min: 0, max: 1, step: 0.01 })).toEqual({ value: 0.05 });
  });
});

describe('clock times', () => {
  it('reads the Pond’s HH:MM and refuses anything else', () => {
    expect(parseClock('22:00')).toEqual({ hour: 22, minute: 0 });
    expect(parseClock('7:05')).toEqual({ hour: 7, minute: 5 });
    expect(parseClock('24:00')).toBeNull();
    expect(parseClock('noon')).toBeNull();
  });

  it('writes two digits each side', () => {
    expect(formatClock(7, 5)).toBe('07:05');
  });
});

describe('time zones', () => {
  it('names a zone by its city', () => {
    expect(zoneCity('Africa/Nairobi')).toBe('Nairobi');
    expect(zoneCity('America/Argentina/Buenos_Aires')).toBe('Buenos Aires');
    expect(zoneCity('UTC')).toBe('UTC');
  });
});

describe('lists the Pond keeps as text', () => {
  it('splits speech categories, dropping blanks and repeats', () => {
    expect(splitCategories('Alert, security,, alert ')).toEqual(['alert', 'security']);
    expect(splitCategories(' , ')).toEqual([]);
  });

  it('round-trips per-kind retention', () => {
    const text = formatRetentionOverrides({ network: 14, sensor: 7 });
    expect(text).toBe('network 14, sensor 7');
    expect(parseRetentionOverrides(text)).toEqual({ network: 14, sensor: 7 });
    expect(parseRetentionOverrides('')).toEqual({});
  });

  it('refuses retention it cannot read', () => {
    expect(parseRetentionOverrides('network fourteen')).toBeNull();
  });
});

describe('voices', () => {
  it('names a Kokoro voice from its id', () => {
    expect(describeVoice('af_heart')).toEqual({ id: 'af_heart', name: 'Heart', language: 'a', gender: 'f', grade: 'A' });
    expect(describeVoice('bm_george').language).toBe('b');
  });

  it('names the voice Kokoro speaks in when none has been chosen', () => {
    expect(voiceInUse('')).toBe('af_heart');
    expect(voiceInUse(' bm_george ')).toBe('bm_george');
  });

  it('keeps a voice of another shape choosable', () => {
    expect(describeVoice('en_US-lessac-medium')).toMatchObject({ language: null, name: 'En US Lessac Medium' });
  });

  it('puts the best-trained voice first and ungraded voices last', () => {
    const sorted = sortVoices(['af_sky', 'af_new', 'af_heart', 'af_bella'].map(describeVoice)).map((v) => v.id);
    expect(sorted).toEqual(['af_heart', 'af_bella', 'af_sky', 'af_new']);
  });

  it('names the pace the way a household hears it', () => {
    expect(paceWord(1)).toBe('natural');
    expect(paceWord(0.5)).toBe('muchSlower');
    expect(paceWord(2)).toBe('muchFaster');
  });
});

describe('what the Pond is doing', () => {
  it('reads the switches that decide it', () => {
    expect(postureOf({ ...SAMPLE_SETTINGS, mic_enabled: false, network_mode: 'offline' })).toMatchObject({
      listens: false,
      reach: 'offline',
    });
  });

  it('treats a mode it does not know as open, which is the Pond’s own default', () => {
    expect(postureOf({ ...SAMPLE_SETTINGS, network_mode: 'something' }).reach).toBe('open');
  });

  it('counts the tools that are on', () => {
    expect(toolsOn(SAMPLE_SETTINGS)).toBe(7);
  });
});
