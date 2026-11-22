/**
 * Idea cards: a card is read only with its why and a source, the set's state drives the poll, and
 * each button does what the spec says: Do it follows the action, Save keeps it, Not this sends the
 * chips and words and puts the card back when the Pond refuses.
 */

import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';

import { askMessage, factLines, makingWords, readIdeaCard, readIdeaCardSet, type IdeaCard } from '@/models/idea-cards';
import { readHub } from '@/models/hub';
import { ApiError, api } from '@/services/api-client';
import { currentSnackbar, resetSnackbar } from '@/services/snackbar';
import { useIdeaCards, type UseIdeaCards } from '@/view-models/use-idea-cards';

jest.mock('@/services/pond-trust', () => ({ assertPondTrust: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/services/secure-random', () => ({ randomBytes: (n: number) => new Uint8Array(n).fill(7) }));
jest.mock('@/services/haptics', () => ({ confirm: jest.fn().mockResolvedValue(undefined) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/services/api-client', () => {
  const actual = jest.requireActual('@/services/api-client');
  return {
    ...actual,
    api: { ideaCards: jest.fn(), refreshIdeaCards: jest.fn(), doIdeaCard: jest.fn(), deeperIdeaCard: jest.fn(), saveIdeaCard: jest.fn(), dismissIdeaCard: jest.fn() },
  };
});
jest.mock('@/providers/server-provider', () => ({ useServer: () => ({ hydrated: true, isScreenReal: () => true }) }));
jest.mock('../use-live', () => ({
  useLive: (read: () => Promise<unknown>, _delay: unknown, enabled = true) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(() => {
      if (enabled) void read();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled]);
  },
}));

const pond = jest.mocked(api);
const push = jest.mocked(router.push);

const source = { kind: 'web', title: 'Karura Forest entry fees', url: 'https://karurafriends.org/fees' };
const wire = {
  cards: [
    {
      id: 'c1',
      kind: 'do',
      title: 'Walk the Karura waterfall trail',
      why: { text: 'You said you want more time outdoors', source: { kind: 'memory', label: 'More time outside' } },
      when: 'Saturday 2 pm',
      where: 'Karura Forest',
      cost: 'KSh 600 entry',
      effort: '2 hours',
      action: { kind: 'reminder', label: 'Remind me Saturday', due: '2026-11-21T11:00:00Z' },
      sources: [source],
      notes: { found: 'Entry is KSh 600 for residents.', next: 'Check the weather Friday.', caveats: 'Fees may have changed.' },
      state: 'new',
      batch_id: 'b1',
      created_at: '2026-11-17T06:00:00Z',
      fades_at: '2026-11-18T18:00:00Z',
    },
    {
      id: 'c2',
      kind: 'ask',
      title: 'Ask Goose for a packing list',
      why: { text: 'You leave for Diani in three weeks', source: { kind: 'plan', label: 'Diani trip' } },
      action: { kind: 'chat', label: 'Ask', prompt: 'Make me a packing list for Diani' },
      sources: [{ kind: 'plan', title: 'Diani trip' }],
      notes: { found: '', next: '', caveats: '' },
      anchor: { id: 'a1', title: 'Diani trip' },
      state: 'saved',
    },
    { id: 'c3', kind: 'do', title: 'No why', sources: [source], action: { kind: 'todo', label: 'Add' } },
    { id: 'c4', kind: 'do', title: 'No source', why: { text: 'You like it', source: { kind: 'memory', label: '' } }, sources: [], action: { kind: 'todo', label: 'Add' } },
  ],
  set: { state: 'ready', made_at: '2026-11-17T06:00:00Z' },
};

async function mounted(enabled = true): Promise<{ readonly vm: UseIdeaCards; unmount: () => Promise<void> }> {
  let latest!: UseIdeaCards;
  const Probe = () => {
    latest = useIdeaCards(enabled);
    return null;
  };
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<Probe />);
  });
  return {
    get vm() {
      return latest;
    },
    unmount: async () => {
      await act(async () => tree.unmount());
    },
  };
}

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  resetSnackbar();
  jest.resetAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  pond.ideaCards.mockImplementation(async () => readIdeaCardSet(wire));
});

afterEach(() => jest.restoreAllMocks());

describe('reading cards', () => {
  it('keeps a card only with its why and a source', () => {
    const set = readIdeaCardSet(wire);
    expect(set.cards.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(set.set).toEqual({ state: 'ready', madeAt: '2026-11-17T06:00:00Z', ahead: null });
    expect(set.cards[1].anchor).toEqual({ id: 'a1', title: 'Diani trip' });
  });

  // 2026-11-18: a refresh behind ten jobs showed only a spinner, and read as stuck.
  it('says how many jobs a queued set waits behind, and only then', () => {
    const queued = readIdeaCardSet({ cards: [], set: { state: 'queued', made_at: null, ahead: 10 } }).set;
    expect(makingWords(queued)).toEqual({ key: 'goose.ideaCards.waiting', count: 10 });
    expect(makingWords({ ...queued, ahead: 0 })).toEqual({ key: 'goose.ideaCards.making' });
    expect(makingWords({ ...queued, state: 'making' })).toEqual({ key: 'goose.ideaCards.making' });
    expect(readIdeaCardSet({ set: { state: 'queued', ahead: -2 } }).set.ahead).toBeNull();
  });

  it('draws when and where, then cost and effort, as two lines', () => {
    expect(factLines(readIdeaCardSet(wire).cards[0])).toEqual(['Saturday 2 pm, Karura Forest', 'KSh 600 entry, 2 hours']);
    expect(factLines(readIdeaCardSet(wire).cards[1])).toEqual([]);
  });

  it('is served by a hub that says idea_cards: true, and keeps the chat card kinds apart', () => {
    expect(readHub({ version: 1, idea_cards: true, cards: ['idea'] })).toMatchObject({ ideaCards: true, cards: ['idea'] });
    expect(readHub({ version: 1, cards: true })?.ideaCards).toBe(false);
    expect(readHub({ version: 1, cards: ['idea'] })).toMatchObject({ ideaCards: false, cards: ['idea'] });
  });
});

const askWire = {
  id: 'c5',
  kind: 'ask',
  title: 'When is the Diani trip?',
  why: { text: 'Goose needs the dates to book', source: { kind: 'plan', label: 'Diani trip' } },
  sources: [{ kind: 'plan', title: 'Diani trip' }],
  action: {
    kind: 'chat',
    label: 'Answer',
    prompt: 'Diani dates',
    question: {
      header: 'Dates',
      text: 'When do you go?',
      options: [{ label: '12-15 Dec', description: 'School holidays', preview: { kind: 'draft', text: 'Day 1' } }, '19-22 Dec', 'Other'],
      recommended: 1,
      multi: false,
    },
  },
  state: 'new',
};

describe('an ask card', () => {
  it('carries its structured question, read as questions are, strings and Other included', () => {
    const question = readIdeaCard(askWire)?.action?.question;
    expect(question).toMatchObject({ header: 'Dates', text: 'When do you go?', recommended: 1, multi: false });
    expect(question?.options).toEqual([
      { label: '12-15 Dec', description: 'School holidays', preview: { kind: 'draft', text: 'Day 1' } },
      { label: '19-22 Dec', description: '', preview: null },
    ]);
  });

  it('has no question when the action carries none, or one with no words', () => {
    expect(readIdeaCardSet(wire).cards[1].action?.question).toBeNull();
    expect(readIdeaCard({ ...askWire, action: { ...askWire.action, question: { header: 'Dates', options: ['A', 'B'] } } })?.action?.question).toBeNull();
  });

  it('words the chosen options as one message', () => {
    expect(askMessage(['Snorkel', ' Kitesurf '])).toBe('Snorkel, Kitesurf');
    expect(askMessage(['  '])).toBe('');
  });
});

describe('the cards view-model', () => {
  it('loads new and saved cards and the set state', async () => {
    const m = await mounted();
    expect(pond.ideaCards).toHaveBeenCalledTimes(1);
    expect(m.vm.fresh.map((c) => c.id)).toEqual(['c1']);
    expect(m.vm.saved.map((c) => c.id)).toEqual(['c2']);
    expect(m.vm.making).toBe(false);
    await m.unmount();
  });

  it('reads nothing on a Pond that does not serve cards', async () => {
    const m = await mounted(false);
    expect(pond.ideaCards).not.toHaveBeenCalled();
    expect(m.vm.loading).toBe(false);
    await m.unmount();
  });

  it('asks for a new set and shows it is being made', async () => {
    pond.refreshIdeaCards.mockResolvedValue('queued');
    const m = await mounted();
    await act(async () => {
      await m.vm.actions.refresh();
    });
    expect(pond.refreshIdeaCards).toHaveBeenCalled();
    expect(m.vm.making).toBe(true);
    await m.unmount();
  });

  it('does a card: it leaves the set, and a chat action opens a conversation with the prompt', async () => {
    const m = await mounted();
    const card = m.vm.cards[1];
    pond.doIdeaCard.mockResolvedValue({ card: { ...card, state: 'done' } as IdeaCard, result: { kind: 'chat', prompt: 'Make me a packing list for Diani', anchorId: null, watchId: null } });
    await act(async () => {
      await m.vm.actions.doIt(card);
    });
    expect(pond.doIdeaCard).toHaveBeenCalledWith('c2');
    expect(m.vm.cards.map((c) => c.id)).toEqual(['c1']);
    expect(push).toHaveBeenCalledWith({ pathname: '/conversation', params: { ask: 'Make me a packing list for Diani' } });
    await m.unmount();
  });

  it('answers an ask card: done on the Pond, and the chosen options, not the prompt, go to chat', async () => {
    pond.ideaCards.mockResolvedValue(readIdeaCardSet({ ...wire, cards: [...wire.cards, askWire] }));
    const m = await mounted();
    const card = m.vm.cards.find((c) => c.id === 'c5')!;
    pond.doIdeaCard.mockResolvedValue({ card: null, result: { kind: 'chat', prompt: 'Diani dates', anchorId: null, watchId: null } });
    await act(async () => {
      await m.vm.actions.answerAsk(card, ['19-22 Dec']);
    });
    expect(pond.doIdeaCard).toHaveBeenCalledWith('c5');
    expect(m.vm.cards.map((c) => c.id)).not.toContain('c5');
    expect(push).toHaveBeenCalledWith({ pathname: '/conversation', params: { ask: '19-22 Dec' } });
    await m.unmount();
  });

  it('keeps an ask card and opens nothing when the Pond refuses, and sends nothing with no choice', async () => {
    pond.ideaCards.mockResolvedValue(readIdeaCardSet({ ...wire, cards: [...wire.cards, askWire] }));
    const m = await mounted();
    const card = m.vm.cards.find((c) => c.id === 'c5')!;
    await act(async () => {
      await m.vm.actions.answerAsk(card, []);
    });
    expect(pond.doIdeaCard).not.toHaveBeenCalled();
    pond.doIdeaCard.mockRejectedValue(new ApiError('POST → 409', 409, null));
    await act(async () => {
      await m.vm.actions.answerAsk(card, ['12-15 Dec']);
    });
    expect(m.vm.cards.map((c) => c.id)).toContain('c5');
    expect(push).not.toHaveBeenCalled();
    await m.unmount();
  });

  it('opens the composer for an ask card’s Other', async () => {
    const m = await mounted();
    act(() => m.vm.actions.askOther());
    expect(push).toHaveBeenCalledWith('/conversation');
    await m.unmount();
  });

  it('goes deeper: opens the plan the Pond made', async () => {
    const m = await mounted();
    pond.doIdeaCard.mockResolvedValue({ card: null, result: { kind: 'go_deeper', prompt: null, anchorId: 'a9', watchId: null } });
    await act(async () => {
      await m.vm.actions.doIt(m.vm.cards[0]);
    });
    expect(push).toHaveBeenCalledWith({ pathname: '/(stack)/goose-anchor', params: { id: 'a9' } });
    await m.unmount();
  });

  it('goes deeper on any card: the plan opens and the card is kept', async () => {
    const m = await mounted();
    const card = m.vm.cards[0];
    pond.deeperIdeaCard.mockResolvedValue({ card, anchorId: 'a7' });
    await act(async () => {
      await m.vm.actions.deeper(card);
    });
    expect(pond.deeperIdeaCard).toHaveBeenCalledWith('c1');
    expect(push).toHaveBeenCalledWith({ pathname: '/(stack)/goose-anchor', params: { id: 'a7' } });
    expect(m.vm.cards.map((c) => c.id)).toEqual(['c1', 'c2']);
    await m.unmount();
  });

  it('says what a reminder action did, and opens nothing', async () => {
    const m = await mounted();
    pond.doIdeaCard.mockResolvedValue({ card: null, result: { kind: 'reminder', prompt: null, anchorId: null, watchId: null } });
    await act(async () => {
      await m.vm.actions.doIt(m.vm.cards[0]);
    });
    expect(push).not.toHaveBeenCalled();
    expect(currentSnackbar()?.message).toBe('Reminder set');
    await m.unmount();
  });

  it('saves a new card and unsaves a saved one', async () => {
    const m = await mounted();
    const [fresh, saved] = m.vm.cards;
    pond.saveIdeaCard.mockImplementation(async (id: string, on: boolean) => ({ ...(id === 'c1' ? fresh : saved), state: on ? 'saved' : 'new' }));
    await act(async () => {
      await m.vm.actions.toggleSave(fresh);
    });
    expect(pond.saveIdeaCard).toHaveBeenCalledWith('c1', true);
    await act(async () => {
      await m.vm.actions.toggleSave(saved);
    });
    expect(pond.saveIdeaCard).toHaveBeenCalledWith('c2', false);
    expect(m.vm.cards.map((c) => [c.id, c.state])).toEqual([
      ['c1', 'saved'],
      ['c2', 'new'],
    ]);
    await m.unmount();
  });

  it('dismisses with the chips and the words, and puts the card back when the Pond refuses', async () => {
    pond.dismissIdeaCard.mockResolvedValueOnce(undefined);
    const m = await mounted();
    await act(async () => {
      await m.vm.actions.dismiss(m.vm.cards[0], ['too_generic', 'bad_timing'], '  not this month ');
    });
    expect(pond.dismissIdeaCard).toHaveBeenCalledWith('c1', { reasons: ['too_generic', 'bad_timing'], text: 'not this month' });
    expect(m.vm.cards.map((c) => c.id)).toEqual(['c2']);

    pond.dismissIdeaCard.mockRejectedValueOnce(new ApiError('POST → 500', 500, null));
    await act(async () => {
      await m.vm.actions.dismiss(m.vm.cards[0], [], '');
    });
    expect(pond.dismissIdeaCard).toHaveBeenLastCalledWith('c2', { reasons: [] });
    expect(m.vm.cards.map((c) => c.id)).toEqual(['c2']);
    expect(currentSnackbar()?.tone).toBe('danger');
    await m.unmount();
  });
});
