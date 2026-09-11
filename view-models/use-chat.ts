/**
 * Chat ViewModel
 * Manages chat messages, drafting, and mock streaming.
 */

import { useState, useCallback, useRef } from 'react';
import type { Message } from '@/models/chat';
import { useServer } from '@/providers/server-provider';

export function useChat() {
  const { isScreenReal } = useServer();
  const [messages, setMessages] = useState<Message[]>([
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
  ]);
  const [streaming, setStreaming] = useState(false);
  const [sessionId] = useState<string | null>('session-1');
  const nextId = useRef(4);

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

    if (isScreenReal('chat')) {
      // Real chat streaming (POST /chat/stream, SSE) lands with issue #9.
      // The toggle is wired ahead of that so it's a config flip, not a rewrite.
      setTimeout(() => {
        const reply: Message = {
          id: String(nextId.current++),
          role: 'assistant',
          content: 'Real backend mode is on, but chat streaming isn’t wired up yet (see issue #9). Flip back to mock in Developer settings.',
          timestamp: Date.now(),
        };
        setMessages((m) => [...m, reply]);
        setStreaming(false);
      }, 300);
      return;
    }

    // Mock response
    setTimeout(() => {
      const reply: Message = {
        id: String(nextId.current++),
        role: 'assistant',
        content: `Working on it. (${text.length} characters received — this is a mock response.)`,
        timestamp: Date.now(),
      };
      setMessages((m) => [...m, reply]);
      setStreaming(false);
    }, 700);
  }, [isScreenReal]);

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
