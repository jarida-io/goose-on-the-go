/**
 * The order of Home's widgets, and whether they are being rearranged.
 *
 * The order is a preference of this phone, not of the Pond, so it lives in AsyncStorage and
 * survives switching Pond. A saved order is merged with today's widgets: one since removed is
 * dropped, and one added since goes in where it would by default rather than at the end.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { moveTo, stepAmong } from '@/components/patterns/widget-layout';
import { Storage } from '@/services/storage';

// What Goose finished and the plans it offers lead: they are what waits on the member.
export const HOME_WIDGETS = ['ready', 'plans', 'ideas', 'ask', 'music', 'next', 'outside', 'remember', 'conversations', 'devices'] as const;
export type HomeWidgetKey = (typeof HOME_WIDGETS)[number];

function isWidget(key: unknown): key is HomeWidgetKey {
  return typeof key === 'string' && (HOME_WIDGETS as readonly string[]).includes(key);
}

export function mergeOrder(saved: unknown): HomeWidgetKey[] {
  if (!Array.isArray(saved)) return [...HOME_WIDGETS];
  const order = saved.filter(isWidget).filter((key, i, all) => all.indexOf(key) === i);
  HOME_WIDGETS.forEach((key, i) => {
    if (order.includes(key)) return;
    const before = HOME_WIDGETS.slice(0, i).reverse().find((k) => order.includes(k));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, key);
  });
  return order;
}

export interface UseHomeLayout {
  order: HomeWidgetKey[];
  editing: boolean;
  actions: {
    edit: () => void;
    done: () => void;
    move: (key: string, target: string) => void;
    /** Among `shown`, the widgets on screen; for the screen reader's move actions. */
    step: (key: string, delta: -1 | 1, shown: string[]) => void;
    reset: () => void;
  };
}

export function useHomeLayout(): UseHomeLayout {
  const [order, setOrder] = useState<HomeWidgetKey[]>(() => [...HOME_WIDGETS]);
  const [editing, setEditing] = useState(false);
  // Set by the first move. A move made before the saved order arrives must not be overwritten by
  // it, and the default must never be written over a saved order that is still on its way.
  const moved = useRef(false);

  useEffect(() => {
    let live = true;
    void Storage.getJSON<unknown>('homeLayout')
      .catch(() => null)
      .then((saved) => {
        if (live && !moved.current) setOrder(mergeOrder(saved));
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (moved.current) void Storage.setJSON('homeLayout', order).catch(() => undefined);
  }, [order]);

  const actions = useMemo<UseHomeLayout['actions']>(() => {
    const change = (next: (current: HomeWidgetKey[]) => string[]) => {
      moved.current = true;
      setOrder((current) => next(current) as HomeWidgetKey[]);
    };
    return {
      edit: () => setEditing(true),
      done: () => setEditing(false),
      move: (key, target) => change((current) => moveTo(current, key, target)),
      step: (key, delta, shown) => change((current) => stepAmong(current, shown, key, delta)),
      reset: () => change(() => [...HOME_WIDGETS]),
    };
  }, []);

  return { order, editing, actions };
}
