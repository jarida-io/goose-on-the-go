// Goose's chat questions the member answered by typing instead of using the card. The Pond takes
// the typed message as "Other" for the batch's first open question and says so on the message's
// own short stream; the card, drawn from the other, still-waiting stream, learns of it here.

export interface TypedAnswer {
  /** Null when the Pond did not name the batch: then it is whichever one the conversation waited on. */
  batchId: string | null;
  text: string;
}

const bySession = new Map<string, TypedAnswer>();
const listeners = new Set<() => void>();

export function markAskAnswered(sessionId: string, answer: TypedAnswer): void {
  bySession.set(sessionId, answer);
  for (const listener of listeners) listener();
}

/** The latest typed answer in a conversation, if any. The same object until it changes. */
export function askAnsweredIn(sessionId: string | null): TypedAnswer | null {
  return sessionId ? (bySession.get(sessionId) ?? null) : null;
}

export function onAskAnswered(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** For tests: nothing answered. */
export function resetAnsweredAsks(): void {
  bySession.clear();
}
