/**
 * The hub probe: a Pond that serves My Goose says which parts, and anything else is no hub.
 */

import { readHub } from '@/models/hub';

describe('reading /me/hub', () => {
  it('keeps the parts the Pond says it serves', () => {
    expect(readHub({ version: 1, interests: true, news: true, todos: false, cart: true, connectors: true, ideas: false, catalog: true })).toEqual({
      version: 1,
      interests: true,
      news: true,
      todos: false,
      cart: true,
      connectors: true,
      ideas: false,
      catalog: true,
      about: false,
      interview: false,
      screenshots: false,
      activity: false,
      anchors: false,
      facts: false,
      questions: false,
      captures: false,
      agents: false,
      ledger: false,
      intentions: false,
      engine_log: false,
      cards: [],
      ideaCards: false,
    });
  });

  it('reads the idea engine parts a newer Pond serves', () => {
    const hub = readHub({ version: 1, anchors: true, facts: true, questions: true, captures: true, agents: true, ledger: false, intentions: true, engine_log: true });
    expect(hub).toMatchObject({ anchors: true, facts: true, questions: true, captures: true, agents: true, ledger: false, intentions: true, engine_log: true });
  });

  it('reads a part left out, or sent as anything but true, as not served', () => {
    const hub = readHub({ version: 2, news: 'yes', todos: 1 });
    expect(hub).toMatchObject({ version: 2, news: false, todos: false, cart: false });
  });

  it('is no hub at all without a version, or for a page that is not the hub', () => {
    expect(readHub({ news: true })).toBeNull();
    expect(readHub('<html>')).toBeNull();
    expect(readHub(null)).toBeNull();
  });
});
