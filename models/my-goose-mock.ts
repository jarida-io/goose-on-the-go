// An in-memory Pond for My Goose's hub, answering as docs/MY-GOOSE-HUB.md says the real one will,
// so the Developer toggle can draw every hub screen without a Pond. Its member is Jerry in Nairobi.
// Time is read from the clock at each call, so nothing runs unasked and a test can move the clock.

import { ApiError } from '@/services/api-client';
import type { CartWriteWire, InterestWriteWire, InterviewApproveWire, NewsSettingsWire, StoryVoteWire, TodoAnswerWire, TodoWriteWire } from '@/services/types';

import type { CartItem } from './cart';
import type { CatalogItem } from './catalog';
import type { Connector } from './connectors';
import type { MeHub } from './hub';
import type { Idea } from './ideas';
import type { Interest, InterestInterview, InterviewTurn, Portrait } from './interests';
import { siteOf, type Money } from './me-read';
import type { Digest, DigestSummary, NewsFeed, NewsSettings, Story, StoryDetail } from './news';
import type { Hook, HookSources, Place, Todo, TodoOffer } from './todos';

/** Every `/me` route the screens use, so the real Pond and this one are driven by the same code. */
export interface HubSource {
  hub(): Promise<MeHub | null>;
  interests(): Promise<Interest[]>;
  addInterest(body: InterestWriteWire & { topic: string }): Promise<Interest>;
  editInterest(id: string, body: InterestWriteWire): Promise<Interest>;
  deleteInterest(id: string): Promise<void>;
  interview(): Promise<InterestInterview>;
  startInterview(): Promise<InterestInterview>;
  answerInterview(answer: { text?: string; choices?: string[] }): Promise<InterestInterview>;
  finishInterview(): Promise<InterestInterview>;
  approveInterview(body: InterviewApproveWire): Promise<number>;
  portrait(): Promise<Portrait | null>;
  newsSettings(): Promise<NewsSettings>;
  saveNewsSettings(change: Partial<NewsSettingsWire>): Promise<NewsSettings>;
  news(): Promise<NewsFeed>;
  newsFor(interestId: string): Promise<NewsFeed>;
  markStoryRead(id: string): Promise<void>;
  newsHistory(): Promise<Story[]>;
  storyFeedback(id: string, vote: StoryVoteWire, note?: string): Promise<void>;
  story(id: string): Promise<StoryDetail>;
  digests(): Promise<DigestSummary[]>;
  digest(id: string): Promise<Digest>;
  digestAudio(path: string, signal?: AbortSignal): Promise<ArrayBuffer>;
  speakDigest(id: string): Promise<void>;
  refreshNews(): Promise<void>;
  todos(state: 'open' | 'done' | 'all'): Promise<Todo[]>;
  addTodo(body: TodoWriteWire & { kind: 'todo' | 'reminder'; text: string }): Promise<Todo>;
  editTodo(id: string, body: TodoWriteWire): Promise<Todo>;
  deleteTodo(id: string): Promise<void>;
  answerTodo(id: string, answer: TodoAnswerWire, snoozeMinutes?: number): Promise<Todo>;
  todoOffers(): Promise<TodoOffer[]>;
  acceptTodoOffer(reminderId: string, dueAt?: string): Promise<Todo>;
  declineTodoOffer(reminderId: string): Promise<void>;
  hookSources(): Promise<HookSources>;
  addPlace(body: { label: string; lat: number; lng: number; radius_m?: number }): Promise<Place>;
  deletePlace(id: string): Promise<void>;
  cart(): Promise<CartItem[]>;
  addToCart(body: CartWriteWire & { url: string }): Promise<CartItem>;
  cartItem(id: string): Promise<CartItem>;
  editCartItem(id: string, body: CartWriteWire): Promise<CartItem>;
  deleteCartItem(id: string): Promise<void>;
  checkCartItem(id: string): Promise<CartItem>;
  connectors(): Promise<Connector[]>;
  connectConnector(id: string, fields: Record<string, string | boolean>): Promise<Connector>;
  disconnectConnector(id: string): Promise<Connector>;
  makeWebhook(name: string): Promise<Connector>;
  ideas(): Promise<{ ideas: Idea[]; state: 'idle' | 'thinking' }>;
  ideaGoose(id: string): Promise<Idea>;
  ideaMine(id: string): Promise<{ idea: Idea; todos: Todo[] }>;
  dismissIdea(id: string): Promise<void>;
  refreshIdeas(): Promise<void>;
  catalog(): Promise<CatalogItem[]>;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** How long the mock Pond "writes" the next interview question, a check or an idea. */
export const MOCK_THINK_MS = 2_000;

/** Pictures for the mock only. A real Pond sends its own paths, and the readers keep nothing else. */
const WIKI = 'https://upload.wikimedia.org/wikipedia/commons/thumb';
export const MOCK_PICTURES = {
  fielderHybrid: `${WIKI}/3/3c/2015-2017_Toyota_Corolla_Fielder_Hybrid_G_Aerotourer.jpg/960px-2015-2017_Toyota_Corolla_Fielder_Hybrid_G_Aerotourer.jpg`,
  fielderRear: `${WIKI}/9/9f/2014_Toyota_Corolla_Fielder_S_WXB_rear_right.jpg/960px-2014_Toyota_Corolla_Fielder_S_WXB_rear_right.jpg`,
  fielderBlue: `${WIKI}/9/99/2008_Toyota_Corolla_Fielder_X_G_Edition_blue_rear.jpg/960px-2008_Toyota_Corolla_Fielder_X_G_Edition_blue_rear.jpg`,
  skyline: `${WIKI}/8/82/Nairobi_Skyline_Savannah_Kenya_May19_R1600687.jpg/960px-Nairobi_Skyline_Savannah_Kenya_May19_R1600687.jpg`,
  mini: `${WIKI}/2/28/Mini_Cooper_S_1964_3.jpg/960px-Mini_Cooper_S_1964_3.jpg`,
  assembly: `${WIKI}/f/fe/Kenya_National_Assembly_seating.jpg/960px-Kenya_National_Assembly_seating.jpg`,
  parliament: `${WIKI}/a/ad/Parliament_Buildings%2C_Nairobi%2C_Kenya-21April2010.jpg/960px-Parliament_Buildings%2C_Nairobi%2C_Kenya-21April2010.jpg`,
  decks: `${WIKI}/a/a7/DJ_booth_with_NI_Traktor_Kontrol_S4_%282015-03-13_17.33.34_by_nikkolodeon_%40pixabay_688549%29.jpg/960px-DJ_booth_with_NI_Traktor_Kontrol_S4_%282015-03-13_17.33.34_by_nikkolodeon_%40pixabay_688549%29.jpg`,
  stage: `${WIKI}/c/c2/TNW_Conference_2012_-_Day_1_%286966816426%29.jpg/960px-TNW_Conference_2012_-_Day_1_%286966816426%29.jpg`,
  kicc: `${WIKI}/d/d9/Kenyatta_International_Convention_Centre_at_August.jpg/960px-Kenyatta_International_Convention_Centre_at_August.jpg`,
  racks: `${WIKI}/b/b3/Datacenter_Server_Racks_%2822370909788%29.jpg/960px-Datacenter_Server_Racks_%2822370909788%29.jpg`,
  controller: `${WIKI}/f/f9/PSX-Original-Controller.jpg/960px-PSX-Original-Controller.jpg`,
  pad: `${WIKI}/c/c4/Xbox-360-Controller-Black.jpg/960px-Xbox-360-Controller-Black.jpg`,
  matatu: `${WIKI}/2/21/A_colorful_matatu_in_Nairobi%2C_Kenya%2C_during_rush_hour.jpg/960px-A_colorful_matatu_in_Nairobi%2C_Kenya%2C_during_rush_hour.jpg`,
  westlands: `${WIKI}/d/d9/Westlands%2C_Nairobi_2025_14.png/960px-Westlands%2C_Nairobi_2025_14.png`,
} as const;

const KSH = (amount: number): Money => ({ amount, currency: 'KSh' });

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/** Today at a wall-clock hour on the phone, as an RFC 3339 time. */
function todayAt(now: number, hour: number, minute = 0, addDays = 0): string {
  const d = new Date(now);
  d.setHours(hour, minute, 0, 0);
  return new Date(d.getTime() + addDays * DAY).toISOString();
}

function interest(id: string, topic: string, rest: Partial<Interest>): Interest {
  return {
    id,
    topic,
    category: 'other',
    facets: [],
    depth: 'keen',
    news: 'tiles',
    avoid: false,
    origin: 'interview',
    evidence: 3,
    confirmed: true,
    picture: null,
    updatedAt: null,
    ...rest,
  };
}

function seedInterests(now: number): Interest[] {
  const at = iso(now - 3 * DAY);
  return [
    interest('i-ai', 'On-device AI', { category: 'tech', facets: ['MCP', 'small models', 'privacy'], depth: 'devoted', news: 'both', picture: MOCK_PICTURES.racks, updatedAt: at }),
    interest('i-boys', 'The Boys', { category: 'film_tv', facets: ['Homelander', 'the final season'], depth: 'devoted', news: 'both', updatedAt: at }),
    interest('i-genv', 'Gen V', { category: 'film_tv', facets: ['Marie Moreau', 'Godolkin University'], depth: 'keen', updatedAt: at }),
    interest('i-civic', 'Kenyan civic politics', { category: 'politics', facets: ['Finance Bill', 'county budgets', 'IEBC'], depth: 'devoted', news: 'digest', picture: MOCK_PICTURES.parliament, updatedAt: at }),
    interest('i-gta', 'GTA', { category: 'games', facets: ['GTA VI', 'Rockstar trailers'], depth: 'devoted', news: 'both', picture: MOCK_PICTURES.pad, updatedAt: at }),
    interest('i-infamous', 'inFAMOUS', { category: 'games', facets: ['Sucker Punch', 'Cole MacGrath'], depth: 'keen', picture: MOCK_PICTURES.controller, updatedAt: at }),
    interest('i-amapiano', 'Amapiano nights', { category: 'music', facets: ['Kabza De Small', 'Nairobi club nights'], depth: 'keen', picture: MOCK_PICTURES.decks, updatedAt: at }),
    interest('i-mini', 'Mini Coopers', { category: 'cars', facets: ['Cooper S', 'classic Minis'], depth: 'curious', picture: MOCK_PICTURES.mini, updatedAt: at }),
    interest('i-fielder', 'Toyota Fielder', { category: 'cars', picture: MOCK_PICTURES.fielderBlue, facets: ['2015 to 2017 hybrids', 'service history'], depth: 'keen', news: 'off', origin: 'chat', evidence: 5, confirmed: false, updatedAt: iso(now - DAY) }),
    interest('i-speaking', 'Public speaking', { category: 'learning', facets: ['conference talks'], depth: 'curious', news: 'off', origin: 'chat', evidence: 2, confirmed: false, updatedAt: iso(now - 2 * DAY) }),
  ];
}

function story(id: string, rest: Omit<Story, 'id' | 'read' | 'readAt'>): Story {
  return { id, read: false, readAt: null, ...rest };
}

function seedStories(now: number): StoryDetail[] {
  const written = iso(now - 2 * HOUR);
  const detail = (s: Story, summary: string, whyYou: string, sources: StoryDetail['sources']): StoryDetail => ({ ...s, summary, whyYou, sources });
  return [
    detail(
      story('s-mcp', {
        kind: 'news',
        headline: 'MCP Dev Summit Nairobi publishes its two-day programme',
        dek: 'Talks on tool servers, agent security and running models on your own hardware.',
        picture: MOCK_PICTURES.kicc,
        source: { name: 'MCP Dev Summit', url: 'https://events.example.org/mcp-dev-summit-nairobi' },
        interest: { id: 'i-ai', topic: 'On-device AI', category: 'tech' },
        publishedAt: iso(now - 40 * MINUTE),
        writtenAt: written,
      }),
      'The organisers of **MCP Dev Summit Nairobi** have put the full programme for **19 and 20 November** online. The first day leans on building tool servers and the second on running agents safely, with a track on models that run on your own hardware.\n\nSpeakers are listed by session, and each talk has a short abstract. Rooms are marked, and the closing panel is on the second afternoon.',
      'You are speaking there, so this is where your slot and your room are listed.',
      [{ title: 'Programme', url: 'https://events.example.org/mcp-dev-summit-nairobi/programme', site: 'events.example.org' }],
    ),
    detail(
      story('s-finance', {
        kind: 'news',
        headline: 'What the Finance Bill hearings mean for county budgets',
        dek: 'The committee heard from four counties on how the new split would land.',
        picture: MOCK_PICTURES.assembly,
        source: { name: 'Nation', url: 'https://nation.africa/kenya/news/politics' },
        interest: { id: 'i-civic', topic: 'Kenyan civic politics', category: 'politics' },
        publishedAt: iso(now - 9 * HOUR),
        writtenAt: written,
      }),
      'The Finance Committee spent the day hearing county treasurers on the proposed revenue split. **Four counties** said the change would delay development money by a quarter, and asked for the release dates to be written into the bill.\n\nThe committee will report back before the second reading.',
      'You follow the Finance Bill and county budgets closely.',
      [{ title: 'Finance Committee hearings', url: 'https://nation.africa/kenya/news/politics', site: 'nation.africa' }],
    ),
    detail(
      story('s-boys', {
        kind: 'news',
        headline: 'The Boys: what to expect from the final season',
        dek: 'The showrunner talks about ending on Homelander, and what carries over from Gen V.',
        picture: null,
        source: { name: 'Variety', url: 'https://variety.com/t/the-boys/' },
        interest: { id: 'i-boys', topic: 'The Boys', category: 'film_tv' },
        publishedAt: iso(now - 20 * HOUR),
        writtenAt: written,
      }),
      'In a long interview, the showrunner says the last season was written as one story, with **Homelander** at its centre, and that two threads from **Gen V** come back in it.',
      'You watch The Boys and Gen V, and asked about the final season last week.',
      [{ title: 'The Boys on Variety', url: 'https://variety.com/t/the-boys/', site: 'variety.com' }],
    ),
    detail(
      story('s-gta', {
        kind: 'news',
        headline: 'Rockstar shows more of GTA VI’s Leonida',
        dek: 'New footage walks through two districts and the in-game phone.',
        picture: MOCK_PICTURES.pad,
        source: { name: 'IGN', url: 'https://www.ign.com/games/grand-theft-auto-vi' },
        interest: { id: 'i-gta', topic: 'GTA', category: 'games' },
        publishedAt: iso(now - 26 * HOUR),
        writtenAt: written,
      }),
      'The new footage spends most of its time on two districts of **Leonida** and on the phone the player carries, which now runs most of the side activities.',
      'You follow GTA VI news as it comes.',
      [{ title: 'GTA VI on IGN', url: 'https://www.ign.com/games/grand-theft-auto-vi', site: 'ign.com' }],
    ),
    detail(
      story('s-amapiano', {
        kind: 'news',
        headline: 'Three Amapiano nights in Nairobi this weekend',
        dek: 'Westlands on Friday, Kilimani on Saturday, and an open-air set on Sunday.',
        picture: MOCK_PICTURES.decks,
        source: { name: 'Nairobi Now', url: 'https://example.com/nairobi-now/amapiano' },
        interest: { id: 'i-amapiano', topic: 'Amapiano nights', category: 'music' },
        publishedAt: iso(now - 30 * HOUR),
        writtenAt: written,
      }),
      'Three nights worth knowing about: a **Friday** set in Westlands, a **Saturday** night in Kilimani with a South African headliner, and an **open-air** afternoon on Sunday.',
      'You go out for Amapiano, and Friday is free on your calendar.',
      [{ title: 'This weekend in Nairobi', url: 'https://example.com/nairobi-now/amapiano', site: 'example.com' }],
    ),
    detail(
      story('s-local-models', {
        kind: 'long_read',
        headline: 'Why small models are winning on the phone',
        dek: 'A long look at what fits in a few gigabytes, and what it costs to keep it there.',
        picture: MOCK_PICTURES.racks,
        source: { name: 'The Gradient', url: 'https://thegradient.pub/' },
        interest: { id: 'i-ai', topic: 'On-device AI', category: 'tech' },
        publishedAt: iso(now - 3 * DAY),
        writtenAt: iso(now - DAY),
      }),
      'A long read on why the most useful models are shrinking. It walks through **quantisation**, what a phone can hold in memory, and why keeping data on the device is a design choice and not only a privacy one.\n\nIt ends on the trade-off you face with Goose: which jobs a small model can carry alone, and which still want a bigger one in the house.',
      'You build Goose In A Pond, which runs models on your own hardware.',
      [{ title: 'The Gradient', url: 'https://thegradient.pub/', site: 'thegradient.pub' }],
    ),
    detail(
      story('s-mini', {
        kind: 'long_read',
        headline: 'The Mini that won Monte Carlo, sixty years on',
        dek: 'How a small car with a transverse engine beat the big ones on ice.',
        picture: MOCK_PICTURES.mini,
        source: { name: 'Hagerty', url: 'https://www.hagerty.com/media/' },
        interest: { id: 'i-mini', topic: 'Mini Coopers', category: 'cars' },
        publishedAt: null,
        writtenAt: iso(now - 2 * DAY),
      }),
      'The story of the **Cooper S** at the Monte Carlo Rally, and why its layout still shapes small cars.',
      'You like Mini Coopers, the classic ones most.',
      [{ title: 'Hagerty', url: 'https://www.hagerty.com/media/', site: 'hagerty.com' }],
    ),
  ];
}

function seedDigest(now: number): Digest {
  return {
    id: 'd-today',
    title: 'Your morning, Monday 9 November',
    writtenAt: todayAt(now, 6, 40),
    intro: 'The summit programme is out and your talk is on the first afternoon. Parliament heard the counties on the Finance Bill, and Rockstar showed more of GTA VI.',
    listen: '/api/v1/me/news/digests/d-today/listen',
    sections: [
      {
        interest: { id: 'i-ai', topic: 'On-device AI', category: 'tech' },
        heading: 'Your summit, in the programme',
        body: 'MCP Dev Summit Nairobi has published its programme for 19 and 20 November. The **first day** is about building tool servers; the **second** about running agents safely, with a track on models that run on your own hardware.',
        pictures: [{ path: MOCK_PICTURES.kicc, caption: 'The convention centre, where the summit is held', sourceUrl: 'https://events.example.org/mcp-dev-summit-nairobi' }],
        references: [{ title: 'Programme', url: 'https://events.example.org/mcp-dev-summit-nairobi/programme', site: 'events.example.org' }],
      },
      {
        interest: { id: 'i-civic', topic: 'Kenyan civic politics', category: 'politics' },
        heading: 'Counties push back on the revenue split',
        body: 'Four county treasurers told the Finance Committee the new split would delay development money by a quarter. They asked for release dates to be written into the bill. The committee reports back before the second reading.',
        pictures: [{ path: MOCK_PICTURES.assembly, caption: 'The National Assembly chamber', sourceUrl: 'https://nation.africa/kenya/news/politics' }],
        references: [{ title: 'Finance Committee hearings', url: 'https://nation.africa/kenya/news/politics', site: 'nation.africa' }],
      },
      {
        interest: { id: 'i-gta', topic: 'GTA', category: 'games' },
        heading: 'More of Leonida',
        body: 'Rockstar’s new GTA VI footage walks through two districts and the in-game phone, which now runs most side activities.',
        pictures: [],
        references: [{ title: 'GTA VI on IGN', url: 'https://www.ign.com/games/grand-theft-auto-vi', site: 'ign.com' }],
      },
    ],
  };
}

function hook(id: string, label: string, spec: Hook['spec'], nextFireAt: string | null = null): Hook {
  return { id, label, spec, nextFireAt, lastFiredAt: null };
}

function todo(id: string, text: string, rest: Partial<Todo>): Todo {
  return {
    id,
    kind: 'todo',
    text,
    notes: null,
    state: 'open',
    dueAt: null,
    hooks: [],
    ask: false,
    source: 'you',
    lastAskedAt: null,
    asked: 0,
    snoozedUntil: null,
    createdAt: null,
    doneAt: null,
    list: null,
    priority: 'normal',
    steps: [],
    gooseCan: null,
    anchorId: null,
    duplicateOf: null,
    ...rest,
  };
}

function seedPlaces(): Place[] {
  return [
    { id: 'p-home', label: 'Home', lat: -1.2921, lng: 36.7856, radiusM: 150 },
    { id: 'p-office', label: 'the Jarida One office', lat: -1.2634, lng: 36.8045, radiusM: 150 },
    { id: 'p-gym', label: 'the gym', lat: -1.2683, lng: 36.8111, radiusM: 120 },
  ];
}

function seedTodos(now: number): Todo[] {
  return [
    todo('t-slides', 'Send the final slides to the MCP Dev Summit team', {
      ask: true,
      asked: 1,
      lastAskedAt: iso(now - 40 * MINUTE),
      source: 'chat',
      dueAt: todayAt(now, 17, 0, 3),
      hooks: [hook('h-1', 'Every weekday at 10:00', { kind: 'repeat', every: 'weekday', at: '10:00', days: [] }, todayAt(now, 10, 0, 1))],
      createdAt: iso(now - 2 * DAY),
    }),
    todo('t-table', 'Confirm the table for Friday’s Amapiano night', {
      ask: true,
      asked: 2,
      lastAskedAt: iso(now - 3 * HOUR),
      source: 'goose',
      hooks: [hook('h-2', 'When you leave the Jarida One office', { kind: 'place', placeId: 'p-office', transition: 'leave' })],
      createdAt: iso(now - DAY),
    }),
    todo('t-emmanuel', 'Call Emmanuel about viewing the Fielder', {
      kind: 'reminder',
      hooks: [hook('h-3', '', { kind: 'time', at: todayAt(now, 18, 0) }, todayAt(now, 18, 0))],
      source: 'chat',
      createdAt: iso(now - 5 * HOUR),
    }),
    todo('t-suit', 'Pick up the suit from the tailor on Kimathi Street', {
      kind: 'reminder',
      hooks: [hook('h-4', 'When you leave the Jarida One office', { kind: 'place', placeId: 'p-office', transition: 'leave' })],
      notes: 'Ticket 0412. Paid half already.',
      createdAt: iso(now - DAY),
    }),
    todo('t-zuku', 'Pay the home internet bill', {
      kind: 'reminder',
      hooks: [hook('h-5', '', { kind: 'repeat', every: 'month', at: '09:00', days: [] }, todayAt(now, 9, 0, 6))],
      createdAt: iso(now - 30 * DAY),
    }),
    todo('t-service', 'Ask the Autochek seller for the Fielder’s service history', {
      source: 'idea',
      ask: true,
      hooks: [hook('h-6', '', { kind: 'event', sourceId: 'cart-fielder-2016', event: 'price_drop' })],
      createdAt: iso(now - 4 * HOUR),
    }),
    todo('t-home', 'Tell Emmanuel the Pond update is done', {
      kind: 'reminder',
      hooks: [hook('h-7', '', { kind: 'place', placeId: 'p-home', transition: 'arrive' })],
      createdAt: iso(now - 2 * HOUR),
    }),
    todo('t-abstract', 'Write the talk abstract', { state: 'done', doneAt: iso(now - DAY), createdAt: iso(now - 5 * DAY), source: 'you' }),
    todo('t-renew', 'Renew the domain for jarida.io', { state: 'done', doneAt: iso(now - 3 * DAY), createdAt: iso(now - 9 * DAY) }),
  ];
}

function seedHookSources(places: Place[]): HookSources {
  return {
    places,
    sources: [
      { id: 'presence-emmanuel', kind: 'presence', label: 'Emmanuel', events: [{ id: 'arrive', label: 'gets home' }, { id: 'leave', label: 'leaves home' }] },
      { id: 'cam-door', kind: 'camera', label: 'Front door camera', events: [{ id: 'person', label: 'sees someone at the door' }, { id: 'package', label: 'sees a parcel' }] },
      { id: 'dev-tv', kind: 'device', label: 'Living room TV', events: [{ id: 'off', label: 'is switched off' }] },
      { id: 'watch-jiji', kind: 'web_watch', label: 'Fielders on Jiji', events: [{ id: 'match', label: 'finds a new match' }] },
      { id: 'cart-fielder-2016', kind: 'cart', label: 'The Fielder on Autochek', events: [{ id: 'price_drop', label: 'drops in price' }, { id: 'target', label: 'reaches your price' }] },
      { id: 'c-gmail', kind: 'connector', label: 'Gmail', events: [{ id: 'from_person', label: 'gets an email from someone you name' }] },
      { id: 'c-calendar', kind: 'connector', label: 'Google Calendar', events: [{ id: 'starting', label: 'has an event starting in 15 minutes' }] },
      { id: 'c-github', kind: 'connector', label: 'GitHub', events: [{ id: 'pr_review', label: 'asks you to review a pull request' }] },
    ],
  };
}

function history(now: number, amounts: number[]): CartItem['history'] {
  return amounts.map((amount, i) => ({ at: iso(now - (amounts.length - 1 - i) * 2 * DAY), amount }));
}

function seedCart(now: number): CartItem[] {
  return [
    {
      id: 'cart-fielder-2016',
      url: 'https://autochek.africa/ke/car/toyota-fielder-2016',
      title: 'Toyota Fielder Hybrid 2016, 1500cc',
      picture: MOCK_PICTURES.fielderHybrid,
      site: 'Autochek',
      price: KSH(1_150_000),
      previous: KSH(1_190_000),
      lowest: KSH(1_150_000),
      highest: KSH(1_240_000),
      target: KSH(1_200_000),
      inStock: true,
      history: history(now, [1_240_000, 1_240_000, 1_215_000, 1_190_000, 1_190_000, 1_150_000]),
      status: 'ok',
      checkedAt: iso(now - 50 * MINUTE),
      nextCheckAt: iso(now + 11 * HOUR),
      everyHours: 12,
      collection: 'Fielder',
      notify: 'drop',
    },
    {
      id: 'cart-fielder-jiji',
      url: 'https://jiji.co.ke/cars/toyota-fielder-2015',
      title: 'Toyota Fielder 2015, silver, Kiambu',
      picture: MOCK_PICTURES.fielderRear,
      site: 'Jiji',
      price: KSH(1_095_000),
      previous: KSH(1_060_000),
      lowest: KSH(1_060_000),
      highest: KSH(1_095_000),
      target: null,
      inStock: true,
      history: history(now, [1_080_000, 1_060_000, 1_060_000, 1_095_000]),
      status: 'ok',
      checkedAt: iso(now - 3 * HOUR),
      nextCheckAt: iso(now + 21 * HOUR),
      everyHours: 24,
      collection: 'Fielder',
      notify: 'any',
    },
    {
      id: 'cart-fielder-kilimall',
      url: 'https://www.kilimall.co.ke/listing/toyota-fielder-2014',
      title: 'Toyota Fielder 2014, blue, one owner',
      picture: MOCK_PICTURES.fielderBlue,
      site: 'Kilimall',
      price: KSH(985_000),
      previous: KSH(985_000),
      lowest: KSH(985_000),
      highest: KSH(985_000),
      target: KSH(950_000),
      inStock: null,
      history: history(now, [985_000, 985_000]),
      status: 'failing',
      checkedAt: iso(now - 2 * DAY),
      nextCheckAt: iso(now + HOUR),
      everyHours: 24,
      collection: 'Fielder',
      notify: 'target',
    },
  ];
}

function seedConnectors(): Connector[] {
  const none = { fields: [], oauth: null };
  return [
    {
      id: 'c-gmail', name: 'Gmail', summary: 'Reads and drafts email, and tells Goose who wrote.', icon: 'mail', category: 'mail',
      status: 'connected', statusDetail: 'jerry@jarida.io', kind: 'account',
      provides: { tools: 4, events: [{ id: 'from_person', label: 'An email from someone you name' }], feeds: ['todos', 'ideas'] },
      setup: none, webhookUrl: null,
    },
    {
      id: 'c-calendar', name: 'Google Calendar', summary: 'What is on your day, and adding to it.', icon: 'calendar', category: 'calendar',
      status: 'connected', statusDetail: 'Work and personal', kind: 'account',
      provides: { tools: 3, events: [{ id: 'starting', label: 'An event is about to start' }], feeds: ['todos', 'ideas'] },
      setup: none, webhookUrl: null,
    },
    {
      id: 'c-home', name: 'Your home', summary: 'Lights, the TV and the sensors your Pond controls.', icon: 'home', category: 'home',
      status: 'connected', statusDetail: '14 devices', kind: 'built_in',
      provides: { tools: 6, events: [{ id: 'device', label: 'A device changes' }], feeds: [] },
      setup: none, webhookUrl: null,
    },
    {
      id: 'c-search', name: 'Web search', summary: 'Searches the web for news and answers, through Brave.', icon: 'globe', category: 'web',
      status: 'connected', statusDetail: null, kind: 'built_in',
      provides: { tools: 2, events: [], feeds: ['news', 'ideas'] },
      setup: none, webhookUrl: null,
    },
    {
      id: 'c-weather', name: 'Weather', summary: 'The forecast for Nairobi.', icon: 'partly-sunny', category: 'weather',
      status: 'connected', statusDetail: null, kind: 'built_in',
      provides: { tools: 2, events: [{ id: 'rain', label: 'Rain is on the way' }], feeds: ['news'] },
      setup: none, webhookUrl: null,
    },
    {
      id: 'c-spotify', name: 'Spotify', summary: 'Plays music in the house and knows what you like.', icon: 'music', category: 'music',
      status: 'error', statusDetail: 'Sign in again to keep playing.', kind: 'account',
      provides: { tools: 5, events: [], feeds: ['ideas'] },
      setup: { fields: [], oauth: 'https://accounts.spotify.com/authorize' }, webhookUrl: null,
    },
    {
      id: 'c-uber', name: 'Uber', summary: 'Prices and books rides from where you are.', icon: 'car', category: 'travel',
      status: 'available', statusDetail: null, kind: 'account',
      provides: { tools: 2, events: [], feeds: [] },
      setup: { fields: [], oauth: 'https://auth.uber.com/oauth/v2/authorize' }, webhookUrl: null,
    },
    {
      id: 'c-mpesa', name: 'M-PESA statements', summary: 'Reads the statements you forward, so Goose can tell you where the month went.', icon: 'wallet', category: 'money',
      status: 'needs_setup', statusDetail: null, kind: 'mcp',
      provides: { tools: 2, events: [{ id: 'statement', label: 'A new statement arrives' }], feeds: ['ideas'] },
      setup: {
        fields: [
          { key: 'phone', label: 'Phone number', kind: 'text', options: [], required: true, help: 'The number your statements are for.' },
          { key: 'pin', label: 'Statement password', kind: 'secret', options: [], required: true, help: 'The password Safaricom sends with each statement. It stays on your Pond.' },
          { key: 'months', label: 'How far back', kind: 'select', options: ['1 month', '3 months', '6 months'], required: false, help: null },
        ],
        oauth: null,
      },
      webhookUrl: null,
    },
    {
      id: 'c-github', name: 'GitHub', summary: 'Pull requests and issues for jarida-io.', icon: 'skills', category: 'custom',
      status: 'connected', statusDetail: 'jarida-io', kind: 'mcp',
      provides: { tools: 8, events: [{ id: 'pr_review', label: 'A review is asked of you' }], feeds: ['todos'] },
      setup: none, webhookUrl: null,
    },
    {
      id: 'c-linear', name: 'Linear', summary: 'Your team’s issues, through its MCP server.', icon: 'checklist', category: 'custom',
      status: 'available', statusDetail: null, kind: 'mcp',
      provides: { tools: 6, events: [{ id: 'assigned', label: 'An issue is assigned to you' }], feeds: ['todos'] },
      setup: {
        fields: [
          { key: 'server', label: 'Server address', kind: 'url', options: [], required: true, help: 'The MCP server’s address, from Linear’s settings.' },
          { key: 'token', label: 'API key', kind: 'secret', options: [], required: true, help: null },
          { key: 'mine_only', label: 'Only issues assigned to me', kind: 'toggle', options: [], required: false, help: null },
        ],
        oauth: null,
      },
      webhookUrl: null,
    },
  ];
}

function seedIdeas(now: number): Idea[] {
  return [
    {
      id: 'idea-rehearse',
      kind: 'project',
      kindLabel: 'For your projects',
      title: 'Rehearse your summit talk out loud, twice',
      hook: 'Two timed run-throughs before the summit.',
      facts: [{ label: 'When', value: 'This week, then the day before' }, { label: 'Length', value: '25 minutes' }],
      notes: '',
      pitch: 'Run the talk once this week and once the day before, with Goose keeping time and noting the slides you rush. Talks at this summit are 25 minutes, and the programme puts yours just after lunch.',
      why: 'You are speaking at MCP Dev Summit Nairobi on 19 November, and the slides are still open on your to-do list.',
      groundedIn: [
        { kind: 'conversation', label: 'Your talk, from last week’s chat' },
        { kind: 'interest', label: 'On-device AI' },
      ],
      sources: [{ title: 'Summit programme', url: 'https://events.example.org/mcp-dev-summit-nairobi/programme', site: 'events.example.org' }],
      picture: MOCK_PICTURES.stage,
      gooseCan: { label: 'Book two run-throughs on your calendar', kind: 'schedule' },
      youCan: ['Export the slides to PDF', 'Ask Emmanuel to watch the second run-through', 'Cut the demo to five minutes'],
      state: 'new',
      taskId: null,
      createdAt: iso(now - 3 * HOUR),
    },
    {
      id: 'idea-history',
      kind: 'interest',
      kindLabel: 'From your interests',
      title: 'Check a Fielder’s history before you pay',
      hook: 'Check a Fielder\'s past owners before you view it.',
      facts: [{ label: 'Where', value: 'NTSA logbook search' }],
      notes: '',
      pitch: 'NTSA’s logbook search shows past owners and whether a car was ever written off. Goose can look up the Autochek Fielder and tell you what it finds.',
      why: 'You are watching three Fielders, and the Autochek one just dropped KSh 40,000.',
      groundedIn: [{ kind: 'interest', label: 'Toyota Fielder' }],
      sources: [{ title: 'NTSA eCitizen', url: 'https://ntsa.go.ke/', site: 'ntsa.go.ke' }],
      picture: MOCK_PICTURES.fielderHybrid,
      gooseCan: { label: 'Look up the Autochek Fielder', kind: 'research' },
      youCan: ['Ask the seller for the registration number', 'Search it on eCitizen', 'Book an inspection'],
      state: 'working',
      taskId: 'task-ntsa-1',
      createdAt: iso(now - DAY),
    },
    {
      id: 'idea-amapiano',
      kind: 'activity',
      kindLabel: 'Something to do',
      title: 'An Amapiano night worth the drive',
      hook: 'A Saturday set in Kilimani that ends before midnight.',
      facts: [{ label: 'Where', value: 'Kilimani' }, { label: 'When', value: 'Saturday' }],
      notes: '',
      pitch: 'The Saturday set in Kilimani has a South African headliner and finishes early enough for Sunday. Goose can watch for tickets and tell you when they open.',
      why: 'You go out for Amapiano, and you have nothing on Saturday night.',
      groundedIn: [{ kind: 'interest', label: 'Amapiano nights' }],
      sources: [{ title: 'This weekend in Nairobi', url: 'https://example.com/nairobi-now/amapiano', site: 'example.com' }],
      picture: MOCK_PICTURES.decks,
      gooseCan: { label: 'Watch for tickets', kind: 'watch' },
      youCan: ['Ask Emmanuel if he is in', 'Book a ride for 22:00'],
      state: 'new',
      taskId: null,
      createdAt: iso(now - 2 * DAY),
    },
  ];
}

function seedCatalog(): CatalogItem[] {
  return [
    { id: 'cat-digest', title: 'Hear the digest at breakfast', body: 'Goose reads the morning digest on the speaker at the time you choose.', icon: 'speaker', state: 'off', try: null, opens: 'news' },
    { id: 'cat-ride', title: 'Get a ride priced', body: 'Ask for a ride and Goose compares the fare from where you are.', icon: 'car', state: 'on', try: 'How much is an Uber to Sarit Centre right now?', opens: null },
    { id: 'cat-cameras', title: 'Know who is at the door', body: 'The Pond’s camera tells you when someone arrives, and can recognise the household.', icon: 'camera', state: 'needs_setup', try: null, opens: 'cameras' },
    { id: 'cat-watch', title: 'Watch a listings page', body: 'Point Goose at a page of listings and hear when something new matches.', icon: 'eye', state: 'on', try: 'Watch Jiji for Toyota Fielders under KSh 1.2 million', opens: 'web_watches' },
    { id: 'cat-agents', title: 'Run an agent on a schedule', body: 'A small helper that does one job, like a weekly summary of your issues.', icon: 'agent', state: 'on', try: null, opens: 'agents' },
    { id: 'cat-voice', title: 'Talk to Goose in the room', body: 'Say “Hey Goose” and ask, with nothing in your hand.', icon: 'voice', state: 'on', try: null, opens: 'voice' },
  ];
}

const QUESTIONS: Omit<InterviewTurn, 'id' | 'at'>[] = [
  { role: 'goose', text: 'What do you do with an evening off?', choices: ['Watch a series', 'Play games', 'Go out for music', 'Follow the news', 'Something with cars'], multi: true, allowFree: true },
  { role: 'goose', text: 'Which shows are you watching right now?', choices: ['The Boys', 'Gen V', 'House of the Dragon', 'Shōgun'], multi: true, allowFree: true },
  { role: 'goose', text: 'How closely do you follow The Boys?', choices: ['Every episode, the night it drops', 'I catch up when I can', 'Just the big moments'], multi: false, allowFree: false },
  { role: 'goose', text: 'Which games are you into?', choices: ['GTA', 'inFAMOUS', 'EA Sports FC', 'Call of Duty'], multi: true, allowFree: true },
  { role: 'goose', text: 'Do you want GTA VI news as it happens, or in the morning digest?', choices: ['As it happens', 'In the digest', 'Both', 'Only big news'], multi: false, allowFree: false },
  { role: 'goose', text: 'In Kenyan politics, what do you follow most?', choices: ['The Finance Bill', 'County budgets', 'IEBC and elections', 'Debates in Parliament'], multi: true, allowFree: true },
  { role: 'goose', text: 'Any cars you’re keeping an eye on?', choices: ['Toyota Fielder', 'Mini Cooper', 'Subaru Forester'], multi: true, allowFree: true },
];
const CLOSING: Omit<InterviewTurn, 'id' | 'at'> = {
  role: 'goose',
  text: 'That’s plenty to start with. Tap Finish and I’ll show you what I’ve got.',
  choices: [],
  multi: false,
  allowFree: false,
};

function draftFor(now: number): Interest[] {
  const at = iso(now);
  return [
    interest('draft-boys', 'The Boys', { category: 'film_tv', facets: ['new episodes', 'Homelander'], depth: 'devoted', news: 'both', confirmed: false, updatedAt: at }),
    interest('draft-gta', 'GTA VI', { category: 'games', facets: ['trailers', 'release date'], depth: 'devoted', news: 'tiles', confirmed: false, updatedAt: at }),
    interest('draft-civic', 'Kenyan civic politics', { category: 'politics', facets: ['Finance Bill', 'county budgets'], depth: 'keen', news: 'digest', confirmed: false, updatedAt: at }),
    interest('draft-fielder', 'Toyota Fielder', { category: 'cars', facets: ['prices under KSh 1.2M'], depth: 'keen', news: 'off', confirmed: false, updatedAt: at }),
  ];
}

const delay = (ms = 220) => new Promise((resolve) => setTimeout(resolve, ms));

function missing(what: string): never {
  throw new ApiError(`mock: no ${what}`, 404, null, 'not_found', null);
}

/** A short silent WAV, so Listen plays end to end without a Pond to speak. */
function silentWav(seconds: number): ArrayBuffer {
  const rate = 8_000;
  const samples = rate * seconds;
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const ascii = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, samples * 2, true);
  return buffer;
}

export interface MockHubOptions {
  /** A member Goose knows nothing about yet: no interests, no news, the interview not started. */
  fresh?: boolean;
  clock?: () => number;
}

export function createMockHub({ fresh = false, clock = Date.now }: MockHubOptions = {}): HubSource {
  const now0 = clock();
  let interests = fresh ? [] : seedInterests(now0);
  const stories = fresh ? [] : seedStories(now0);
  const digest: Digest | null = fresh ? null : seedDigest(now0);
  let settings: NewsSettings = { digest: !fresh, digestTime: '06:45', spokenOnSpeaker: false, tiles: !fresh, timezone: 'Africa/Nairobi' };
  let newsWritingUntil = 0;
  const places = seedPlaces();
  let todos = fresh ? [] : seedTodos(now0);
  let offers: TodoOffer[] = fresh
    ? []
    : [
        { reminderId: 'r-garage', text: 'Call the garage about the Fielder inspection', whenSaid: 'on Friday', dueAt: todayAt(now0, 10, 0, 4), saidAt: iso(now0 - 5 * HOUR) },
        { reminderId: 'r-mum', text: 'Send Mum the photos from the weekend', whenSaid: 'sometime this week', dueAt: null, saidAt: iso(now0 - DAY) },
      ];
  const readAt = new Map<string, string>([['s-mini', iso(now0 - DAY)], ['s-gta', iso(now0 - 5 * HOUR)]]);
  let cart = fresh ? [] : seedCart(now0);
  const checkingUntil = new Map<string, number>();
  let connectors = seedConnectors();
  let ideas = fresh ? [] : seedIdeas(now0);
  let ideasThinkingUntil = 0;
  let nextId = 1;
  const id = (prefix: string) => `${prefix}-${nextId++}`;

  let interview: InterestInterview = { status: 'not_started', turns: [], draft: [], asked: 0, planned: QUESTIONS.length + 1 };
  let thinkingUntil = 0;

  const ask = (index: number): InterviewTurn => ({ ...(QUESTIONS[index] ?? CLOSING), id: id('turn'), at: iso(clock()) });

  /** The Pond finishes writing its next question once the think time has passed. */
  const settleInterview = () => {
    if (interview.status !== 'thinking' || clock() < thinkingUntil) return;
    const asked = interview.turns.filter((t) => t.role === 'goose').length;
    interview = { ...interview, status: 'asking', turns: [...interview.turns, ask(asked)], asked: Math.min(asked + 1, interview.planned) };
  };

  const settleCart = () => {
    cart = cart.map((item) => {
      const until = checkingUntil.get(item.id);
      if (item.status !== 'checking' || until === undefined || clock() < until) return item;
      checkingUntil.delete(item.id);
      const price = item.price ?? KSH(1_120_000);
      return { ...item, status: 'ok', price, previous: item.previous ?? price, lowest: item.lowest ?? price, highest: item.highest ?? price, checkedAt: iso(clock()), history: item.history.length ? item.history : [{ at: iso(clock()), amount: price.amount }] };
    });
  };

  const todoFrom = (body: TodoWriteWire, base: Todo): Todo => ({
    ...base,
    ...(body.kind ? { kind: body.kind } : {}),
    ...(body.text !== undefined ? { text: body.text } : {}),
    ...(body.notes !== undefined ? { notes: body.notes } : {}),
    ...(body.due_at !== undefined ? { dueAt: body.due_at } : {}),
    ...(body.ask !== undefined ? { ask: body.ask } : {}),
    ...(body.state ? { state: body.state, doneAt: body.state === 'done' ? iso(clock()) : null } : {}),
    ...(body.list !== undefined ? { list: body.list || null } : {}),
    ...(body.priority ? { priority: body.priority } : {}),
    ...(body.steps ? { steps: body.steps } : {}),
    ...(body.goose_can !== undefined ? { gooseCan: body.goose_can } : {}),
    ...(body.anchor_id !== undefined ? { anchorId: body.anchor_id } : {}),
    ...(body.hooks
      ? {
          hooks: body.hooks.map((h, i) => {
            const spec = h.spec as Record<string, unknown>;
            const read: Hook['spec'] =
              h.kind === 'time' ? { kind: 'time', at: String(spec.at) }
              : h.kind === 'repeat' ? { kind: 'repeat', every: spec.every as 'day', at: String(spec.at), days: (spec.days as number[]) ?? [] }
              : h.kind === 'place' ? { kind: 'place', placeId: String(spec.place_id), transition: spec.transition === 'leave' ? 'leave' : 'arrive' }
              : h.kind === 'connector' ? { kind: 'connector', connectorId: String(spec.connector_id), event: String(spec.event), filter: null }
              : { kind: 'event', sourceId: String(spec.source_id), event: String(spec.event) };
            return { id: `${base.id}-h${i}`, label: '', spec: read, nextFireAt: read.kind === 'time' ? read.at : null, lastFiredAt: null };
          }),
        }
      : {}),
  });

  const findTodo = (todoId: string) => todos.find((t) => t.id === todoId) ?? missing('to-do');
  const replaceTodo = (next: Todo) => {
    todos = todos.map((t) => (t.id === next.id ? next : t));
    return next;
  };

  const feed = (): NewsFeed => {
    const writing = clock() < newsWritingUntil;
    return {
      stories: (settings.tiles || writing ? stories : stories.filter((s) => s.kind === 'long_read')).map((s) => ({ ...s, read: readAt.has(s.id) })),
      digest: settings.digest ? digest : null,
      state: writing ? 'writing' : 'idle',
      nextDigestAt: todayAt(clock(), 6, 45, 1),
      lastWrittenAt: stories.length ? iso(now0 - 2 * HOUR) : null,
      blocked: interests.some((i) => i.confirmed) ? null : 'no_interests',
    };
  };

  return {
    async hub() {
      await delay();
      return {
        version: 1,
        interests: true,
        news: true,
        todos: true,
        cart: true,
        connectors: true,
        ideas: true,
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
      };
    },
    async interests() {
      await delay();
      return interests;
    },
    async addInterest(body) {
      await delay();
      const made = interest(id('i'), body.topic, {
        category: body.category ?? 'other',
        facets: body.facets ?? [],
        depth: body.depth ?? 'keen',
        news: body.news ?? 'tiles',
        avoid: body.avoid ?? false,
        origin: 'you',
        evidence: 1,
        confirmed: true,
        updatedAt: iso(clock()),
      });
      interests = [made, ...interests];
      return made;
    },
    async editInterest(interestId, body) {
      await delay();
      const found = interests.find((i) => i.id === interestId) ?? missing('interest');
      const next: Interest = { ...found, ...body, confirmed: body.confirmed ?? found.confirmed, updatedAt: iso(clock()) } as Interest;
      interests = interests.map((i) => (i.id === interestId ? next : i));
      return next;
    },
    async deleteInterest(interestId) {
      await delay();
      interests = interests.filter((i) => i.id !== interestId);
    },
    async interview() {
      await delay(120);
      settleInterview();
      return interview;
    },
    async startInterview() {
      await delay();
      if (interview.status === 'not_started' || interview.status === 'done') {
        interview = { status: 'asking', turns: [ask(0)], draft: [], asked: 1, planned: QUESTIONS.length + 1 };
      }
      return interview;
    },
    async answerInterview(answer) {
      await delay();
      if (interview.status !== 'asking') throw new ApiError('mock: not asking', 409, null, 'not_asking', null);
      const said = [...(answer.choices ?? []), ...(answer.text ? [answer.text] : [])].join(', ');
      const you: InterviewTurn = { id: id('turn'), role: 'you', text: said, choices: [], multi: false, allowFree: false, at: iso(clock()) };
      thinkingUntil = clock() + MOCK_THINK_MS;
      interview = { ...interview, status: 'thinking', turns: [...interview.turns, you] };
      return interview;
    },
    async finishInterview() {
      await delay(600);
      interview = { ...interview, status: 'review', draft: draftFor(clock()) };
      return interview;
    },
    async approveInterview(body) {
      await delay();
      const kept = interview.draft
        .filter((d) => body.keep.includes(d.id))
        .map((d) => ({ ...d, ...(body.edits[d.id] ?? {}), id: id('i'), confirmed: true }) as Interest);
      interests = [...kept, ...interests.filter((i) => !kept.some((k) => k.topic === i.topic))];
      interview = { ...interview, status: 'done', draft: [] };
      return kept.length;
    },
    async portrait() {
      await delay();
      if (fresh) return null;
      return {
        summary: 'Jerry runs Jarida One and leads the team building Goose In A Pond, in Nairobi. He is speaking at MCP Dev Summit Nairobi this month and is shopping for a Toyota Fielder.',
        into: ['On-device AI', 'The Boys', 'GTA', 'Kenyan civic politics'],
        workingOn: ['His summit talk', 'Goose In A Pond'],
        likes: ['Amapiano nights', 'Mini Coopers'],
        updatedAt: iso(now0 - 6 * HOUR),
      };
    },
    async newsSettings() {
      await delay();
      return settings;
    },
    async saveNewsSettings(change) {
      await delay();
      settings = {
        digest: change.digest ?? settings.digest,
        digestTime: change.digest_time ?? settings.digestTime,
        spokenOnSpeaker: change.spoken_on_speaker ?? settings.spokenOnSpeaker,
        tiles: change.tiles ?? settings.tiles,
        timezone: change.timezone ?? settings.timezone,
      };
      return settings;
    },
    async news() {
      await delay();
      return feed();
    },
    async newsFor(interestId) {
      await delay();
      return { ...feed(), digest: null, stories: stories.filter((s) => s.interest?.id === interestId).map((s) => ({ ...s, read: readAt.has(s.id) })) };
    },
    async markStoryRead(storyId) {
      await delay(80);
      readAt.set(storyId, iso(clock()));
    },
    async newsHistory() {
      await delay();
      return stories
        .filter((s) => readAt.has(s.id))
        .map((s) => ({ ...s, read: true, readAt: readAt.get(s.id) ?? null }))
        .sort((a, b) => (b.readAt ?? '').localeCompare(a.readAt ?? ''));
    },
    async storyFeedback(storyId, vote) {
      await delay();
      if (vote === 'wrong') {
        const i = stories.findIndex((s) => s.id === storyId);
        if (i >= 0) stories.splice(i, 1);
      }
    },
    async story(storyId) {
      await delay();
      const found = stories.find((s) => s.id === storyId) ?? missing('story');
      return { ...found, read: readAt.has(found.id) };
    },
    async digests() {
      await delay();
      if (!digest) return [];
      return [
        { id: digest.id, title: digest.title, writtenAt: digest.writtenAt },
        { id: 'd-yesterday', title: 'Your morning, Sunday 8 November', writtenAt: todayAt(clock(), 6, 40, -1) },
        { id: 'd-saturday', title: 'Your morning, Saturday 7 November', writtenAt: todayAt(clock(), 6, 40, -2) },
      ];
    },
    async digest(digestId) {
      await delay();
      if (!digest) return missing('digest');
      return digestId === digest.id ? digest : { ...digest, id: digestId, title: digestId === 'd-yesterday' ? 'Your morning, Sunday 8 November' : 'Your morning, Saturday 7 November' };
    },
    async digestAudio() {
      await delay(900);
      return silentWav(4);
    },
    async speakDigest() {
      await delay();
    },
    async refreshNews() {
      await delay();
      newsWritingUntil = clock() + 6_000;
    },
    async todos(state) {
      await delay();
      if (state === 'all') return todos;
      return todos.filter((t) => (state === 'open' ? t.state === 'open' : t.state === 'done'));
    },
    async addTodo(body) {
      await delay();
      const made = todoFrom(body, todo(id('t'), body.text, { kind: body.kind, source: 'you', createdAt: iso(clock()) }));
      todos = [made, ...todos];
      return made;
    },
    async editTodo(todoId, body) {
      await delay();
      return replaceTodo(todoFrom(body, findTodo(todoId)));
    },
    async deleteTodo(todoId) {
      await delay();
      todos = todos.filter((t) => t.id !== todoId);
    },
    async answerTodo(todoId, answer, snoozeMinutes) {
      await delay();
      const found = findTodo(todoId);
      if (answer === 'done') return replaceTodo({ ...found, state: 'done', doneAt: iso(clock()) });
      if (answer === 'drop') return replaceTodo({ ...found, state: 'dropped' });
      const until = clock() + (snoozeMinutes ? snoozeMinutes * MINUTE : 16 * HOUR);
      return replaceTodo({ ...found, snoozedUntil: iso(until), ask: found.asked < 3 });
    },
    async todoOffers() {
      await delay();
      return offers;
    },
    async acceptTodoOffer(reminderId, dueAt) {
      await delay();
      const offer = offers.find((o) => o.reminderId === reminderId) ?? missing('offer');
      offers = offers.filter((o) => o.reminderId !== reminderId);
      const at = dueAt ?? offer.dueAt ?? todayAt(clock(), 9, 0, 1);
      const made = todo(id('t'), offer.text, {
        kind: 'reminder',
        source: 'chat',
        dueAt: at,
        hooks: [hook(id('h'), '', { kind: 'time', at }, at)],
        createdAt: iso(clock()),
      });
      todos = [made, ...todos];
      return made;
    },
    async declineTodoOffer(reminderId) {
      await delay();
      offers = offers.filter((o) => o.reminderId !== reminderId);
    },
    async hookSources() {
      await delay();
      return seedHookSources(places);
    },
    async addPlace(body) {
      await delay();
      const made: Place = { id: id('p'), label: body.label, lat: body.lat, lng: body.lng, radiusM: body.radius_m ?? 150 };
      places.push(made);
      return made;
    },
    async deletePlace(placeId) {
      await delay();
      const i = places.findIndex((p) => p.id === placeId);
      if (i >= 0) places.splice(i, 1);
    },
    async cart() {
      await delay();
      settleCart();
      return cart;
    },
    async addToCart(body) {
      await delay();
      const made: CartItem = {
        id: id('cart'),
        url: body.url,
        title: siteOf(body.url),
        picture: null,
        site: siteOf(body.url),
        price: null,
        previous: null,
        lowest: null,
        highest: null,
        target: body.target ?? null,
        inStock: null,
        history: [],
        status: 'checking',
        checkedAt: null,
        nextCheckAt: null,
        everyHours: body.every_hours ?? 24,
        collection: body.collection ?? null,
        notify: body.notify ?? 'drop',
      };
      checkingUntil.set(made.id, clock() + MOCK_THINK_MS * 2);
      cart = [made, ...cart];
      return made;
    },
    async cartItem(itemId) {
      await delay();
      settleCart();
      return cart.find((c) => c.id === itemId) ?? missing('watched link');
    },
    async editCartItem(itemId, body) {
      await delay();
      const found = cart.find((c) => c.id === itemId) ?? missing('watched link');
      const next: CartItem = {
        ...found,
        ...(body.target !== undefined ? { target: body.target } : {}),
        ...(body.notify ? { notify: body.notify } : {}),
        ...(body.every_hours ? { everyHours: body.every_hours } : {}),
        ...(body.collection !== undefined ? { collection: body.collection } : {}),
      };
      cart = cart.map((c) => (c.id === itemId ? next : c));
      return next;
    },
    async deleteCartItem(itemId) {
      await delay();
      cart = cart.filter((c) => c.id !== itemId);
    },
    async checkCartItem(itemId) {
      await delay(900);
      const found = cart.find((c) => c.id === itemId) ?? missing('watched link');
      const next: CartItem = found.status === 'failing' ? { ...found, checkedAt: iso(clock()) } : { ...found, status: 'ok', checkedAt: iso(clock()) };
      cart = cart.map((c) => (c.id === itemId ? next : c));
      return next;
    },
    async connectors() {
      await delay();
      return connectors;
    },
    async connectConnector(connectorId, fields) {
      await delay(700);
      const found = connectors.find((c) => c.id === connectorId) ?? missing('connector');
      const lacking = found.setup.fields.filter((f) => f.required && !String(fields[f.key] ?? '').trim());
      if (lacking.length) throw new ApiError('mock: missing fields', 400, null, 'missing_fields', { error: 'missing_fields', fields: lacking.map((f) => f.key) });
      const next: Connector = { ...found, status: 'connected', statusDetail: null };
      connectors = connectors.map((c) => (c.id === connectorId ? next : c));
      return next;
    },
    async disconnectConnector(connectorId) {
      await delay();
      const found = connectors.find((c) => c.id === connectorId) ?? missing('connector');
      const next: Connector = { ...found, status: found.setup.fields.length || found.setup.oauth ? 'available' : 'needs_setup', statusDetail: null };
      connectors = connectors.map((c) => (c.id === connectorId ? next : c));
      return next;
    },
    async makeWebhook(name) {
      await delay();
      const made: Connector = {
        id: id('c-hook'),
        name,
        summary: 'Anything that can send a web request can tell Goose something happened.',
        icon: 'webhook',
        category: 'custom',
        status: 'connected',
        statusDetail: null,
        kind: 'webhook',
        provides: { tools: 0, events: [{ id: 'received', label: 'It is called' }], feeds: ['todos'] },
        setup: { fields: [], oauth: null },
        webhookUrl: `https://pond.jarida.home:4443/api/v1/hooks/in/${(0xf00d + nextId).toString(16)}9c41e2b7d05a8f63`,
      };
      connectors = [...connectors, { ...made, webhookUrl: null }];
      return made;
    },
    async ideas() {
      await delay();
      return { ideas, state: clock() < ideasThinkingUntil ? 'thinking' : 'idle' };
    },
    async ideaGoose(ideaId) {
      await delay();
      const found = ideas.find((i) => i.id === ideaId) ?? missing('idea');
      const next: Idea = { ...found, state: 'working', taskId: id('task') };
      ideas = ideas.map((i) => (i.id === ideaId ? next : i));
      return next;
    },
    async ideaMine(ideaId) {
      await delay();
      const found = ideas.find((i) => i.id === ideaId) ?? missing('idea');
      const made = found.youCan.map((step) => todo(id('t'), step, { source: 'idea', ask: true, createdAt: iso(clock()) }));
      todos = [...made, ...todos];
      const next: Idea = { ...found, state: 'done' };
      ideas = ideas.map((i) => (i.id === ideaId ? next : i));
      return { idea: next, todos: made };
    },
    async dismissIdea(ideaId) {
      await delay();
      ideas = ideas.map((i) => (i.id === ideaId ? { ...i, state: 'dismissed' } : i));
    },
    async refreshIdeas() {
      await delay();
      ideasThinkingUntil = clock() + 6_000;
    },
    async catalog() {
      await delay();
      return seedCatalog();
    },
  };
}
