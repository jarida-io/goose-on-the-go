/**
 * An idea card, the same wherever it appears (pond docs/architecture/idea-cards.md, section 5):
 * collapsed it says what kind it is, the idea, why it is for this member and where that came from,
 * and the when, where, cost or effort it has; opened, Goose's notes and the sources.
 */

import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { InkButton, InkCard, InkEyebrow, InkSheet, InkSpinner, InkText, InkTextArea, inkText, useInkTheme } from '@/components/ui/ink';

import { GIcon } from '@/components/ui/g-icon';
import { GPressable } from '@/components/ui/g-pressable';
import { Spacing } from '@/constants/spacing';
import type { RejectReason } from '@/models/anchors';
import { factLine, ideaKindKey, makingWords, sourceKindKey, type IdeaCard } from '@/models/idea-cards';
import { selectionTick } from '@/services/haptics';
import type { Question } from '@/models/questions';
import type { UseIdeaCards } from '@/view-models/use-idea-cards';
import { EMPTY_DRAFT, pick, type AnswerDraft } from '@/view-models/use-questions';
import { ReasonChips, toggleReason } from './engine-parts';
import { RoundButton, useAgo } from './hub-parts';
import { Labelled } from './labelled';
import { QuestionPage } from './question-card';

type Theme = ReturnType<typeof useInkTheme>;

export interface IdeaCardViewProps {
  card: IdeaCard;
  busy: 'do' | 'deeper' | 'save' | 'dismiss' | null;
  onDo: () => void;
  /** An ask card's chosen options, sent to chat as the member's message. */
  onAnswer?: (labels: string[]) => void;
  /** An ask card's "Other": the member answers in the composer. */
  onAskOther?: () => void;
  onDeeper: () => void;
  onSave: () => void;
  onNotThis: () => void;
  onOpen: () => void;
}

export function IdeaCardView({ card, busy, onDo, onAnswer, onAskOther, onDeeper, onSave, onNotThis, onOpen }: IdeaCardViewProps) {
  const theme = useInkTheme();
  const styles = makeStyles(theme);
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);
  const action = card.action;
  const question = action?.question ?? null;
  // A go-deeper action is the Go deeper button itself, so the card offers it once.
  const doable = action !== null && action.kind !== 'go_deeper';
  const facts = [
    { key: 'when', icon: 'calendar' as const, words: factLine([card.when, card.where]) },
    { key: 'cost', icon: 'wallet' as const, words: factLine([card.cost, card.effort]) },
  ].filter((f) => f.words);
  const source = card.why.source.label ? `${t(sourceKindKey(card.why.source.kind))}: ${card.why.source.label}` : t(sourceKindKey(card.why.source.kind));
  return (
    <InkCard raised>
      <View style={styles.card}>
        <GPressable style={styles.words} accessibilityRole="button" accessibilityLabel={t('goose.ideaCards.openLabel', { title: card.title })} onPress={onOpen}>
          <View style={styles.eyebrowRow}>
            <Text style={styles.eyebrow} numberOfLines={1}>
              {t(ideaKindKey(card.kind))}
            </Text>
            {card.state === 'saved' ? <GIcon name="archive" size={12} color={theme.color.accentLine} strokeWidth={2.5} /> : null}
          </View>
          <Text style={styles.title}>{card.title}</Text>
          <Text style={styles.why}>{card.why.text}</Text>
          <Text style={styles.source} numberOfLines={1}>
            {source}
          </Text>
          {facts.map((f) => (
            <View key={f.key} style={styles.fact}>
              <GIcon name={f.icon} size={14} color={theme.color.textSecondary} strokeWidth={2.25} />
              <Text style={styles.factText}>{f.words}</Text>
            </View>
          ))}
        </GPressable>
        {asking && question ? (
          <AskQuestion
            question={{ ...question, id: card.id }}
            busy={busy === 'do'}
            onAnswer={(labels) => onAnswer?.(labels)}
            onOther={() => onAskOther?.()}
          />
        ) : null}
        <View style={styles.buttons}>
          {action && doable && !(asking && question) ? (
            <InkButton variant="primary" size="sm" loading={busy === 'do'} disabled={busy !== null} onPress={question ? () => setAsking(true) : onDo}>
              {action.label || t('goose.ideaCards.doIt')}
            </InkButton>
          ) : null}
          <InkButton variant={doable ? 'quiet' : 'primary'} size="sm" loading={busy === 'deeper'} disabled={busy !== null} onPress={onDeeper}>
            {t('goose.ideaCards.goDeeper')}
          </InkButton>
          <InkButton variant="quiet" size="sm" loading={busy === 'save'} disabled={busy !== null} onPress={onSave}>
            {card.state === 'saved' ? t('goose.ideaCards.saved') : t('goose.ideaCards.save')}
          </InkButton>
          <InkButton variant="quiet" size="sm" disabled={busy !== null} onPress={onNotThis}>
            {t('goose.ideaCards.notThis')}
          </InkButton>
        </View>
      </View>
    </InkCard>
  );
}

/** An ask card's question, inline: one choice sends at once, several wait for Send. */
function AskQuestion({ question, busy, onAnswer, onOther }: { question: Question; busy: boolean; onAnswer: (labels: string[]) => void; onOther: () => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<AnswerDraft>(EMPTY_DRAFT);
  return (
    <View style={askStyles.ask}>
      <QuestionPage
        question={question}
        draft={draft}
        onChoose={(_, option) => {
          const next = pick(question, draft, option);
          setDraft(next);
          if (!question.multi) onAnswer(next.choices);
        }}
        onOther={onOther}
        onOtherText={() => undefined}
        onOtherPress={onOther}
      />
      {question.multi ? (
        <InkButton variant="primary" size="sm" style={askStyles.send} loading={busy} disabled={busy || draft.choices.length === 0} onPress={() => onAnswer(draft.choices)}>
          {t('goose.questions.send')}
        </InkButton>
      ) : null}
    </View>
  );
}

const askStyles = StyleSheet.create({
  ask: { gap: Spacing.sm },
  send: { alignSelf: 'flex-end' },
});

/** The card opened: what Goose found, would do next and is unsure of, and the pages behind it. */
export function IdeaCardSheet({ card, onClose }: { card: IdeaCard | null; onClose: () => void }) {
  const theme = useInkTheme();
  const styles = makeStyles(theme);
  const { t } = useTranslation();
  const notes = card
    ? [
        { key: 'found', label: t('goose.ideaCards.found'), body: card.notes.found },
        { key: 'next', label: t('goose.ideaCards.next'), body: card.notes.next },
        { key: 'caveats', label: t('goose.ideaCards.caveats'), body: card.notes.caveats },
      ].filter((n) => n.body)
    : [];
  return (
    <InkSheet open={card !== null} onClose={onClose} title={card?.title ?? ''} description={card?.why.text} scroll>
      {card ? (
        <View style={styles.sheet}>
          {card.anchor?.title ? (
            <InkText size="sm" tone="secondary">
              {t('goose.ideaCards.inPlan', { title: card.anchor.title })}
            </InkText>
          ) : null}
          {notes.map((n) => (
            <View key={n.key} style={styles.block}>
              <InkEyebrow>{n.label}</InkEyebrow>
              <InkText>{n.body}</InkText>
            </View>
          ))}
          <View style={styles.block}>
            <InkEyebrow>{t('goose.ideaCards.sources')}</InkEyebrow>
            {card.sources.map((s, i) =>
              s.url ? (
                <GPressable
                  key={`${s.url}-${i}`}
                  style={styles.sourceRow}
                  accessibilityRole="link"
                  accessibilityLabel={t('goose.ideaCards.sourceLabel', { title: s.title })}
                  onPress={() => {
                    void selectionTick();
                    void WebBrowser.openBrowserAsync(s.url!);
                  }}
                >
                  <Text style={styles.link}>{s.title}</Text>
                  <GIcon name="external" size={14} color={theme.color.accentLine} strokeWidth={2.25} />
                </GPressable>
              ) : (
                <View key={`${s.title}-${i}`} style={styles.sourceRow}>
                  <Text style={styles.factText}>{s.title}</Text>
                  <Text style={styles.source}>{t(sourceKindKey(s.kind))}</Text>
                </View>
              ),
            )}
          </View>
        </View>
      ) : null}
    </InkSheet>
  );
}

/** "Not this": the reason chips used everywhere, and the member's own words. */
export function DismissCardSheet({ card, onClose, onDismiss }: { card: IdeaCard | null; onClose: () => void; onDismiss: (card: IdeaCard, reasons: RejectReason[], words: string) => Promise<boolean> }) {
  const theme = useInkTheme();
  const styles = makeStyles(theme);
  const { t } = useTranslation();
  const [reasons, setReasons] = useState<RejectReason[]>([]);
  const [words, setWords] = useState('');
  const close = () => {
    setReasons([]);
    setWords('');
    onClose();
  };
  return (
    <InkSheet open={card !== null} onClose={close} title={t('goose.ideaCards.dismissTitle')} description={t('goose.ideaCards.dismissBody')} scroll>
      <View style={styles.sheet}>
        <View style={styles.block}>
          <InkEyebrow>{t('goose.reasons.title')}</InkEyebrow>
          <ReasonChips selected={reasons} onToggle={(r) => setReasons((all) => toggleReason(all, r))} />
        </View>
        <Labelled label={t('goose.reasons.words')}>
          <InkTextArea label={t('goose.reasons.words')} value={words} onChange={setWords} placeholder={t('goose.reasons.wordsPlaceholder')} rows={2} maxRows={4} />
        </Labelled>
        <InkButton
          variant="primary"
          block
          onPress={() => {
            if (!card) return;
            const chosen = reasons;
            const said = words;
            close();
            void onDismiss(card, chosen, said);
          }}
        >
          {t('goose.ideaCards.dismissConfirm')}
        </InkButton>
      </View>
    </InkSheet>
  );
}

/**
 * The set with its header: how fresh it is or that Goose is making one, and refresh. `cards` picks
 * which of the set to draw; `limit` keeps a glance short and offers the rest.
 */
export function IdeaCardSetView({ vm, cards, limit, onSeeAll }: { vm: UseIdeaCards; cards?: IdeaCard[]; limit?: number; onSeeAll?: () => void }) {
  const theme = useInkTheme();
  const styles = makeStyles(theme);
  const { t } = useTranslation();
  const ago = useAgo();
  const [opened, setOpened] = useState<IdeaCard | null>(null);
  const [dismissing, setDismissing] = useState<IdeaCard | null>(null);
  const all = cards ?? vm.cards;
  const shown = limit ? all.slice(0, limit) : all;
  const hidden = all.length - shown.length;
  const waiting = makingWords(vm.data.set);
  const making = t(waiting.key, { count: waiting.count });
  const meta = vm.making ? making : ago(vm.data.set.madeAt);
  return (
    <View style={styles.set}>
      <View style={styles.header}>
        <GIcon name="light" size={14} color={theme.color.accentLine} strokeWidth={2.5} />
        <Text style={styles.headerTitle} numberOfLines={1}>
          {t('goose.ideaCards.title')}
        </Text>
        {meta ? (
          <Text style={styles.headerMeta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        <View style={styles.spacer} />
        <RoundButton icon="refresh" size={32} label={t('goose.ideaCards.refreshLabel')} onPress={() => void (vm.making || vm.refreshing ? undefined : vm.actions.refresh())} />
      </View>
      {vm.loading && all.length === 0 ? <InkSpinner label={t('goose.ideaCards.loading')} /> : null}
      {!vm.loading && all.length === 0 ? (
        vm.making ? (
          <InkSpinner label={making} />
        ) : (
          <InkText size="sm" tone="secondary">
            {t('goose.ideaCards.empty')}
          </InkText>
        )
      ) : null}
      {shown.map((card) => (
        <IdeaCardView
          key={card.id}
          card={card}
          busy={vm.busy?.id === card.id ? vm.busy.what : null}
          onDo={() => void vm.actions.doIt(card)}
          onAnswer={(labels) => void vm.actions.answerAsk(card, labels)}
          onAskOther={vm.actions.askOther}
          onDeeper={() => void vm.actions.deeper(card)}
          onSave={() => void vm.actions.toggleSave(card)}
          onNotThis={() => setDismissing(card)}
          onOpen={() => {
            void selectionTick();
            setOpened(card);
          }}
        />
      ))}
      {hidden > 0 && onSeeAll ? (
        <GPressable style={styles.more} hitSlop={8} accessibilityRole="link" onPress={onSeeAll}>
          <Text style={styles.link}>{t('goose.ideaCards.more', { count: hidden })}</Text>
          <GIcon name="chevron-right" size={14} color={theme.color.accentLine} strokeWidth={2.5} />
        </GPressable>
      ) : null}
      <IdeaCardSheet card={opened} onClose={() => setOpened(null)} />
      <DismissCardSheet card={dismissing} onClose={() => setDismissing(null)} onDismiss={vm.actions.dismiss} />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    set: { gap: theme.space[3] },
    header: { flexDirection: 'row', alignItems: 'center', gap: theme.space[2] },
    headerTitle: inkText(theme, { size: 'sm', weight: theme.weight.semibold, color: theme.color.accentLine }).style,
    headerMeta: inkText(theme, { size: 'xs', color: theme.color.textTertiary }).style,
    spacer: { flex: 1 },
    card: { gap: theme.space[3] },
    words: { gap: 4 },
    eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space[1] },
    eyebrow: inkText(theme, { size: 'xs', weight: theme.weight.semibold, color: theme.color.accentLine }).style,
    title: inkText(theme, { size: 'md', weight: theme.weight.semibold }).style,
    why: inkText(theme, { size: 'sm', color: theme.color.textSecondary }).style,
    source: inkText(theme, { size: 'xs', color: theme.color.textTertiary }).style,
    fact: { flexDirection: 'row', alignItems: 'center', gap: theme.space[2], marginTop: 2 },
    factText: { flex: 1, ...inkText(theme, { size: 'sm' }).style },
    buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] },
    sheet: { gap: Spacing.lg, paddingBottom: Spacing.lg },
    block: { gap: Spacing.sm },
    sourceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xs },
    link: inkText(theme, { size: 'sm', weight: theme.weight.semibold, color: theme.color.accentLine }).style,
    more: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', gap: 2 },
  });
