/**
 * Home's lead, from the idea engine: what Goose finished and the member has not read, the plans it
 * offered and waits on a yes for, and its questions, answered in place. Each is a board widget and
 * draws only what it says; the board draws the frame. A widget with nothing in it is not on the board.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { InkText, inkText, useInkTheme } from '@/components/ui/ink';

import { CandidateBlock, QuestionBatchBlock, type BatchLinks } from '@/components/goose/engine-parts';
import { GIcon } from '@/components/ui/g-icon';
import { GPressable } from '@/components/ui/g-pressable';
import type { Anchor, ReadyWork } from '@/models/anchors';
import type { UseQuestions } from '@/view-models/use-questions';
import { WidgetHeader } from './home-widgets';

type Theme = ReturnType<typeof useInkTheme>;

/** A glance, not the list: the rest are a tap away. */
const SHOWN_READY = 3;
const SHOWN_OFFERS = 2;

export function ReadyWidget({ ready, onOpen, onSeeAll }: { ready: ReadyWork[]; onOpen: (work: ReadyWork) => void; onSeeAll: () => void }) {
  const theme = useInkTheme();
  const styles = makeStyles(theme);
  const { t } = useTranslation();
  const hidden = ready.length - SHOWN_READY;
  return (
    <View>
      <WidgetHeader icon="sparkle" title={t('home.ready.title')} meta={t('home.ready.meta', { count: ready.length })} />
      {ready.slice(0, SHOWN_READY).map((work, i) => (
        <GPressable
          key={work.deliverable.id}
          style={[styles.item, i > 0 && styles.divided]}
          accessibilityRole="button"
          accessibilityLabel={t('home.ready.openLabel', { title: work.deliverable.title, anchor: work.anchor.title })}
          onPress={() => onOpen(work)}
        >
          <View style={styles.words}>
            <Text style={styles.eyebrow} numberOfLines={1}>
              {work.anchor.title}
            </Text>
            <Text style={styles.title} numberOfLines={2}>
              {work.deliverable.title}
            </Text>
            {work.deliverable.hook ? (
              <Text style={styles.hook} numberOfLines={2}>
                {work.deliverable.hook}
              </Text>
            ) : null}
            {work.deliverable.state === 'unsure' ? (
              <InkText size="sm" tone="tertiary">
                {t('home.ready.unsure')}
              </InkText>
            ) : null}
          </View>
          <GIcon name="chevron-right" size={16} color={theme.color.textTertiary} strokeWidth={2.5} />
        </GPressable>
      ))}
      {hidden > 0 ? <MoreLine label={t('home.ready.more', { count: hidden })} onPress={onSeeAll} /> : null}
    </View>
  );
}

export function PlansWidget({
  offered,
  busy,
  onYes,
  onNo,
  onOpen,
  onSeeAll,
}: {
  offered: Anchor[];
  busy: string | null;
  onYes: (anchor: Anchor) => void;
  onNo: (anchor: Anchor) => void;
  onOpen: (anchor: Anchor) => void;
  onSeeAll: () => void;
}) {
  const theme = useInkTheme();
  const styles = makeStyles(theme);
  const { t } = useTranslation();
  const hidden = offered.length - SHOWN_OFFERS;
  return (
    <View>
      <WidgetHeader icon="light" title={t('home.plans.title')} />
      {offered.slice(0, SHOWN_OFFERS).map((anchor, i) => (
        <View key={anchor.id} style={[styles.item, i > 0 && styles.divided]}>
          <View style={styles.words}>
            <CandidateBlock anchor={anchor} busy={busy === anchor.id} onYes={() => onYes(anchor)} onNo={() => onNo(anchor)} onOpen={() => onOpen(anchor)} />
          </View>
        </View>
      ))}
      {hidden > 0 ? <MoreLine label={t('home.plans.more', { count: hidden })} onPress={onSeeAll} /> : null}
    </View>
  );
}

/** The newest open batch, answerable here; the rest wait on Goose's questions screen. */
export function QuestionsWidget({ vm, onSeeAll, onOpenPlan, onOpenChat }: { vm: UseQuestions; onSeeAll: () => void } & BatchLinks) {
  const { t } = useTranslation();
  const batch = vm.batches[0];
  if (!batch) return null;
  const hidden = vm.count - batch.questions.length;
  return (
    <View>
      <WidgetHeader icon="chat" title={t('home.questions.title')} action={{ label: t('home.questions.seeAll'), name: t('screens.gooseQuestions'), onPress: onSeeAll }} />
      <QuestionBatchBlock vm={vm} batch={batch} onOpenPlan={onOpenPlan} onOpenChat={onOpenChat} />
      {hidden > 0 ? <MoreLine label={t('home.questions.more', { count: hidden })} onPress={onSeeAll} /> : null}
    </View>
  );
}

function MoreLine({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useInkTheme();
  const styles = makeStyles(theme);
  return (
    <GPressable style={styles.more} hitSlop={8} accessibilityRole="link" accessibilityLabel={label} onPress={onPress}>
      <Text style={styles.moreText}>{label}</Text>
      <GIcon name="chevron-right" size={14} color={theme.color.accentLine} strokeWidth={2.5} />
    </GPressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    item: { flexDirection: 'row', alignItems: 'center', gap: theme.space[3], paddingVertical: theme.space[1] },
    words: { flex: 1, gap: 2 },
    divided: { borderTopWidth: theme.edge.hairlineWidth, borderTopColor: theme.color.line, marginTop: theme.space[3], paddingTop: theme.space[3] },
    eyebrow: inkText(theme, { size: 'xs', weight: theme.weight.semibold, color: theme.color.accentLine }).style,
    title: inkText(theme, { size: 'md', weight: theme.weight.semibold }).style,
    hook: inkText(theme, { size: 'sm', color: theme.color.textSecondary }).style,
    more: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', gap: 2, marginTop: theme.space[3] },
    moreText: inkText(theme, { size: 'sm', weight: theme.weight.semibold, color: theme.color.accentLine }).style,
  });
