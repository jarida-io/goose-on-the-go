// To-dos and reminders: the open and done lists, what Goose is asking about, the offers lifted from
// chats, adding and editing with hooks, and the places a hook can wait on (docs/MY-GOOSE-HUB.md,
// part 3). A place hook needs the phone's geofences, which this keeps in step with the open list.

import { useCallback, useEffect, useMemo, useState } from 'react';

import { DEFAULT_RADIUS_M, inOrder, isAsking, placesWatched, tickStep, todoWrite, type HookSources, type Todo, type TodoDraft, type TodoOffer, type TodoStep } from '@/models/todos';
import { useServer } from '@/providers/server-provider';
import { askForLocation, currentPosition, locationAccess, watchPlaces, type LocationAccess } from '@/services/geofence';
import { confirm } from '@/services/haptics';
import i18n from '@/services/i18n';
import { showSnackbar } from '@/services/snackbar';
import type { TodoAnswerWire } from '@/services/types';
import { hubAction, useHubRead } from './hub-read';
import { useHubSource } from './hub-source';

/** To-dos change when a hook fires or a chat adds one; a read every couple of minutes in front. */
export const TODOS_MS = 2 * 60_000;
/** How long "Not yet" waits before Goose asks again, when the member does not say. */
export const NOT_YET_MINUTES = 120;

export interface TodoLists {
  open: Todo[];
  done: Todo[];
  offers: TodoOffer[];
}

const EMPTY: TodoLists = { open: [], done: [], offers: [] };

export function useTodos(enabled = true) {
  const { isScreenReal } = useServer();
  const real = isScreenReal('myGoose');
  const lists = useHubRead<TodoLists>(
    'todos',
    async (s) => {
      const [all, offers] = await Promise.all([s.todos('all'), s.todoOffers().catch(() => [] as TodoOffer[])]);
      return { open: inOrder(all.filter((t) => t.state === 'open')), done: all.filter((t) => t.state === 'done'), offers };
    },
    EMPTY,
    TODOS_MS,
    enabled,
  );
  const sources = useHubRead<HookSources>('hook-sources', (s) => s.hookSources(), { places: [], sources: [] }, 10 * 60_000, enabled);
  const { source, setData, data } = lists;
  const [access, setAccess] = useState<LocationAccess | null>(null);

  // The geofences follow the open list: watched while a to-do waits on a place, stopped when none do.
  // The mock member's places are not the phone's, so only a real Pond's are watched.
  const watched = useMemo(() => placesWatched(data.open), [data.open]);
  const placesJson = JSON.stringify(sources.data.places.filter((p) => watched.has(p.id)));
  useEffect(() => {
    if (!enabled || lists.loading) return;
    let live = true;
    const places = JSON.parse(placesJson) as HookSources['places'];
    void (real ? watchPlaces(places) : locationAccess()).then((a) => live && setAccess(a));
    return () => {
      live = false;
    };
  }, [enabled, lists.loading, placesJson, real]);

  const now = new Date();
  const asking = data.open.filter((t) => isAsking(t, now));
  const upcoming = data.open.filter((t) => !isAsking(t, now));

  const replace = useCallback(
    (todo: Todo) =>
      setData((d) => {
        const rest = { open: d.open.filter((t) => t.id !== todo.id), done: d.done.filter((t) => t.id !== todo.id), offers: d.offers };
        return todo.state === 'open' ? { ...rest, open: inOrder([todo, ...rest.open]) } : todo.state === 'done' ? { ...rest, done: [todo, ...rest.done] } : rest;
      }),
    [setData],
  );

  const answer = useCallback(
    async (todo: Todo, reply: TodoAnswerWire) => {
      const done = await hubAction('todos', () => source.answerTodo(todo.id, reply, reply === 'not_yet' ? NOT_YET_MINUTES : undefined), { retry: true });
      if (!done) return false;
      replace(done);
      if (reply === 'done') void confirm();
      showSnackbar({ message: i18n.t(reply === 'done' ? 'goose.todos.markedDone' : reply === 'not_yet' ? 'goose.todos.askLater' : 'goose.todos.dropped'), tone: 'success' });
      return true;
    },
    [replace, source],
  );

  /**
   * Ticking a to-do Goose is not asking about is the member saying it is done, so it is the same
   * answer. The row leaves the list it was on, so the message names it and offers to undo it.
   */
  const flip = useCallback(
    async (todo: Todo, isDone: boolean) => {
      const done = await hubAction('todos', () => source.editTodo(todo.id, { state: isDone ? 'done' : 'open' }));
      if (done) replace(done);
      return done;
    },
    [replace, source],
  );

  const setDone = useCallback(
    async (todo: Todo, isDone: boolean): Promise<void> => {
      const done = await flip(todo, isDone);
      if (!done) return;
      if (isDone) void confirm();
      showSnackbar({
        message: i18n.t(isDone ? 'goose.todos.doneNamed' : 'goose.todos.reopened', { text: todo.text }),
        tone: 'success',
        action: { label: i18n.t('goose.todos.undo'), onPress: () => void flip(done, !isDone) },
      });
    },
    [flip],
  );

  /** A new one the list already holds under the same words comes back as that one, with `duplicateOf`. */
  const save = useCallback(
    async (id: string | null, draft: TodoDraft) => {
      const body = todoWrite(draft);
      const done = await hubAction('todos', () => (id ? source.editTodo(id, body) : source.addTodo({ ...body, kind: draft.kind, text: draft.text.trim() })));
      if (!done) return null;
      replace(done);
      const said = done.duplicateOf ? 'goose.todos.alreadyListed' : id ? 'goose.todos.saved' : draft.kind === 'reminder' ? 'goose.todos.reminderAdded' : 'goose.todos.added';
      showSnackbar({ message: i18n.t(said), tone: 'success' });
      return done;
    },
    [replace, source],
  );

  /** Ticks one step: the Pond takes the steps only whole, so the whole list is sent again. */
  const tick = useCallback(
    async (todo: Todo, index: number, isDone: boolean, from: readonly TodoStep[] = todo.steps) => {
      const steps = tickStep(from, index, isDone);
      replace({ ...todo, steps });
      const done = await hubAction('todos', () => source.editTodo(todo.id, { steps }));
      replace(done ?? todo);
      if (done && isDone) void confirm();
      return done;
    },
    [replace, source],
  );

  const remove = useCallback(
    async (todo: Todo) => {
      const done = await hubAction('todos', () => source.deleteTodo(todo.id));
      if (done === null) return false;
      setData((d) => ({ ...d, open: d.open.filter((t) => t.id !== todo.id), done: d.done.filter((t) => t.id !== todo.id) }));
      showSnackbar({ message: i18n.t('goose.todos.deleted'), tone: 'success' });
      return true;
    },
    [setData, source],
  );

  const acceptOffer = useCallback(
    async (offer: TodoOffer, dueAt?: string) => {
      const done = await hubAction('todos', () => source.acceptTodoOffer(offer.reminderId, dueAt), { retry: true });
      if (!done) return false;
      setData((d) => ({ ...d, offers: d.offers.filter((o) => o.reminderId !== offer.reminderId), open: inOrder([done, ...d.open.filter((t) => t.id !== done.id)]) }));
      void confirm();
      showSnackbar({ message: i18n.t(done.duplicateOf ? 'goose.todos.alreadyListed' : 'goose.todos.offerAdded'), tone: 'success' });
      return true;
    },
    [setData, source],
  );

  const declineOffer = useCallback(
    async (offer: TodoOffer) => {
      setData((d) => ({ ...d, offers: d.offers.filter((o) => o.reminderId !== offer.reminderId) }));
      const done = await hubAction('todos', () => source.declineTodoOffer(offer.reminderId));
      if (done === null) void lists.reload();
    },
    [lists, setData, source],
  );

  /** Saves where the phone is now as a place, named by the member. */
  const addPlaceHere = useCallback(
    async (label: string) => {
      const here = await currentPosition();
      if (here === 'denied' || here === 'unavailable') {
        showSnackbar({ message: i18n.t(here === 'denied' ? 'goose.places.positionDenied' : 'goose.places.positionUnavailable'), tone: 'danger' });
        return null;
      }
      const place = await hubAction('places', () => source.addPlace({ label: label.trim(), lat: here.lat, lng: here.lng, radius_m: DEFAULT_RADIUS_M }));
      if (!place) return null;
      sources.setData((d) => ({ ...d, places: [...d.places, place] }));
      showSnackbar({ message: i18n.t('goose.places.saved', { place: place.label }), tone: 'success' });
      return place;
    },
    [source, sources],
  );

  const removePlace = useCallback(
    async (placeId: string) => {
      const done = await hubAction('places', () => source.deletePlace(placeId));
      if (done === null) return;
      sources.setData((d) => ({ ...d, places: d.places.filter((p) => p.id !== placeId) }));
    },
    [source, sources],
  );

  /** The member's tap on "Turn on location", after the app said why. */
  const allowLocation = useCallback(async () => {
    const next = await askForLocation();
    setAccess(next);
    if (next === 'granted' && real) {
      setAccess(await watchPlaces(sources.data.places.filter((p) => watched.has(p.id))));
    }
    return next;
  }, [real, sources.data.places, watched]);

  return {
    ...lists,
    data: { ...data, asking, upcoming },
    sources: sources.data,
    access,
    actions: {
      reload: async () => {
        await Promise.all([lists.reload(), sources.reload()]);
      },
      answer,
      setDone,
      save,
      tick,
      remove,
      acceptOffer,
      declineOffer,
      addPlaceHere,
      removePlace,
      allowLocation,
    },
  };
}

export type UseTodos = ReturnType<typeof useTodos>;

/** One to-do, for its editor; null while it loads, or for a new one. */
export function useTodo(id: string | null) {
  const source = useHubSource();
  const [todo, setTodo] = useState<Todo | null>(null);
  const { hydrated } = useServer();
  useEffect(() => {
    if (!id || !hydrated) return;
    let live = true;
    void source
      .todos('all')
      .then((all) => live && setTodo(all.find((t) => t.id === id) ?? null))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [hydrated, id, source]);
  return todo;
}
