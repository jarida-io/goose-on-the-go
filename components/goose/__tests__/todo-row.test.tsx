/**
 * Ticking a to-do shows the tick before the row moves, so the press is seen to do something, and
 * the tick says what pressing it does.
 */
import '@/services/i18n';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { InkProvider } from '@jarida/ink/native';

import type { Todo } from '@/models/todos';
import { TICK_SETTLE_MS, TodoRow } from '../todo-parts';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/services/haptics', () => ({ toggle: jest.fn().mockResolvedValue(undefined), selectionTick: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/components/ui/g-icon', () => ({ GIcon: () => null }));

const todo: Todo = {
  id: 't1',
  kind: 'todo',
  text: 'Call the plumber',
  notes: null,
  state: 'open',
  dueAt: null,
  hooks: [],
  ask: true,
  source: 'you',
  lastAskedAt: null,
  asked: 0,
  snoozedUntil: null,
  createdAt: '2026-11-11T09:00:00Z',
  doneAt: null,
  list: null,
  priority: 'normal',
  steps: [],
  gooseCan: null,
  anchorId: null,
  duplicateOf: null,
};

function render(row: Todo, onToggle: () => Promise<unknown>) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <InkProvider scheme="light">
        <TodoRow todo={row} sources={null} access={null} onToggle={onToggle} />
      </InkProvider>,
    );
  });
  return tree;
}

const tick = (tree: ReactTestRenderer) => tree.root.find((n) => n.props.accessibilityRole === 'checkbox' && typeof n.props.onPress === 'function');

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('TodoRow', () => {
  it('ticks at once and moves the row only after it settles', async () => {
    const onToggle = jest.fn().mockResolvedValue(undefined);
    const tree = render(todo, onToggle);
    expect(tick(tree).props.accessibilityLabel).toBe('Mark done: Call the plumber');

    act(() => tick(tree).props.onPress());
    expect(tick(tree).props.accessibilityState).toEqual({ checked: true, busy: true });
    expect(onToggle).not.toHaveBeenCalled();

    act(() => tick(tree).props.onPress());
    await act(async () => {
      jest.advanceTimersByTime(TICK_SETTLE_MS);
    });
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(tick(tree).props.accessibilityState).toEqual({ checked: false, busy: false });
  });

  it('says a done to-do can be marked not done', () => {
    const tree = render({ ...todo, state: 'done' }, jest.fn().mockResolvedValue(undefined));
    expect(tick(tree).props.accessibilityLabel).toBe('Mark not done: Call the plumber');
    expect(tick(tree).props.accessibilityState.checked).toBe(true);
  });

  it('does not act after it is gone', () => {
    const onToggle = jest.fn().mockResolvedValue(undefined);
    const tree = render(todo, onToggle);
    act(() => tick(tree).props.onPress());
    act(() => tree.unmount());
    jest.advanceTimersByTime(TICK_SETTLE_MS);
    expect(onToggle).not.toHaveBeenCalled();
  });
});
