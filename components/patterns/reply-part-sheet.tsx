/**
 * Answering part of a message: its words laid out to select from, the way a text is selected
 * anywhere on the phone, then a reply to just that part or to all of it. A field shows the words
 * because a field reports what is selected, which plain text does not; it never opens a keyboard
 * and never changes the words.
 */

import React, { useEffect, useState } from 'react';
import { Keyboard, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { InkButton, InkSheet, inkText, useInkTheme } from '@/components/ui/ink';

export function ReplyPartSheet({
  text,
  onClose,
  onReply,
  title,
  hint: hintText,
  selectionLabel,
  allLabel,
}: {
  /** The message's words; the sheet is open while there are some. */
  text: string | null;
  onClose: () => void;
  onReply: (words: string, part: boolean) => void;
  title?: string;
  hint?: string;
  selectionLabel?: string;
  allLabel?: string;
}) {
  const theme = useInkTheme();
  const { t } = useTranslation();
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [shownFor, setShownFor] = useState(text);
  if (shownFor !== text) {
    setShownFor(text);
    setSelection({ start: 0, end: 0 });
  }
  // The words are chosen with a finger, so the composer's keyboard goes while they are.
  useEffect(() => {
    if (text !== null) Keyboard.dismiss();
  }, [text]);
  const words = text ?? '';
  const chosen = words.slice(selection.start, selection.end).trim();
  const body = inkText(theme, { size: 'md' });
  const hint = inkText(theme, { size: 'sm', color: theme.color.textSecondary });
  const answer = (part: boolean) => {
    onReply(part ? chosen : words, part);
    onClose();
  };
  return (
    <InkSheet open={text !== null} onClose={onClose} title={title ?? t('chat.replyPart.title')}>
      <Text style={hint.style}>{hintText ?? t('chat.replyPart.hint')}</Text>
      <TextInput
        value={words}
        multiline
        scrollEnabled={false}
        // iOS selects in a field that cannot be edited; Android needs it editable, with no keyboard.
        editable={Platform.OS === 'android'}
        showSoftInputOnFocus={false}
        onChangeText={() => {}}
        onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
        accessibilityLabel={hintText ?? t('chat.replyPart.hint')}
        style={[
          body.style,
          styles.words,
          { backgroundColor: theme.color.neutralSoft, borderRadius: theme.radius.md, color: theme.color.text },
        ]}
      />
      <View style={styles.actions}>
        <InkButton disabled={chosen === ''} onPress={() => answer(true)}>
          {selectionLabel ?? t('chat.replyPart.selection')}
        </InkButton>
        <InkButton variant="quiet" onPress={() => answer(false)}>
          {allLabel ?? t('chat.replyPart.all')}
        </InkButton>
      </View>
    </InkSheet>
  );
}

const styles = StyleSheet.create({
  words: { padding: 12, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 16 },
});
