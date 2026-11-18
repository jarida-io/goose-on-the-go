// Goose's questions where its `giap-questions__ask` call sits in a reply: answerable while the turn
// waits on them, and the answers in their place once sent. Flat on a hairline like the other tool cards.

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { InkButton, InkEdge, InkText, useInkTheme } from '@/components/ui/ink';

import { AnswerLines, QuestionPager } from '@/components/goose/question-card';
import type { ToolCall } from '@/models/chat';
import { useAskCard } from '@/view-models/use-ask-card';

export const AskCard = React.memo(function AskCard({ call, sessionId }: { call: ToolCall; sessionId: string | null }) {
  const theme = useInkTheme();
  const { t } = useTranslation();
  const card = useAskCard(call, sessionId);
  const { view } = card;
  if (view.kind === 'none') return null;
  return (
    <InkEdge raised={false} budgeted={false} radius={theme.radius.lg} contentStyle={styles.card}>
      {view.kind === 'answers' ? <AnswerLines lines={view.lines} /> : null}
      {view.kind === 'ended' ? (
        <InkText size="sm" tone="secondary">
          {t('goose.questions.enoughSaid')}
        </InkText>
      ) : null}
      {view.kind === 'card' ? (
        <View style={styles.body}>
          <QuestionPager
            questions={view.questions}
            draftOf={card.draftOf}
            onChoose={card.actions.choose}
            onOther={card.actions.chooseOther}
            onOtherText={card.actions.setOtherText}
            onSubmit={() => void card.actions.submit()}
            onEnough={() => void card.actions.enough()}
            busy={card.busy}
            canSend={card.canSend}
            ready={view.ready}
          />
          {view.lost ? (
            <View style={styles.lost}>
              <InkText size="sm" tone="secondary" style={styles.fill}>
                {t('goose.questions.lost')}
              </InkText>
              <InkButton variant="quiet" size="sm" icon="refresh" onPress={card.actions.retry}>
                {t('goose.errors.tryAgain')}
              </InkButton>
            </View>
          ) : null}
        </View>
      ) : null}
    </InkEdge>
  );
});

const styles = StyleSheet.create({
  card: { padding: 14 },
  body: { gap: 8 },
  lost: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fill: { flex: 1 },
});
