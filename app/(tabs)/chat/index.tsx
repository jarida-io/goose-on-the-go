/**
 * ConversationsScreen — the wall the Chat tab opens on.
 *
 * Every conversation the Pond is holding, as cards you scan rather than a list
 * you read: pond-desktop's "Conversations" wall, brought to a phone. Three
 * things carry it.
 *
 * - **The cards are the only loud thing.** They wear Ink's edge because they
 *   are what the screen is for. The three controls floating over them are
 *   opaque chrome, solid rather than the tab bar's glass, and stay quiet.
 * - **A card is as tall as its conversation was long.** Three heights, by the
 *   desktop's own rule, so the wall is a rough map of where the household's
 *   attention went — which is what you scan for when you half remember a
 *   conversation.
 * - **The controls sit where a thumb is.** Search and a new conversation float
 *   above the bar; the menu keeps the top corner until it is wanted.
 *
 * The menu holds the layout — this wall, or a quieter list of the same
 * conversations under headings by date — the filter, and Select. Choosing
 * several trades the corner's puck for Done and the dock for a bar that
 * deletes what was chosen. Leaving the screen puts all of it away.
 *
 * The list is re-read whenever the wall comes back into view. The Pond names a
 * conversation after its first exchange, so the one just left may have a title
 * now that it did not have when it was opened.
 *
 * Under the title, where each conversation was begun: on this phone, which is
 * what the wall opens on, in the room, by a schedule, or on another screen.
 * The Goose thread, where the Pond posts what it did by itself, leads this
 * phone's wall and cannot be deleted from it.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Keyboard, LayoutAnimation, PanResponder, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  InkChoice,
  InkEmptyState,
  InkText,
  InkTitle,
  useReduceMotion,
} from '@/components/ui/ink';

import { ChromePill } from '@/components/patterns/chrome-pill';
import { ContentUnavailable } from '@/components/patterns/content-unavailable';
import { ChromePuck, PUCK_SIZE } from '@/components/patterns/chrome-puck';
import { ConversationList } from '@/components/patterns/conversation-list';
import { ConversationWall, WALL_GUTTER } from '@/components/patterns/conversation-wall';
import { DOCK_GAP, WallDock } from '@/components/patterns/wall-dock';
import { WallMenu } from '@/components/patterns/wall-menu';
import { WallSelectionBar } from '@/components/patterns/wall-selection-bar';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import {
  useBottomBarInset,
  useChromeRestore,
  useChromeScroll,
} from '@/providers/chrome-provider';
import { caution, confirm, reject, selectionTick } from '@/services/haptics';
import type { TranslationKey } from '@/services/i18n';
import type { ThemeColors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';
import { isUnavailable } from '@/models/content-state';
import { useContentState } from '@/view-models/use-content-state';
import { usePullToRefresh } from '@/view-models/use-pull-to-refresh';
import {
  HISTORY_TABS,
  useChatHistory,
  type HistoryFilter,
  type HistoryTab,
  type HistoryView,
} from '@/view-models/use-chat-history';

/** The corner control's inset from the top of the safe area. The title aligns to it. */
const CORNER_TOP = Spacing.sm;

const VIEW_LABELS = {
  grid: 'chat.history.viewGrid',
  list: 'chat.history.viewList',
} as const satisfies Record<HistoryView, TranslationKey>;

const FILTER_LABELS = {
  all: 'chat.history.filterAll',
  chats: 'chat.history.filterChats',
  routines: 'chat.history.filterRoutines',
} as const satisfies Record<HistoryFilter, TranslationKey>;

const TAB_LABELS = {
  all: 'chat.history.filterAll',
  phone: 'chat.history.tabPhone',
  room: 'chat.history.tabRoom',
  scheduled: 'chat.history.tabScheduled',
  other: 'chat.history.tabOther',
} as const satisfies Record<HistoryTab, TranslationKey>;

/** What an empty tab says: nothing begun there yet, and what would show if something were. */
const TAB_EMPTY = {
  all: { title: 'home.noConversations', body: 'home.noConversationsBody' },
  phone: { title: 'home.noConversations', body: 'home.noConversationsBody' },
  room: { title: 'chat.history.noRoom', body: 'chat.history.noRoomBody' },
  scheduled: { title: 'chat.history.noScheduled', body: 'chat.history.noScheduledBody' },
  other: { title: 'chat.history.noOther', body: 'chat.history.noOtherBody' },
} as const satisfies Record<HistoryTab, { title: TranslationKey; body: TranslationKey }>;

/** One empty selection, shared, so clearing one that is already clear renders nothing. */
const NOTHING_SELECTED: ReadonlySet<string> = new Set();

export default function ConversationsScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const router = useRouter();
  const reduced = useReduceMotion();
  const history = useChatHistory();
  const chrome = useChromeScroll();
  const restoreChrome = useChromeRestore();
  const barInset = useBottomBarInset();

  const { cards, sections, total, query, filter, tab, view } = history.data;
  const { refresh, setQuery, setFilter, setTab, setView, remove, removeMany } = history.actions;

  const [searching, setSearching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  // Choosing several to delete. Ids rather than cards, so a refresh underneath
  // unchooses nothing that is still on the wall.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(NOTHING_SELECTED);
  const [confirmingMany, setConfirmingMany] = useState(false);

  // Back on the wall: read the list again. Leaving it: put away anything that
  // was asking a question, so it is not still asking on return — a selection
  // included, which would otherwise be waiting there to be deleted.
  useFocusEffect(
    useCallback(() => {
      void refresh();
      return () => {
        setMenuOpen(false);
        setConfirmingId(null);
        setSelecting(false);
        setSelected(NOTHING_SELECTED);
        setConfirmingMany(false);
      };
    }, [refresh]),
  );

  // Whatever changes shape next moves there rather than jumping.
  const animate = useCallback(() => {
    if (!reduced) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [reduced]);

  const open = useCallback(
    (id: string) => {
      setConfirmingId(null);
      // The title travels with the link, so the conversation's bar names it
      // on its first frame instead of after a read of the whole list. What a
      // schedule reported opens the Goose thread it is in, under that thread's name.
      const card = cards.find((c) => c.id === id);
      const session = card?.opens ?? id;
      const title = card?.opens === id ? card.title : card?.opensTitle;
      router.push({ pathname: '/conversation', params: title ? { session, title } : { session } });
    },
    [cards, router],
  );

  const tabsScrollRef = useRef<ScrollView>(null);
  const didInitialScroll = useRef(false);

  // Another tab is another wall: nothing asked or chosen on the last one carries over.
  const pickTab = useCallback(
    (next: HistoryTab) => {
      void selectionTick();
      setConfirmingId(null);
      setSelecting(false);
      setSelected(NOTHING_SELECTED);
      setConfirmingMany(false);
      setTab(next);
      if (next === 'all') {
        tabsScrollRef.current?.scrollTo({ x: 0, animated: true });
      }
      restoreChrome();
    },
    [restoreChrome, setTab],
  );

  const tabRef = useRef(tab);
  tabRef.current = tab;
  const pickTabRef = useRef(pickTab);
  pickTabRef.current = pickTab;

  const swipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderRelease: (_e, g) => {
          if (Math.abs(g.dx) < 40) return;
          const idx = HISTORY_TABS.indexOf(tabRef.current);
          if (idx === -1) return;
          const nextIdx = g.dx > 0 ? idx - 1 : idx + 1;
          if (nextIdx >= 0 && nextIdx < HISTORY_TABS.length) {
            pickTabRef.current(HISTORY_TABS[nextIdx]);
          }
        },
      }),
    [],
  );

  const compose = useCallback(() => {
    void selectionTick();
    router.push('/conversation');
  }, [router]);

  const composeIncognito = useCallback(() => {
    void selectionTick();
    router.push({ pathname: '/conversation', params: { incognito: '1' } });
  }, [router]);

  const askDelete = useCallback(
    (id: string) => {
      void caution();
      // A card asks inside its own frame. A row grows to ask, and the rows
      // under it make room rather than jumping.
      if (view === 'list') animate();
      setConfirmingId(id);
    },
    [animate, view],
  );

  const keep = useCallback(() => {
    if (view === 'list') animate();
    setConfirmingId(null);
  }, [animate, view]);

  const deleteCard = useCallback(
    (id: string) => {
      setConfirmingId(null);
      // The cards after it close the gap rather than jumping into it.
      animate();
      void remove(id).then((ok) => (ok ? confirm() : reject()));
    },
    [animate, remove],
  );

  const toggleMenu = useCallback(() => {
    void selectionTick();
    setMenuOpen((shown) => !shown);
  }, []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // The other layout opens at its top, so the bar comes back with it rather
  // than staying contracted over a list nobody has scrolled yet.
  const changeView = useCallback(
    (next: HistoryView) => {
      setView(next);
      restoreChrome();
    },
    [restoreChrome, setView],
  );

  const startSelecting = useCallback(() => {
    // A search left behind the selection bar would narrow the wall with
    // nothing on screen to say so, so choosing starts from the whole of it.
    Keyboard.dismiss();
    setQuery('');
    setSearching(false);
    setConfirmingId(null);
    animate();
    setSelecting(true);
  }, [animate, setQuery]);

  const stopSelecting = useCallback(() => {
    animate();
    setSelecting(false);
    setSelected(NOTHING_SELECTED);
    setConfirmingMany(false);
  }, [animate]);

  const finishSelecting = useCallback(() => {
    void selectionTick();
    stopSelecting();
  }, [stopSelecting]);

  const toggleSelected = useCallback((id: string) => {
    void selectionTick();
    // Changing what is chosen while the bar is asking about it answers "not
    // these", so the question goes.
    setConfirmingMany(false);
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  // The Goose thread, and what is read out of it, are not the wall's to delete.
  const deletable = useMemo(() => cards.filter((card) => card.deletable), [cards]);

  // Only what is on the wall counts. A refresh can take a chosen conversation
  // away, and a count that still held it would delete something nobody sees.
  const chosen = useMemo(
    () => deletable.filter((card) => selected.has(card.id)).map((card) => card.id),
    [deletable, selected],
  );
  const allChosen = deletable.length > 0 && chosen.length === deletable.length;

  const toggleAll = useCallback(() => {
    void selectionTick();
    setConfirmingMany(false);
    setSelected(allChosen ? NOTHING_SELECTED : new Set(deletable.map((card) => card.id)));
  }, [allChosen, deletable]);

  const askDeleteMany = useCallback(() => {
    if (chosen.length === 0) return;
    void caution();
    setConfirmingMany(true);
  }, [chosen.length]);

  const keepMany = useCallback(() => setConfirmingMany(false), []);

  const deleteMany = useCallback(() => {
    // The chosen cards close up and the bar gives way to the dock in the same
    // movement. Whatever the Pond refuses comes back with the re-read, and
    // the notice above the wall says how many.
    animate();
    setSelecting(false);
    setSelected(NOTHING_SELECTED);
    setConfirmingMany(false);
    void removeMany(chosen).then(({ failed }) => (failed.length > 0 ? reject() : confirm()));
  }, [animate, chosen, removeMany]);

  // Android's back button steps out of the question first, then out of choosing.
  useEffect(() => {
    if (!selecting) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (confirmingMany) setConfirmingMany(false);
      else stopSelecting();
      return true;
    });
    return () => sub.remove();
  }, [confirmingMany, selecting, stopSelecting]);

  const state = useContentState({ loading: history.loading, failed: history.failed, hasContent: total > 0 });
  const pull = usePullToRefresh(refresh);
  const unavailable = isUnavailable(state);
  // A count, or nothing. "Nothing here yet" above a list that failed to load was a claim nobody
  // made, and above an empty one it said what the empty state below already says.
  const subtitle = state === 'ready' ? t('chat.history.subtitle', { count: total }) : null;

  const header = (
    <View style={styles.head}>
      <View style={styles.heading}>
        <InkTitle level={1}>{t('chat.history.title')}</InkTitle>
        {subtitle ? (
          <InkText size="base" tone="tertiary">
            {subtitle}
          </InkText>
        ) : null}
      </View>
      {/* The Devices tab's room pills: "All" sits off the left edge with a slight peek unless dragged/swiped right. */}
      <ScrollView
        ref={tabsScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="radiogroup"
        accessibilityLabel={t('chat.history.tabsLabel')}
        style={styles.tabs}
        contentContainerStyle={styles.tabsRow}
      >
        {HISTORY_TABS.map((id) => (
          <View
            key={id}
            style={{ opacity: tab === id ? 1 : 0.45 }}
            onLayout={
              id === 'all'
                ? (e) => {
                    if (!didInitialScroll.current) {
                      didInitialScroll.current = true;
                      const peek = 18;
                      const x = Math.max(0, e.nativeEvent.layout.width + Spacing.xs - peek);
                      tabsScrollRef.current?.scrollTo({ x, animated: false });
                    }
                  }
                : undefined
            }
          >
            <InkChoice role="radio" shape="pill" selected={tab === id} onSelect={() => pickTab(id)}>
              {t(TAB_LABELS[id])}
            </InkChoice>
          </View>
        ))}
      </ScrollView>
    </View>
  );

  const searched = query.trim();
  const empty = unavailable ? (
    <ContentUnavailable state={state} reason={history.error} onRetry={refresh} />
  ) : searched ? (
    <InkEmptyState icon="search" title={t('chat.history.noMatch', { query: searched })}>
      {t('chat.history.noMatchBody')}
    </InkEmptyState>
  ) : filter !== 'all' && total > 0 ? (
    <InkEmptyState
      icon="list-filter"
      title={t(filter === 'routines' ? 'chat.history.noRoutines' : 'chat.history.noChats')}
    >
      {t('chat.history.noneBody')}
    </InkEmptyState>
  ) : (
    <InkEmptyState icon="chat" title={t(TAB_EMPTY[tab].title)}>
      {t(TAB_EMPTY[tab].body)}
    </InkEmptyState>
  );

  // Both layouts take exactly these, so the bar follows either one the same
  // way and each clears the same foot.
  const shared = {
    loading: history.loading,
    header,
    empty,
    confirmingId,
    selecting,
    selected,
    onOpen: open,
    onAskDelete: askDelete,
    onDelete: deleteCard,
    onKeep: keep,
    onToggle: toggleSelected,
    ...pull,
    onScroll: chrome.onScroll,
    scrollEventThrottle: chrome.scrollEventThrottle,
    bottomInset: barInset + DOCK_GAP + PUCK_SIZE + Spacing.lg,
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* No padding on this box, so every absolute inset inside it is measured
          from the same corner on both platforms. */}
      <View style={styles.stage} {...swipeResponder.panHandlers}>
        {view === 'list' ? (
          <ConversationList sections={sections} {...shared} />
        ) : (
          <ConversationWall cards={cards} {...shared} />
        )}

        {selecting ? (
          <ChromePill
            label={t('chat.history.done')}
            onPress={finishSelecting}
            style={styles.corner}
          />
        ) : (
          <ChromePuck
            // The reference's glyph for this same menu of layout, filter and
            // Select — lines narrowing, which reads as "arrange this list".
            icon="list-filter"
            label={t('chat.history.options')}
            value={`${t(VIEW_LABELS[view])}, ${t(FILTER_LABELS[filter])}`}
            // The filter only: it hides conversations, and a layout hides none.
            marked={filter !== 'all'}
            expanded={menuOpen}
            onPress={toggleMenu}
            style={styles.corner}
          />
        )}

        {selecting ? (
          <WallSelectionBar
            count={chosen.length}
            available={deletable.length}
            confirming={confirmingMany}
            onToggleAll={toggleAll}
            onAskDelete={askDeleteMany}
            onDelete={deleteMany}
            onKeep={keepMany}
            bottomInset={barInset}
          />
        ) : (
          <WallDock
            query={query}
            onQuery={setQuery}
            open={searching}
            onOpenChange={setSearching}
            onCompose={compose}
            onComposeIncognito={composeIncognito}
            bottomInset={barInset}
          />
        )}

        {/* Last, so its backdrop is over everything else on the wall: a tap
            anywhere but the panel puts it away, the puck that opened it
            included. */}
        <WallMenu
          open={menuOpen}
          onClose={closeMenu}
          view={view}
          onViewChange={changeView}
          filter={filter}
          onFilterChange={setFilter}
          canSelect={!history.loading && deletable.length > 0}
          onSelect={startSelecting}
          top={CORNER_TOP + PUCK_SIZE + Spacing.sm}
          right={WALL_GUTTER}
        />
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    stage: { flex: 1 },
    head: {
      paddingHorizontal: WALL_GUTTER,
      paddingTop: CORNER_TOP,
      paddingBottom: Spacing.lg,
      gap: Spacing.md,
    },
    // Clear of the corner control, which floats over this corner.
    heading: { paddingRight: PUCK_SIZE + Spacing.md, gap: Spacing.xs },
    // Out to the screen's edges, so a pill scrolls off the edge and not into a margin.
    tabs: { flexGrow: 0, marginHorizontal: -WALL_GUTTER },
    tabsRow: { paddingHorizontal: WALL_GUTTER, gap: Spacing.sm, alignItems: 'center' },
    corner: { position: 'absolute', top: CORNER_TOP, right: WALL_GUTTER },
  });
