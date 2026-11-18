/**
 * The question card: the header chip and the question, Goose's pick first and marked, the focused
 * option's preview, a pager for a batch, and Done and Send wired to their own actions.
 */
import '@/services/i18n';
import React from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { InkProvider } from '@jarida/ink/native';

import { readQuestion, type Question } from '@/models/questions';
import { EMPTY_DRAFT, type AnswerDraft } from '@/view-models/use-questions';
import { AnswerLines, QuestionPager, previewOf, type QuestionPagerProps } from '../question-card';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
jest.mock('@/services/haptics', () => ({ selectionTick: jest.fn().mockResolvedValue(undefined), tap: jest.fn().mockResolvedValue(undefined), toggle: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/components/ui/g-icon', () => ({ GIcon: () => null }));
jest.mock('@/components/patterns/pond-picture', () => ({ PondPicture: () => null }));
jest.mock('@/view-models/use-page-pictures', () => ({ usePagePictures: () => [] }));

const dates = readQuestion({
  id: 'q1',
  header: 'Dates',
  text: 'When do you go?',
  options: [
    { label: '12-15 Dec', description: 'School holidays' },
    { label: '19-22 Dec', description: 'Christmas week', preview: { kind: 'draft', text: 'Day 1: the train to Mombasa' } },
  ],
  recommended: 1,
})!;
const stay = readQuestion({
  id: 'q2',
  header: 'Stay',
  text: 'Where will you stay?',
  options: [{ label: 'Kenyaways', description: 'On the beach', preview: { kind: 'place', name: 'Kenyaways', price: 'KSh 9,000' } }, 'A friend'],
  multi: true,
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

function press(tree: ReactTestRenderer, label: string) {
  const target = tree.root.findAll((n) => typeof n.props.onPress === 'function' && words(n).includes(label))[0];
  if (!target) throw new Error(`nothing to press: ${label}`);
  act(() => target.props.onPress());
}

function render(questions: Question[], over: Partial<QuestionPagerProps> = {}) {
  const props: QuestionPagerProps = {
    questions,
    draftOf: () => EMPTY_DRAFT,
    onChoose: jest.fn(),
    onOther: jest.fn(),
    onOtherText: jest.fn(),
    onSubmit: jest.fn(),
    onEnough: jest.fn(),
    busy: null,
    canSend: true,
    ...over,
  };
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <InkProvider scheme="light">
        <QuestionPager {...props} />
      </InkProvider>,
    );
  });
  return { tree, props };
}

// Ink's icons have no native renderer under Jest, and say so each time one is drawn.
beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => undefined));
afterEach(() => jest.restoreAllMocks());

describe('the question card', () => {
  it('shows the header, the question, and Goose’s pick first, marked, with each description', () => {
    const { tree } = render([dates]);
    const shown = words(tree.root);
    for (const part of ['Dates', 'When do you go?', 'Recommended', 'Christmas week', 'School holidays']) expect(shown).toContain(part);
    expect(shown.indexOf('19-22 Dec')).toBeLessThan(shown.indexOf('12-15 Dec'));
    expect(shown).toContain('Other');
    act(() => tree.unmount());
  });

  it('shows the recommended option’s preview until another is chosen', () => {
    const { tree } = render([dates]);
    expect(words(tree.root)).toContain('Day 1: the train to Mombasa');
    act(() => tree.unmount());
    const chosen: AnswerDraft = { choices: ['12-15 Dec'], other: false, text: '' };
    expect(previewOf(dates, chosen, null)).toBeNull();
    expect(previewOf(stay, EMPTY_DRAFT, 'Kenyaways')).toMatchObject({ kind: 'place', name: 'Kenyaways' });
  });

  it('pages through a batch, one question at a time', () => {
    const { tree } = render([dates, stay]);
    expect(words(tree.root)).toContain('1 of 2');
    expect(words(tree.root)).not.toContain('Where will you stay?');
    press(tree, 'Next');
    const shown = words(tree.root);
    expect(shown).toContain('2 of 2');
    expect(shown).toContain('Where will you stay?');
    expect(shown).toContain('Pick any that fit');
    act(() => tree.unmount());
  });

  it('passes a choice up, and wires Send and Done to their own actions', () => {
    const { tree, props } = render([dates]);
    press(tree, '12-15 Dec');
    expect(props.onChoose).toHaveBeenCalledWith(dates, '12-15 Dec');
    press(tree, 'Send');
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
    press(tree, 'Done');
    expect(props.onEnough).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  it('holds Send while there is nothing to send or the batch is not ready', () => {
    const sendOf = (tree: ReactTestRenderer) => tree.root.findAll((n) => n.props.accessibilityRole === 'button' && words(n).includes('Send'))[0];
    const empty = render([dates], { canSend: false });
    expect(sendOf(empty.tree).props.accessibilityState).toMatchObject({ disabled: true });
    act(() => empty.tree.unmount());
    const early = render([dates], { ready: false });
    expect(words(early.tree.root)).toContain('Getting these ready to send');
    expect(sendOf(early.tree).props.accessibilityState).toMatchObject({ disabled: true });
    act(() => early.tree.unmount());
  });

  it('shows sent answers as each header with what was said', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(
        <InkProvider scheme="light">
          <AnswerLines lines={[{ header: 'Dates', answer: '12-15 Dec' }]} />
        </InkProvider>,
      );
    });
    expect(words(tree.root)).toContain('Your answers');
    expect(words(tree.root)).toContain('12-15 Dec');
    act(() => tree.unmount());
  });
});
