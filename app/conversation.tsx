/**
 * ChatScreen — the conversation with Goose.
 *
 * It opens over the whole app, not inside the Chat tab: a conversation is the
 * one screen that is all content, and the tab bar under its composer was a
 * chin of chrome nobody reached for mid-sentence. Back returns to the wall.
 *
 * What carries it:
 *
 * - **The turn as it happens.** Every reply streams. Each tool Goose calls
 *   appears as it calls it — a chip while it runs, a card once the answer is a
 *   thing worth drawing — and the words arrive as they are written. Until the
 *   first of them, the thinking line says what the Pond is doing and a quip
 *   keeps the wait alive.
 * - **An opening worth having.** A new conversation is the greeting card, and
 *   under it what the Pond itself offers to answer, not a fixed list.
 * - **Writing never waits for the answer.** What is sent mid-reply queues at
 *   the foot of the thread, marked as queued, and goes when the reply ends.
 * - **Voice in the composer's place.** The microphone swaps the composer for
 *   the orb; the keyboard swaps it back. The conversation stays on screen
 *   either way, and what is said out loud lands in it like anything typed.
 *
 * The title bar names the conversation, not the assistant: every conversation
 * is with Goose, so "Goose" over each of them said nothing. The wall's own
 * title arrives with the link so the bar is right on the first frame; a new
 * conversation takes the title the Pond will give it the moment it is asked,
 * and the Pond's own replaces it after each reply. Until anything is asked the
 * bar has no title — the greeting card under it already says "New chat".
 *
 * - **Reading back is left alone.** A reader well back in the thread is not
 *   pulled down by a reply arriving at its foot; the list holds what they are
 *   reading where it is, and a round arrow offers the way back to the newest
 *   message, with a dot when something arrived meanwhile
 *   (`view-models/latest-button.ts`).
 *
 * The header reports reachability only when it is bad. A green dot reading
 * "Connected" above every conversation is chrome; an explicit line when the
 * Pond cannot be reached is the thing a reader actually needs.
 *
 * Linked with `interview`, the conversation is the member's setup interview:
 * the topics covered sit under the bar, and the notes Goose drafts arrive at
 * the foot of the thread to be saved with a tap or changed by answering.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NAVBAR_DEFAULTS, NavbarBehaviour, type NavbarStage } from '@jarida/ink/headless';
import { InkNavbar, InkNotice, InkSpinner, inkText, useInkTheme, useReduceMotion } from '@/components/ui/ink';

import { ChatDock } from '@/components/patterns/chat-dock';
import { GreetingCard } from '@/components/patterns/greeting-card';
import { JumpToLatest } from '@/components/patterns/jump-to-latest';
import { InterviewDraft, InterviewProgress, InterviewSaved } from '@/components/patterns/interview-panels';
import { MessageRow } from '@/components/patterns/message-row';
import { RenameSheet } from '@/components/patterns/rename-sheet';
import type { ReplyTarget } from '@/services/reply';
import { VoiceDock } from '@/components/patterns/voice-dock';
import { GIcon } from '@/components/ui/g-icon';
import { cardFromParams, type CardRef } from '@/models/cards';
import { GKeyboardView } from '@/components/ui/g-keyboard-view';
import { GPressable } from '@/components/ui/g-pressable';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { useServer } from '@/providers/server-provider';
import { NEW_DRAFT, draftFor, moveDraft, setDraft } from '@/services/chat-threads';
import { selectionTick } from '@/services/haptics';
import {
  AttachError,
  bytesToBase64,
  pickAttachments,
  turnFileProblem,
  withinTurnLimit,
  type Attachment,
  type AttachSource,
} from '@/services/media';
import { cacheFile } from '@/services/voice-io';
import { useChatSenses } from '@/view-models/use-chat-senses';
import type { VoiceNote } from '@/view-models/use-voice-note';
import type { Message } from '@/models/chat';
import type { ThemeColors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';
import {
  HIDDEN,
  afterScroll,
  holdPlace,
  isBackInThread,
  footKey,
  hasUnseen,
  type LatestButton,
} from '@/view-models/latest-button';
import { positionsFor, useChat, type SendOptions } from '@/view-models/use-chat';
import { useResearchOffer } from '@/view-models/use-deep-research';
import { useGreetingName } from '@/view-models/use-greeting';
import { useInterview } from '@/view-models/use-interview';
import { useSuggestions, type OfferedPrompt } from '@/view-models/use-suggestions';
import type { BubblePosition } from '@/components/ui/ink';

/** The phone number for when the title bar condenses; see `chrome-provider.tsx`. */
const BEHAVIOUR = { ...NAVBAR_DEFAULTS, collapseAt: 120 };

/** One row of the inverted list: a message, where it sits in its run, and whether it is still waiting. */
interface Row {
  message: Message;
  position: BubblePosition;
  queued: boolean;
}

/**
 * The way back to the wall, at the head of the bar.
 *
 * The root stack keeps the tabs under this screen, so `back` is the ordinary
 * case. `replace` is for the one way to arrive without them: a link opened
 * cold, with nothing to go back to.
 */
function BackToWall() {
  const router = useRouter();
  const theme = useInkTheme();
  const { t } = useTranslation();

  const onPress = useCallback(() => {
    void selectionTick();
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/chat');
  }, [router]);

  return (
    <GPressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={t('chat.history.back')}
      style={localStyles.back}
    >
      <GIcon name="chevron-left" size={22} color={theme.color.text} />
    </GPressable>
  );
}

/**
 * The bar's title, which renames the conversation, as the dashboard's title does. Set exactly as
 * the bar sets a plain title, so a name that can be changed reads no differently from one that
 * cannot. Only a control once the Pond has the conversation: before that there is nothing to rename.
 */
function ConversationTitle({ title, onPress }: { title: string; onPress: (() => void) | null }) {
  const theme = useInkTheme();
  const { t } = useTranslation();
  const heading = inkText(theme, {
    role: 'display',
    size: 'lg',
    weight: theme.weight.bold,
    tracking: 'title',
    leading: 'tight',
  });
  const text = (
    <Text accessibilityRole="header" numberOfLines={1} style={[heading.style, localStyles.title]}>
      {title}
    </Text>
  );
  if (!onPress) return text;
  return (
    <GPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('chat.rename.open', { title })}
      style={localStyles.title}
    >
      {text}
    </GPressable>
  );
}

export default function ChatScreen() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { data, loading, error, actions } = useChat();
  const { hydrated } = useServer();
  const { messages, queued, streaming, turnSeed, sessionId, title } = data;
  const name = useGreetingName();
  const suggestions = useSuggestions(sessionId);
  const research = useResearchOffer();
  const [voice, setVoice] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);

  // The wall and Home link a conversation here by id, with the title they show
  // for it; without an id the screen opens a new conversation, which is what
  // the wall's compose button means. The ref is what stops a re-render
  // re-reading a conversation already on screen.
  const { session, title: linkedTitle, ask, interview: interviewOf, card_kind, card_id, card_title } = useLocalSearchParams<{
    session?: string;
    title?: string;
    /** A prompt handed over from Home's chips, to be asked on arrival. */
    ask?: string;
    /** A card sent to chat from My Goose: it rides the first message, and Goose works from it. */
    card_kind?: string;
    card_id?: string;
    card_title?: string;
    /** The member whose setup interview this conversation is, which turns its panels on. */
    interview?: string;
  }>();
  // The link alone decides what opens. `open` changes whenever the chat's queue
  // is replaced, which starting a new conversation does; read through a ref, so
  // that change cannot open the linked conversation again over the new one.
  const openedRef = useRef<string | null>(null);
  const { open, unqueue, watch, answerOffer } = actions;
  const openRef = useRef(open);
  // Declared before the effect that reads it, so it is current when that runs.
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  useEffect(() => {
    if (!session || openedRef.current === session) return;
    openedRef.current = session;
    openRef.current(session, linkedTitle);
  }, [session, linkedTitle]);

  // What is half-written stays with its conversation: leave and come back, or
  // start another and return, and the composer holds it again. A conversation
  // with no id yet writes into the new-conversation slot, and the draft moves
  // with it the moment the Pond names it. `dock` remounts the composer when the
  // screen moves to another conversation, so it starts from that one's draft.
  const draftKey = useRef(session ?? NEW_DRAFT);
  const [dock, setDock] = useState(() => ({ key: 0, draft: draftFor(session ?? NEW_DRAFT) }));
  useEffect(() => {
    if (!sessionId || draftKey.current === sessionId) return;
    if (draftKey.current === NEW_DRAFT) moveDraft(NEW_DRAFT, sessionId);
    draftKey.current = sessionId;
  }, [sessionId]);
  const onDraftChange = useCallback((text: string) => setDraft(draftKey.current, text), []);

  // The interview moves on a turn at a time, so it is read again as each reply ends.
  const interview = useInterview(interviewOf ?? null, Boolean(interviewOf));
  const { refresh: refreshInterview, approve } = interview.actions;
  const wasStreaming = useRef(false);
  useEffect(() => {
    if (wasStreaming.current && !streaming && interviewOf) void refreshInterview();
    wasStreaming.current = streaming;
  }, [interviewOf, refreshInterview, streaming]);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const saveDraft = useCallback(async () => {
    setSaving(true);
    setSaveFailed(false);
    const saved = await approve();
    setSaving(false);
    setSaveFailed(saved === null);
  }, [approve]);
  const seeNotes = useCallback(() => router.push('/(stack)/settings-prompt-notes'), [router]);
  const current = interviewOf ? interview.data.interview : null;
  const asking = current?.status === 'in_progress' || current?.status === 'stopped' || current?.status === 'awaiting_approval';
  const interviewFoot =
    current?.status === 'awaiting_approval' && current.draft.length > 0 ? (
      <View style={styles.foot}>
        <InterviewDraft interview={current} saving={saving} error={saveFailed ? t('interview.saveFailed') : null} onSave={saveDraft} />
      </View>
    ) : current?.status === 'done' ? (
      <View style={styles.foot}>
        <InterviewSaved onSeeNotes={seeNotes} />
      </View>
    ) : null;
  // While this is on screen, a reply that finishes here is simply read here.
  useFocusEffect(watch);

  // This screen is outside the tabs, so it has no shared bar to follow. The
  // title bar reads the list's own scroll through Ink's state machine, and
  // stops at condensed: Ink's navbar shrinks its body at `collapsed` whether
  // or not it may draw the puck that gets it back.
  const [behaviour] = useState(() => new NavbarBehaviour(BEHAVIOUR));
  const [stage, setStage] = useState<NavbarStage>('expanded');
  // The same scroll decides whether the way back to the newest message shows.
  // The list is inverted, so its offset is already the distance from the foot.
  // The foot is the newest row the list draws: the last queued message, else
  // the last message. When it moves behind a reader back in the thread, the
  // arrow carries a dot.
  const [latest, setLatest] = useState<LatestButton>(HIDDEN);
  // Whether the reader is back in the thread, the only time the list holds
  // their place (see `holdPlace`).
  const [back, setBack] = useState(false);
  const foot = footKey(queued[queued.length - 1] ?? messages[messages.length - 1]);
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, layoutMeasurement } = e.nativeEvent;
      const next = behaviour.scrolled(contentOffset.y);
      setStage(next === 'collapsed' ? 'condensed' : next);
      setLatest((state) => afterScroll(state, contentOffset.y, layoutMeasurement.height, foot));
      setBack(isBackInThread(contentOffset.y));
    },
    [behaviour, foot],
  );

  const listRef = useRef<FlatList<Row>>(null);
  const reduceMotion = useReduceMotion();
  // After the person asks, the reply is read from its top: once it outgrows the screen the list
  // holds its top edge where it is and the rest arrives below, until the reader scrolls or it ends.
  const holdTop = useRef(false);
  // Once the reply outgrows the screen, the row above it is the one the list keeps still, natively and
  // in the same frame as the reply grows; held from script, the text jumped a frame at every line.
  const [holding, setHolding] = useState<number | null>(null);
  const listHeight = useRef(0);
  const letGo = useCallback(() => {
    holdTop.current = false;
    setHolding(null);
  }, []);
  const scrollToFoot = useCallback(() => {
    letGo();
    setLatest(HIDDEN);
    // Before the scroll event says so: a message sent now lands in the next
    // render, which must not still be holding the place the reader just left.
    setBack(false);
    listRef.current?.scrollToOffset({ offset: 0, animated: !reduceMotion });
  }, [letGo, reduceMotion]);
  const toLatest = useCallback(() => {
    void selectionTick();
    scrollToFoot();
  }, [scrollToFoot]);

  const { vision, voiceNotes, files, maxPdfs } = useChatSenses();

  const onAttach = useCallback(
    async (source: AttachSource, room: number): Promise<Attachment[]> => {
      setNotice(null);
      if (vision === false && source !== 'files') {
        setNotice(t('chat.composer.noVision'));
        return [];
      }
      try {
        const picked = await pickAttachments(source, room, files);
        if (vision === false && picked.some((a) => a.kind === 'image')) {
          setNotice(t('chat.composer.noVision'));
          return picked.filter((a) => a.kind !== 'image');
        }
        return picked;
      } catch (e) {
        setNotice(e instanceof AttachError ? t(e.key, e.params) : t('chat.composer.unreadable'));
        return [];
      }
    },
    [files, t, vision],
  );

  const ink = useInkTheme();
  // The card waits above the composer until the first message takes it; the member can drop it.
  const [card, setCard] = useState<CardRef | null>(() => cardFromParams({ card_kind, card_id, card_title }));

  const onSend = useCallback(
    (text: string, attachments: Attachment[], options?: Pick<SendOptions, 'research' | 'answer'>) => {
      if (!withinTurnLimit(attachments)) {
        setNotice(t('chat.composer.turnTooLarge'));
        return;
      }
      const problem = turnFileProblem(attachments, maxPdfs);
      if (problem) {
        setNotice(t(problem));
        return;
      }
      setNotice(null);
      // What the reader just wrote is where they are now, however far back
      // they had been reading.
      scrollToFoot();
      holdTop.current = true;
      void actions.send(text, attachments, card ? { ...options, card: { kind: card.kind, id: card.id } } : options);
      setCard(null);
    },
    [actions, card, maxPdfs, scrollToFoot, t],
  );

  // The sound itself goes to the model, never a transcript of it. The phone keeps a copy to replay,
  // because the Pond keeps only a mark where the note was.
  const onVoiceNote = useCallback(
    (note: VoiceNote) => {
      setNotice(null);
      let uri: string;
      try {
        uri = cacheFile('voice-note', note.wav);
      } catch (e) {
        console.warn('[voice-note] could not keep the recording', { kind: 'voice_note', error: String(e) });
        setNotice(t('chat.voiceNote.failed'));
        return;
      }
      scrollToFoot();
      const attachment: Attachment = {
        id: `voice-${Date.now().toString(36)}`,
        kind: 'audio',
        uri,
        name: 'voice-note.wav',
        mimeType: 'audio/wav',
        base64: bytesToBase64(note.wav),
        durationMs: note.durationMs,
      };
      void actions.send('', [attachment]);
    },
    [actions, scrollToFoot, t],
  );

  // A hold on a Pond that would not hear the note is refused before anyone speaks into it.
  const voiceNoteRefusal = useMemo(() => {
    const openModels = () => router.push('/(stack)/models' as never);
    switch (voiceNotes) {
      case 'update':
        return { words: t('chat.voiceNote.needsPondUpdate') };
      case 'unsupported':
        return { words: t('chat.voiceNote.modelCannotHear'), action: t('chat.voiceNote.openModels'), onPress: openModels };
      case 'not_ready':
        return { words: t('chat.voiceNote.addOnNotReady'), action: t('chat.voiceNote.openModels'), onPress: openModels };
      default:
        return null;
    }
  }, [router, t, voiceNotes]);

  // A prompt Home handed over: asked once on arrival, exactly as picking one here does.
  //
  // The ref stops a re-render asking it again, and clearing the param stops a remount doing so --
  // Android recreates the activity on a return to the app, and a prompt still sitting in the route
  // would be sent a second time into a conversation that already holds it.
  const askedRef = useRef(false);
  useEffect(() => {
    const prompt = ask?.trim();
    if (!hydrated || askedRef.current || !prompt) return;
    askedRef.current = true;
    router.setParams({ ask: undefined });
    void actions.send(prompt);
  }, [hydrated, ask, actions, router]);

  const onPick = useCallback(
    (prompt: OfferedPrompt) => {
      suggestions.actions.taken(prompt);
      void actions.send(prompt.prompt);
    },
    [actions, suggestions.actions],
  );

  const handleNew = useCallback(() => {
    void selectionTick();
    // The screen no longer shows the conversation it was linked to, so it drops
    // the link; following the same link again opens that conversation again.
    openedRef.current = null;
    router.setParams({ session: undefined, title: undefined });
    behaviour.set('expanded');
    setStage('expanded');
    setLatest(HIDDEN);
    setBack(false);
    draftKey.current = NEW_DRAFT;
    setDock((d) => ({ key: d.key + 1, draft: draftFor(NEW_DRAFT) }));
    actions.newConversation();
  }, [actions, behaviour, router]);

  // Runs are read in speaking order, then reversed for `inverted`. What is
  // queued comes last, where it will be asked; a queued message keeps its id
  // when it is sent, so its row stays put and only stops waiting.
  const rows: Row[] = useMemo(() => {
    const thread = [...messages, ...queued];
    const positions = positionsFor(thread);
    return thread
      .map((m, i) => ({ message: m, position: positions[i], queued: i >= messages.length }))
      .reverse();
  }, [messages, queued]);

  // What the next message answers. It belongs to this conversation, so another one starts without it.
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [replyFor, setReplyFor] = useState(sessionId);
  if (replyFor !== sessionId) {
    setReplyFor(sessionId);
    setReplyTo(null);
  }
  const clearReply = useCallback(() => setReplyTo(null), []);

  // Read when the reply is measured, after the render that drew it; a dependency instead would hand
  // every row a new callback, and redraw them all, at each word.
  const rowsNow = useRef(rows);
  useEffect(() => {
    rowsNow.current = rows;
  }, [rows]);
  // Shorter than the screen, the reply grows up from the foot as any message does. The moment it is
  // taller, its top edge is lined up with the screen's (`viewPosition: 1` on the inverted list) and
  // the row above it is held from then on, so the rest of the reply arrives below.
  const holdReplyTop = useCallback(
    (height: number) => {
      if (!holdTop.current || holding !== null) return;
      if (height + REPLY_FOOT + Spacing.sm < listHeight.current) return;
      const index = rowsNow.current.findIndex((row) => row.message.pending && row.message.role === 'assistant');
      if (index < 0) return;
      setHolding(index + 1);
      // A frame later, once the list has measured the row at its new size.
      requestAnimationFrame(() =>
        listRef.current?.scrollToIndex({ index, viewPosition: 1, viewOffset: Spacing.sm, animated: false }),
      );
    },
    [holding],
  );
  // A finished reply is held no longer; the next question starts the hold again from the foot.
  useEffect(() => {
    if (!streaming) holdTop.current = false;
  }, [streaming]);

  const keyExtractor = useCallback((row: Row) => row.message.id, []);
  const renderItem = useCallback(
    ({ item }: { item: Row }) => (
      <MessageRow
        message={item.message}
        position={item.position}
        turnSeed={turnSeed}
        queued={item.queued}
        onUnqueue={unqueue}
        onOffer={answerOffer}
        onReply={setReplyTo}
        onLayout={item.message.pending && item.message.role === 'assistant' ? holdReplyTop : undefined}
        sessionId={sessionId}
      />
    ),
    [turnSeed, unqueue, answerOffer, holdReplyTop, sessionId],
  );

  const started = messages.length > 0 || queued.length > 0;
  const shown = notice ?? error;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <GKeyboardView style={styles.flex}>
        {/* `alignSelf: flex-end` plus an undefined width makes the bar hug its
            own content on the right until its first layout lands. Stretching it
            is what keeps the title on the left, where a title belongs. */}
        <InkNavbar
          variant="static"
          style={styles.navbar}
          stage={stage}
          lead={<BackToWall />}
          title={
            title ? (
              <ConversationTitle title={title} onPress={sessionId ? () => setRenaming(true) : null} />
            ) : undefined
          }
          actions={[
            {
              key: 'new',
              label: t('chat.newConversation'),
              icon: 'compose',
              onPress: handleNew,
            },
          ]}
        />

        {renaming && sessionId && title ? (
          <RenameSheet
            key={sessionId}
            title={title}
            onClose={() => setRenaming(false)}
            onRename={actions.rename}
            onNameForMe={actions.nameForMe}
          />
        ) : null}

        {asking && current ? <InterviewProgress interview={current} /> : null}

        {shown ? (
          <GPressable
            feedback="tint"
            onPress={() => {
              setNotice(null);
              actions.dismissError();
            }}
            accessibilityRole="button"
            accessibilityHint={t('chat.dismiss')}
            style={styles.notice}
          >
            <InkNotice tone={notice ? 'warning' : 'danger'}>{shown}</InkNotice>
          </GPressable>
        ) : null}

        <View style={styles.conversation}>
          {started ? (
            <FlatList
              ref={listRef}
              data={rows}
              keyExtractor={keyExtractor}
              renderItem={renderItem}
              inverted
              onScroll={onScroll}
              onScrollBeginDrag={letGo}
              onLayout={(e) => {
                listHeight.current = e.nativeEvent.layout.height;
              }}
              // The reply is the row being drawn, so it is measured; should it not be, the hold still holds.
              onScrollToIndexFailed={() => {}}
              scrollEventThrottle={16}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.listContent}
              maintainVisibleContentPosition={
                streaming && holding !== null ? { minIndexForVisible: holding } : holdPlace(back)
              }
              // The list is inverted, so its header sits under the newest message.
              ListHeaderComponent={interviewFoot}
            />
          ) : session && loading ? (
            // An existing conversation being read for the first time is not a
            // new one: the greeting card here would say "New chat" over it.
            <View style={styles.reading}>
              <InkSpinner label={t('chat.reading')} />
            </View>
          ) : (
            <View style={styles.opening}>
              <GreetingCard
                name={name}
                seed={turnSeed}
                busy={streaming}
                prompts={suggestions.data.prompts}
                onPick={onPick}
              />
            </View>
          )}
          {started && latest.visible ? (
            <View pointerEvents="box-none" style={styles.latest}>
              <JumpToLatest onPress={toLatest} unseen={hasUnseen(latest, foot)} />
            </View>
          ) : null}
        </View>

        {voice ? (
          <VoiceDock
            send={actions.send}
            stop={actions.stop}
            sendsRecordings={voiceNotes === 'ready'}
            onClose={() => setVoice(false)}
            bottomInset={insets.bottom}
          />
        ) : (
          <>
            {card ? (
              <View style={styles.cardChip}>
                <GIcon name="link" size={14} color={ink.color.textTertiary} />
                <View style={styles.flex}>
                  <Text style={styles.cardChipTitle} numberOfLines={1}>
                    {t('goose.cards.chip', { title: card.title })}
                  </Text>
                  <Text style={styles.cardChipHint} numberOfLines={1}>
                    {t('goose.cards.chipHint')}
                  </Text>
                </View>
                <GPressable onPress={() => setCard(null)} accessibilityRole="button" accessibilityLabel={t('goose.cards.remove', { title: card.title })} hitSlop={10}>
                  <GIcon name="x" size={16} color={ink.color.textTertiary} />
                </GPressable>
              </View>
            ) : null}
            <ChatDock
              key={dock.key}
              initialDraft={dock.draft}
              onDraftChange={onDraftChange}
              onSend={onSend}
              onVoice={() => setVoice(true)}
              onVoiceNote={onVoiceNote}
              voiceNoteRefusal={voiceNoteRefusal}
              onAttach={onAttach}
              busy={streaming}
              bottomInset={insets.bottom}
              research={research}
              conversation={sessionId}
              replyTo={replyTo}
              onClearReply={clearReply}
            />
          </>
        )}
      </GKeyboardView>
    </SafeAreaView>
  );
}

/** Under the reply in the list: its own bottom margin and the list's padding (`styles.listContent`). */
const REPLY_FOOT = 18 + Spacing.md;

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    flex: { flex: 1 },
    navbar: { alignSelf: 'stretch' },

    conversation: { flex: 1, overflow: 'hidden' },
    listContent: {
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
    },

    notice: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm },
    cardChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginHorizontal: Spacing.lg,
      marginBottom: Spacing.xs,
      paddingHorizontal: Spacing.md,
      paddingVertical: 8,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    cardChipTitle: { color: c.text, fontSize: 14, fontWeight: '600' },
    cardChipHint: { color: c.textSecondary, fontSize: 12 },
    foot: { paddingTop: Spacing.md },

    // Over the foot of the thread, centred, clear of the composer under it.
    latest: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: Spacing.md,
      alignItems: 'center',
    },
    reading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    opening: {
      flex: 1,
      justifyContent: 'flex-end',
      paddingHorizontal: Spacing.lg,
      paddingBottom: Spacing.lg,
    },
  });

/* Nothing themed in here, so it needs no factory. */
const localStyles = StyleSheet.create({
  back: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Shrinks before the bar's actions do, as the bar's own title does.
  title: { flexShrink: 1 },
});
