// What a Pond serves of My Goose, from `GET /me/hub`. A part the Pond leaves out, or sends as
// anything but `true`, is a part it does not serve, so the phone never offers what it cannot do.

import { readCardKinds, type CardKind } from './cards';
import { count, record } from './me-read';

export interface MeHub {
  version: number;
  interests: boolean;
  news: boolean;
  todos: boolean;
  cart: boolean;
  connectors: boolean;
  ideas: boolean;
  catalog: boolean;
  /** The member's profile under headings, `/me/about`. */
  about: boolean;
  /** The one structured interview, `/me/interview`. */
  interview: boolean;
  /** Ideas from screenshots, `/me/screenshots`. */
  screenshots: boolean;
  /** What Goose did by itself, `/me/goose/activity`. */
  activity: boolean;
  /** Plans and what Goose makes for them: `/me/anchors*` and `/me/deliverables*`. */
  anchors: boolean;
  /** The fact sheet and the don't-list: `/me/facts*` and `/me/dont*`. */
  facts: boolean;
  /** Goose's question batches, `/me/questions*`. */
  questions: boolean;
  /** Screenshots and photos sent to Goose, `/me/captures*`. */
  captures: boolean;
  /** The specialists, `/me/agents*`. */
  agents: boolean;
  /** The Budget ledger, `/me/ledger*`. */
  ledger: boolean;
  /** The heartbeat's waiting jobs, `/me/intentions*`. */
  intentions: boolean;
  /** Every maker-and-critic run, `/me/engine/jobs`. */
  engine_log: boolean;
  /** The kinds of card this Pond can send to chat; empty on a Pond that sends none. */
  cards: CardKind[];
  /** Idea cards, `/me/idea-cards*`. */
  ideaCards: boolean;
}

export type HubPart = Exclude<keyof MeHub, 'version' | 'cards' | 'ideaCards'>;

export const HUB_PARTS: readonly HubPart[] = [
  'interests',
  'news',
  'todos',
  'cart',
  'connectors',
  'ideas',
  'catalog',
  'about',
  'interview',
  'screenshots',
  'activity',
  'anchors',
  'facts',
  'questions',
  'captures',
  'agents',
  'ledger',
  'intentions',
  'engine_log',
];

/** Null for an answer that is not the hub at all, which the phone treats as no hub. */
export function readHub(raw: unknown): MeHub | null {
  const r = record(raw);
  if (!r) return null;
  const version = count(r.version);
  if (version < 1) return null;
  const hub = { version } as MeHub;
  for (const part of HUB_PARTS) hub[part] = r[part] === true;
  hub.cards = readCardKinds(r.cards);
  hub.ideaCards = r.idea_cards === true;
  return hub;
}
