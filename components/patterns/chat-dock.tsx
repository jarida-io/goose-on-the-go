/**
 * ChatDock — where a message is written: attach, the field, and speak or send.
 *
 * It floats. The dock used to be a slab the width of the screen with a rule
 * along its top, standing on the strip the tab bar floated over — a chin of
 * chrome nearly a sixth of the screen tall under every conversation. The
 * conversation now opens over the tabs, so the only thing under the dock is the
 * home indicator, and the controls are three pieces of opaque chrome sitting
 * on the page rather than a panel holding them. Solid, not the tab bar's glass,
 * for the reason in `chrome-puck.tsx`.
 *
 * The right-hand control is two in one place. With nothing written it is the
 * microphone beside the field, which opens voice mode; once there is something
 * to send it is send, drawn as the screen's one filled accent on Ink's edge,
 * because it is the control actually asking a question. They share a place
 * because they are never both useful at once. Send sits inside the field, in
 * its bottom corner, so a long draft has the whole width and send stays by the
 * last line, where the writing ends.
 *
 * It stays live while Goose answers. A follow-up thought mid-reply is the
 * ordinary case, and a field that locked until the model finished made the
 * person hold it in their head; now send queues it behind the reply, and the
 * field says so before anything is typed. A light behind the composer, running
 * along the field's top border and lighting the field and its buttons from
 * behind, says the reply is still coming, and a reminder under it that Goose
 * can be wrong fades once the reply is in (`answering.tsx`).
 *
 * The dock holds its own draft and attachments. Lifting them into the screen
 * would re-render every message on each keystroke, and nothing above here
 * needs to know what is half-written. It starts from `initialDraft` and reports
 * each edit through `onDraftChange`, so the screen can keep the draft with its
 * conversation without re-rendering for it.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { glassLift, hitSlop } from '@jarida/ink';
import { InkChip, InkEdge, InkEyebrow, InkSegmented, inkText, useInkTheme, useReduceMotion } from '@/components/ui/ink';

import {
  AnsweringLight,
  AnsweringNote,
  AnsweringWash,
  useAnsweringLight,
  useAnsweringNote,
  type FieldBox,
} from '@/components/patterns/answering';
import { AttachMenu } from '@/components/patterns/attach-menu';
import { WebWatchGuidedSheet } from '@/components/patterns/web-watch-guided-sheet';
import { VoiceNoteMic, VoiceNoteStrip } from '@/components/patterns/voice-note-mic';
import { GIcon } from '@/components/ui/g-icon';
import { GPressable } from '@/components/ui/g-pressable';
import { reject, selectionTick, tap } from '@/services/haptics';
import type { Attachment, AttachSource } from '@/services/media';
import type { ResearchOffer } from '@/models/long-tasks';
import type { WebWatch } from '@/models/web-watches';
import type { SendOptions } from '@/view-models/use-chat';
import { RESEARCH_ANSWERS, researchAnswerWords, researchItem, useResearchMode } from '@/view-models/use-deep-research';
import { useVoiceNote, type VoiceNote } from '@/view-models/use-voice-note';
import { Spacing } from '@/constants/spacing';
import { REPLY_CARD, pictureAttachment, replyHead, replyQuote, withReply, type ReplyTarget } from '@/services/reply';

/** The controls' diameter, and the field's height on one line: the touch floor. */
const CONTROL = 44;

/** The text's own height plus the field's padding, from one line up to `tallest`. */
function fieldHeight(content: number, tallest: number): number {
  return Math.min(tallest, Math.max(CONTROL, Math.ceil(content) + (Platform.OS === 'ios' ? 24 : 16)));
}

/** Send's face; Ink's compact plate adds four below it and to its right. */
const SEND = { width: 40, height: 28 };
const PLATE = 4;
/** Send's gap from the field's corner, which centres it on a one-line field. */
const SEND_INSET = (CONTROL - SEND.height - PLATE) / 2;

/** The strip's words for what the next message answers. */
function replyingKey(target: ReplyTarget) {
  if (target.kind === 'picture') return target.from === 'goose' ? 'chat.replying.goosePicture' : 'chat.replying.yourPicture';
  return target.from === 'goose' ? 'chat.replying.goose' : 'chat.replying.you';
}

/** Past this many the Pond's turn gets heavy and the strip stops fitting a thumb. */
export const MAX_ATTACHMENTS = 4;

export interface VoiceNoteRefusal {
  words: string;
  action?: string;
  onPress?: () => void;
}

export interface ChatDockProps {
  onSend: (text: string, attachments: Attachment[], options?: Pick<SendOptions, 'research' | 'answer'>) => void;
  /** Open voice mode. */
  onVoice: () => void;
  /** A held microphone was let go: the note to send. Without it, the microphone only opens voice mode. */
  onVoiceNote?: (note: VoiceNote) => void;
  /** Why a hold would record nothing worth sending, said instead of recording; with a way to fix it when there is one. */
  voiceNoteRefusal?: VoiceNoteRefusal | null;
  /** Ask for pictures or a file. Resolves with what was chosen, or nothing. */
  onAttach: (source: AttachSource, room: number) => Promise<Attachment[]>;
  /** A turn is in flight: what is sent now waits behind it. */
  busy?: boolean;
  /** The home indicator, when no keyboard is covering it. */
  bottomInset?: number;
  /** Whether the plus menu offers deep research, as the Pond answered once. */
  research?: ResearchOffer;
  /** The conversation on screen; research mode ends when it changes. */
  conversation?: string | null;
  /** What was half-written here last time. Read once, when the dock mounts. */
  initialDraft?: string;
  /** Each edit to the draft, sending included. */
  onDraftChange?: (text: string) => void;
  /** What the next message answers, chosen in the thread; null when it answers nothing in particular. */
  replyTo?: ReplyTarget | null;
  /** The reply was sent or set aside. */
  onClearReply?: () => void;
  /** Open a newly created web watch. */
  onOpenWatch?: (id: string) => void;
}

export function ChatDock({
  onSend,
  onVoice,
  onVoiceNote,
  voiceNoteRefusal = null,
  onAttach,
  busy,
  bottomInset = 0,
  research = 'hidden',
  conversation = null,
  initialDraft = '',
  onDraftChange,
  replyTo = null,
  onClearReply,
  onOpenWatch,
}: ChatDockProps) {
  const theme = useInkTheme();
  const field = inkText(theme, { size: 'md' });
  const { t } = useTranslation();
  const [draft, setDraftState] = useState(initialDraft);
  const setDraft = useCallback(
    (text: string) => {
      setDraftState(text);
      onDraftChange?.(text);
    },
    [onDraftChange],
  );
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [menu, setMenu] = useState(false);
  const [watchSheetOpen, setWatchSheetOpen] = useState(false);
  const [createdWatch, setCreatedWatch] = useState<WebWatch | null>(null);
  // The keyboard's height, 0 while it is down.
  const [keyboard, setKeyboard] = useState(0);
  const { width, height: screen } = useWindowDimensions();
  // A long draft stands as tall as it needs, as in a messages app, while the thread keeps a strip above
  // it. Edge-to-edge never shrinks the window for the keyboard, so its height is taken off here.
  const tallest = Math.max(132, Math.round((screen - keyboard) * 0.55));
  const mode = useResearchMode(conversation);
  const input = useRef<TextInput>(null);
  // The field's height follows its text both ways. Left to itself a multiline
  // field on iOS grows as lines are added and keeps that height once they are
  // gone, so the dock stood two lines tall after every long message.
  // A draft brought back on mount may get no content-size event on iOS, so its own lines are the first guess.
  const [lines, setLines] = useState(() =>
    initialDraft ? initialDraft.split('\n').length * (StyleSheet.flatten(field.style).lineHeight ?? 22) : 0,
  );
  // The light is drawn in the row, around the field, so it needs to know where the field is.
  const [fieldBox, setFieldBox] = useState<FieldBox | null>(null);
  const light = useAnsweringLight(Boolean(busy));
  const note = useAnsweringNote(Boolean(busy));
  const reduced = useReduceMotion();
  // The note's band under the row, eased open and shut so the thread above slides rather than jumps.
  const chin = useSharedValue(note.room);
  useEffect(() => {
    chin.set(reduced ? note.room : withTiming(note.room, { duration: 280, easing: Easing.out(Easing.cubic) }));
  }, [chin, note.room, reduced]);

  // With the keyboard up the indicator is under it, and padding for it would
  // leave a gap between the dock and the keys.
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => setKeyboard(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboard(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // A Pond that stops offering research, or a different Pond, ends the mode it no longer backs.
  const { clear: clearResearch } = mode;
  useEffect(() => {
    if (research !== 'available') clearResearch();
  }, [research, clearResearch]);

  // A reply to a picture carries the picture, so the model sees what is being asked about; it
  // leaves with the reply if the reply is set aside.
  const replyPicture = useRef<string | null>(null);
  useEffect(() => {
    if (!replyTo) return;
    input.current?.focus();
    if (replyTo.kind !== 'picture') return;
    let live = true;
    void pictureAttachment(replyTo.picture).then((picture) => {
      if (!live || !picture) return;
      replyPicture.current = picture.id;
      setAttachments((current) => [...current, picture].slice(0, MAX_ATTACHMENTS));
    });
    return () => {
      live = false;
      const id = replyPicture.current;
      replyPicture.current = null;
      if (id) setAttachments((current) => current.filter((a) => a.id !== id));
    };
  }, [replyTo]);

  const hasContent = draft.trim().length > 0 || attachments.length > 0;
  const voiceNote = useVoiceNote((note) => onVoiceNote?.(note));
  const recording = voiceNote.state !== 'idle';
  const [pastLine, setPastLine] = useState(false);
  const [refused, setRefused] = useState(false);

  const handleSend = useCallback(() => {
    if (!hasContent) return;
    void tap();
    const asResearch = mode.take();
    const text = replyTo ? withReply(replyHead(replyTo, t), replyQuote(replyTo), draft) : draft;
    onSend(text, attachments, asResearch ? { research: true, answer: mode.answer } : undefined);
    setDraft('');
    // Sent: the picture went with it, so clearing the reply must not take it out of anything.
    replyPicture.current = null;
    setAttachments([]);
    onClearReply?.();
  }, [attachments, draft, hasContent, mode, onClearReply, onSend, replyTo, setDraft, t]);

  const startResearch = useCallback(() => {
    if (!mode.start(attachments.length)) return;
    void selectionTick();
    input.current?.focus();
  }, [attachments.length, mode]);

  // The menu has already closed by the time it hands over a choice, so the
  // picker is presented from the screen rather than from the menu.
  const choose = useCallback(
    async (source: AttachSource) => {
      const picked = await onAttach(source, MAX_ATTACHMENTS - attachments.length);
      if (picked.length === 0) return;
      void selectionTick();
      setAttachments((current) => [...current, ...picked].slice(0, MAX_ATTACHMENTS));
    },
    [attachments.length, onAttach],
  );

  const remove = useCallback((id: string) => {
    setAttachments((current) => current.filter((a) => a.id !== id));
  }, []);

  const material = {
    backgroundColor: theme.color.chrome,
    borderColor: theme.color.lineStrong,
    borderWidth: theme.edge.hairlineWidth,
  };
  const hint = inkText(theme, { size: 'sm', color: theme.color.textSecondary });
  const replyWho = inkText(theme, { size: 'xs', weight: theme.weight.semibold, color: theme.color.accentLine });
  const placeholder = mode.on ? t('chat.research.placeholder') : busy ? t('chat.queuePlaceholder') : t('chat.placeholder');
  // Clear of the keyboard by a full step, not half of one. Vendor keyboards
  // (Samsung's among them) draw a toolbar row of their own inside the height
  // they report, so 8px put the composer visually against that row rather than
  // above it — the input read as part of the keyboard. The note gets a band of
  // its own on top, so it never sits on the home indicator or the keys, and the
  // band is there only while the note is, so an idle composer keeps no empty chin.
  const base = keyboard > 0 ? Spacing.lg : bottomInset + Spacing.xs;
  const foot = base + note.room;
  const padded = useAnimatedStyle(() => ({ paddingBottom: base + chin.get() }));

  return (
    <Animated.View pointerEvents="box-none" style={[styles.dock, padded]}>
      {mode.on ? (
        <View style={styles.research}>
          <InkChip icon="search" onRemove={mode.clear}>
            {t('chat.research.chip')}
          </InkChip>
          <InkEyebrow>{t('chat.research.answer.label')}</InkEyebrow>
          <InkSegmented
            label={t('chat.research.answer.label')}
            value={mode.answer}
            options={RESEARCH_ANSWERS.map((answer) => ({ value: answer, label: t(researchAnswerWords(answer).labelKey) }))}
            onChange={(answer) => {
              void selectionTick();
              mode.choose(answer);
            }}
          />
          <Text style={hint.style}>{t(researchAnswerWords(mode.answer).hintKey)}</Text>
        </View>
      ) : null}

      {createdWatch ? (
        <View
          style={[
            styles.replying,
            material,
            {
              borderLeftColor: theme.color.accentLine,
              borderLeftWidth: 3,
              borderRadius: theme.radius.md,
            },
          ]}
        >
          <GIcon name="eye" size={16} color={theme.color.accentLine} />
          <View style={styles.replyWords}>
            <Text style={replyWho.style} numberOfLines={1}>
              Watching: {createdWatch.title || createdWatch.lookingFor}
            </Text>
            {onOpenWatch ? (
              <Text
                onPress={() => {
                  const id = createdWatch.id;
                  setCreatedWatch(null);
                  onOpenWatch(id);
                }}
                accessibilityRole="link"
                style={[hint.style, { color: theme.color.accentLine, fontWeight: '600' }]}
              >
                View watch
              </Text>
            ) : null}
          </View>
          <GPressable
            onPress={() => setCreatedWatch(null)}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            hitSlop={12}
          >
            <GIcon name="x" size={16} color={theme.color.textSecondary} />
          </GPressable>
        </View>
      ) : null}

      {replyTo ? (
        <View
          style={[
            styles.replying,
            material,
            {
              width: Math.round(width * REPLY_CARD),
              borderLeftColor: theme.color.accentLine,
              borderLeftWidth: 3,
              borderRadius: theme.radius.md,
            },
          ]}
        >
          <View style={styles.replyWords}>
            <Text style={replyWho.style} numberOfLines={1}>
              {t(replyingKey(replyTo))}
            </Text>
            {replyQuote(replyTo) ? (
              <Text style={hint.style} numberOfLines={2}>
                {replyQuote(replyTo)}
              </Text>
            ) : null}
          </View>
          <GPressable
            onPress={() => {
              void selectionTick();
              onClearReply?.();
            }}
            accessibilityRole="button"
            accessibilityLabel={t('chat.replying.cancel')}
            hitSlop={12}
          >
            <GIcon name="x" size={16} color={theme.color.textSecondary} />
          </GPressable>
        </View>
      ) : null}

      {attachments.length > 0 ? (
        <View style={styles.strip}>
          {attachments.map((a) => (
            <View key={a.id} style={[styles.thumb, { borderRadius: theme.radius.md }, material]}>
              {a.kind === 'image' ? (
                <Image source={{ uri: a.uri }} style={styles.thumbImage} contentFit="cover" />
              ) : (
                <View style={styles.fileThumb}>
                  <GIcon name={a.kind === 'audio' ? 'music' : 'file'} size={20} color={theme.color.textSecondary} />
                </View>
              )}
              <GPressable feedback="none"
                onPress={() => remove(a.id)}
                accessibilityRole="button"
                accessibilityLabel={t('chat.composer.removeAttachment', { name: a.name })}
                hitSlop={8}
                style={[styles.unattach, { backgroundColor: theme.color.chrome }]}
              >
                <GIcon name="x" size={12} color={theme.color.text} />
              </GPressable>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.row}>
        {fieldBox ? <AnsweringLight light={light} field={fieldBox} radius={CONTROL / 2} /> : null}
        {/* Nothing can be attached mid-note, and the strip needs the room to say how to cancel. */}
        {recording ? null : <GPressable
          feedback="lift"
          onPress={() => {
            void selectionTick();
            // The menu hangs from this button, and the button drops back to
            // the foot of the screen once the keyboard is gone.
            Keyboard.dismiss();
            setMenu((open) => !open);
          }}
          disabled={attachments.length >= MAX_ATTACHMENTS}
          accessibilityRole="button"
          accessibilityLabel={t('chat.composer.attach')}
          accessibilityState={{
            expanded: menu,
            disabled: attachments.length >= MAX_ATTACHMENTS,
          }}
          style={[styles.control, material, glassLift(theme)]}
        >
          <GIcon name="plus" size={20} color={theme.color.text} />
        </GPressable>}

        <View
          style={[styles.field, material]}
          onLayout={(e) => setFieldBox(e.nativeEvent.layout)}
        >
          {recording ? (
            <View style={styles.inset}>
              <VoiceNoteStrip elapsedMs={voiceNote.elapsedMs} level={voiceNote.level} past={pastLine} />
            </View>
          ) : null}
          <TextInput
            ref={input}
            style={[
              field.style,
              styles.input,
              { height: fieldHeight(draft ? lines : 0, tallest) },
              hasContent && styles.besideSend,
              recording && styles.hidden,
            ]}
            value={draft}
            onChangeText={setDraft}
            onContentSizeChange={(e) => setLines(e.nativeEvent.contentSize.height)}
            placeholder={placeholder}
            placeholderTextColor={theme.color.textTertiary}
            multiline
            maxLength={4000}
            accessibilityLabel={placeholder}
          />
          {hasContent ? (
            <GPressable
              feedback="none"
              onPress={handleSend}
              accessibilityRole="button"
              accessibilityLabel={busy ? t('chat.queue') : t('chat.send')}
              hitSlop={hitSlop(SEND.height + PLATE)}
              style={styles.sendPlace}
            >
              {({ pressed }) => (
                <InkEdge
                  radius={theme.radius.pill}
                  edge={theme.edgeCompact}
                  state={pressed ? 'pressed' : 'rest'}
                  contentStyle={[styles.send, { backgroundColor: theme.color.accent }]}
                >
                  <GIcon name="arrow-up" size={18} color={theme.color.textOnAccent} />
                </InkEdge>
              )}
            </GPressable>
          ) : null}
        </View>

        {hasContent ? null : onVoiceNote ? (
          <VoiceNoteMic
            size={CONTROL}
            recording={recording}
            onTap={() => {
              void selectionTick();
              onVoice();
            }}
            onHold={() => {
              Keyboard.dismiss();
              setPastLine(false);
              if (voiceNoteRefusal) {
                setRefused(true);
                void reject();
                return;
              }
              setRefused(false);
              void voiceNote.begin();
            }}
            onRelease={voiceNote.release}
            onCancel={voiceNote.cancel}
            onPastLine={setPastLine}
          />
        ) : (
          <GPressable
            feedback="lift"
            onPress={() => {
              void selectionTick();
              onVoice();
            }}
            accessibilityRole="button"
            accessibilityLabel={t('chat.voice.open')}
            style={[styles.control, material, glassLift(theme)]}
          >
            <GIcon name="mic" size={20} color={theme.color.text} />
          </GPressable>
        )}
        {fieldBox ? <AnsweringWash light={light} field={fieldBox} radius={CONTROL / 2} /> : null}
        <AnsweringNote note={note} />
      </View>

      {refused && voiceNoteRefusal && !recording ? (
        <Text style={[hint.style, styles.noteError]}>
          {voiceNoteRefusal.words}
          {voiceNoteRefusal.action && voiceNoteRefusal.onPress ? (
            <>
              {' '}
              <Text
                onPress={voiceNoteRefusal.onPress}
                accessibilityRole="link"
                style={{ color: theme.color.accentLine, fontWeight: '600' }}
              >
                {voiceNoteRefusal.action}
              </Text>
            </>
          ) : null}
        </Text>
      ) : voiceNote.error && !recording ? (
        <Text style={[hint.style, styles.noteError]}>{voiceNote.error}</Text>
      ) : null}

      <AttachMenu
        open={menu}
        onClose={() => setMenu(false)}
        onChoose={choose}
        research={researchItem(research, attachments.length)}
        researching={mode.on}
        onResearch={startResearch}
        onWebWatch={() => setWatchSheetOpen(true)}
        anchorBottom={foot + CONTROL}
        anchorLeft={Spacing.lg}
      />
      <WebWatchGuidedSheet
        open={watchSheetOpen}
        onClose={() => setWatchSheetOpen(false)}
        onCreated={(watch) => setCreatedWatch(watch)}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dock: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
  },
  control: {
    width: CONTROL,
    height: CONTROL,
    borderRadius: CONTROL / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: {
    flex: 1,
    minHeight: CONTROL,
    borderRadius: CONTROL / 2,
    justifyContent: 'center',
  },
  hidden: { position: 'absolute', opacity: 0, height: 0 },
  noteError: { paddingLeft: CONTROL + Spacing.sm },
  // The field's own padding stays zero, so send's corner offsets mean the same on every Yoga.
  inset: { paddingHorizontal: Spacing.lg },
  input: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Platform.OS === 'ios' ? 12 : 8,
    paddingBottom: Platform.OS === 'ios' ? 12 : 8,
  },
  // Every line stops short of send, not only the last, so no line runs under it as the draft grows.
  besideSend: { paddingRight: SEND_INSET + SEND.width + PLATE + Spacing.sm },
  sendPlace: { position: 'absolute', right: SEND_INSET, bottom: SEND_INSET },
  send: {
    width: SEND.width,
    height: SEND.height,
    alignItems: 'center',
    justifyContent: 'center',
  },
  strip: { flexDirection: 'row', gap: Spacing.sm, paddingLeft: CONTROL + Spacing.sm },
  replying: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  replyWords: { flex: 1, gap: 2 },
  research: { alignItems: 'flex-start', gap: Spacing.sm, paddingLeft: CONTROL + Spacing.sm },
  thumb: { width: 60, height: 60, overflow: 'hidden' },
  thumbImage: { width: '100%', height: '100%' },
  fileThumb: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  unattach: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
