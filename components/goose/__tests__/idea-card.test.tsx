/**
 * A collapsed idea card says what kind it is, the idea, why and from where, and the when, where,
 * cost and effort it has; Do it wears the action's label, and Go deeper is offered once on every card.
 */
import '@/services/i18n';
import React from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { InkProvider } from '@jarida/ink/native';

import { readIdeaCard, type IdeaCard } from '@/models/idea-cards';
import { IdeaCardView } from '../idea-cards';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
jest.mock('@/services/haptics', () => ({
  selectionTick: jest.fn().mockResolvedValue(undefined),
  confirm: jest.fn().mockResolvedValue(undefined),
  tap: jest.fn().mockResolvedValue(undefined),
  toggle: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/components/ui/g-icon', () => ({ GIcon: () => null }));
jest.mock('@/components/patterns/pond-picture', () => ({ PondPicture: () => null }));
jest.mock('@/view-models/use-page-pictures', () => ({ usePagePictures: () => [] }));

const card = readIdeaCard({
  id: 'c1',
  kind: 'do',
  title: 'Walk the Karura waterfall trail',
  why: { text: 'You said you want more time outdoors', source: { kind: 'memory', label: 'More time outside' } },
  when: 'Saturday 2 pm',
  where: 'Karura Forest',
  cost: 'KSh 600 entry',
  effort: '2 hours',
  action: { kind: 'reminder', label: 'Remind me Saturday' },
  sources: [{ kind: 'web', title: 'Karura Forest entry fees', url: 'https://karurafriends.org/fees' }],
  notes: { found: 'Entry is KSh 600.', next: '', caveats: '' },
  state: 'new',
})!;

function words(node: ReactTestInstance): string {
  const out: string[] = [];
  const walk = (n: ReactTestInstance | string) => {
    if (typeof n === 'string') out.push(n);
    else n.children.forEach(walk);
  };
  walk(node);
  return out.join(' ');
}

function render(shown: IdeaCard, onDo = jest.fn()) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <InkProvider scheme="light">
        <IdeaCardView card={shown} busy={null} onDo={onDo} onDeeper={jest.fn()} onSave={jest.fn()} onNotThis={jest.fn()} onOpen={jest.fn()} />
      </InkProvider>,
    );
  });
  return tree;
}

describe('a collapsed idea card', () => {
  it('shows the kind, title, why with its source, and the structured fields', () => {
    const tree = render(card);
    const shown = words(tree.root);
    for (const part of ['Something to do', 'Walk the Karura waterfall trail', 'You said you want more time outdoors', 'From what you said: More time outside', 'Saturday 2 pm, Karura Forest', 'KSh 600 entry, 2 hours']) {
      expect(shown).toContain(part);
    }
    // The notes wait for the card to be opened.
    expect(shown).not.toContain('Entry is KSh 600.');
    act(() => tree.unmount());
  });

  it('labels Do it with the action, and offers Go deeper, Save and Not this', () => {
    const onDo = jest.fn();
    const tree = render(card, onDo);
    const shown = words(tree.root);
    expect(shown).toContain('Remind me Saturday');
    expect(shown).toContain('Save');
    expect(shown).toContain('Not this');
    expect(shown).toContain('Go deeper');
    act(() => tree.unmount());
  });

  it('offers Go deeper once for a go-deeper action, and draws no field it lacks', () => {
    const deeper: IdeaCard = { ...card, when: null, where: null, cost: null, effort: null, action: { kind: 'go_deeper', label: '', prompt: null, text: null, due: null, url: null, question: null } };
    const tree = render(deeper);
    const shown = words(tree.root);
    expect(shown.split('Go deeper').length - 1).toBe(1);
    expect(shown).not.toContain('Karura Forest,');
    expect(shown).not.toContain('KSh 600 entry');
    act(() => tree.unmount());
  });
});

const ask = (multi: boolean) =>
  readIdeaCard({
    id: 'c5',
    kind: 'ask',
    title: 'When is the Diani trip?',
    why: { text: 'Goose needs the dates to book', source: { kind: 'plan', label: 'Diani trip' } },
    sources: [{ kind: 'plan', title: 'Diani trip' }],
    action: {
      kind: 'chat',
      label: 'Answer',
      prompt: 'Diani dates',
      question: { header: 'Dates', text: 'When do you go?', options: [{ label: '12-15 Dec', description: 'School holidays' }, { label: '19-22 Dec', description: 'Christmas' }], recommended: 1, multi },
    },
    state: 'new',
  })!;

function renderAsk(shown: IdeaCard) {
  const props = { onDo: jest.fn(), onAnswer: jest.fn(), onAskOther: jest.fn() };
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <InkProvider scheme="light">
        <IdeaCardView card={shown} busy={null} {...props} onDeeper={jest.fn()} onSave={jest.fn()} onNotThis={jest.fn()} onOpen={jest.fn()} />
      </InkProvider>,
    );
  });
  return { tree, ...props };
}

function press(tree: ReactTestRenderer, label: string) {
  const target = tree.root.findAll((n) => typeof n.props.onPress === 'function' && words(n).includes(label)).pop();
  if (!target) throw new Error(`nothing to press: ${label}`);
  act(() => target.props.onPress());
}

describe('an ask card', () => {
  // Ink's icons have no native renderer under Jest, and say so each time one is drawn.
  beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('shows its question inline on Do it, and sends the one option picked', () => {
    const { tree, onDo, onAnswer } = renderAsk(ask(false));
    expect(words(tree.root)).not.toContain('When do you go?');
    press(tree, 'Answer');
    expect(onDo).not.toHaveBeenCalled();
    const shown = words(tree.root);
    expect(shown).toContain('When do you go?');
    expect(shown).toContain('Recommended');
    expect(shown.indexOf('19-22 Dec')).toBeLessThan(shown.indexOf('12-15 Dec'));
    press(tree, '12-15 Dec');
    expect(onAnswer).toHaveBeenCalledWith(['12-15 Dec']);
    act(() => tree.unmount());
  });

  it('opens the composer for Other', () => {
    const { tree, onAnswer, onAskOther } = renderAsk(ask(false));
    press(tree, 'Answer');
    press(tree, 'Other');
    expect(onAskOther).toHaveBeenCalledTimes(1);
    expect(onAnswer).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('collects several options when the question allows, and sends them together', () => {
    const { tree, onAnswer } = renderAsk(ask(true));
    press(tree, 'Answer');
    press(tree, '12-15 Dec');
    press(tree, '19-22 Dec');
    expect(onAnswer).not.toHaveBeenCalled();
    press(tree, 'Send');
    expect(onAnswer).toHaveBeenCalledWith(['12-15 Dec', '19-22 Dec']);
    act(() => tree.unmount());
  });

  it('does as before when the action carries no question', () => {
    const plain: IdeaCard = { ...ask(false), action: { ...ask(false).action!, question: null } };
    const { tree, onDo, onAnswer } = renderAsk(plain);
    press(tree, 'Answer');
    expect(onDo).toHaveBeenCalledTimes(1);
    expect(onAnswer).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });
});
