// What Home leads with from the idea engine: finished work not yet read, plans Goose offered and
// waits on a yes for, and its open questions, answerable in place. Each part reads only on a Pond
// whose `/me/hub` serves it, so an older Pond's Home is the board it always was.

import { candidates, readyWork, type Anchor, type ReadyWork } from '@/models/anchors';
import { useAnchors, type UseAnchors } from './use-anchors';
import { useHub } from './use-hub';
import { useIdeaCards, type UseIdeaCards } from './use-idea-cards';
import { useQuestions, type UseQuestions } from './use-questions';

export interface UseHomeEngine {
  ready: ReadyWork[];
  offered: Anchor[];
  anchors: UseAnchors;
  questions: UseQuestions;
  /** Idea cards, at the top of Home. */
  cards: UseIdeaCards;
  cardsOn: boolean;
  /** Both reads answered and neither had anything; a failed read is not quiet. */
  quiet: boolean;
}

export function useHomeEngine(): UseHomeEngine {
  const { hub } = useHub();
  const anchorsOn = hub?.anchors === true;
  const questionsOn = hub?.questions === true;
  const anchors = useAnchors(anchorsOn);
  const questions = useQuestions(undefined, questionsOn);
  const cardsOn = hub?.ideaCards === true;
  const cards = useIdeaCards(cardsOn);
  const ready = readyWork(anchors.data);
  const offered = candidates(anchors.data);
  const settled = (on: boolean, r: { loading: boolean; failed: boolean }) => !on || (!r.loading && !r.failed);
  return {
    ready,
    offered,
    anchors,
    questions,
    cards,
    cardsOn,
    quiet: settled(anchorsOn, anchors) && settled(questionsOn, questions) && settled(cardsOn, cards) && cards.cards.length === 0 && ready.length === 0 && offered.length === 0 && questions.count === 0,
  };
}
