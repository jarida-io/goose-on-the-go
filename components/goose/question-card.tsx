/**
 * Goose's structured questions, drawn the same in chat, on Home and in My Goose: one question at a
 * time with a pager, its header chip, its options with what each means (Goose's pick first and
 * marked), the focused option's preview, "Other" with a field, Done, and Send for the whole batch.
 */

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as WebBrowser from 'expo-web-browser';
import { InkBadge, InkButton, InkCheckbox, InkEdge, InkInput, InkRadioGroup, InkTable, InkText, useInkTheme } from '@/components/ui/ink';

import { PondPicture } from '@/components/patterns/pond-picture';
import { Spacing } from '@/constants/spacing';
import { shownOptions, type AnswerLine, type Question, type QuestionOption, type QuestionPreview } from '@/models/questions';
import type { AnswerDraft } from '@/view-models/use-questions';
import { usePagePictures } from '@/view-models/use-page-pictures';

// The radio's values are positions, so an option worded like "other" never collides with Other.
const OTHER = 'other';

export interface QuestionPagerProps {
  questions: Question[];
  draftOf: (id: string) => AnswerDraft;
  onChoose: (question: Question, option: string) => void;
  onOther: (question: Question, on: boolean) => void;
  onOtherText: (question: Question, text: string) => void;
  onSubmit: () => void;
  onEnough: () => void;
  busy: 'send' | 'enough' | null;
  canSend: boolean;
  /** False while the batch's ids are still being read: choices can be made, but wait to be sent. */
  ready?: boolean;
}

/** A batch, one question a page, sent whole. */
export function QuestionPager({ questions, draftOf, onChoose, onOther, onOtherText, onSubmit, onEnough, busy, canSend, ready = true }: QuestionPagerProps) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const at = Math.min(page, Math.max(0, questions.length - 1));
  const question = questions[at];
  if (!question) return null;
  const last = at === questions.length - 1;
  return (
    <View style={styles.pager}>
      <QuestionPage key={question.id} question={question} draft={draftOf(question.id)} onChoose={onChoose} onOther={onOther} onOtherText={onOtherText} />
      {questions.length > 1 ? (
        <View style={styles.row}>
          <InkButton variant="quiet" size="sm" icon="chevron-left" disabled={at === 0} onPress={() => setPage(at - 1)}>
            {t('goose.questions.back')}
          </InkButton>
          <InkText size="sm" tone="secondary">
            {t('goose.questions.page', { at: at + 1, count: questions.length })}
          </InkText>
          <InkButton variant="quiet" size="sm" icon="chevron-right" disabled={last} onPress={() => setPage(at + 1)}>
            {t('goose.questions.next')}
          </InkButton>
        </View>
      ) : null}
      {ready ? null : (
        <InkText size="sm" tone="tertiary">
          {t('goose.questions.gettingReady')}
        </InkText>
      )}
      <View style={styles.actions}>
        <InkButton variant="quiet" disabled={busy !== null || !ready} loading={busy === 'enough'} onPress={onEnough}>
          {t('goose.questions.enough')}
        </InkButton>
        <InkButton variant="primary" disabled={!canSend || busy !== null || !ready} loading={busy === 'send'} onPress={onSubmit}>
          {t('goose.questions.send')}
        </InkButton>
      </View>
    </View>
  );
}

export interface QuestionPageProps {
  question: Question;
  draft: AnswerDraft;
  onChoose: (question: Question, option: string) => void;
  onOther: (question: Question, on: boolean) => void;
  onOtherText: (question: Question, text: string) => void;
  /** Where "Other" is answered somewhere else, such as an idea card's composer, in place of the field. */
  onOtherPress?: () => void;
}

/** The option whose preview shows: the one last touched, else the chosen one, else Goose's pick. */
export function previewOf(question: Question, draft: AnswerDraft, touched: string | null): QuestionPreview | null {
  const label = touched ?? draft.choices[draft.choices.length - 1] ?? null;
  const option = (label ? question.options.find((o) => o.label === label) : undefined) ?? (question.recommended !== null ? question.options[question.recommended] : undefined);
  return option?.preview ?? null;
}

/** One question: its header, words, options with Goose's pick first, Other, and the focused preview. */
export function QuestionPage({ question, draft, onChoose, onOther, onOtherText, onOtherPress }: QuestionPageProps) {
  const { t } = useTranslation();
  const [touched, setTouched] = useState<string | null>(null);
  const shown = shownOptions(question);
  const choose = (option: QuestionOption) => {
    setTouched(option.label);
    onChoose(question, option.label);
  };
  const preview = previewOf(question, draft, touched);
  return (
    <View style={styles.page}>
      {question.header ? (
        <View style={styles.chip}>
          <InkBadge tone="brand">{question.header}</InkBadge>
        </View>
      ) : null}
      <InkText weight="semibold">{question.text}</InkText>
      {question.multi ? (
        <View style={styles.checks} accessibilityLabel={question.text}>
          <InkText size="sm" tone="secondary">
            {t('goose.questions.pickSeveral')}
          </InkText>
          {shown.map(({ option, recommended }) => (
            <InkCheckbox key={option.label} label={option.label} checked={draft.choices.includes(option.label)} onChange={() => choose(option)}>
              <OptionWords option={option} recommended={recommended} />
            </InkCheckbox>
          ))}
          <InkCheckbox label={t('goose.questions.other')} checked={draft.other} onChange={(on) => (onOtherPress ? onOtherPress() : onOther(question, on))}>
            <InkText weight="semibold">{t('goose.questions.other')}</InkText>
          </InkCheckbox>
        </View>
      ) : (
        <InkRadioGroup
          label={question.text}
          value={draft.other ? OTHER : String(question.options.findIndex((o) => draft.choices.includes(o.label)))}
          options={[
            ...shown.map(({ option, recommended }) => ({
              value: String(question.options.indexOf(option)),
              label: option.label,
              description: <OptionNote option={option} recommended={recommended} />,
            })),
            { value: OTHER, label: t('goose.questions.other') },
          ]}
          onChange={(value) => {
            if (value === OTHER) {
              if (onOtherPress) onOtherPress();
              else onOther(question, true);
            } else {
              const option = question.options[Number(value)];
              if (option) choose(option);
            }
          }}
        />
      )}
      {draft.other && !onOtherPress ? <InkInput label={t('goose.questions.other')} value={draft.text} onChange={(text) => onOtherText(question, text)} placeholder={t('goose.questions.otherPlaceholder')} /> : null}
      {preview ? <PreviewView preview={preview} caption={question.header || question.text} /> : null}
    </View>
  );
}

/** Under a radio's label: the Recommended mark and what choosing it means. */
function OptionNote({ option, recommended }: { option: QuestionOption; recommended: boolean }) {
  const { t } = useTranslation();
  if (!recommended && !option.description) return null;
  return (
    <View style={styles.note}>
      {recommended ? <InkBadge tone="success">{t('goose.questions.recommended')}</InkBadge> : null}
      {option.description ? (
        <InkText size="sm" tone="secondary">
          {option.description}
        </InkText>
      ) : null}
    </View>
  );
}

/** Beside a checkbox: the label, then the same note a radio carries. */
function OptionWords({ option, recommended }: { option: QuestionOption; recommended: boolean }) {
  return (
    <View style={styles.fill}>
      <InkText weight="semibold">{option.label}</InkText>
      <OptionNote option={option} recommended={recommended} />
    </View>
  );
}

/** What an option leads to: the first lines of a draft, a place, or options side by side. */
export function PreviewView({ preview, caption }: { preview: QuestionPreview; caption: string }) {
  const theme = useInkTheme();
  return (
    <InkEdge raised={false} budgeted={false} radius={theme.radius.md} contentStyle={styles.preview}>
      {preview.kind === 'draft' ? <InkText size="sm">{preview.text}</InkText> : null}
      {preview.kind === 'place' ? <PlacePreview preview={preview} /> : null}
      {preview.kind === 'table' ? <TablePreview preview={preview} caption={caption} /> : null}
    </InkEdge>
  );
}

function PlacePreview({ preview }: { preview: Extract<QuestionPreview, { kind: 'place' }> }) {
  const { t } = useTranslation();
  // With no picture of its own, the Pond is asked for the place page's, as it is for any cited page.
  const fallback = !preview.imagePath && preview.url ? [preview.url] : [];
  const pictures = usePagePictures(fallback, fallback.length > 0);
  const path = preview.imagePath ?? pictures[0]?.src ?? null;
  return (
    <View style={styles.place}>
      {path ? <PondPicture path={path} label={preview.name} style={styles.thumb} /> : null}
      <View style={styles.fill}>
        <InkText weight="semibold">{preview.name}</InkText>
        {preview.price ? (
          <InkText size="sm" tone="secondary">
            {preview.price}
          </InkText>
        ) : null}
        {preview.url ? (
          <InkButton variant="quiet" size="sm" icon="external" style={styles.left} onPress={() => void WebBrowser.openBrowserAsync(preview.url!)}>
            {t('goose.questions.openPlace')}
          </InkButton>
        ) : null}
      </View>
    </View>
  );
}

function TablePreview({ preview, caption }: { preview: Extract<QuestionPreview, { kind: 'table' }>; caption: string }) {
  const rows = preview.rows.map((cells, i) => ({ key: String(i), cells }));
  return (
    <InkTable
      caption={caption}
      columns={preview.columns.map((header, i) => ({ key: String(i), header, width: 112, render: (row: { cells: string[] }) => <InkText size="sm">{row.cells[i] ?? ''}</InkText> }))}
      rows={rows}
      rowKey={(row) => row.key}
    />
  );
}

/** A sent batch, in place of its questions: each header with what the member said. */
export function AnswerLines({ lines }: { lines: AnswerLine[] }) {
  const { t } = useTranslation();
  return (
    <View style={styles.page} accessibilityLabel={t('goose.questions.answered')}>
      <InkText size="sm" tone="secondary">
        {t('goose.questions.answered')}
      </InkText>
      {lines.map((line, i) => (
        <View key={`${line.header}-${i}`} style={styles.answer}>
          <InkBadge tone="brand">{line.header}</InkBadge>
          <InkText style={styles.fill}>{line.answer}</InkText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pager: { gap: Spacing.md },
  page: { gap: Spacing.sm },
  chip: { flexDirection: 'row' },
  checks: { gap: Spacing.md },
  note: { gap: Spacing.xs, alignItems: 'flex-start' },
  fill: { flex: 1, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm },
  preview: { padding: Spacing.md, gap: Spacing.sm },
  place: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  thumb: { width: 64, height: 64, borderRadius: 8 },
  left: { alignSelf: 'flex-start' },
  answer: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
});
