/**
 * My Goose as the hub, for a Pond that serves `/me/hub`. A find bar and a strip of jumps sit at
 * the top, so every part is one tap away. Under them it is ordered by what needs the member: the
 * sentence, what Goose is asking, the news, what Goose found (ideas, prices), the to-dos, the
 * watches, what Goose knows of them and how it works for them, what is connected, and what they
 * keep and follow. Each section is a heading over a few short rows that open the full screen; a
 * section with nothing in it folds away.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { router, useIsFocused } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { InkButton, InkCard, InkChoice, InkInput, InkSheet, InkSpinner, InkText, InkTextArea, inkText, useInkTheme } from '@/components/ui/ink';

import { ChromePuck, PUCK_SIZE } from '@/components/patterns/chrome-puck';
import { ContentUnavailable } from '@/components/patterns/content-unavailable';
import { Goose } from '@/components/patterns/goose';
import { GlyphRow } from '@/components/patterns/goose-shelves';
import { WebWatchGuidedSheet } from '@/components/patterns/web-watch-guided-sheet';
import { GIcon } from '@/components/ui/g-icon';
import { GPressable } from '@/components/ui/g-pressable';
import type { ThemeColors } from '@/constants/colors';
import { iconOr, type IconName } from '@/constants/icons';
import { Spacing } from '@/constants/spacing';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { catalogHref, type CatalogItem } from '@/models/catalog';
import { inUse } from '@/models/connectors';
import { ADDABLE_KINDS, anchorKindKey, candidates, followed, readyWork } from '@/models/anchors';
import type { MeHub } from '@/models/hub';
import { shownIdeas } from '@/models/ideas';
import { categoriesOf, categoryIcon, categoryKey } from '@/models/interests';
import { formatMoney } from '@/models/me-read';
import type { HubClause } from '@/models/my-goose';
import { formatPrice } from '@/models/my-goose';
import { splitStories } from '@/models/news';
import type { WebWatch } from '@/models/web-watches';
import { useBottomBarInset, useChromeScroll } from '@/providers/chrome-provider';
import { useTheme } from '@/providers/theme-provider';
import { selectionTick, tap } from '@/services/haptics';
import { Storage } from '@/services/storage';
import { useContentState } from '@/view-models/use-content-state';
import { useGooseActivity } from '@/view-models/use-goose-activity';
import { useIdeaCards, type UseIdeaCards } from '@/view-models/use-idea-cards';
import { AddIdeaSheet } from './idea-cards';
import { ideaKindKey, makingWords } from '@/models/idea-cards';
import { useMyGooseHub, type UseMyGooseHub } from '@/view-models/use-my-goose';
import { useListen, useStoryActions } from '@/view-models/use-news';
import { usePullToRefresh } from '@/view-models/use-pull-to-refresh';
import { usePriceWords } from './cart-parts';
import { DigestCard } from './digest-card';
import { QuestionBatchList } from './engine-parts';
import { GroupHeading, GroupRow, InsetGroup } from './following';
import { MoreLink, RoundButton, SectionHead, useAgo } from './hub-parts';
import { HubSentence } from './hub-sentence';
import { IdeaRow } from './idea-card';
import { InterestsGroup } from './interests-group';
import { ConnectorStrip } from './connector-strip';
import { CompactStory, LongReadShelf } from './news-cards';
import { CheckinRow, LocationSheet, OfferRow, TodoRow, openTodo } from './todo-parts';

function go(href: Parameters<typeof router.push>[0]) {
  void selectionTick();
  router.push(href);
}

/** How many of each thing the tab shows before "more": a screenful holds several sections. */
const COMPACT_STORIES = 4;
const SHOWN_TODOS = 4;
const SHOWN_ROWS = 3;

function targetHref(clause: HubClause): Parameters<typeof router.push>[0] {
  const target = clause.target;
  switch (target.to) {
    case 'todos':
      return '/(stack)/goose-todos';
    case 'interview':
      return '/(stack)/goose-interview';
    case 'news':
      return '/(stack)/goose-news';
    case 'digest':
      return { pathname: '/(stack)/goose-digest', params: { id: target.id } };
    case 'cart':
      return { pathname: '/(stack)/goose-cart-item', params: { id: target.id } };
    case 'ideas':
      return '/(stack)/goose-cards';
  }
}

/** Width of the goose on its pond beside the title, as the older My Goose had it. */
const GOOSE_SIZE = 88;

/** The title and today's date, with the goose afloat on its pond beside them, working while the hub loads. */
/** Past this the header has scrolled out of sight, and its goose rests. */
const HEADER_OUT = GOOSE_SIZE + Spacing.lg;

function Header({ working, out }: { working: boolean; out: boolean }) {
  const theme = useInkTheme();
  const { t, i18n } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  // The pond's ripples are drawn in the colour behind it: the page's own.
  const { colors } = useTheme();
  // The tab stays mounted behind the others, and a goose moving there costs the screen in front.
  const focused = useIsFocused();
  const title = inkText(theme, { role: 'display', size: '3xl', weight: 700, tracking: 'title', color: theme.color.text }).style;
  const today = new Date().toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <View style={styles.head}>
      <View style={styles.headText}>
        <Text style={title} accessibilityRole="header">
          {t('myGoose.title')}
        </Text>
        <InkText size="lg" weight="semibold" tone="secondary">
          {today}
        </InkText>
      </View>
      <Goose state={working ? 'working' : 'idle'} size={GOOSE_SIZE} ground={colors.background} still={!focused || out} />
    </View>
  );
}

function InterviewInvite({ hub }: { hub: MeHub }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const interview = hub.interview ? '/(stack)/goose-member-interview' : '/(stack)/goose-interview';
  return (
    <InkCard>
      <View style={styles.invite}>
        <InkText size="xl" weight="bold">
          {t('goose.invite.title')}
        </InkText>
        <InkText size="md" tone="secondary">
          {t('goose.invite.body')}
        </InkText>
        <View style={styles.inviteActions}>
          <InkButton variant="primary" icon="chat" onPress={() => go(interview)}>
            {t('goose.invite.start')}
          </InkButton>
          <InkButton variant="quiet" icon="plus" onPress={() => go('/(stack)/goose-interests')}>
            {t('goose.invite.addOne')}
          </InkButton>
        </View>
      </View>
    </InkCard>
  );
}

type HubChipKey = 'plans' | 'todos' | 'ideas' | 'news' | 'watching' | 'you' | 'following';
type Jump = { key: HubChipKey; icon: IconName; label: string };

function clauseChipLabel(clause: HubClause): { icon: IconName; label: string } {
  switch (clause.target.to) {
    case 'todos':
      return { icon: 'checklist', label: 'Reminders & To-dos' };
    case 'interview':
      return { icon: 'chat', label: 'Interview' };
    case 'news':
      return { icon: 'news', label: 'News' };
    case 'digest':
      return { icon: 'news', label: 'Open digest' };
    case 'cart':
      return { icon: 'cart', label: 'Tracked item' };
    case 'ideas':
      return { icon: 'light', label: 'Ideas' };
  }
}

/** Bigger category chips at the top so the user picks one area to explore instead of scrolling everything. */
const CHIPS_COLLAPSED_HEIGHT = 94;

function HubChips({
  hub,
  counts,
  selected,
  onSelect,
}: {
  hub: MeHub;
  counts: Record<HubChipKey, number>;
  selected: HubChipKey | null;
  onSelect: (next: HubChipKey | null) => void;
}) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const theme = useInkTheme();
  const [expanded, setExpanded] = useState(false);
  const [chipLayouts, setChipLayouts] = useState<Record<string, { y: number; height: number }>>({});
  const all: (Jump & { shown: boolean })[] = [
    { shown: hub.anchors, key: 'plans', icon: 'calendar', label: 'Goals' },
    { shown: hub.todos, key: 'todos', icon: 'checklist', label: 'Reminders & To-dos' },
    { shown: hub.ideas || hub.ideaCards, key: 'ideas', icon: 'light', label: t('goose.find.ideas') },
    { shown: hub.news, key: 'news', icon: 'news', label: t('goose.find.news') },
    { shown: true, key: 'watching', icon: 'eye', label: t('goose.find.watching') },
    { shown: true, key: 'you', icon: 'profile', label: 'You & Goose' },
    { shown: true, key: 'following', icon: 'sparkle', label: 'Following' },
  ];
  const jumps = all
    .filter((jump) => jump.shown)
    .sort((a, b) => (counts[b.key] ?? 0) - (counts[a.key] ?? 0));

  const { overflows, maxHeight } = useMemo(() => {
    const rects = jumps.map((j) => chipLayouts[j.key]).filter(Boolean);
    if (rects.length === 0) return { overflows: false, maxHeight: CHIPS_COLLAPSED_HEIGHT };
    const rows: number[] = [];
    for (const r of rects) {
      if (!rows.some((y) => Math.abs(y - r.y) < 6)) rows.push(r.y);
    }
    rows.sort((a, b) => a - b);
    if (rows.length <= 2) return { overflows: false, maxHeight: undefined };
    const secondRowY = rows[1];
    const thirdRowY = rows[2];
    const secondRowBottom = Math.max(
      ...rects.filter((r) => Math.abs(r.y - secondRowY) < 6).map((r) => r.y + r.height),
    );
    return { overflows: true, maxHeight: Math.floor((secondRowBottom + thirdRowY) / 2) };
  }, [chipLayouts, jumps]);

  return (
    <View style={styles.jumpsOuter} accessibilityLabel={t('goose.find.jumpTo')}>
      <View style={!expanded && maxHeight !== undefined ? { maxHeight, overflow: 'hidden' } : undefined}>
        <View style={styles.jumpsWrap}>
          {jumps.map((jump) => {
            const active = selected === jump.key;
            return (
              <GPressable
                key={jump.key}
                onLayout={(e) => {
                  const { y, height } = e.nativeEvent.layout;
                  setChipLayouts((prev) => {
                    const cur = prev[jump.key];
                    if (cur && Math.abs(cur.y - y) < 1 && Math.abs(cur.height - height) < 1) return prev;
                    return { ...prev, [jump.key]: { y, height } };
                  });
                }}
                onPress={() => {
                  void selectionTick();
                  onSelect(active ? null : jump.key);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={jump.label}
                style={[
                  styles.jumpBig,
                  {
                    backgroundColor: active ? theme.color.accent : theme.color.chrome,
                    borderColor: active ? theme.color.accent : theme.color.lineStrong,
                  },
                ]}
              >
                <GIcon name={jump.icon} size={17} color={active ? theme.color.textOnAccent : theme.color.accentLine} />
                <InkText
                  size="md"
                  weight="semibold"
                  style={active ? { color: theme.color.textOnAccent } : undefined}
                >
                  {jump.label}
                </InkText>
              </GPressable>
            );
          })}
        </View>
      </View>
      {overflows ? (
        <GPressable
          onPress={() => {
            void selectionTick();
            setExpanded((v) => !v);
          }}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Show fewer' : 'Show more'}
          style={styles.jumpsToggle}
        >
          <InkText size="xs" weight="semibold" style={{ color: theme.color.accentLine }}>
            {expanded ? 'Show less' : 'More'}
          </InkText>
          <View style={{ transform: [{ rotate: expanded ? '-90deg' : '90deg' }] }}>
            <GIcon name="chevron-right" size={14} color={theme.color.accentLine} />
          </View>
        </GPressable>
      ) : null}
    </View>
  );
}

/**
 * What Goose knows of the member and how it works for them: the sheet it works from, the profile,
 * the interview, its notes, the specialists and the budget, what it is working on, and the
 * pictures the member sends it.
 */
function YouAndGoose({ hub, g }: { hub: MeHub; g: UseMyGooseHub }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const activity = useGooseActivity(hub.activity);
  if (!hub.about && !hub.interview && !hub.screenshots && !hub.activity && !hub.facts && !hub.agents && !hub.captures && !hub.engine_log && !hub.intentions) return null;
  const { items, unseen } = activity.data;
  // What it did last says more than a caption; a count says there is something new to read.
  const did = unseen > 0 ? t('goose.you.activityNew', { count: unseen }) : (items[0]?.summary ?? t('goose.you.activityDetail'));
  const offered = g.specialists.data.some((s) => s.state === 'offered');
  const all: { shown: boolean; key: string; icon: IconName; label: string; detail: string | null; href: Parameters<typeof router.push>[0] }[] = [
    { shown: hub.facts, key: 'facts', icon: 'profile', label: t('goose.you.facts'), detail: g.factCount === null ? null : t('goose.you.factsDetail', { count: g.factCount }), href: '/(stack)/goose-facts' },
    { shown: true, key: 'memories', icon: 'memory', label: t('screens.memories'), detail: null, href: '/(stack)/memories' },
    { shown: hub.activity, key: 'activity', icon: 'activity', label: t('goose.you.activity'), detail: did, href: '/(stack)/goose-activity' },
    { shown: hub.engine_log || hub.intentions, key: 'work', icon: 'sparkle', label: t('goose.you.work'), detail: t('goose.you.workDetail'), href: '/(stack)/goose-work' },
    // With the fact sheet, "About you" is the sheet; the older profile is what Goose remembers.
    { shown: hub.about, key: 'about', icon: hub.facts ? 'memory' : 'profile', label: hub.facts ? t('goose.you.remembers') : t('goose.you.about'), detail: null, href: '/(stack)/goose-about' },
    { shown: hub.agents, key: 'specialists', icon: 'agent', label: t('goose.you.specialists'), detail: offered ? t('goose.you.specialistsOffered') : t('goose.you.specialistsDetail'), href: '/(stack)/goose-specialists' },
    { shown: hub.ledger && g.specialists.budgetOn, key: 'budget', icon: 'wallet', label: t('goose.you.budget'), detail: t('goose.you.budgetDetail'), href: '/(stack)/goose-ledger' },
    { shown: hub.interview, key: 'interview', icon: 'chat', label: t('goose.you.interview'), detail: t('goose.you.interviewStart'), href: '/(stack)/goose-member-interview' },
    { shown: hub.about, key: 'notes', icon: 'file-text', label: t('goose.you.notes'), detail: t('goose.you.notesDetail'), href: '/(stack)/goose-notes' },
    { shown: hub.about, key: 'instructions', icon: 'prompts', label: t('goose.you.instructions'), detail: t('goose.you.instructionsDetail'), href: '/(stack)/settings-prompt-templates' },
    { shown: hub.captures, key: 'pictures', icon: 'photo', label: t('goose.you.pictures'), detail: g.captures.settings.screenshots ? t('goose.you.picturesOn') : t('goose.you.picturesOff'), href: '/(stack)/goose-captures' },
    { shown: hub.screenshots && !hub.captures, key: 'screenshots', icon: 'photo', label: t('goose.you.screenshots'), detail: null, href: '/(stack)/goose-screenshots' },
  ];
  const rows = all.filter((row) => row.shown);
  return (
    <View style={styles.section}>
      <SectionHead title={t('goose.you.title')} subtitle={t('goose.you.subtitle')} size="small" />
      <InsetGroup>
        {rows.map((row, i) => (
          <GroupRow key={row.key} first={i === 0} icon={row.icon} label={row.label} detail={row.detail} onPress={() => go(row.href)} />
        ))}
      </InsetGroup>
    </View>
  );
}

/** Idea cards: the new ones first, then the saved, each opening the cards screen. */
function IdeaCards({ cards }: { cards: UseIdeaCards }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const [adding, setAdding] = useState(false);
  const waiting = makingWords(cards.data.set);
  const rows = [...cards.fresh, ...cards.saved];
  if (cards.loading && rows.length === 0) return null;
  const open = () => go('/(stack)/goose-cards');
  return (
    <View style={styles.section}>
      <SectionHead
        fact={cards.making ? t(waiting.key, { count: waiting.count }) : null}
        title={t('goose.ideaCards.title')}
        subtitle={t('goose.ideaCards.subtitle')}
        onOpen={open}
        trailing={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <RoundButton
              icon="chat"
              label="Brainstorm ideas"
              onPress={() =>
                go({
                  pathname: '/conversation',
                  params: {
                    ask: "Let's brainstorm ideas together based on my interests and saved ideas. Ask me what I'm curious about or want to explore, and we can shape new ideas I can try later.",
                  },
                })
              }
            />
            <RoundButton icon="plus" label="Add idea" onPress={() => setAdding(true)} />
            <RoundButton icon="refresh" label={t('goose.ideaCards.refreshLabel')} onPress={() => void (cards.making ? undefined : cards.actions.refresh())} />
          </View>
        }
      />
      <AddIdeaSheet open={adding} onClose={() => setAdding(false)} onCreate={cards.actions.create} />
      {rows.length ? (
        <InsetGroup>
          {rows.slice(0, SHOWN_ROWS).map((card, i) => (
            <GroupRow
              key={card.id}
              first={i === 0}
              icon={card.state === 'saved' ? 'archive' : 'light'}
              label={card.title}
              detail={`${t(card.state === 'saved' ? 'goose.ideaCards.rowSaved' : 'goose.ideaCards.rowNew')}, ${t(ideaKindKey(card.kind))}`}
              onPress={open}
            />
          ))}
        </InsetGroup>
      ) : (
        <InkText size="md" tone="secondary">
          {t('goose.ideaCards.empty')}
        </InkText>
      )}
      {rows.length > SHOWN_ROWS ? <MoreLink label={t('goose.ideaCards.seeAll')} onPress={open} /> : null}
    </View>
  );
}

/** Goose's open and waiting questions, each batch under its plan's or chat's title, answered here. */
function Questions({ g }: { g: UseMyGooseHub }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const vm = g.questions;
  if (vm.batches.length === 0) return null;
  return (
    <View style={styles.section}>
      <SectionHead
        fact={t('goose.plans.questions', { count: vm.count })}
        title={t('home.questions.title')}
        subtitle={t('goose.questions.lead')}
        onOpen={() => go('/(stack)/goose-questions')}
      />
      <InkCard>
        <QuestionBatchList
          vm={vm}
          onOpenPlan={(id) => go({ pathname: '/(stack)/goose-anchor', params: { id } })}
          onOpenChat={(session, title) => go({ pathname: '/conversation', params: { session, title } })}
        />
      </InkCard>
    </View>
  );
}

/**
 * Plans and things you follow: what is ready to read, what Goose offered, then the
 * plans themselves, a few rows that open each, and the way to all of them.
 */
function Plans({ g }: { g: UseMyGooseHub }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const all = g.anchors.data;
  const ready = readyWork(all);
  const offered = candidates(all);
  const shown = followed(all);
  const asked = g.questions.count;
  if (g.anchors.loading && all.length === 0) return null;
  const facts = [ready.length ? t('goose.plans.ready', { count: ready.length }) : null, asked ? t('goose.plans.questions', { count: asked }) : null].filter(Boolean).join(', ');
  return (
    <View style={styles.section}>
      <SectionHead
        fact={facts || null}
        title={t('goose.plans.title')}
        subtitle={t('goose.plans.subtitle')}
        onOpen={() => go('/(stack)/goose-plans')}
        trailing={<RoundButton icon="plus" label={t('goose.plans.add')} onPress={() => go({ pathname: '/(stack)/goose-plans', params: { add: '1' } })} />}
      />
      {ready.length || offered.length ? (
        <InsetGroup>
          {ready.slice(0, SHOWN_ROWS).map((work, i) => (
            <GroupRow
              key={work.deliverable.id}
              first={i === 0}
              icon="sparkle"
              label={work.deliverable.title}
              detail={[work.anchor.title, work.deliverable.hook].filter(Boolean).join(', ')}
              onPress={() => go({ pathname: '/(stack)/goose-deliverable', params: { id: work.deliverable.id } })}
            />
          ))}
          {offered.slice(0, SHOWN_ROWS).map((anchor, i) => (
            <GroupRow
              key={anchor.id}
              first={ready.length === 0 && i === 0}
              icon="light"
              label={anchor.title}
              detail={t('goose.plans.offered')}
              onPress={() => go({ pathname: '/(stack)/goose-anchor', params: { id: anchor.id } })}
            />
          ))}
        </InsetGroup>
      ) : null}
      {shown.length ? (
        <InsetGroup>
          {shown.slice(0, SHOWN_ROWS).map((anchor, i) => (
            <GroupRow
              key={anchor.id}
              first={i === 0}
              icon={anchor.mine ? 'calendar' : 'users'}
              label={anchor.title}
              detail={anchor.job ? t('goose.plans.working') : anchor.sharedBy ? t('goose.plans.by', { name: anchor.sharedBy }) : t(anchorKindKey(anchor.kind))}
              onPress={() => go({ pathname: '/(stack)/goose-anchor', params: { id: anchor.id } })}
            />
          ))}
        </InsetGroup>
      ) : offered.length === 0 && ready.length === 0 ? (
        <InkText size="md" tone="secondary">
          {t('goose.plans.empty')}
        </InkText>
      ) : null}
      {shown.length > SHOWN_ROWS ? <MoreLink label={t('goose.plans.more')} onPress={() => router.push('/(stack)/goose-plans')} /> : null}
    </View>
  );
}

function Asking({ g }: { g: UseMyGooseHub }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const theme = useInkTheme();
  const [busy, setBusy] = useState<string | null>(null);
  const { asking, offers } = g.todos.data;
  if (asking.length + offers.length === 0) return null;
  const run = async (id: string, work: () => Promise<unknown>) => {
    setBusy(id);
    await work();
    setBusy(null);
  };
  return (
    <View style={styles.section}>
      <SectionHead title={t('goose.asking.title')} subtitle={t('goose.asking.subtitle')} />
      <InkCard contentStyle={styles.askCard}>
        {asking.map((todo, i) => (
          <View key={todo.id} style={i > 0 ? [styles.divided, { borderTopColor: theme.color.line }] : null}>
            <CheckinRow
              todo={todo}
              busy={busy === todo.id}
              onDone={() => void run(todo.id, () => g.todos.actions.answer(todo, 'done'))}
              onNotYet={() => void run(todo.id, () => g.todos.actions.answer(todo, 'not_yet'))}
            />
          </View>
        ))}
        {offers.map((offer, i) => (
          <View key={offer.reminderId} style={asking.length + i > 0 ? [styles.divided, { borderTopColor: theme.color.line }] : null}>
            <OfferRow
              offer={offer}
              busy={busy === offer.reminderId}
              onAdd={(dueAt) => void run(offer.reminderId, () => g.todos.actions.acceptOffer(offer, dueAt))}
              onNo={() => void run(offer.reminderId, () => g.todos.actions.declineOffer(offer))}
            />
          </View>
        ))}
      </InkCard>
    </View>
  );
}

function News({ g }: { g: UseMyGooseHub }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const ago = useAgo();
  const actions = useStoryActions();
  const listen = useListen();
  const { data, loading } = g.news;
  const followed = useMemo(() => new Map(g.interests.data.map((i) => [i.id, i.news !== 'off'])), [g.interests.data]);
  const { news } = splitStories(data.stories);
  const hero = news[0];
  const digest = data.digest;

  if (loading && news.length === 0 && !digest) return null;

  const blocked =
    data.blocked === 'web_search' ? (
      <InkCard>
        <View style={styles.invite}>
          <InkText size="lg" weight="bold">
            {t('goose.news.blockedSearchTitle')}
          </InkText>
          <InkText tone="secondary">{t('goose.news.blockedSearchBody')}</InkText>
          <InkButton variant="primary" icon="globe" onPress={() => go('/(stack)/goose-connectors')} style={styles.start}>
            {t('goose.news.blockedSearchAction')}
          </InkButton>
        </View>
      </InkCard>
    ) : null;

  // A new member is already invited at the top; the news says nothing more until there is some.
  if (!hero && !digest && !blocked) {
    if (data.state !== 'writing') return null;
    return (
      <View style={styles.section}>
        <SectionHead title={t('goose.news.title')} />
        <InkSpinner label={t('goose.news.writingFirst')} />
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <SectionHead
        fact={data.state === 'writing' ? t('goose.news.writingNow') : data.lastWrittenAt ? t('goose.news.updated', { when: ago(data.lastWrittenAt) }) : null}
        title={t('goose.news.title')}
        subtitle={t('goose.news.subtitle')}
        onOpen={() => go('/(stack)/goose-news')}
        openLabel={t('goose.news.openAll')}
        trailing={<RoundButton icon="sliders" label={t('goose.newsSettings.title')} onPress={() => go('/(stack)/goose-news-settings')} />}
      />
      {blocked}
      {news.slice(0, COMPACT_STORIES).map((story) => (
        <CompactStory key={story.id} story={story} actions={actions} followed={story.interest ? (followed.get(story.interest.id) ?? null) : null} />
      ))}
      {digest ? (
        <DigestCard digest={digest} listen={listen.state} onPlay={() => digest.listen && void listen.play(digest.listen)} onStop={listen.stop} />
      ) : null}
      {news.length > COMPACT_STORIES || digest ? <MoreLink label={t('goose.news.more')} onPress={() => router.push('/(stack)/goose-news')} /> : null}
    </View>
  );
}

function Ideas({ g }: { g: UseMyGooseHub }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  // New ideas lead here: the ones Goose is already working on can wait their turn.
  const ideas = shownIdeas(g.ideas.data.ideas)
    .filter((i) => i.state !== 'done' || g.ideas.made[i.id])
    .sort((a, b) => Number(b.state === 'new') - Number(a.state === 'new'));
  if (ideas.length === 0) return null;
  const fresh = ideas.filter((i) => i.state === 'new').length;
  return (
    <View style={styles.section}>
      <SectionHead
        fact={fresh ? t('goose.ideas.fresh', { count: fresh }) : null}
        title={t('goose.ideas.title')}
        subtitle={t('goose.ideas.subtitle')}
        onOpen={() => go('/(stack)/goose-ideas')}
      />
      <InsetGroup>
        {ideas.slice(0, SHOWN_ROWS).map((idea, i) => (
          <IdeaRow key={idea.id} idea={idea} first={i === 0} onOpen={() => go({ pathname: '/(stack)/goose-idea', params: { id: idea.id } })} />
        ))}
      </InsetGroup>
      <MoreLink label={t('goose.ideas.more')} onPress={() => router.push('/(stack)/goose-ideas')} />
    </View>
  );
}

function Prices({ g }: { g: UseMyGooseHub }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const words = usePriceWords();
  const items = g.cart.data;
  const kept = g.cart.kept;
  if (items.length === 0 && kept.length === 0) return null;
  return (
    <View style={styles.section}>
      <SectionHead
        fact={items.length ? t('goose.cart.onWatch', { count: items.length }) : null}
        title={t('goose.cart.title')}
        subtitle={t('goose.cart.subtitle')}
        onOpen={() => go('/(stack)/goose-cart')}
      />
      {items.length ? (
        <InsetGroup>
          {items.slice(0, SHOWN_ROWS).map((item, i) => {
            const moved = words(item);
            return (
              <GroupRow
                key={item.id}
                first={i === 0}
                picture={item.picture}
                initial={item.title.charAt(0)}
                label={item.title}
                detail={[item.site, moved?.text].filter(Boolean).join(', ')}
                value={item.price ? formatMoney(item.price) : t('goose.cart.noPrice')}
                onPress={() => go({ pathname: '/(stack)/goose-cart-item', params: { id: item.id } })}
              />
            );
          })}
        </InsetGroup>
      ) : null}
      {kept.length ? (
        <InsetGroup>
          {kept.slice(0, 3).map((cart, i) => (
            <GroupRow
              key={cart.name ?? ''}
              first={i === 0}
              icon="package"
              label={cart.name ?? t('myGoose.cart.loose')}
              detail={t('goose.cart.keptListings', { count: cart.lines.length })}
              value={cart.low ? formatPrice(cart.low) : null}
              onPress={() => go('/(stack)/goose-cart')}
            />
          ))}
        </InsetGroup>
      ) : null}
      <MoreLink label={t('goose.cart.more')} onPress={() => router.push('/(stack)/goose-cart')} />
    </View>
  );
}

function LongReads({ g }: { g: UseMyGooseHub }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const { longReads } = splitStories(g.news.data.stories);
  if (longReads.length === 0) return null;
  return (
    <View style={styles.section}>
      <SectionHead title={t('goose.news.longReads')} subtitle={t('goose.news.longReadsSubtitle')} />
      <LongReadShelf stories={longReads} />
    </View>
  );
}

function Todos({ g, onNeedsLocation }: { g: UseMyGooseHub; onNeedsLocation: () => void }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const theme = useInkTheme();
  const { upcoming } = g.todos.data;
  if (g.todos.loading && upcoming.length === 0) return null;
  return (
    <View style={styles.section}>
      <SectionHead
        title={t('goose.todos.title')}
        subtitle={upcoming.length ? t('goose.todos.subtitle', { count: upcoming.length }) : null}
        onOpen={() => go('/(stack)/goose-todos')}
        trailing={<RoundButton icon="plus" label={t('goose.todos.add')} onPress={() => openTodo(null)} />}
      />
      {upcoming.length === 0 ? (
        <GPressable onPress={() => openTodo(null)} accessibilityRole="button" accessibilityLabel={t('goose.todos.emptyAction')} style={styles.emptyRow}>
          <GIcon name="plus" size={18} color={theme.color.accentLine} />
          <InkText size="md" tone="secondary" style={{ flex: 1 }}>
            {t('goose.todos.emptyHub')}
          </InkText>
        </GPressable>
      ) : (
        <View>
          {upcoming.slice(0, SHOWN_TODOS).map((todo, i) => (
            <View key={todo.id} style={i > 0 ? [styles.divided, { borderTopColor: theme.color.line }] : null}>
              <TodoRow todo={todo} sources={g.todos.sources} access={g.todos.access} onToggle={() => g.todos.actions.setDone(todo, true)} onNeedsLocation={onNeedsLocation} />
            </View>
          ))}
          {upcoming.length > SHOWN_TODOS ? <MoreLink label={t('goose.todos.more', { count: upcoming.length - SHOWN_TODOS })} onPress={() => router.push('/(stack)/goose-todos')} /> : null}
        </View>
      )}
    </View>
  );
}

function Watching({ g }: { g: UseMyGooseHub }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const watches = g.watches.data.watches;
  if (watches.length === 0) return null;
  const open = (w: WebWatch) => go({ pathname: '/(stack)/web-watch', params: { id: w.id } });
  const ordered = [...watches].sort((a, b) => b.matchingCount - a.matchingCount);
  return (
    <View style={styles.section}>
      <SectionHead title={t('goose.watching.title')} subtitle={t('goose.watching.subtitle')} onOpen={() => go('/(stack)/web-watches')} size="small" />
      <InsetGroup>
        {ordered.slice(0, SHOWN_ROWS).map((w, i) => (
          <GroupRow key={w.id} first={i === 0} icon="eye" label={w.title} detail={w.filtersWords || w.lookingFor} value={w.matchingCount ? String(w.matchingCount) : null} onPress={() => open(w)} />
        ))}
      </InsetGroup>
      {ordered.length > SHOWN_ROWS ? <MoreLink label={t('goose.watching.all')} onPress={() => router.push('/(stack)/web-watches')} /> : null}
    </View>
  );
}

function Connectors({ g }: { g: UseMyGooseHub }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  if (!g.hub.connectors || (g.connectors.loading && g.connectors.data.length === 0)) return null;
  const used = inUse(g.connectors.data);
  return (
    <View style={styles.section}>
      <SectionHead title={t('goose.connectors.title')} subtitle={used.length ? null : t('goose.connectors.noneYet')} onOpen={() => go('/(stack)/goose-connectors')} size="small" />
      <ConnectorStrip connectors={used} />
    </View>
  );
}

function catalogDetail(item: CatalogItem, t: (k: 'goose.catalog.off' | 'goose.catalog.needsSetup') => string): string {
  if (item.state === 'needs_setup') return `${t('goose.catalog.needsSetup')}. ${item.body}`;
  if (item.state === 'off') return `${t('goose.catalog.off')}. ${item.body}`;
  return item.body;
}

export function openCatalogItem(item: CatalogItem) {
  if (item.opens) go(catalogHref(item.opens));
  else if (item.try) go({ pathname: '/conversation', params: { ask: item.try } });
}

function MoreGooseCanDo({ g }: { g: UseMyGooseHub }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const items = g.catalog.data.filter((i) => i.opens || i.try);
  if (items.length === 0) return null;
  return (
    <View style={styles.section}>
      <SectionHead title={t('goose.catalog.title')} onOpen={() => go('/(stack)/goose-catalog')} size="small" />
      <View>
        {items.slice(0, 4).map((item) => (
          <GlyphRow key={item.id} icon={iconOr(item.icon, 'sparkle')} title={item.title} detail={catalogDetail(item, t)} onPress={() => openCatalogItem(item)} />
        ))}
      </View>
    </View>
  );
}

type Folded = { interests?: boolean; sections?: boolean };

function Following({ g }: { g: UseMyGooseHub }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const theme = useInkTheme();
  const [editing, setEditing] = useState(false);
  const [folded, setFolded] = useState<Folded>({});
  useEffect(() => {
    void Storage.getJSON<Folded>('followingFolded').then((f) => f && setFolded(f));
  }, []);
  const fold = (key: keyof Folded) => {
    const next = { ...folded, [key]: !folded[key] };
    setFolded(next);
    void Storage.setJSON('followingFolded', next);
  };
  const { confirmed } = g.interests.groups;
  const sections = categoriesOf(confirmed);
  const title = inkText(theme, { role: 'display', size: '2xl', weight: 700, tracking: 'title', color: theme.color.text }).style;

  return (
    <View style={styles.section}>
      <View style={styles.followHead}>
        <View style={{ flex: 1 }}>
          <Text style={title} accessibilityRole="header">
            {t('goose.following.title')}
          </Text>
          <InkText size="md" weight="semibold" tone="secondary">
            {t('goose.following.subtitle')}
          </InkText>
        </View>
        {g.hub.interests && confirmed.length > 0 ? (
          <GPressable
            onPress={() => {
              void tap();
              setEditing((e) => !e);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: editing }}
            style={[styles.pill, { backgroundColor: editing ? theme.color.accent : theme.color.chrome, borderColor: editing ? theme.color.accent : theme.color.lineStrong }]}
          >
            <InkText size="md" weight="semibold" style={{ color: editing ? theme.color.textOnAccent : theme.color.text }}>
              {editing ? t('goose.following.done') : t('goose.following.edit')}
            </InkText>
          </GPressable>
        ) : null}
      </View>

      <InsetGroup>
        <GroupRow first icon="archive" label={t('goose.following.saved')} onPress={() => go('/(stack)/saved')} />
        <GroupRow icon="users" label={t('goose.following.shared')} onPress={() => go({ pathname: '/(stack)/saved', params: { shared: '1' } })} />
        <GroupRow icon="news" label={t('goose.following.savedStories')} onPress={() => go({ pathname: '/(stack)/saved', params: { collection: t('goose.saved.storiesCollection') } })} />
        {g.hub.news ? <GroupRow icon="schedule" label={t('goose.following.history')} onPress={() => go('/(stack)/goose-history')} /> : null}
      </InsetGroup>

      {g.hub.interests ? (
        <View style={styles.group}>
          <GroupHeading title={t('goose.following.interests')} folded={folded.interests} onToggle={() => fold('interests')} />
          {!folded.interests ? (
            <InterestsGroup interests={g.interests} editing={editing} onAdd={() => go({ pathname: '/(stack)/goose-interests', params: { add: '1' } })} />
          ) : null}
        </View>
      ) : null}

      {sections.length > 0 ? (
        <View style={styles.group}>
          <GroupHeading title={t('goose.following.sections')} folded={folded.sections} onToggle={() => fold('sections')} />
          {!folded.sections ? (
            <InsetGroup>
              {sections.map((s, i) => (
                <GroupRow
                  key={s.category}
                  first={i === 0}
                  icon={categoryIcon(s.category)}
                  label={t(categoryKey(s.category))}
                  detail={s.interests.map((x) => x.topic).join(', ')}
                  onPress={() => go({ pathname: '/(stack)/goose-section', params: { category: s.category } })}
                />
              ))}
            </InsetGroup>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function HubMyGoose({ hub }: { hub: MeHub }) {
  const { t } = useTranslation();
  const theme = useInkTheme();
  const styles = useThemedStyles(makeStyles);
  const chrome = useChromeScroll();
  // The header's goose works only while it can be seen; the bail-out keeps a scroll from re-rendering.
  const [headerOut, setHeaderOut] = useState(false);
  const { onScroll: chromeScroll } = chrome;
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      chromeScroll(e);
      const out = e.nativeEvent.contentOffset.y > HEADER_OUT;
      setHeaderOut((was) => (was === out ? was : out));
    },
    [chromeScroll],
  );
  const bottomInset = useBottomBarInset();
  const g = useMyGooseHub(hub);
  const pull = usePullToRefresh(g.reload);
  const [placesSheet, setPlacesSheet] = useState(false);
  const [selectedChip, setSelectedChip] = useState<HubChipKey | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [ideaModalOpen, setIdeaModalOpen] = useState(false);
  const ideaCards = useIdeaCards(hub.ideaCards);
  const [watchModalOpen, setWatchModalOpen] = useState(false);
  const [goalKind, setGoalKind] = useState<(typeof ADDABLE_KINDS)[number]>('trip');
  const [goalTitle, setGoalTitle] = useState('');
  const [goalPlace, setGoalPlace] = useState('');
  const [goalNotes, setGoalNotes] = useState('');
  const [savingGoal, setSavingGoal] = useState(false);

  const clauses = g.clauses.map((clause) => ({
    text: t(clause.key as never, clause.params) as string,
    chip: clauseChipLabel(clause),
    onPress: () => go(targetHref(clause)),
  }));

  const anything =
    g.news.data.stories.length +
      g.todos.data.open.length +
      g.todos.data.offers.length +
      g.cart.data.length +
      g.ideas.data.ideas.length +
      g.interests.data.length +
      g.anchors.data.length >
      0 || !!g.news.data.digest;
  const failed = g.news.failed && g.todos.failed && g.interests.failed;
  const state = useContentState({ loading: g.loading, failed, hasContent: anything });
  const reload = useCallback(() => g.reload(), [g]);

  const handlePlus = useCallback(() => {
    void selectionTick();
    if (selectedChip === 'plans') {
      setGoalModalOpen(true);
      return;
    }
    if (selectedChip === 'todos') {
      openTodo(null);
      return;
    }
    if (selectedChip === 'watching') {
      setWatchModalOpen(true);
      return;
    }
    if (selectedChip === 'following') {
      go({ pathname: '/(stack)/goose-interests', params: { add: '1' } });
      return;
    }
    setAddModalOpen(true);
  }, [selectedChip]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        {...chrome}
        onScroll={onScroll}
        style={styles.page}
        contentContainerStyle={[
          styles.scroll,
          selectedChip === null && styles.scrollCentered,
          { paddingBottom: bottomInset + PUCK_SIZE + Spacing['2xl'] },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl {...pull} />}
      >
        <Header working={g.loading} out={headerOut} />
        <HubChips
          hub={hub}
          counts={{
            plans: g.anchors.data.length,
            todos: g.todos.data.open.length + g.todos.data.offers.length,
            ideas: hub.cards.length,
            news: g.news.data.stories.length,
            watching: g.watches.data.watches.length,
            following: g.interests.data.length,
            you: 1,
          }}
          selected={selectedChip}
          onSelect={setSelectedChip}
        />

        {selectedChip === null ? (
          <View style={styles.centerStage}>
            {g.loading && !anything ? (
              <InkSpinner label={t('myGoose.loading')} />
            ) : (
              <>
                <HubSentence clauses={clauses} quiet={t('goose.say.quiet')} />
                {clauses.length > 0 ? (
                  <View style={styles.clauseChips}>
                    {clauses.map((c, idx) => (
                      <GPressable
                        key={`${c.chip.label}-${idx}`}
                        onPress={c.onPress}
                        accessibilityRole="button"
                        style={[
                          styles.smallChip,
                          { backgroundColor: theme.color.chrome, borderColor: theme.color.lineStrong },
                        ]}
                      >
                        <GIcon name={c.chip.icon} size={13} color={theme.color.accentLine} />
                        <InkText size="xs" weight="semibold">
                          {c.chip.label}
                        </InkText>
                      </GPressable>
                    ))}
                  </View>
                ) : null}
              </>
            )}
            {state === 'unreachable' || state === 'failed' ? <ContentUnavailable state={state} onRetry={reload} /> : null}
            {g.newMember ? <InterviewInvite hub={hub} /> : null}
          </View>
        ) : (
          <View style={styles.selectedStage}>
            {selectedChip === 'plans' && hub.anchors ? <Plans g={g} /> : null}
            {selectedChip === 'todos' && hub.todos ? (
              <>
                <Asking g={g} />
                <Todos g={g} onNeedsLocation={() => setPlacesSheet(true)} />
              </>
            ) : null}
            {selectedChip === 'ideas' ? (
              <>
                {hub.ideaCards ? <IdeaCards cards={ideaCards} /> : null}
                {hub.questions ? <Questions g={g} /> : null}
              </>
            ) : null}
            {selectedChip === 'news' && hub.news ? (
              <>
                <News g={g} />
                <LongReads g={g} />
              </>
            ) : null}
            {selectedChip === 'watching' ? <Watching g={g} /> : null}
            {selectedChip === 'you' ? <YouAndGoose hub={hub} g={g} /> : null}
            {selectedChip === 'following' ? <Following g={g} /> : null}
          </View>
        )}
      </ScrollView>

      {/* Bottom floating dock: minimized Search puck on the left, contextual + puck on the right */}
      <View pointerEvents="box-none" style={[styles.bottomDock, { bottom: bottomInset + Spacing.sm }]}>
        <ChromePuck
          icon="search"
          label={t('goose.find.placeholder')}
          onPress={() => go('/(stack)/goose-search')}
        />
        <ChromePuck
          icon="plus"
          label="Add or change"
          onPress={handlePlus}
        />
      </View>

      <LocationSheet open={placesSheet} access={g.todos.access} onClose={() => setPlacesSheet(false)} onAllow={g.todos.actions.allowLocation} />

      {addModalOpen ? (
        <View style={styles.inTreeSheetRoot} pointerEvents="box-none">
          <GPressable
            feedback="none"
            haptic="none"
            onPress={() => setAddModalOpen(false)}
            accessibilityLabel={t('common.cancel')}
            style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
          />
          <View
            style={[
              styles.inTreeSheetPanel,
              {
                backgroundColor: theme.color.surface,
                borderColor: theme.color.edge,
                paddingBottom: Math.max(bottomInset, Spacing.xl),
              },
            ]}
          >
            <View style={[styles.sheetGrabber, { backgroundColor: theme.color.textDisabled }]} />
            <InkText size="xl" weight="bold" style={styles.sheetTitle}>
              Add or change
            </InkText>
            <View style={styles.modalList}>
              {hub.anchors ? (
                <InkButton
                  variant="quiet"
                  icon="calendar"
                  onPress={() => {
                    setAddModalOpen(false);
                    setGoalModalOpen(true);
                  }}
                >
                  Add Goal or Plan
                </InkButton>
              ) : null}
              {hub.todos ? (
                <InkButton
                  variant="quiet"
                  icon="checklist"
                  onPress={() => {
                    setAddModalOpen(false);
                    openTodo(null);
                  }}
                >
                  Add Reminder or To-do
                </InkButton>
              ) : null}
              <InkButton
                variant="quiet"
                icon="eye"
                onPress={() => {
                  setAddModalOpen(false);
                  setWatchModalOpen(true);
                }}
              >
                Add Web Watch
              </InkButton>
              {hub.interests ? (
                <InkButton
                  variant="quiet"
                  icon="sparkle"
                  onPress={() => {
                    setAddModalOpen(false);
                    go({ pathname: '/(stack)/goose-interests', params: { add: '1' } });
                  }}
                >
                  Add Interest
                </InkButton>
              ) : null}
              {hub.ideaCards ? (
                <InkButton
                  variant="quiet"
                  icon="light"
                  onPress={() => {
                    setAddModalOpen(false);
                    setIdeaModalOpen(true);
                  }}
                >
                  Add Idea
                </InkButton>
              ) : null}
              <InkButton
                variant="primary"
                icon="chat"
                onPress={() => {
                  setAddModalOpen(false);
                  go('/conversation');
                }}
              >
                Ask Goose
              </InkButton>
            </View>
          </View>
        </View>
      ) : null}

      <AddIdeaSheet open={ideaModalOpen} onClose={() => setIdeaModalOpen(false)} onCreate={ideaCards.actions.create} />

      <InkSheet open={goalModalOpen} onClose={() => setGoalModalOpen(false)} title={t('goose.plans.addTitle')} scroll>
        <View style={styles.modalList}>
          <View style={styles.clauseChips}>
            {ADDABLE_KINDS.map((k) => (
              <InkChoice key={k} selected={goalKind === k} onSelect={() => setGoalKind(k)}>
                {t(anchorKindKey(k))}
              </InkChoice>
            ))}
          </View>
          <InkInput
            label={t('goose.plans.addWhat')}
            value={goalTitle}
            onChange={setGoalTitle}
            placeholder={t('goose.plans.addWhatPlaceholder')}
          />
          <InkInput
            label={t('goose.plans.addPlace')}
            value={goalPlace}
            onChange={setGoalPlace}
            placeholder={t('goose.plans.addPlacePlaceholder')}
          />
          <InkTextArea
            label={t('goose.plans.addNotes')}
            value={goalNotes}
            onChange={setGoalNotes}
            placeholder={t('goose.plans.addNotesPlaceholder')}
            rows={2}
            maxRows={4}
          />
          <InkButton
            variant="primary"
            block
            loading={savingGoal}
            disabled={!goalTitle.trim() || savingGoal}
            onPress={async () => {
              setSavingGoal(true);
              const done = await g.anchors.actions.add({
                kind: goalKind,
                title: goalTitle,
                ...(goalPlace.trim() ? { place: goalPlace.trim() } : {}),
                ...(goalNotes.trim() ? { notes: goalNotes.trim() } : {}),
              });
              setSavingGoal(false);
              if (done) {
                setGoalTitle('');
                setGoalPlace('');
                setGoalNotes('');
                setGoalModalOpen(false);
              }
            }}
          >
            {t('goose.plans.addSave')}
          </InkButton>
        </View>
      </InkSheet>

      <WebWatchGuidedSheet
        open={watchModalOpen}
        onClose={() => setWatchModalOpen(false)}
        onCreated={() => void g.reload()}
      />
    </SafeAreaView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    page: { flex: 1 },
    scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, gap: Spacing.xl },
    scrollCentered: { flexGrow: 1 },
    centerStage: { flex: 1, justifyContent: 'center', gap: Spacing.lg, paddingVertical: Spacing.xl },
    selectedStage: { gap: Spacing.xl },
    clauseChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
    smallChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
    bottomDock: { position: 'absolute', left: Spacing.lg, right: Spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    modalList: { gap: Spacing.md, paddingBottom: Spacing.xl },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
    headText: { flex: 1 },
    jumpsOuter: { gap: Spacing.xs },
    jumpsCollapsed: { maxHeight: CHIPS_COLLAPSED_HEIGHT, overflow: 'hidden' },
    jumpsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    jumpsToggle: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, paddingVertical: 4 },
    jumpBig: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
    section: { gap: Spacing.md },
    group: { gap: Spacing.xs },
    invite: { gap: Spacing.sm },
    inviteActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.xs },
    start: { alignSelf: 'flex-start', marginTop: Spacing.xs },
    askCard: { paddingVertical: Spacing.xs, gap: 0 },
    divided: { borderTopWidth: StyleSheet.hairlineWidth },
    emptyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
    followHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
    pill: { paddingHorizontal: Spacing.lg, paddingVertical: 7, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, marginTop: 6 },
    inTreeSheetRoot: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'flex-end', zIndex: 50 },
    inTreeSheetPanel: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderWidth: 1,
      borderBottomWidth: 0,
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.sm,
      gap: Spacing.sm,
    },
    sheetGrabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginBottom: Spacing.xs },
    sheetTitle: { marginBottom: Spacing.xs },
  });
