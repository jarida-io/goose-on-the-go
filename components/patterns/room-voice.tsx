/**
 * In this room: what the Pond's own microphone and speaker are doing, who it last heard, and a way
 * to stop it talking. The Voice agent page shows it live, from the room's event stream; Home shows a
 * card from the status alone, and only where the Pond can listen in the room at all.
 *
 * Who was heard is said by name only when Voice Match knew them; anyone else is "someone", because
 * the room never guesses a name.
 */

import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { InkButton, InkCard, InkText, InkTitle } from '@/components/ui/ink';

import { Spacing } from '@/constants/spacing';
import { formatScheduleTime } from '@/models/schedule';
import { canInterrupt, interruptedWords, roomStateWords, unavailableWords } from '@/models/voice-room';
import { tap } from '@/services/haptics';
import { dismissSnackbar, showSnackbar } from '@/services/snackbar';
import type { VoiceRoom } from '@/services/types';
import { useVoiceRoom, type UseVoiceRoom } from '@/view-models/use-voice-room';

function lastHeard(room: VoiceRoom | null, t: TFunction): string {
  if (!room?.last_heard) return t('voiceRoom.lastHeardNobody');
  const when = formatScheduleTime(room.last_heard.at);
  return t('voiceRoom.lastHeard', { name: room.last_heard.name, when });
}

/** The live panel: state, what was heard and said, and Stop talking while there is something to stop. */
export function RoomVoicePanel({ voice }: { voice: UseVoiceRoom }) {
  const { t } = useTranslation();
  const { room, live, missing, streaming } = voice;

  if (missing) {
    return (
      <InkCard raised={false} contentStyle={styles.card}>
        <InkTitle level={3}>{t('voiceRoom.title')}</InkTitle>
        <InkText tone="secondary">{t('voiceRoom.missing')}</InkText>
      </InkCard>
    );
  }
  if (!room) return null;
  if (!room.available) {
    return (
      <InkCard raised={false} contentStyle={styles.card}>
        <InkTitle level={3}>{t('voiceRoom.title')}</InkTitle>
        <InkText>{unavailableWords(room.unavailable_reason)}</InkText>
      </InkCard>
    );
  }

  const stoppable = canInterrupt(live.state);
  const wokeBy = live.woke === undefined ? null : live.woke ? live.woke.name : t('voiceRoom.someone');
  return (
    // Flat: the one control that asks something here is Stop talking, and it is a button.
    <InkCard raised={false} contentStyle={styles.card}>
      <View style={styles.head}>
        <InkTitle level={3}>{t('voiceRoom.title')}</InkTitle>
        <InkText size="sm" tone="secondary">
          {streaming ? t('voiceRoom.live') : t('voiceRoom.notLive')}
        </InkText>
      </View>
      <View accessibilityLiveRegion="polite" style={styles.lines}>
        <InkText weight="semibold">{roomStateWords(live.state)}</InkText>
        {wokeBy && live.state !== 'wait' && live.state !== 'off' && live.state !== 'paused' ? (
          <InkText size="sm" tone="secondary">
            {t('voiceRoom.wokeBy', { name: wokeBy })}
          </InkText>
        ) : null}
        {live.heard ? <InkText size="sm">{t('voiceRoom.heard', { text: live.heard })}</InkText> : null}
        {live.reply ? (
          <InkText size="sm" tone="secondary" numberOfLines={3}>
            {live.reply}
          </InkText>
        ) : null}
        {live.interrupted ? (
          <InkText size="sm" tone="secondary">
            {interruptedWords(live.interrupted)}
          </InkText>
        ) : null}
        {live.error ? (
          <InkText size="sm" tone="secondary">
            {t('voiceRoom.turnError')}
          </InkText>
        ) : null}
        <InkText size="sm" tone="secondary">
          {lastHeard(room, t)}
        </InkText>
      </View>
      {stoppable ? (
        <View style={styles.actions}>
          <InkButton
            variant="primary"
            icon="stop"
            disabled={voice.interrupting}
            onPress={() => {
              void tap();
              void voice.actions.interrupt();
            }}
          >
            {t('voiceRoom.interrupt')}
          </InkButton>
        </View>
      ) : null}
    </InkCard>
  );
}

/** Shows a snackbar while the room voice is speaking so Home stays clean when idle. */
export function RoomVoiceHome() {
  const { t } = useTranslation();
  const voice = useVoiceRoom();
  const { room, live, actions } = voice;
  const speaking = Boolean(room && !voice.missing && room.available && live.state === 'speak');
  const snackbarIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (speaking) {
      snackbarIdRef.current = showSnackbar({
        message: roomStateWords('speak'),
        action: {
          label: t('voiceRoom.interrupt'),
          onPress: () => {
            void tap();
            void actions.interrupt();
          },
        },
      });
    } else if (snackbarIdRef.current !== null) {
      dismissSnackbar(snackbarIdRef.current);
      snackbarIdRef.current = null;
    }

    return () => {
      if (snackbarIdRef.current !== null) {
        dismissSnackbar(snackbarIdRef.current);
        snackbarIdRef.current = null;
      }
    };
  }, [actions, speaking, t]);

  return null;
}

const styles = StyleSheet.create({
  card: { gap: Spacing.sm },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: Spacing.sm, flexWrap: 'wrap' },
  lines: { gap: Spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.xs },
});
