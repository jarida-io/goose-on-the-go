/**
 * ChatComposer — message input + send button for chat screens.
 */

import React, { useState } from 'react';
import { View, TextInput, Pressable, Text, StyleSheet } from 'react-native';
import { GIcon } from '@/components/ui/g-icon';
import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { AccentPurple, Grey } from '@/constants/colors';

import { Radii } from '@/constants/radii';
import { Spacing } from '@/constants/spacing';

interface ChatComposerProps {
  onSend: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function ChatComposer({ onSend, placeholder = 'Message Pond\u2026', disabled }: ChatComposerProps) {
  const [draft, setDraft] = useState('');

  const handleSend = () => {
    if (!draft.trim() || disabled) return;
    onSend(draft);
    setDraft('');
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={Grey[400]}
          value={draft}
          onChangeText={setDraft}
          multiline
          maxLength={4000}
          returnKeyType="send"
          blurOnSubmit={false}
        />
        <Pressable
          style={[styles.sendBtn, (!draft.trim() || disabled) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!draft.trim() || disabled}
        >
          <GIcon name="send" size={14} color="#fff" />
        </Pressable>
      </View>
      <Text style={styles.hint}>Return to send</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderTopColor: Grey[200],
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: '#1C1C1C',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Grey[300],
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    maxHeight: 120,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: Radii.md,
    backgroundColor: AccentPurple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  hint: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: Grey[500],
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
});
