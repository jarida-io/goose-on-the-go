/**
 * The saved order of Home's widgets, read back against today's widgets.
 */

import { HOME_WIDGETS, mergeOrder } from '@/view-models/use-home-layout';

describe('mergeOrder', () => {
  it('starts from the default when nothing usable was saved', () => {
    expect(mergeOrder(null)).toEqual([...HOME_WIDGETS]);
    expect(mergeOrder('devices')).toEqual([...HOME_WIDGETS]);
  });

  it('keeps an arrangement as it was saved', () => {
    const saved = [...HOME_WIDGETS].reverse();
    expect(mergeOrder(saved)).toEqual(saved);
  });

  it('drops a widget that no longer exists, and a repeat', () => {
    expect(mergeOrder(['devices', 'weather-radar', 'devices', ...HOME_WIDGETS])).toEqual([
      'devices',
      ...HOME_WIDGETS.filter((k) => k !== 'devices'),
    ]);
  });

  it('puts a widget added since in its default place, after the one it follows by default', () => {
    const saved = HOME_WIDGETS.filter((k) => k !== 'music');
    const merged = mergeOrder(saved);
    expect(merged.indexOf('music')).toBe(merged.indexOf('ask') + 1);
    expect(mergeOrder(HOME_WIDGETS.filter((k) => k !== 'ready'))[0]).toBe('ready');
  });

  it('leads an order saved before the idea engine with what is ready and the plans', () => {
    const before = ['devices', 'ideas', 'ask', 'music', 'next', 'outside', 'remember', 'conversations'];
    expect(mergeOrder(before).slice(0, 3)).toEqual(['ready', 'plans', 'devices']);
  });

  it('drops the questions from an order saved while they were on the board', () => {
    const saved = ['ready', 'plans', 'questions', 'ideas', 'ask', 'music', 'next', 'outside', 'remember', 'conversations', 'devices'];
    expect(mergeOrder(saved)).not.toContain('questions');
  });
});
