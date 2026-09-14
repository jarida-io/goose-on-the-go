/**
 * Chat ViewModel
 * Manages chat messages, drafting, and mock streaming.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Message } from '@/models/chat';
import { useServer } from '@/providers/server-provider';

const SEED_MESSAGES: Message[] = [
  {
    id: '1',
    role: 'assistant',
    content: 'Good morning! I\'ve started your morning routine — lights are warming up, thermostat set to 72°F, and your coffee maker is brewing.',
    timestamp: Date.now() - 300000,
  },
  {
    id: '2',
    role: 'user',
    content: 'Thanks! Can you also check if there are any packages arriving today?',
    timestamp: Date.now() - 240000,
  },
  {
    id: '3',
    role: 'assistant',
    content: 'You have 2 packages expected today:\n\n1. Amazon — arriving by 2 PM\n2. Glovo grocery order — arriving by 4 PM\n\nWant me to send a notification when they\'re nearby?',
    timestamp: Date.now() - 180000,
  },
];

export function useChat() {
  const { screenModes } = useServer();
  const [messages, setMessages] = useState<Message[]>(() => SEED_MESSAGES);
  const [streaming, setStreaming] = useState(false);
  const [sessionId] = useState<string | null>('session-1');
  const nextId = useRef(4);

  // Read fresh at delivery time (not send time) so a reply always reflects
  // whatever the toggle is when it actually lands, not when it was sent.
  const screenModesRef = useRef(screenModes);
  useEffect(() => {
    screenModesRef.current = screenModes;
  }, [screenModes]);

  const pendingTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  useEffect(() => {
    const pending = pendingTimeoutsRef.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const send = useCallback((text: string) => {
    if (!text.trim()) return;
    const userMsg: Message = {
      id: String(nextId.current++),
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    };
    setMessages((m) => [...m, userMsg]);
    setStreaming(true);

    const timeoutId = setTimeout(() => {
      pendingTimeoutsRef.current.delete(timeoutId);

      const reply: Message = screenModesRef.current.chat
        ? {
            id: String(nextId.current++),
            role: 'assistant',
            // Real chat streaming (POST /chat/stream, SSE) lands with issue #9.
            // The toggle is wired ahead of that so it's a config flip, not a rewrite.
            content: 'Real backend mode is on, but chat streaming isn’t wired up yet (see issue #9). Flip back to mock in Developer settings.',
            timestamp: Date.now(),
          }
        : {
            id: String(nextId.current++),
            role: 'assistant',
            content: `Working on it. (${text.length} characters received — this is a mock response.)`,
            timestamp: Date.now(),
          };
      setMessages((m) => [...m, reply]);
      setStreaming(false);
    }, 700);
    pendingTimeoutsRef.current.add(timeoutId);
  }, []);

  const newConversation = useCallback(() => {
    setMessages([]);
    nextId.current = 1;
  }, []);

  return {
    data: { messages, sessionId, streaming },
    loading: false,
    error: null as string | null,
    actions: { send, newConversation },
  };
}
