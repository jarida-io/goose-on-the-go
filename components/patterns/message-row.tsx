/**
 * MessageRow — one turn of the conversation.
 *
 * What a person said is a bubble, Ink's, with any pictures they sent above it.
 * What Goose said is not: it is the page's text, full width, set from the
 * markdown the model writes, the way pond-desktop sets a reply — a bubble
 * around every answer makes a long one a box to scroll inside. At its top,
 * what Goose thought and noted on the way, tucked into one line beside a
 * rippling pond; below it, what its tools drew and the pages it read. The turn
 * can still be running once the words appear — the Pond can take another
 * model pass before it calls the turn done — so the pond and the composer's
 * glowing line keep going until it does. Without them, a message queued behind
 * a finished-looking answer looks stuck.
 *
 * A message written while Goose was still answering sits at the foot of the
 * thread, where it will be asked, drawn as Ink's bubble in its sending state
 * with a note that it is queued and a way to take it back. pond-desktop marks
 * a queued message the same way, in place rather than in a tray, so the queue
 * is visible and not a silent buffer.
 *
 * A message the Pond wrote for itself says where it came from in one quiet line
 * above it, and a reply carries a chip for each thing it set or could not set,
 * and what it offers to do (`message-note.tsx`).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { hitSlop } from '@jarida/ink';
import { InkBubble, inkText, useInkTheme, type BubblePosition } from '@/components/ui/ink';

import { TrailChip, TrailSheet, useTrail, type TrailState } from '@/components/patterns/answer-trail';
import { ACTION_HEIGHT, CopyButton } from '@/components/patterns/copy-button';
import { PagePictures } from '@/components/patterns/cited-sources';
import { PictureViewer } from '@/components/patterns/picture-viewer';
import { PondPicture } from '@/components/patterns/pond-picture';
import { ReplyPartSheet } from '@/components/patterns/reply-part-sheet';
import { SwipeToReply } from '@/components/patterns/swipe-to-reply';
import { citedLinks, mergeSources } from '@/models/sources';
import { Markdown } from '@/components/patterns/markdown';
import { FromLine, OfferPanel, ReceiptChips } from '@/components/patterns/message-note';
import { sourcesOf } from '@/constants/tools';
import { usePagePictures } from '@/view-models/use-page-pictures';
import { useReadAloud } from '@/view-models/use-read-aloud';
import { ReplyThoughts } from '@/components/patterns/reply-thoughts';
import { ToolTrail, foldedTools } from '@/components/patterns/tool-card';
import { GIcon } from '@/components/ui/g-icon';
import { GPressable } from '@/components/ui/g-pressable';
import { clockWords } from '@/components/patterns/voice-note-mic';
import type { ChatImage, ChatVoiceNote, Message, ToolCall } from '@/models/chat';
import { markdownToPlain } from '@/services/markdown';
import { REPLY_CARD, splitReply, type ReplyPicture, type ReplyTarget } from '@/services/reply';
import { selectionTick } from '@/services/haptics';
import { playFile } from '@/services/voice-io';
import { Spacing } from '@/constants/spacing';

/** One picture on its own is shown large; several share a row. */
const SINGLE = 220;
const TILE = 104;

/** A picture as the thread holds it, in the shape a reply to it and the viewer take. */
const asPicture = (image: ChatImage): ReplyPicture => ({ uri: image.uri, local: image.local });

function Pictures({ images, onOpen }: { images: ChatImage[]; onOpen?: (picture: ReplyPicture) => void }) {
  const theme = useInkTheme();
  const { t } = useTranslation();
  const single = images.length === 1;
  return (
    <View style={[styles.pictures, single ? null : styles.grid]}>
      {images.map((image, i) => {
        const ratio = image.width && image.height ? image.width / image.height : 1;
        const width = single ? SINGLE : TILE;
        const height = single ? Math.round(SINGLE / Math.max(0.5, Math.min(2, ratio))) : TILE;
        const frame = { width, height, borderRadius: theme.radius.lg, backgroundColor: theme.color.line };
        const label = t('chat.attachedPicture', { index: i + 1 });
        return (
          <GPressable
            key={image.id}
            feedback="lift"
            disabled={!onOpen}
            onPress={() => onOpen?.(asPicture(image))}
            accessibilityRole="imagebutton"
            accessibilityLabel={label}
          >
            {/* One the Pond holds loads through its pinned connection, which the image view's own loader cannot use. */}
            {image.local ? (
              <Image source={{ uri: image.uri }} style={frame} contentFit="cover" transition={120} />
            ) : (
              <PondPicture path={image.uri} label={label} style={frame} />
            )}
          </GPressable>
        );
      })}
    </View>
  );
}

/** Above a reply: whose words or picture it answers, and the words, in the quote's own quiet type. */
function QuoteLine({ head, quote }: { head: string; quote: string }) {
  const theme = useInkTheme();
  const screen = useWindowDimensions();
  const who = inkText(theme, { size: 'xs', weight: theme.weight.semibold, color: theme.color.textSecondary });
  const words = inkText(theme, { size: 'sm', color: theme.color.textSecondary });
  return (
    <View
      style={[
        styles.quote,
        {
          width: Math.round(screen.width * REPLY_CARD),
          borderLeftColor: theme.color.accentLine,
          backgroundColor: theme.color.neutralSoft,
          borderRadius: theme.radius.md,
        },
      ]}
    >
      <Text style={who.style} numberOfLines={1}>
        {head}
      </Text>
      {quote ? (
        <Text style={words.style} numberOfLines={3}>
          {quote}
        </Text>
      ) : null}
    </View>
  );
}

/** "Queued", and the way to take it back, under a message still waiting its turn. */
/** A voice note the person sent: played back from this phone, which is where it was recorded. */
function VoiceNoteChip({ note }: { note: ChatVoiceNote }) {
  const theme = useInkTheme();
  const { t } = useTranslation();
  const [at, setAt] = useState<number | null>(null);
  const playing = useRef<{ stop: () => void } | null>(null);
  useEffect(() => () => playing.current?.stop(), []);
  const toggle = () => {
    void selectionTick();
    if (playing.current) {
      playing.current.stop();
      return;
    }
    const run = playFile(note.uri, (secs) => setAt(secs * 1000));
    playing.current = run;
    setAt(0);
    void run.done.then(() => {
      playing.current = null;
      setAt(null);
    });
  };
  const words = inkText(theme, { role: 'mono', size: 'sm', color: theme.color.textOnAccent });
  // Read back from the Pond, which keeps no recording: the note was sent, and there is nothing to play.
  if (!note.uri) {
    const label = note.name ?? t('chat.voiceNote.sent');
    return (
      <View
        accessible
        accessibilityLabel={label}
        style={[styles.voice, { backgroundColor: theme.color.accent, borderRadius: theme.radius.pill }]}
      >
        <GIcon name="voice" size={16} color={theme.color.textOnAccent} />
        <Text style={[words.style, note.name ? styles.voiceName : null]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    );
  }
  return (
    <GPressable
      feedback="lift"
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel={
        note.name
          ? t(at === null ? 'chat.voiceNote.playFile' : 'chat.voiceNote.stopFile', { name: note.name })
          : t(at === null ? 'chat.voiceNote.play' : 'chat.voiceNote.stop', { length: clockWords(note.durationMs) })
      }
      style={[styles.voice, { backgroundColor: theme.color.accent, borderRadius: theme.radius.pill }]}
    >
      <GIcon name={at === null ? 'play' : 'stop'} size={16} color={theme.color.textOnAccent} />
      <GIcon name="voice" size={16} color={theme.color.textOnAccent} />
      {note.name ? (
        <Text style={[words.style, styles.voiceName]} numberOfLines={1}>
          {at === null ? note.name : clockWords(at)}
        </Text>
      ) : (
        <Text style={words.style}>{clockWords(at === null ? note.durationMs : Math.min(at, note.durationMs))}</Text>
      )}
    </GPressable>
  );
}

function QueuedNote({ onRemove }: { onRemove: () => void }) {
  const theme = useInkTheme();
  const { t } = useTranslation();
  const note = inkText(theme, { role: 'mono', size: 'xs', color: theme.color.textTertiary });
  return (
    <View style={styles.queuedNote}>
      <Text style={note.style}>{t('chat.queued')}</Text>
      <GPressable
        feedback="tint"
        onPress={() => {
          void selectionTick();
          onRemove();
        }}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={t('chat.unqueue')}
        style={styles.unqueue}
      >
        <GIcon name="x" size={12} color={theme.color.textTertiary} />
      </GPressable>
    </View>
  );
}

export interface MessageRowProps {
  message: Message;
  position: BubblePosition;
  turnSeed: number;
  /** Written while Goose was answering, and not yet sent. */
  queued?: boolean;
  /** Take a queued message back, by id. */
  onUnqueue?: (id: string) => void;
  /** Answer what a message offers, by the message's id. */
  onOffer?: (id: string, take: boolean) => Promise<void> | void;
  /** Answer this message, a part of it, or one of its pictures, from the composer. */
  onReply?: (target: ReplyTarget) => void;
  /** The reply's height, as it changes, for a thread that holds its top edge in view while it is written. */
  onLayout?: (height: number) => void;
  /** The conversation's session, which Goose's questions in a reply are stored under. */
  sessionId?: string | null;
}

export const MessageRow = React.memo(function MessageRow({
  message,
  position,
  turnSeed,
  queued = false,
  onUnqueue,
  onOffer,
  onReply,
  onLayout,
  sessionId = null,
}: MessageRowProps) {
  if (message.role === 'user') {
    return <MyMessage message={message} position={position} queued={queued} onUnqueue={onUnqueue} onReply={onReply} />;
  }
  return <TheirMessage message={message} turnSeed={turnSeed} sessionId={sessionId} onOffer={onOffer} onReply={onReply} onLayout={onLayout} />;
});

/** What the person said: any quote it answers, their pictures, a voice note, and the bubble. */
function MyMessage({
  message,
  position,
  queued,
  onUnqueue,
  onReply,
}: Pick<MessageRowProps, 'message' | 'position' | 'queued' | 'onUnqueue' | 'onReply'>) {
  const [viewing, setViewing] = useState<ReplyPicture | null>(null);
  const [part, setPart] = useState<string | null>(null);
  const reply = message.content ? splitReply(message.content) : null;
  const words = reply ? reply.body : message.content;
  // A message still waiting to be sent is not one to answer yet.
  const answer = queued ? undefined : onReply;
  const first = message.images?.[0];
  const whole = answer
    ? () =>
        words
          ? answer({ kind: 'text', from: 'you', text: words, part: false })
          : first
            ? answer({ kind: 'picture', from: 'you', picture: asPicture(first) })
            : undefined
    : undefined;
  return (
    <SwipeToReply onReply={whole}>
      <View style={styles.mine}>
        {message.note?.from ? <FromLine from={message.note.from} mine /> : null}
        {reply ? <QuoteLine head={reply.head} quote={reply.quote} /> : null}
        {message.images?.length ? (
          <View style={queued ? styles.waiting : null}>
            <Pictures images={message.images} onOpen={setViewing} />
          </View>
        ) : null}
        {message.voice ? (
          <View style={queued ? styles.waiting : null}>
            <VoiceNoteChip note={message.voice} />
          </View>
        ) : null}
        {words ? (
          <GPressable feedback="none" disabled={!answer} onLongPress={() => setPart(words)} delayLongPress={350}>
            <InkBubble mine position={position} status={queued ? 'sending' : 'sent'}>
              {words}
            </InkBubble>
          </GPressable>
        ) : null}
        {queued && onUnqueue ? <QueuedNote onRemove={() => onUnqueue(message.id)} /> : null}
      </View>
      <PictureViewer
        picture={viewing}
        onClose={() => setViewing(null)}
        onReply={answer ? (picture) => answer({ kind: 'picture', from: 'you', picture }) : undefined}
      />
      {answer ? (
        <ReplyPartSheet
          text={part}
          onClose={() => setPart(null)}
          onReply={(text, chosen) => answer({ kind: 'text', from: 'you', text, part: chosen })}
        />
      ) : null}
    </SwipeToReply>
  );
}

/** Pages an answer's pictures are asked for at most. */
const PICTURE_PAGES = 6;

/**
 * What Goose said: its text with each cited page numbered, then one chip folding the pages it read
 * and the tools it ran, then once the turn is done the Pond's pictures for those pages, edge to
 * edge, then what its tools drew.
 */
function TheirMessage({
  message,
  turnSeed,
  sessionId,
  onOffer,
  onReply,
  onLayout,
}: {
  message: Message;
  turnSeed: number;
  sessionId: string | null;
  onOffer?: (id: string, take: boolean) => Promise<void> | void;
  onReply?: (target: ReplyTarget) => void;
  onLayout?: (height: number) => void;
}) {
  const done = !message.pending;
  const [viewing, setViewing] = useState<ReplyPicture | null>(null);
  const [part, setPart] = useState<string | null>(null);
  // Answered as the words it reads as, not the markdown it was written in.
  const plain = useMemo(() => (done && message.content ? markdownToPlain(message.content) : ''), [done, message.content]);
  const answer = done ? onReply : undefined;
  const sources = useMemo(
    () =>
      mergeSources(
        citedLinks(message.content),
        sourcesOf(message.tools).map((s) => ({ title: s.title, url: s.url })),
      ),
    [message.content, message.tools],
  );
  const trail = useTrail(sources);
  const folded = useMemo(() => foldedTools(message.tools ?? []), [message.tools]);
  // The pages settle once the text has, so the chip counts tools alone until then.
  const shown = done ? trail : { ...trail, sources: [] };
  const pictures = usePagePictures(
    sources.slice(0, PICTURE_PAGES).map((s) => s.url),
    done,
  );
  const note = message.note;

  const text = message.content ? (
    <Markdown key="text" source={message.content} sources={done ? trail.chips : undefined} />
  ) : null;
  const tools = message.tools?.length ? <ToolTrail key="tools" tools={message.tools} sessionId={sessionId} /> : null;
  const thoughts = (
    <ReplyThoughts
      key="thoughts"
      thinking={message.thinking}
      steps={message.steps}
      tools={message.tools}
      live={!done}
      waiting={!message.content}
      seed={turnSeed}
    />
  );
  // While Goose writes, what its tools did sits above the words too, under its thinking. Keyed, so a
  // part moves, not remounts, when the reply settles.
  const parts = done
    ? [
        thoughts,
        text,
        <ReplyActions
          key="actions"
          message={message}
          trail={shown}
          tools={folded}
          onReply={answer && plain ? () => setPart(plain) : undefined}
        />,
        /* The thread's own padding (app/conversation.tsx), which the pictures reach past. */
        <PagePictures
          key="pictures"
          pictures={pictures}
          inset={Spacing.lg}
          onOpen={(image) => setViewing({ uri: image.src, local: false, label: image.caption ?? image.credit })}
        />,
        tools,
      ]
    : [thoughts, <TrailChip key="chip" state={shown} tools={folded} />, tools, text];

  return (
    <SwipeToReply
      onReply={answer && plain ? () => answer({ kind: 'text', from: 'goose', text: plain, part: false }) : undefined}
    >
      <View style={styles.theirs} onLayout={onLayout ? (e) => onLayout(e.nativeEvent.layout.height) : undefined}>
        {note?.from ? <FromLine from={note.from} /> : null}
        {parts}
        {trail.mounted ? <TrailSheet state={shown} tools={folded} /> : null}
        {note?.receipts?.length ? <ReceiptChips receipts={note.receipts} /> : null}
        {note?.offer ? (
          <OfferPanel offer={note.offer} onAnswer={onOffer ? (take) => onOffer(message.id, take) : undefined} />
        ) : null}
      </View>
      <PictureViewer
        picture={viewing}
        onClose={() => setViewing(null)}
        onReply={answer ? (picture) => answer({ kind: 'picture', from: 'goose', picture }) : undefined}
      />
      {answer ? (
        <ReplyPartSheet
          text={part}
          onClose={() => setPart(null)}
          onReply={(text, chosen) => answer({ kind: 'text', from: 'goose', text, part: chosen })}
        />
      ) : null}
    </SwipeToReply>
  );
}

/** Under a finished reply: the chip, then reading it aloud, copying it as written, and answering it. */
function ReplyActions({
  message,
  trail,
  tools,
  onReply,
}: {
  message: Message;
  trail: TrailState;
  tools: ToolCall[];
  /** Opens the reply's words to answer all of them or a part. */
  onReply?: () => void;
}) {
  const theme = useInkTheme();
  const { t } = useTranslation();
  const { reading, toggle } = useReadAloud(message.id);
  return (
    <View style={styles.actions}>
      <TrailChip state={trail} tools={tools} />
      {message.content ? (
        <>
          <GPressable
            feedback="tint"
            onPress={() => {
              void selectionTick();
              toggle(message.content);
            }}
            accessibilityRole="button"
            accessibilityLabel={reading ? t('chat.reply.stopReading') : t('chat.reply.readAloud')}
            hitSlop={hitSlop(ACTION_HEIGHT)}
            style={styles.action}
          >
            <GIcon name={reading ? 'stop' : 'volume'} size={15} color={reading ? theme.color.accentLine : theme.color.textSecondary} />
          </GPressable>
          <CopyButton text={message.content} />
          {onReply ? (
            <GPressable
              feedback="tint"
              onPress={() => {
                void selectionTick();
                onReply();
              }}
              accessibilityRole="button"
              accessibilityLabel={t('chat.reply.reply')}
              hitSlop={hitSlop(ACTION_HEIGHT)}
              style={styles.action}
            >
              <GIcon name="reply" size={15} color={theme.color.textSecondary} />
            </GPressable>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  mine: { alignItems: 'flex-end', gap: 6, marginBottom: 10 },
  theirs: { gap: 10, marginBottom: 18, paddingRight: 8 },
  pictures: { alignItems: 'flex-end' },
  voice: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  voiceName: { flexShrink: 1, maxWidth: 220 },
  // Ink's bubble dims to this while sending; its pictures match it.
  waiting: { opacity: 0.6 },
  queuedNote: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12 },
  unqueue: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6, maxWidth: 3 * TILE + 12 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  quote: { borderLeftWidth: 3, paddingHorizontal: 10, paddingVertical: 6, gap: 2 },
  action: { height: ACTION_HEIGHT, minWidth: 32, alignItems: 'center', justifyContent: 'center' },
});
