/**
 * ChatScreen — Claude-mobile-style AI conversation tab.
 *
 * Goose avatar header, message bubbles, typing indicator,
 * suggested prompts, input bar with mic and send.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GIcon } from '@/components/ui/g-icon';
import type { Message } from '@/models/chat';
import { useChat } from '@/view-models/use-chat';
import { Grey, JaridaPurple, AccentPurple, Brand, Semantic } from '@/constants/colors';

import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radii } from '@/constants/radii';

const SUGGESTED_PROMPTS = [
  'Turn off all lights',
  'What\u2019s the weather?',
  'Play some music',
  'Lock the front door',
];

/** Chat bubble component */
const ChatBubble = React.memo(function ChatBubble({ item }: { item: Message }) {
  const isUser = item.role === 'user';
  return (
    <View style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}>
      {!isUser && (
        <View style={styles.gooseAvatar}>
          <Text style={styles.gooseAvatarText}>G</Text>
        </View>
      )}
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant]}>
          {item.content}
        </Text>
      </View>
    </View>
  );
});

/** Typing dots indicator */
const TypingDots = React.memo(function TypingDots() {
  return (
    <View style={styles.bubbleRow}>
      <View style={styles.gooseAvatar}>
        <Text style={styles.gooseAvatarText}>G</Text>
      </View>
      <View style={[styles.bubble, styles.bubbleAssistant]}>
        <View style={styles.dotsRow}>
          <View style={styles.dot} />
          <View style={[styles.dot, styles.dotMid]} />
          <View style={styles.dot} />
        </View>
      </View>
    </View>
  );
});

export default function ChatScreen() {
  const { data, actions } = useChat();
  const { messages, streaming: isTyping } = data;
  const [draft, setDraft] = useState('');
  const flatListRef = useRef<FlatList<Message>>(null);

  const handleSend = useCallback(() => {
    if (!draft.trim()) return;
    actions.send(draft);
    setDraft('');
  }, [draft, actions]);

  const handleSuggestedPrompt = useCallback((prompt: string) => {
    setDraft(prompt);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Message }) => <ChatBubble item={item} />,
    [],
  );
  const keyExtractor = useCallback((item: Message) => item.id, []);
  const reversedMessages = [...messages].reverse();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerAvatar}>
              <Text style={styles.headerAvatarText}>G</Text>
            </View>
            <View>
              <Text style={styles.headerName}>Goose</Text>
              <View style={styles.headerMeta}>
                <View style={styles.modelBadge}>
                  <Text style={styles.modelBadgeText}>Goose 2</Text>
                </View>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>Connected</Text>
              </View>
            </View>
          </View>
          <Pressable style={styles.newChatBtn} onPress={actions.newConversation}>
            <GIcon name="plus" size={18} color={Grey[600]} />
          </Pressable>
        </View>

        {/* Message list */}
        <FlatList
          ref={flatListRef}
          data={reversedMessages}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          inverted
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={isTyping ? <TypingDots /> : null}
        />

        {/* Suggested prompts */}
        <View style={styles.suggestedRow}>
          {SUGGESTED_PROMPTS.map((p) => (
            <Pressable
              key={p}
              style={styles.suggestedChip}
              onPress={() => handleSuggestedPrompt(p)}
            >
              <Text style={styles.suggestedText}>{p}</Text>
            </Pressable>
          ))}
        </View>

        {/* Input bar */}
        <View style={styles.inputBar}>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Message Goose..."
              placeholderTextColor={Grey[400]}
              multiline
              maxLength={4000}
            />
            <Pressable style={styles.micBtn}>
              <GIcon name="voice" size={18} color={AccentPurple} />
            </Pressable>
          </View>
          <Pressable
            style={[styles.sendBtn, draft.trim() ? styles.sendBtnActive : styles.sendBtnInactive]}
            onPress={handleSend}
            disabled={!draft.trim()}
          >
            <GIcon name="send" size={16} color={draft.trim() ? Brand.white : Grey[400]} />
          </Pressable>
        </View>

        {/* Powered by footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Powered by Goose 2</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Grey[50] },
  flex: { flex: 1 },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Brand.white,
    borderBottomWidth: 1,
    borderBottomColor: Grey[200],
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: AccentPurple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Brand.white,
  },
  headerName: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Brand.charcoal,
  },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  modelBadge: {
    backgroundColor: JaridaPurple[50],
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radii.sm,
  },
  modelBadgeText: {
    fontFamily: FontFamily.body,
    fontSize: 10,
    fontWeight: FontWeight.semibold,
    color: JaridaPurple[600],
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Semantic.success,
  },
  statusText: {
    fontFamily: FontFamily.body,
    fontSize: 10,
    color: Grey[500],
  },
  newChatBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Grey[200],
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* List */
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    paddingBottom: Spacing.sm,
  },

  /* Bubbles */
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: Spacing.md,
  },
  bubbleRowUser: { justifyContent: 'flex-end' },
  gooseAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: AccentPurple,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  gooseAvatarText: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Brand.white,
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.lg,
  },
  bubbleUser: {
    backgroundColor: AccentPurple,
    borderBottomRightRadius: Radii.xs,
  },
  bubbleAssistant: {
    backgroundColor: Brand.white,
    borderWidth: 1,
    borderColor: Grey[200],
    borderBottomLeftRadius: Radii.xs,
  },
  bubbleText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    lineHeight: FontSize.base * 1.5,
  },
  bubbleTextUser: { color: Brand.white },
  bubbleTextAssistant: { color: Brand.charcoal },

  /* Typing dots */
  dotsRow: { flexDirection: 'row', gap: 4, paddingVertical: 4 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Grey[400],
    opacity: 0.6,
  },
  dotMid: { opacity: 0.9 },

  /* Suggested prompts */
  suggestedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  suggestedChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: Grey[200],
    backgroundColor: Brand.white,
  },
  suggestedText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Grey[700],
  },

  /* Input bar */
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    backgroundColor: Brand.white,
    borderTopWidth: 1,
    borderTopColor: Grey[200],
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: Grey[100],
    borderRadius: Radii.xl,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  input: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: Brand.charcoal,
    maxHeight: 100,
    paddingVertical: 4,
  },
  micBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnActive: { backgroundColor: AccentPurple },
  sendBtnInactive: { backgroundColor: Grey[200] },

  /* Footer */
  footer: {
    alignItems: 'center',
    paddingBottom: 96,
    paddingTop: 4,
    backgroundColor: Brand.white,
  },
  footerText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Grey[400],
  },
});
