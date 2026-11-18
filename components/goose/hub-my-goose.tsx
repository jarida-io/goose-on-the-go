/**
 * My Goose as the hub, for a Pond that serves `/me/hub`. A find bar and a strip of jumps sit at
 * the top, so every part is one tap away. Under them it is ordered by what needs the member: the
 * sentence, what Goose is asking, the news, what Goose found (ideas, prices), the to-dos, the
 * watches, what Goose knows of them and how it works for them, what is connected, and what they
 * keep and follow. Each section is a heading over a few short rows that open the full screen; a
 * section with nothing in it folds away.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { router, useIsFocused } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { InkButton, InkCard, InkSpinner, InkText, inkText, useInkTheme } from '@/components/ui/ink';

import { ContentUnavailable } from '@/components/patterns/content-unavailable';
import { Goose } from '@/components/patterns/goose';
import { GlyphRow } from '@/components/patterns/goose-shelves';
import { GIcon } from '@/components/ui/g-icon';
import { GPressable } from '@/components/ui/g-pressable';
import type { ThemeColors } from '@/constants/colors';
import { iconOr, type IconName } from '@/constants/icons';
import { Spacing } from '@/constants/spacing';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { catalogHref, type CatalogItem } from '@/models/catalog';
import { inUse } from '@/models/connectors';
import { anchorKindKey, candidates, followed, readyWork } from '@/models/anchors';
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
import { useIdeaCards } from '@/view-models/use-idea-cards';
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
      return '/(stack)/goose-ideas';
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

type Jump = { key: string; icon: IconName; label: string; href: Parameters<typeof router.push>[0] };

/** The find bar and the jumps: every part of My Goose, one tap from the top. */
function FindAndJump({ hub }: { hub: MeHub }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const theme = useInkTheme();
  const all: (Jump & { shown: boolean })[] = [
    { shown: hub.anchors, key: 'plans', icon: 'calendar', label: t('goose.find.plans'), href: '/(stack)/goose-plans' },
    { shown: hub.news, key: 'news', icon: 'news', label: t('goose.find.news'), href: '/(stack)/goose-news' },
    { shown: hub.ideas, key: 'ideas', icon: 'light', label: t('goose.find.ideas'), href: '/(stack)/goose-ideas' },
    { shown: hub.todos, key: 'todos', icon: 'checklist', label: t('goose.find.todos'), href: '/(stack)/goose-todos' },
    { shown: hub.cart, key: 'prices', icon: 'tag', label: t('goose.find.prices'), href: '/(stack)/goose-cart' },
    { shown: true, key: 'watching', icon: 'eye', label: t('goose.find.watching'), href: '/(stack)/web-watches' },
    { shown: hub.facts, key: 'facts', icon: 'profile', label: t('goose.find.facts'), href: '/(stack)/goose-facts' },
    { shown: hub.about && !hub.facts, key: 'about', icon: 'profile', label: t('goose.find.about'), href: '/(stack)/goose-about' },
    { shown: hub.captures, key: 'pictures', icon: 'photo', label: t('goose.find.pictures'), href: '/(stack)/goose-captures' },
    { shown: hub.interests, key: 'interests', icon: 'sparkle', label: t('goose.find.interests'), href: '/(stack)/goose-interests' },
    { shown: true, key: 'saved', icon: 'archive', label: t('goose.find.saved'), href: '/(stack)/saved' },
    { shown: hub.about, key: 'notes', icon: 'file-text', label: t('goose.find.notes'), href: '/(stack)/goose-notes' },
    { shown: hub.activity, key: 'activity', icon: 'activity', label: t('goose.find.activity'), href: '/(stack)/goose-activity' },
    { shown: hub.connectors, key: 'connectors', icon: 'plug', label: t('goose.find.connectors'), href: '/(stack)/goose-connectors' },
    { shown: hub.catalog, key: 'more', icon: 'more', label: t('goose.find.more'), href: '/(stack)/goose-catalog' },
  ];
  const jumps = all.filter((jump) => jump.shown);
  return (
    <View style={styles.find}>
      <GPressable
        onPress={() => go('/(stack)/goose-search')}
        accessibilityRole="search"
        accessibilityLabel={t('goose.find.placeholder')}
        style={[styles.findBar, { backgroundColor: theme.color.chrome, borderColor: theme.color.line }]}
      >
        <GIcon name="search" size={18} color={theme.color.textTertiary} />
        <InkText size="md" tone="secondary" style={{ flex: 1 }}>
          {t('goose.find.placeholder')}
        </InkText>
      </GPressable>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.jumps} accessibilityLabel={t('goose.find.jumpTo')}>
        {jumps.map((jump) => (
          <GPressable
            key={jump.key}
            onPress={() => go(jump.href)}
            accessibilityRole="button"
            accessibilityLabel={jump.label}
            style={[styles.jump, { backgroundColor: theme.color.chrome, borderColor: theme.color.line }]}
          >
            <GIcon name={jump.icon} size={14} color={theme.color.accentLine} />
            <InkText size="sm" weight="semibold">
              {jump.label}
            </InkText>
          </GPressable>
        ))}
      </ScrollView>
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
  const all: (Jump & { shown: boolean; detail: string | null })[] = [
    { shown: hub.facts, key: 'facts', icon: 'profile', label: t('goose.you.facts'), detail: g.factCount === null ? null : t('goose.you.factsDetail', { count: g.factCount }), href: '/(stack)/goose-facts' },
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
function IdeaCards() {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const cards = useIdeaCards();
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
        trailing={<RoundButton icon="refresh" label={t('goose.ideaCards.refreshLabel')} onPress={() => void (cards.making ? undefined : cards.actions.refresh())} />}
      />
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

  const clauses = g.clauses.map((clause) => ({
    text: t(clause.key as never, clause.params) as string,
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

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        {...chrome}
        onScroll={onScroll}
        style={styles.page}
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomInset + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl {...pull} />}
      >
        <Header working={g.loading} out={headerOut} />
        <FindAndJump hub={hub} />
        {g.loading && !anything ? <InkSpinner label={t('myGoose.loading')} /> : <HubSentence clauses={clauses} quiet={t('goose.say.quiet')} />}
        {state === 'unreachable' || state === 'failed' ? <ContentUnavailable state={state} onRetry={reload} /> : null}
        {g.newMember ? <InterviewInvite hub={hub} /> : null}
        {hub.todos ? <Asking g={g} /> : null}
        {hub.ideaCards ? <IdeaCards /> : null}
        {hub.questions ? <Questions g={g} /> : null}
        {hub.anchors ? <Plans g={g} /> : null}
        {hub.news ? <News g={g} /> : null}
        {hub.ideas ? <Ideas g={g} /> : null}
        {hub.cart ? <Prices g={g} /> : null}
        {hub.news ? <LongReads g={g} /> : null}
        {hub.todos ? <Todos g={g} onNeedsLocation={() => setPlacesSheet(true)} /> : null}
        <Watching g={g} />
        <YouAndGoose hub={hub} g={g} />
        <Connectors g={g} />
        {hub.catalog ? <MoreGooseCanDo g={g} /> : null}
        <Following g={g} />
      </ScrollView>
      <LocationSheet open={placesSheet} access={g.todos.access} onClose={() => setPlacesSheet(false)} onAllow={g.todos.actions.allowLocation} />
    </SafeAreaView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    page: { flex: 1 },
    scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, gap: Spacing['2xl'] },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
    headText: { flex: 1 },
    find: { gap: Spacing.sm },
    findBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: 10, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
    jumps: { gap: Spacing.sm, paddingRight: Spacing.lg },
    jump: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
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
  });
