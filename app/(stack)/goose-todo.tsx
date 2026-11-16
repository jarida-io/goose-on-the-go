/**
 * Adding or editing a to-do or a reminder: what it is, any notes, whether Goose should ask if it is
 * done, and what brings it up. Saving sends the hooks whole, as the Pond replaces them all.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { InkButton, InkSegmented, InkSwitch, InkText, InkTextArea, useInkTheme } from '@/components/ui/ink';

import { RoundButton, ScreenScroll, SectionHead } from '@/components/goose/hub-parts';
import { HookPicker } from '@/components/goose/hook-picker';
import { Labelled } from '@/components/goose/labelled';
import { LocationSheet, hookIcon, useHookWords } from '@/components/goose/todo-parts';
import { DangerQuietButton } from '@/components/pond/danger-quiet-button';
import { GIcon } from '@/components/ui/g-icon';
import { GPressable } from '@/components/ui/g-pressable';
import { SendToChat } from '@/components/goose/send-to-chat';
import { Spacing } from '@/constants/spacing';
import { draftOf, pickerSeedOf, replaceHook, type Hook, type TodoDraft, type TodoKind } from '@/models/todos';
import { useConfirm } from '@/providers/confirm-provider';
import { toggle } from '@/services/haptics';
import { useTodo, useTodos } from '@/view-models/use-todos';

export default function GooseTodoScreen() {
  const { id, kind } = useLocalSearchParams<{ id?: string; kind?: TodoKind }>();
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
  // The hook the member tapped to change; the picker below opens on it.
  const [editing, setEditing] = useState<number | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: id ? t('goose.todo.editTitle') : t('goose.todo.newTitle') });
  }, [id, navigation, t]);

  const set = (change: Partial<TodoDraft>) => setEdited({ ...draft, ...change });
  const addHook = (hook: Hook) => set({ hooks: [...draft.hooks, hook] });
  const removeHook = (index: number) => {
    set({ hooks: draft.hooks.filter((_, i) => i !== index) });
    setEditing((e) => (e === null || e === index ? null : e > index ? e - 1 : e));
  };
  const changeHook = (hook: Hook) => {
    if (editing === null) return;
    set({ hooks: replaceHook(draft.hooks, editing, hook) });
    setEditing(null);
  };

  const save = async () => {
    setSaving(true);
    const done = await todos.actions.save(id ?? null, draft);
    setSaving(false);
    if (done) router.back();
  };

  const remove = async () => {
    if (!existing) return;
    const yes = await ask({ title: t('goose.todo.deleteTitle'), message: t('goose.todo.deleteBody', { text: existing.text }), confirmLabel: t('goose.todo.delete'), destructive: true });
    if (yes && (await todos.actions.remove(existing))) router.back();
  };

  return (
    <>
      <ScreenScroll gap={Spacing.xl}>
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
});
