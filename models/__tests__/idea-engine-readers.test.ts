/**
 * The idea engine's other shapes, read defensively: amounts stay the Pond's decimal strings,
 * screenshots read as on unless the Pond says off, and an unknown state offers the least.
 */

import { cleanAlbums, readCaptures, MAX_ALBUMS } from '@/models/captures';
import { readEngineJobs, readIntentions } from '@/models/engine-log';
import { moneyText, plainAmount, readLedger, readSpecialists, stepMonth } from '@/models/specialists';

describe('the ledger', () => {
  it('keeps amounts as decimal strings and drops an entry whose amount is not one', () => {
    const ledger = readLedger({
      month: '2026-11',
      entries: [
        { id: 'e1', occurred_on: '2026-11-03', payee: 'Naivas', amount: '4200.50', currency: 'KES', category: 'groceries', anchor_id: null, note: null },
        { id: 'e2', occurred_on: '2026-11-04', payee: 'Refund', amount: '-300', currency: 'KES', category: 'made_up' },
        { id: 'e3', amount: 'about 40' },
      ],
      totals: [{ currency: 'KES', total: '3900.50', by_category: [{ category: 'groceries', total: '4200.50' }] }],
    });
    expect(ledger.entries.map((e) => [e.id, e.amount, e.category])).toEqual([
      ['e1', '4200.50', 'groceries'],
      ['e2', '-300', 'other'],
    ]);
    expect(ledger.totals[0]).toEqual({ currency: 'KES', total: '3900.50', byCategory: [{ category: 'groceries', total: '4200.50' }] });
  });

  it('takes a typed amount only as a plain number, and writes one with its currency', () => {
    expect(plainAmount(' 4,200.50 ')).toBe('4200.50');
    expect(plainAmount('42 shillings')).toBeNull();
    expect(moneyText('4200.50', 'KES', 'en')).toBe('KES 4,200.50');
    expect(moneyText('-50000', 'UGX', 'en')).toBe('UGX -50,000');
  });

  it('steps a month back across a year', () => {
    expect(stepMonth('2026-01', -1)).toBe('2025-12');
    expect(stepMonth('2026-11', 1)).toBe('2026-12');
  });

  it('reads the specialists, an unknown state as off', () => {
    expect(readSpecialists({ agents: [{ id: 'budget', title: 'Budget', about: 'Keeps a ledger', state: 'offered', why: 'Three receipts' }, { id: 'trip', title: 'Trips', state: 'sideways' }] })).toEqual([
      { id: 'budget', title: 'Budget', about: 'Keeps a ledger', state: 'offered', why: 'Three receipts' },
      { id: 'trip', title: 'Trips', about: '', state: 'off', why: '' },
    ]);
  });
});

describe('captures', () => {
  it('reads screenshots as on unless the Pond says off', () => {
    expect(readCaptures({ settings: {}, available: true, pending: 2, captures: [{ id: 'c1', kind: 'photo', album: 'Receipts', details: { names: ['Ann'] } }] })).toMatchObject({
      settings: { screenshots: true, albums: [] },
      available: true,
      pending: 2,
      captures: [{ id: 'c1', kind: 'photo', album: 'Receipts', details: { names: ['Ann'], dates: [] } }],
    });
    expect(readCaptures({ settings: { screenshots: false, albums: ['Receipts'] } }).settings).toEqual({ screenshots: false, albums: ['Receipts'] });
  });

  it('sends an album list the Pond will take', () => {
    expect(cleanAlbums([' Receipts ', 'Receipts', '', 'x'.repeat(70)])).toEqual(['Receipts', 'x'.repeat(60)]);
    expect(cleanAlbums(Array.from({ length: 25 }, (_, i) => `Album ${i}`))).toHaveLength(MAX_ALBUMS);
  });
});

describe('what Goose worked on', () => {
  it('reads runs and waiting jobs, an unknown intention state as not withdrawable', () => {
    expect(readEngineJobs({ jobs: [{ id: 'j1', kind: 'deliverable', subject: 'Plan for Diani trip', state: 'unsure', rounds: 3, objections: [{ kind: 'vague', about: 'Too broad', fix: 'Name the hotels' }], deliverable_id: 'd1' }] })[0]).toMatchObject({
      state: 'unsure',
      rounds: 3,
      objections: [{ about: 'Too broad' }],
      deliverableId: 'd1',
    });
    expect(readIntentions({ intentions: [{ id: 'i1', act: 'push', text: 'Leave by 7:15', when: 'tomorrow at 7am', state: 'waiting' }, { id: 'i2', act: 'teleport', text: 'x', state: 'later' }] }).map((i) => [i.act, i.state])).toEqual([
      ['push', 'waiting'],
      ['push', 'done'],
    ]);
  });
});
