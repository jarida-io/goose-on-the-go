/**
 * HomeScreen — whether the Pond wants anything from you, and what is happening at home.
 *
 * Under the greeting, everything is a widget on one board, in the order this phone's owner chose:
 * by default what Goose finished for you, the plans it offers and its suggestions first, because
 * they are the part that needs a person; Goose's questions sit above the board, beside the idea
 * cards. Each widget is something the Pond actually told us, and a widget with nothing true to say
 * is not drawn. Only what waits on an answer is raised and only the music is filled; the rest sit
 * on hairlines, so the board can hold more of them without every one shouting.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  InkButton,
  InkCard,
  InkEdge,
  InkEmptyState,
  InkText,
  InkTitle,
} from '@/components/ui/ink';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useBottomBarInset, useChromeScroll } from '@/providers/chrome-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { ThemeColors } from '@/constants/colors';

import { GIcon } from '@/components/ui/g-icon';
import { GPressable } from '@/components/ui/g-pressable';
import { FinishSetup } from '@/components/patterns/finish-setup';
import { InterviewOffer } from '@/components/patterns/interview-offer';
import { AgentsGettingReady } from '@/components/patterns/agents-building';
import { RoomVoiceHome } from '@/components/patterns/room-voice';
import { PondGettingReady } from '@/components/patterns/pond-getting-ready';
import { PondStatusCard } from '@/components/patterns/pond-status-card';
import { RemoteAccessOffer } from '@/components/patterns/remote-access-offer';
import { AskRow, HomeIdeas } from '@/components/patterns/home-ideas';
import { PlansWidget, QuestionsWidget, ReadyWidget } from '@/components/patterns/home-engine';
import { IdeaCardSetView } from '@/components/goose/idea-cards';
import { GlanceStrip, type Figure } from '@/components/patterns/glance-strip';
import { PondSays } from '@/components/patterns/pond-says';
import {
  ConversationsWidget,
  DevicesWidget,
  NextRoutineWidget,
  NowPlayingWidget,
  OutsideWidget,
  RememberWidget,
} from '@/components/patterns/home-widgets';
import { WIDGET_GAP, WidgetBoard, type BoardWidget } from '@/components/patterns/widget-board';
import { useHomeIdeas } from '@/view-models/use-home-ideas';
import { useHomeEngine } from '@/view-models/use-home-engine';
import type { OfferedPrompt } from '@/view-models/use-suggestions';
import { useHomeLayout, type HomeWidgetKey } from '@/view-models/use-home-layout';
import { useContentState } from '@/view-models/use-content-state';
import { usePullToRefresh } from '@/view-models/use-pull-to-refresh';
import { useRecentSessions } from '@/view-models/use-recent-sessions';
import { useDevices } from '@/view-models/use-devices';
import { initialOf, useMember } from '@/view-models/use-household';
import { useRightNow } from '@/view-models/use-right-now';
import { useLive } from '@/view-models/use-live';
import { useServer } from '@/providers/server-provider';
import { hostOf } from '@/services/discovery';
import { tap } from '@/services/haptics';
import type { Device } from '@/services/types';
import { Brand, JaridaPurple } from '@/constants/colors';
import { FontSize, face } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

/** The devices widget is a glance, not the full list — that is the Devices tab. Three rows of two. */
const HOME_GRID_LIMIT = 6;

/** Home leads with a few ideas; the rest are on the cards screen. */
const HOME_CARD_LIMIT = 3;

/** How often the greeting and the countdowns catch up with the clock. */
const CLOCK_MS = 60_000;

/** A greeting uses the name someone is called, not their full record. */
function firstName(displayName: string | undefined): string | null {
  const first = displayName?.trim().split(/\s+/)[0];
  return first || null;
}

function greetingKey(hour: number) {
  if (hour < 5) return 'greeting.night' as const;
  if (hour < 12) return 'greeting.morning' as const;
  if (hour < 18) return 'greeting.afternoon' as const;
  return 'greeting.evening' as const;
}

/**
 * The Pond, while it is not plainly there.
 *
 * Home tells the connection here rather than in the strip above the app: the card names the Pond,
 * says what is happening and why, when it last answered and when the next check runs, and offers
 * Try now and Switch Pond (`PondStatusCard`). Until `hydrated` the stored URL has not been read
 * back, so it says it is looking rather than claiming anything. Connected, it is the line under
 * the name (`PondLine`), and this draws nothing.
 */
function PondCard() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const { online, hydrated, pondUrls } = useServer();
  const router = useRouter();

  if (!hydrated) {
    return (
      <InkCard>
        <InkTitle level={2}>{t('pond.searching')}</InkTitle>
        <InkText>{t('pond.searchingBody')}</InkText>
      </InkCard>
    );
  }

  if (online) return null;

  return (
    <PondStatusCard
      address={hostOf(pondUrls[0] ?? '')}
      note={t('pond.waitingBody')}
      onSwitch={() => router.push('/(stack)/switch-pond')}
      style={styles.flush}
    />
  );
}

export default function HomeScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const { online, hydrated } = useServer();
  const offline = hydrated && !online;
  const recent = useRecentSessions();
  const devices = useDevices();
  // The member the Pond attributes this phone to. No name when nobody has
  // claimed it — the first household profile is not necessarily whoever holds
  // this phone.
  const member = useMember();
  const rightNow = useRightNow().data;
  // One read of the Pond's ideas for the whole screen; the widgets take their parts.
  const ideas = useHomeIdeas();
  // What Goose made, offers and asks: read only from a Pond whose hub serves it.
  const engine = useHomeEngine();
  const layout = useHomeLayout();
  const router = useRouter();
  const chrome = useChromeScroll();
  const bottomInset = useBottomBarInset();
  const scroller = useRef<ScrollView>(null);
  const cardsTop = useRef(0);
  const boardTop = useRef(0);

  // The clock is state, advanced once a minute while Home is in front, so render stays pure and
  // the greeting and "in 23 h" move with the time instead of freezing at the moment Home mounted.
  const [now, setNow] = useState(() => new Date());
  useLive(async () => setNow(new Date()), CLOCK_MS);

  const initial = member ? initialOf(member.displayName) : null;

  const handleDeviceToggle = useCallback(
    (device: Device, on: boolean) => void devices.actions.setState(device, { power: on }),
    [devices.actions],
  );

  const ask = useCallback(
    (prompt: OfferedPrompt) => {
      ideas.actions.taken(prompt);
      router.push({ pathname: '/conversation', params: { ask: prompt.prompt } });
    },
    [ideas.actions, router],
  );

  const edit = useCallback(() => {
    void tap();
    layout.actions.edit();
    // Folded, the board fits on one screen; bring all of it into view, since the page holds still while widgets move.
    scroller.current?.scrollTo({ y: Math.max(0, cardsTop.current + boardTop.current - Spacing.lg), animated: true });
  }, [layout.actions]);

  const shownDevices = devices.data.devices.slice(0, HOME_GRID_LIMIT);
  const recentState = useContentState({
    loading: recent.loading,
    failed: recent.failed,
    hasContent: recent.data.sessions.length > 0,
  });
  const devicesState = useContentState({ loading: devices.loading, failed: devices.failed, hasContent: shownDevices.length > 0 });
  // Home's pull reads both of the Pond's lists on it: recent conversations and the devices.
  const { reload: reloadAnchors } = engine.anchors;
  const { reload: reloadQuestions } = engine.questions;
  const { reload: reloadCards } = engine.cards;
  const reloadHome = useCallback(
    () => Promise.all([recent.actions.refresh(), devices.actions.refresh(), reloadAnchors(), reloadQuestions(), reloadCards()]),
    [recent.actions, devices.actions, reloadAnchors, reloadQuestions, reloadCards],
  );
  const pull = usePullToRefresh(reloadHome);

  // The online count is the list the grid shows, so the two cannot disagree, and it is not stated
  // while that list is unknown.
  const devicesKnown = devicesState === 'ready' || devicesState === 'empty';
  // Quiet is said above the board, by the Pond's own line; the widget is for suggestions.
  const hasIdeas = ideas.data.proposals.length > 0 || !!ideas.data.agent;

  // Built in the saved order; a widget with nothing to say is left out rather than drawn empty.
  const widgets = useMemo(() => {
    const all: Record<HomeWidgetKey, BoardWidget | null> = {
      ready:
        engine.ready.length > 0
          ? {
              key: 'ready',
              span: 2,
              frame: 'raised',
              title: t('home.ready.title'),
              icon: 'sparkle',
              node: (
                <ReadyWidget
                  ready={engine.ready}
                  onOpen={(work) => router.push({ pathname: '/(stack)/goose-deliverable', params: { id: work.deliverable.id } })}
                  onSeeAll={() => router.push('/(stack)/goose-plans')}
                />
              ),
            }
          : null,
      plans:
        engine.offered.length > 0
          ? {
              key: 'plans',
              span: 2,
              frame: 'raised',
              title: t('home.plans.title'),
              icon: 'light',
              node: (
                <PlansWidget
                  offered={engine.offered}
                  busy={engine.anchors.busy}
                  onYes={(anchor) => void engine.anchors.actions.confirm(anchor)}
                  onNo={(anchor) => void engine.anchors.actions.dismiss(anchor)}
                  onOpen={(anchor) => router.push({ pathname: '/(stack)/goose-anchor', params: { id: anchor.id } })}
                  onSeeAll={() => router.push('/(stack)/goose-plans')}
                />
              ),
            }
          : null,
      ideas: hasIdeas
        ? {
            key: 'ideas',
            span: 2,
            frame: ideas.data.proposals.length > 0 ? 'raised' : 'plain',
            title: t('home.ideas.title'),
            icon: 'sparkle',
            node: (
              <HomeIdeas
                proposals={ideas.data.proposals}
                agent={ideas.data.agent}
                deciding={ideas.deciding}
                collapsed={ideas.collapsed}
                onToggleCollapsed={ideas.actions.toggleCollapsed}
                onAccept={(id) => void ideas.actions.approve(id)}
                onDecline={(id) => void ideas.actions.decline(id)}
              />
            ),
          }
        : null,
      ask: {
        key: 'ask',
        span: 2,
        frame: 'plain',
        title: t('pond.askGoose'),
        icon: 'chat',
        node: <AskRow prompts={ideas.data.prompts} onAsk={ask} onAskGoose={() => router.push('/conversation')} />,
      },
      music: rightNow.nowPlaying
        ? {
            key: 'music',
            span: 1,
            frame: 'accent',
            title: t('home.nowPlaying'),
            icon: 'music',
            node: <NowPlayingWidget playing={rightNow.nowPlaying} />,
          }
        : null,
      next: rightNow.nextRoutine
        ? {
            key: 'next',
            span: 1,
            frame: 'plain',
            title: t('home.nextRoutine'),
            icon: 'schedule',
            node: (
              <NextRoutineWidget routine={rightNow.nextRoutine} now={now} onOpen={() => router.push('/(stack)/schedule')} />
            ),
          }
        : null,
      outside: rightNow.outdoor
        ? {
            key: 'outside',
            span: 1,
            frame: 'plain',
            title: t('home.widgets.outside'),
            icon: 'partly-sunny',
            node: <OutsideWidget outdoor={rightNow.outdoor} />,
          }
        : null,
      remember: ideas.data.reminders
        ? {
            key: 'remember',
            span: 1,
            frame: 'plain',
            title: t('home.widgets.remember'),
            icon: 'bell',
            node: <RememberWidget reminders={ideas.data.reminders} onOpen={() => router.push('/(stack)/reminders')} />,
          }
        : null,
      conversations: {
        key: 'conversations',
        span: 2,
        frame: 'plain',
        title: t('home.conversations'),
        icon: 'chat',
        node: (
          <ConversationsWidget
            sessions={recent.data.sessions}
            state={recentState}
            error={recent.error}
            onRetry={recent.actions.refresh}
            onSeeAll={() => router.push('/(tabs)/chat')}
            onOpen={(c) =>
              router.push({
                pathname: '/conversation',
                params: c.title ? { session: c.id, title: c.title } : { session: c.id },
              })
            }
          />
        ),
      },
      devices: {
        key: 'devices',
        span: 2,
        frame: 'plain',
        title: t('home.devices'),
        icon: 'device',
        node: (
          <DevicesWidget
            devices={shownDevices}
            powerById={devices.data.powerById}
            online={devicesKnown ? { count: devices.data.onlineCount, total: devices.data.devices.length } : null}
            state={devicesState}
            error={devices.error}
            onRetry={devices.actions.refresh}
            onToggle={handleDeviceToggle}
            onSeeAll={() => router.push('/(tabs)/devices')}
            empty={
              <InkEmptyState
                icon="device"
                title={t('home.noDevices')}
                action={
                  <InkButton variant="primary" onPress={() => router.push('/(stack)/commission-device')}>
                    {t('home.addDevice')}
                  </InkButton>
                }
              >
                <InkText>{t('home.noDevicesBody')}</InkText>
              </InkEmptyState>
            }
          />
        ),
      },
    };
    return layout.order.map((key) => all[key]).filter((w): w is BoardWidget => w !== null);
  }, [layout.order, engine, hasIdeas, ideas, rightNow, now, recent, recentState, devices, shownDevices, devicesState, devicesKnown, handleDeviceToggle, ask, router, t]);

  const shown = widgets.map((w) => w.key);

  // Only phrases with a source behind them; the line hides when there are none.
  const figures: Figure[] = [];
  if (devicesKnown) {
    figures.push({ key: 'devices', phrase: t('home.lineDevicesOn', { count: devices.data.onlineCount }) });
  }
  if (rightNow.outdoor) {
    const { temp, place } = rightNow.outdoor;
    // Where the Pond is configured to be, which is not always where the reader is.
    figures.push({ key: 'outdoor', phrase: place ? t('home.lineOutdoorPlace', { temp, place }) : t('home.lineOutdoor', { temp }) });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        ref={scroller}
        {...chrome}
        // Still while rearranging: a widget is carried with the finger the page would otherwise follow.
        scrollEnabled={!layout.editing}
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomInset }]}
        showsVerticalScrollIndicator={false}
        refreshControl={layout.editing ? undefined : <RefreshControl {...pull} />}
      >
        <View style={styles.greetingRow}>
          <View style={styles.greetingText}>
            <Text style={styles.greetingLabel}>{t(greetingKey(now.getHours()))}</Text>
            <InkTitle level={1}>{firstName(member?.displayName) ?? t('home.you')}</InkTitle>
          </View>
          <GPressable feedback="lift"
            style={styles.avatar}
            onPress={() => router.push('/(tabs)/profile')}
            accessibilityRole="button"
            accessibilityLabel={t('tabs.you')}
          >
            {initial ? (
              <Text style={styles.avatarText}>{initial}</Text>
            ) : (
              <GIcon name="home" size={18} color={Brand.white} />
            )}
          </GPressable>
        </View>

        {offline || !engine.cardsOn ? null : (
          <View style={styles.ideaCards}>
            <IdeaCardSetView vm={engine.cards} limit={HOME_CARD_LIMIT} onSeeAll={() => router.push('/(stack)/goose-cards')} />
          </View>
        )}

        {/* Beside the ideas, since both wait on the member; a batch asked in chat leads back to it. */}
        {offline || engine.questions.batches.length === 0 ? null : (
          <InkEdge raised style={styles.questions} contentStyle={styles.questionsBody}>
            <QuestionsWidget
              vm={engine.questions}
              onSeeAll={() => router.push('/(stack)/goose-questions')}
              onOpenPlan={(id) => router.push({ pathname: '/(stack)/goose-anchor', params: { id } })}
              onOpenChat={(session, title) => router.push({ pathname: '/conversation', params: { session, title } })}
            />
          </InkEdge>
        )}

        {/* Suggestions are the From your Pond widget's alone; the line says only what it cannot. */}
        {offline || ideas.data.proposals.length > 0 ? null : (
          <PondSays reminderCount={ideas.data.reminderCount} quiet={ideas.quiet && engine.quiet} />
        )}

        {offline ? null : <GlanceStrip figures={figures} />}

        {/* One column at the board's own gap, so a card that draws nothing leaves no space behind. */}
        <View style={styles.cards} onLayout={(e) => (cardsTop.current = e.nativeEvent.layout.y)}>
          <PondCard />

          {/* Offered once per pairing, and declinable. It draws nothing unless
              the Pond is reachable and remote access is off, so it sits under the
              card that says the Pond is reachable. */}
          {/* Whether Goose can answer yet matters more than reaching it from away, so it comes first. */}
          <PondGettingReady />
          <AgentsGettingReady />
          {offline ? null : <RoomVoiceHome />}
          <FinishSetup />
          <InterviewOffer />
          <RemoteAccessOffer />

          {offline ? null : (
            <View onLayout={(e) => (boardTop.current = e.nativeEvent.layout.y)}>
              {layout.editing ? (
                <View style={styles.editBar}>
                  <Text style={styles.editHint}>{t('home.board.hint')}</Text>
                  <InkButton variant="quiet" onPress={layout.actions.reset}>
                    {t('home.board.reset')}
                  </InkButton>
                  <InkButton variant="primary" onPress={layout.actions.done}>
                    {t('common.done')}
                  </InkButton>
                </View>
              ) : null}
              <WidgetBoard
                widgets={widgets}
                editing={layout.editing}
                onEdit={edit}
                onMove={layout.actions.move}
                onStep={(key, delta) => layout.actions.step(key, delta, shown)}
              />
              {layout.editing ? null : (
                <GPressable style={styles.editLink} hitSlop={8} accessibilityRole="button" onPress={edit}>
                  <GIcon name="grip" size={14} color={styles.editLinkText.color} />
                  <Text style={styles.editLinkText}>{t('home.board.edit')}</Text>
                </GPressable>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  scroll: { paddingHorizontal: Spacing.lg },

  greetingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.lg,
    marginBottom: Spacing['2xl'],
  },
  greetingText: { flex: 1 },
  greetingLabel: {
    ...face('body', 'regular'),
    fontSize: FontSize.base,
    color: c.textTertiary,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: JaridaPurple[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...face('display', 'bold'),
    fontSize: FontSize.lg,
    color: Brand.white,
  },


  cards: { gap: WIDGET_GAP },
  ideaCards: { marginBottom: Spacing['2xl'] },
  questions: { marginBottom: Spacing['2xl'] },
  questionsBody: { padding: Spacing.lg },
  // The column spaces Home's cards; the card's own margin is for screens that do not.
  flush: { marginBottom: 0 },

  editBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  editHint: {
    flex: 1,
    ...face('body', 'regular'),
    fontSize: FontSize.sm,
    color: c.textSecondary,
  },
  editLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: Spacing.xs + 2,
    marginTop: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  editLinkText: {
    ...face('body', 'semibold'),
    fontSize: FontSize.sm,
    color: c.textBrand,
  },
});
