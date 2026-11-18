// A card the member sends to chat: an idea, a news story, a digest, a to-do, a watched link or a
// web watch. The phone names the card; the Pond reads it and gives the turn what the member read
// with the notes Goose kept (pond docs/architecture/my-goose-hub.md, part 6a).

import { list, oneOf, record, text } from './me-read';

export const CARD_KINDS = ['idea', 'news', 'digest', 'todo', 'cart', 'watch', 'anchor', 'deliverable'] as const;
export type CardKind = (typeof CARD_KINDS)[number];

/** A card as a chat turn names it. `title` is only for the chip the phone shows. */
export interface CardRef {
  kind: CardKind;
  id: string;
  title: string;
}

/** What a chat about a card is given: `GET /me/cards/{kind}/{id}`. */
export interface ContextCard {
  kind: string;
  title: string;
  content: string;
  notes: string;
}

export function readCard(raw: unknown): ContextCard | null {
  const r = record(raw);
  const title = text(r?.title);
  if (!r || !title) return null;
  return { kind: text(r.kind), title, content: text(r.content), notes: text(r.notes) };
}

/** The card kinds this Pond can send to chat, from `/me/hub`; none on a Pond that sends none. */
export function readCardKinds(raw: unknown): CardKind[] {
  return list(raw).flatMap((k) => {
    const kind = oneOf(k, CARD_KINDS, 'idea');
    return kind === k ? [kind] : [];
  });
}

/** Route params that carry a card into the conversation screen. */
export function cardParams(card: CardRef): { card_kind: string; card_id: string; card_title: string } {
  return { card_kind: card.kind, card_id: card.id, card_title: card.title };
}

/** The card a conversation was opened with, or null when its params name none. */
export function cardFromParams(params: { card_kind?: string; card_id?: string; card_title?: string }): CardRef | null {
  const id = text(params.card_id);
  const kind = CARD_KINDS.find((k) => k === params.card_kind);
  return id && kind ? { kind, id, title: text(params.card_title) } : null;
}
