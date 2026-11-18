/**
 * Structured questions read the same from `/me/questions` and from a chat `ask` call: options as
 * objects or as the plain strings older rows hold, previews of each kind, Goose's pick first, and
 * nothing a surface cannot draw or answer.
 */

import { matchBatch, readAnswerLines, readAskInput, readAskResult, watchAsks, readOption, readPreview, readQuestion, readQuestionBatches, shownOptions, type QuestionBatch } from '@/models/questions';

describe('an option', () => {
  it('reads a plain string as its label alone', () => {
    expect(readOption(' A villa ')).toEqual({ label: 'A villa', description: '', preview: null });
    expect(readOption('  ')).toBeNull();
  });

  it('reads an object with its description and preview, and needs a label', () => {
    expect(readOption({ label: 'Galu', description: 'Quieter beach', preview: { kind: 'draft', text: 'Day 1: arrive' } })).toEqual({
      label: 'Galu',
      description: 'Quieter beach',
      preview: { kind: 'draft', text: 'Day 1: arrive' },
    });
    expect(readOption({ description: 'No label' })).toBeNull();
    expect(readOption(7)).toBeNull();
  });
});

describe('a preview', () => {
  it('reads a draft, cut to the Pond’s 600 characters', () => {
    const long = readPreview({ kind: 'draft', text: 'x'.repeat(700) });
    expect(long?.kind === 'draft' && long.text.length).toBe(601);
    expect(readPreview({ kind: 'draft', text: '' })).toBeNull();
  });

  it('reads a place, with a price in any shape and only a picture the Pond serves', () => {
    expect(readPreview({ kind: 'place', name: 'Kenyaways', price: 'KSh 9,000 a night', url: 'https://kenyaways.com', image_url: '/api/v1/pictures/k1' })).toEqual({
      kind: 'place',
      name: 'Kenyaways',
      price: 'KSh 9,000 a night',
      url: 'https://kenyaways.com',
      imagePath: '/api/v1/pictures/k1',
    });
    expect(readPreview({ kind: 'place', name: 'Almanara', price: { amount: 30000, currency: 'KSh' }, image_url: 'https://cdn.example.com/a.jpg', url: 'javascript:alert(1)' })).toEqual({
      kind: 'place',
      name: 'Almanara',
      price: 'KSh 30,000',
      url: null,
      imagePath: null,
    });
    expect(readPreview({ kind: 'place', price: 4 })).toBeNull();
  });

  it('reads a table, held to 4 columns and 6 rows, numbers as words', () => {
    const table = readPreview({
      kind: 'table',
      columns: ['Option', 'Cost', 'Time', 'Distance', 'Extra'],
      rows: [['Bus', 1500, '9 h', '580 km', 'cut'], ...Array.from({ length: 8 }, (_, i) => [`Row ${i}`])],
    });
    expect(table).toMatchObject({ kind: 'table', columns: ['Option', 'Cost', 'Time', 'Distance'] });
    expect(table?.kind === 'table' && table.rows[0]).toEqual(['Bus', '1500', '9 h', '580 km']);
    expect(table?.kind === 'table' && table.rows).toHaveLength(6);
    expect(readPreview({ kind: 'table', columns: [], rows: [['a']] })).toBeNull();
  });

  it('reads an unknown kind as none', () => {
    expect(readPreview({ kind: 'video', url: 'https://example.com' })).toBeNull();
    expect(readPreview(null)).toBeNull();
  });
});

describe('a question', () => {
  it('keeps the header, the options in order, Goose’s pick and multi', () => {
    const q = readQuestion({
      id: 'q1',
      header: 'Dates',
      text: 'When do you go?',
      options: [{ label: '12-15 Dec', description: 'School holidays' }, { label: '19-22 Dec', description: 'Christmas week' }],
      recommended: 1,
      multi: false,
    });
    expect(q).toMatchObject({ id: 'q1', header: 'Dates', recommended: 1, multi: false });
    expect(q?.options.map((o) => o.label)).toEqual(['12-15 Dec', '19-22 Dec']);
  });

  it('drops an option meaning Other and a repeated one, and keeps the pick pointing at the same option', () => {
    const q = readQuestion({ id: 'q1', text: 'Where?', options: ['Other', 'Diani', 'diani', 'Watamu'], recommended: 3 });
    expect(q?.options.map((o) => o.label)).toEqual(['Diani', 'Watamu']);
    expect(q?.recommended).toBe(1);
  });

  it('reads a pick that is out of range, or names a dropped option, as none', () => {
    expect(readQuestion({ id: 'q', text: 'Where?', options: ['A', 'B'], recommended: 5 })?.recommended).toBeNull();
    expect(readQuestion({ id: 'q', text: 'Where?', options: ['Other', 'B'], recommended: 0 })?.recommended).toBeNull();
    expect(readQuestion({ id: 'q', text: 'Where?', options: ['A', 'B'], recommended: '1' })?.recommended).toBeNull();
  });

  it('needs an id and words', () => {
    expect(readQuestion({ text: 'Where?', options: ['A'] })).toBeNull();
    expect(readQuestion({ id: 'q', options: ['A'] })).toBeNull();
  });

  it('lists Goose’s pick first, marked', () => {
    const q = readQuestion({ id: 'q', text: 'Where?', options: ['A', 'B', 'C'], recommended: 2 })!;
    expect(shownOptions(q).map((o) => [o.option.label, o.recommended])).toEqual([
      ['C', true],
      ['A', false],
      ['B', false],
    ]);
  });
});

describe('the batches', () => {
  it('read purpose, chat, round and state, an unknown state as open, and drop an empty batch', () => {
    const batches = readQuestionBatches({
      batches: [
        { id: 'b1', purpose: 'chat', anchor_id: null, session_id: 's1', round: 2, title: 'Diani', state: 'waiting', questions: [{ id: 'q', text: 'When?', options: ['A', 'B'] }] },
        { id: 'b2', purpose: 'new_kind', state: 'archived', questions: [{ id: 'q2', text: 'Where?', options: ['A', 'B'] }] },
        { id: 'b3', purpose: 'anchor', questions: [] },
      ],
    });
    expect(batches.map((b) => [b.id, b.purpose, b.sessionId, b.round, b.state])).toEqual([
      ['b1', 'chat', 's1', 2, 'waiting'],
      ['b2', 'profile', null, 1, 'open'],
    ]);
  });
});

describe('a chat ask call', () => {
  const input = {
    questions: [
      { header: 'Dates', text: 'When do you go?', options: [{ label: '12-15 Dec', description: 'School holidays' }, { label: '19-22 Dec', description: 'Christmas' }], recommended: 0 },
      { header: 'Budget', text: 'What budget?', options: ['Under KSh 20,000', 'More'], multi: false },
    ],
  };

  it('reads its questions from the input object or its JSON text, and nothing from anything else', () => {
    expect(readAskInput(input).map((q) => q.header)).toEqual(['Dates', 'Budget']);
    expect(readAskInput(JSON.stringify(input)).map((q) => q.header)).toEqual(['Dates', 'Budget']);
    expect(readAskInput('{not json')).toEqual([]);
    expect(readAskInput({})).toEqual([]);
  });

  it('finds the stored chat batch whose questions were all asked, the fullest one', () => {
    const asked = readAskInput(input);
    const batch = (id: string, texts: string[], purpose = 'chat'): QuestionBatch =>
      readQuestionBatches({ batches: [{ id, purpose, session_id: 's1', questions: texts.map((text, i) => ({ id: `${id}-${i}`, text, options: ['A', 'B'] })) }] })[0];
    const cut = batch('cut', ['When do you go?']);
    const whole = batch('whole', ['when do you go? ', 'What budget?']);
    const other = batch('other', ['Who is coming?']);
    const plan = batch('plan', ['When do you go?', 'What budget?'], 'anchor');
    expect(matchBatch([other, cut, whole, plan], asked)?.id).toBe('whole');
    expect(matchBatch([other, cut], asked)?.id).toBe('cut');
    expect(matchBatch([other, plan], asked)).toBeNull();
  });

  it('reads the answers a finished call returned, and a refusal or the waiting note as none', () => {
    const asked = readAskInput(input);
    expect(readAnswerLines('Dates: 12-15 Dec\nBudget: Other: "about 30k"', asked)).toEqual([
      { header: 'Dates', answer: '12-15 Dec' },
      { header: 'Budget', answer: 'Other: "about 30k"' },
    ]);
    expect(readAnswerLines("Not answered yet; the questions wait in My Goose. Say you'll carry on when they answer.", asked)).toEqual([]);
    expect(readAnswerLines(undefined, asked)).toEqual([]);
  });
});

describe('how a finished ask call ended', () => {
  const asked = readAskInput({ questions: [{ header: 'Dates', text: 'When?', options: ['A', 'B'] }, { header: 'Budget', text: 'How much?', options: ['A', 'B'] }] });

  it('reads answer lines, the go-ahead, and the waiting note, each as its own', () => {
    expect(readAskResult('Dates: 12-15 Dec\nBudget: Other: "about 30k"', asked)).toEqual({
      kind: 'answers',
      lines: [
        { header: 'Dates', answer: '12-15 Dec' },
        { header: 'Budget', answer: 'Other: "about 30k"' },
      ],
    });
    expect(readAskResult('The member wants you to go ahead with what you have.', asked)).toEqual({ kind: 'enough' });
    expect(readAskResult("Not answered yet; the questions wait in My Goose. Say you'll carry on when they answer.", asked)).toEqual({ kind: 'waiting' });
    expect(readAskResult('Refused: asked already.', asked)).toEqual({ kind: 'other' });
    expect(readAskResult(undefined, asked)).toEqual({ kind: 'other' });
  });
});

describe('the ask calls a stream waits on', () => {
  it('holds an ask call from its tool_call to its tool_result, and nothing else', () => {
    let held: ReadonlySet<string> = new Set();
    held = watchAsks(held, { type: 'tool_call', tool: 'giap-weather__get_current_weather', id: 'w1' });
    expect(held.size).toBe(0);
    held = watchAsks(held, { type: 'tool_call', tool: 'giap-questions__ask', id: 'a1' });
    expect([...held]).toEqual(['a1']);
    expect(watchAsks(held, { type: 'tool_call', tool: 'giap-questions__ask', id: 'a1' })).toBe(held);
    held = watchAsks(held, { type: 'tool_result', tool: 'giap-weather__get_current_weather', id: 'w1' });
    expect([...held]).toEqual(['a1']);
    held = watchAsks(held, { type: 'tool_result', tool: 'giap-questions__ask', id: 'a1' });
    expect(held.size).toBe(0);
  });
});
