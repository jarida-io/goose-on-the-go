/**
 * Adding or editing a to-do or a reminder: what it is, any notes, its list, priority and steps,
 * whether Goose should ask if it is done, and what brings it up. Saving sends the hooks and the
 * steps whole, as the Pond replaces them all; ticking a step of a saved to-do sends at once. What
 * Goose can do for it is a button, and the plan it belongs to a row that opens the plan.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { InkButton, InkCheckbox, InkInput, InkNotice, InkSegmented, InkSwitch, InkText, InkTextArea, useInkTheme } from '@/components/ui/ink';

import { GroupRow, InsetGroup } from '@/components/goose/following';
import { RoundButton, ScreenScroll, SectionHead } from '@/components/goose/hub-parts';
import { HookPicker } from '@/components/goose/hook-picker';
import { Labelled } from '@/components/goose/labelled';
import { LocationSheet, hookIcon, useHookWords } from '@/components/goose/todo-parts';
import { DangerQuietButton } from '@/components/pond/danger-quiet-button';
import { GIcon } from '@/components/ui/g-icon';
import { GPressable } from '@/components/ui/g-pressable';
import { SendToChat } from '@/components/goose/send-to-chat';
import { Spacing } from '@/constants/spacing';
import { cleanSteps, draftOf, hookToOpen, MAX_LIST_CHARS, MAX_STEP_CHARS, MAX_STEPS, pickerSeedOf, PRIORITIES, priorityKey, replaceHook, type Hook, type TodoDraft, type TodoKind } from '@/models/todos';
import { useConfirm } from '@/providers/confirm-provider';
import { toggle } from '@/services/haptics';
import { useAnchor } from '@/view-models/use-anchors';
import { useTodo, useTodos } from '@/view-models/use-todos';

/** The plan a to-do belongs to, named, or a quiet line while its name is read. */
function PlanRow({ anchorId, onLeave }: { anchorId: string; onLeave: () => void }) {
  const { t } = useTranslation();
  const plan = useAnchor(anchorId);
  return (
    <View style={styles.section}>
      <InsetGroup>
        <GroupRow first icon="calendar" label={plan.data?.title ?? t('goose.anchor.loading')} detail={t('goose.todo.plan')} onPress={() => router.push({ pathname: '/(stack)/goose-anchor', params: { id: anchorId } })} />
      </InsetGroup>
      <InkButton variant="quiet" onPress={onLeave} style={styles.left}>
        {t('goose.todo.leavePlan')}
      </InkButton>
    </View>
  );
}

export default function GooseTodoScreen() {
  const { id, kind, already } = useLocalSearchParams<{ id?: string; kind?: TodoKind; already?: string }>();
  const theme = useInkTheme();
  const { t } = useTranslation();
  const ask = useConfirm();
  const navigation = useNavigation();
  const todos = useTodos();
  const existing = useTodo(id ?? null);
  const words = useHookWords();
  // The member's edits; until the first, the to-do as the Pond has it (or a blank one).
  const [edited, setEdited] = useState<TodoDraft | null>(null);
  const loaded = !id || existing !== null;
  const draft = edited ?? (existing ? draftOf(existing) : draftOf(null, kind === 'reminder' ? 'reminder' : 'todo'));
  const [saving, setSaving] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [step, setStep] = useState('');
  // The hook the member tapped to change; the picker below opens on it. Until they tap one, a
  // saved to-do opens on its only time (`hookToOpen`): a picker showing 18:00 under a reminder set
  // for 15:00 read as the reminder's time not having been kept.
  const [tapped, setEditing] = useState<number | null | undefined>(undefined);
  const editing = tapped === undefined ? (existing ? hookToOpen(draft.hooks) : null) : tapped;

  useEffect(() => {
    navigation.setOptions({ title: id ? t('goose.todo.editTitle') : t('goose.todo.newTitle') });
  }, [id, navigation, t]);

  const set = (change: Partial<TodoDraft>) => setEdited({ ...draft, ...change });
  const addHook = (hook: Hook) => set({ hooks: [...draft.hooks, hook] });
  const removeHook = (index: number) => {
    set({ hooks: draft.hooks.filter((_, i) => i !== index) });
    setEditing(editing === null || editing === index ? null : editing > index ? editing - 1 : editing);
  };
  const changeHook = (hook: Hook) => {
    if (editing === null) return;
    set({ hooks: replaceHook(draft.hooks, editing, hook) });
    setEditing(null);
  };
  const addStep = () => {
    const typed = step.trim();
    if (!typed || draft.steps.length >= MAX_STEPS) return;
    set({ steps: cleanSteps([...draft.steps, { text: typed, done: false }]) });
    setStep('');
  };
  const tickStep = (index: number, isDone: boolean) => {
    set({ steps: draft.steps.map((s, i) => (i === index ? { ...s, done: isDone } : s)) });
    // A saved to-do's steps are sent at once, the whole list, as the Pond takes them.
    if (existing) void todos.actions.tick(existing, index, isDone, draft.steps);
  };

  const save = async () => {
    setSaving(true);
    const done = await todos.actions.save(id ?? null, draft);
    setSaving(false);
    if (!done) return;
    // The list already held it: open that one, and say so, rather than leave a second behind.
    if (!id && done.duplicateOf) router.replace({ pathname: '/(stack)/goose-todo', params: { id: done.id, already: '1' } });
    else router.back();
  };

  const remove = async () => {
    if (!existing) return;
    const yes = await ask({ title: t('goose.todo.deleteTitle'), message: t('goose.todo.deleteBody', { text: existing.text }), confirmLabel: t('goose.todo.delete'), destructive: true });
    if (yes && (await todos.actions.remove(existing))) router.back();
  };

  return (
    <>
      <ScreenScroll gap={Spacing.xl}>
        {already ? <InkNotice tone="info">{t('goose.todo.already')}</InkNotice> : null}
        {existing?.gooseCan ? (
          <View style={styles.section}>
            <InkText size="sm" weight="semibold" tone="secondary">
              {t('goose.todo.gooseCan')}
            </InkText>
            <InkButton
              variant="primary"
              icon="sparkle"
              onPress={() => router.push({ pathname: '/conversation', params: { ask: existing.gooseCan!.prompt } })}
              style={styles.left}
            >
              {existing.gooseCan.label}
            </InkButton>
          </View>
        ) : null}
        <InkSegmented
          label={t('goose.todo.kind')}
          value={draft.kind}
          options={[
            { value: 'todo', label: t('goose.todo.todo') },
            { value: 'reminder', label: t('goose.todo.reminder') },
          ]}
          onChange={(k) => set({ kind: k, ask: k === 'todo' ? draft.ask : false })}
        />
        <Labelled label={t('goose.todo.what')}>
          <InkTextArea label={t('goose.todo.what')} value={draft.text} onChange={(text) => set({ text })} placeholder={t('goose.todo.whatPlaceholder')} rows={2} />
        </Labelled>
        <Labelled label={t('goose.todo.notes')}>
          <InkTextArea label={t('goose.todo.notes')} value={draft.notes} onChange={(notes) => set({ notes })} placeholder={t('goose.todo.notesPlaceholder')} rows={2} />
        </Labelled>
        <InkInput label={t('goose.todo.list')} value={draft.list} onChange={(list) => set({ list: list.slice(0, MAX_LIST_CHARS) })} placeholder={t('goose.todo.listPlaceholder')} />
        <InkSegmented
          label={t('goose.todo.priorityLabel')}
          value={draft.priority}
          options={PRIORITIES.map((p) => ({ value: p, label: t(priorityKey(p)) }))}
          onChange={(priority) => set({ priority })}
        />

        <View style={styles.section}>
          <SectionHead title={t('goose.todo.steps')} subtitle={draft.steps.length ? t('goose.todo.stepsBody') : null} size="small" />
          {draft.steps.map((s, i) => (
            <View key={`${i}-${s.text}`} style={styles.step}>
              <View style={styles.stepWords}>
                <InkCheckbox checked={s.done} label={s.text} onChange={(isDone) => tickStep(i, isDone)} />
              </View>
              <RoundButton icon="x" size={28} label={t('goose.todo.removeStep', { step: s.text })} onPress={() => set({ steps: draft.steps.filter((_, at) => at !== i) })} />
            </View>
          ))}
          {draft.steps.length < MAX_STEPS ? (
            <View style={styles.step}>
              <View style={styles.stepWords}>
                <InkInput label={t('goose.todo.stepPlaceholder')} value={step} onChange={(words) => setStep(words.slice(0, MAX_STEP_CHARS))} placeholder={t('goose.todo.stepPlaceholder')} onSubmit={addStep} />
              </View>
              <InkButton variant="quiet" icon="plus" disabled={!step.trim()} onPress={addStep}>
                {t('goose.todo.addStep')}
              </InkButton>
            </View>
          ) : null}
        </View>

        {draft.anchorId ? <PlanRow anchorId={draft.anchorId} onLeave={() => set({ anchorId: null })} /> : null}

        <InkSwitch
          checked={draft.ask}
          label={t('goose.todo.ask')}
          onChange={(v) => {
            void toggle();
            set({ ask: v });
          }}
        >
          <View style={styles.switchWords}>
            <InkText weight="semibold">{t('goose.todo.ask')}</InkText>
            <InkText size="sm" tone="secondary">
              {t('goose.todo.askBody')}
            </InkText>
          </View>
        </InkSwitch>

        <View style={styles.section}>
          <SectionHead title={t('goose.todo.when')} subtitle={t('goose.todo.whenBody')} size="small" />
          {draft.hooks.map((hook, i) => {
            const said = words(hook, todos.sources);
            const changeable = pickerSeedOf(hook) !== null;
            const chosen = editing === i;
            return (
              <View
                key={`${hook.id}-${i}`}
                style={[styles.hook, { backgroundColor: theme.color.accentSofter, borderColor: chosen ? theme.color.accentLine : theme.color.line }]}
              >
                <GPressable
                  style={styles.hookTap}
                  haptic="selection"
                  disabled={!changeable}
                  accessibilityRole="button"
                  accessibilityState={{ selected: chosen, disabled: !changeable }}
                  accessibilityLabel={t('goose.todo.changeHook', { hook: said })}
                  onPress={() => setEditing(chosen ? null : i)}
                >
                  <GIcon name={hookIcon(hook)} size={16} color={theme.color.accentLine} />
                  <InkText weight="semibold" style={styles.hookWords}>
                    {said}
                  </InkText>
                  {changeable ? <GIcon name="edit" size={14} color={theme.color.textTertiary} /> : null}
                </GPressable>
                <RoundButton icon="x" size={28} label={t('goose.todo.removeHook', { hook: said })} onPress={() => removeHook(i)} />
              </View>
            );
          })}
          {editing !== null ? (
            <InkText size="sm" tone="secondary">
              {t('goose.todo.changing')}
            </InkText>
          ) : null}
          <HookPicker
            key={editing === null ? 'new' : `edit-${editing}`}
            sources={todos.sources}
            access={todos.access}
            editing={editing === null ? null : (draft.hooks[editing] ?? null)}
            onAdd={addHook}
            onReplace={changeHook}
            onCancelEdit={() => setEditing(null)}
            onSavePlace={todos.actions.addPlaceHere}
            onNeedsLocation={() => setSheet(true)}
          />
        </View>

        <View style={styles.actions}>
          <InkButton variant="primary" block loading={saving} disabled={!draft.text.trim() || !loaded} onPress={() => void save()}>
            {id ? t('goose.todo.save') : draft.kind === 'reminder' ? t('goose.todo.addReminder') : t('goose.todo.addTodo')}
          </InkButton>
          {existing ? <SendToChat kind="todo" id={existing.id} title={existing.text} size="md" /> : null}
          {existing ? (
            <DangerQuietButton icon="trash" onPress={() => void remove()}>
              {t('goose.todo.delete')}
            </DangerQuietButton>
          ) : null}
        </View>
      </ScreenScroll>
      <LocationSheet open={sheet} access={todos.access} onClose={() => setSheet(false)} onAllow={todos.actions.allowLocation} />
    </>
  );
}

const styles = StyleSheet.create({
  switchWords: { flex: 1, gap: 2 },
  section: { gap: Spacing.md },
  hook: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingLeft: Spacing.md, paddingRight: 6, paddingVertical: 6, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  hookTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  hookWords: { flex: 1 },
  actions: { gap: Spacing.sm },
  left: { alignSelf: 'flex-start' },
  step: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  stepWords: { flex: 1 },
});
