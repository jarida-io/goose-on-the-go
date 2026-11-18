/**
 * UnifiedSchedulesView — unified Schedules & Automations where hook-based automations are a
 * subset of schedules, featuring an Apple Shortcuts-inspired "Describe an automation" builder
 * with explicit hook selection (Clock, Camera, Sensor, Device).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Keyboard, Modal, PanResponder, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  InkChoice,
  InkEmptyState,
  InkNotice,
  InkSpinner,
  InkText,
  inkText,
  useInkTheme,
} from '@/components/ui/ink';

import { AutomationCard } from '@/components/patterns/automation-card';
import { AutomationFormSheet } from '@/components/patterns/automation-form-sheet';
import { ContentUnavailable } from '@/components/patterns/content-unavailable';
import { ScheduleCard } from '@/components/patterns/schedule-card';
import { ScheduleFormSheet } from '@/components/patterns/schedule-form-sheet';
import { VisualAutomationSheet } from '@/components/patterns/visual-automation-sheet';
import { GIcon } from '@/components/ui/g-icon';
import { GPressable } from '@/components/ui/g-pressable';
import { Spacing } from '@/constants/spacing';
import type { IconName } from '@/constants/icons';
import { isUnavailable } from '@/models/content-state';
import { deviceTimeZone } from '@/models/schedule';
import { useServer } from '@/providers/server-provider';
import { selectionTick } from '@/services/haptics';
import type { Rule, RuleRequest, Schedule } from '@/services/types';
import { useContentState } from '@/view-models/use-content-state';
import { useReloadOnPull } from '@/view-models/use-pull-to-refresh';
import { useRules } from '@/view-models/use-rules';
import { useSchedules } from '@/view-models/use-schedules';

type FilterKind = 'all' | 'clock' | 'automations';
type HookKind = 'clock' | 'camera' | 'sensor' | 'device';
type CreateKind = 'schedule' | 'automation';

const HOOKS: { kind: HookKind; label: string; icon: IconName }[] = [
  { kind: 'camera', label: 'Camera', icon: 'camera' },
  { kind: 'sensor', label: 'Sensor', icon: 'sensor' },
  { kind: 'device', label: 'Device', icon: 'device' },
  { kind: 'clock', label: 'Clock', icon: 'schedule' },
];

function shortTitle(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (clean.length <= 42) return clean;
  return `${clean.slice(0, 39)}…`;
}

export function UnifiedSchedulesView({
  composerOpen = false,
  onCloseComposer,
}: {
  composerOpen?: boolean;
  onCloseComposer?: () => void;
}) {
  const theme = useInkTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const router = useRouter();
  const { isScreenReal } = useServer();
  const real = isScreenReal('schedule');

  const schedulesVm = useSchedules();
  const rulesVm = useRules();
  const refreshAll = useCallback(async () => {
    await Promise.all([schedulesVm.actions.refresh(), rulesVm.actions.refresh()]);
  }, [schedulesVm.actions, rulesVm.actions]);
  useReloadOnPull(refreshAll);

  const [filter, setFilter] = useState<FilterKind>('all');
  const [createKind, setCreateKind] = useState<CreateKind>('automation');
  const [description, setDescription] = useState('');
  const [hook, setHook] = useState<HookKind>('camera');
  const [phoneZone] = useState(deviceTimeZone);

  const [creatingSchedule, setCreatingSchedule] = useState(false);
  const [schedulePrefill, setSchedulePrefill] = useState<{ name?: string; prompt?: string }>({});

  const [creatingRule, setCreatingRule] = useState(false);
  const [rulePrefill, setRulePrefill] = useState<RuleRequest | undefined>(undefined);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [visualOpen, setVisualOpen] = useState(false);

  const modalDragY = useRef(new Animated.Value(0)).current;
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (composerOpen) modalDragY.setValue(0);
    else setKeyboardHeight(0);
  }, [composerOpen, modalDragY]);

  useEffect(() => {
    if (!composerOpen) return;
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      setKeyboardHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [composerOpen]);

  const modalPan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_e, g) => {
          modalDragY.setValue(g.dy >= 0 ? g.dy : g.dy * 0.25);
        },
        onPanResponderRelease: (_e, g) => {
          if (g.dy > 90 || g.vy > 0.65) {
            Animated.timing(modalDragY, { toValue: 420, duration: 160, useNativeDriver: true }).start(() => {
              modalDragY.setValue(0);
              onCloseComposer?.();
            });
          } else {
            Animated.spring(modalDragY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(modalDragY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
        },
      }),
    [modalDragY, onCloseComposer],
  );

  const openSchedule = useCallback(
    (schedule: Schedule) => {
      void selectionTick();
      router.push({ pathname: '/(stack)/schedule-detail', params: { id: schedule.id } });
    },
    [router],
  );

  const startDescribed = useCallback(() => {
    const text = description.trim();
    if (!text) return;
    void selectionTick();
    onCloseComposer?.();
    setDescription('');
    const prompt =
      createKind === 'schedule' || hook === 'clock'
        ? `Create a schedule: ${text}`
        : `Create a ${hook}-triggered automation: ${text}`;
    setTimeout(() => {
      router.push({ pathname: '/conversation', params: { ask: prompt } } as never);
    }, Platform.OS === 'ios' ? 320 : 0);
  }, [createKind, description, hook, onCloseComposer, router]);

  const showClock = filter === 'all' || filter === 'clock';
  const showRules = filter === 'all' || filter === 'automations';

  const schedulesState = useContentState({
    loading: schedulesVm.loading,
    failed: schedulesVm.failed || schedulesVm.error !== null,
    hasContent: schedulesVm.data.schedules.length > 0,
  });
  const rulesState = useContentState({
    loading: rulesVm.loading,
    failed: rulesVm.failed || rulesVm.error !== null,
    hasContent: rulesVm.data.rules.length > 0,
  });

  type GridEntry =
    | { kind: 'schedule'; item: Schedule }
    | { kind: 'rule'; item: Rule };

  const gridItems = useMemo<GridEntry[]>(() => {
    const out: GridEntry[] = [];
    if (showClock) {
      for (const item of schedulesVm.data.schedules) out.push({ kind: 'schedule', item });
    }
    if (showRules) {
      for (const item of rulesVm.data.rules) out.push({ kind: 'rule', item });
    }
    return out;
  }, [rulesVm.data.rules, schedulesVm.data.schedules, showClock, showRules]);

  const [leftCol, rightCol] = useMemo(() => {
    const left: GridEntry[] = [];
    const right: GridEntry[] = [];
    gridItems.forEach((entry, idx) => {
      if (idx % 2 === 0) left.push(entry);
      else right.push(entry);
    });
    return [left, right];
  }, [gridItems]);

  const bodyText = inkText(theme, { size: 'md', color: theme.color.text }).style;

  const renderEntry = (entry: GridEntry) =>
    entry.kind === 'schedule' ? (
      <ScheduleCard
        key={`s-${entry.item.id}`}
        schedule={entry.item}
        canRun={real}
        phoneZone={phoneZone}
        onOpen={openSchedule}
        onSetPaused={schedulesVm.actions.setPaused}
        onRunNow={schedulesVm.actions.runNow}
      />
    ) : (
      <AutomationCard
        key={`r-${entry.item.id}`}
        rule={entry.item}
        onOpen={setEditingRule}
        onSetPaused={rulesVm.actions.setPaused}
      />
    );

  return (
    <View style={styles.body}>
      {/* Filter pills matching Conversations */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {(
          [
            { id: 'all', label: `All (${schedulesVm.data.schedules.length + rulesVm.data.rules.length})` },
            { id: 'clock', label: `Clock (${schedulesVm.data.schedules.length})` },
            { id: 'automations', label: `Automations (${rulesVm.data.rules.length})` },
          ] as const
        ).map((item) => (
          <InkChoice
            key={item.id}
            role="radio"
            shape="pill"
            selected={filter === item.id}
            onSelect={() => {
              void selectionTick();
              setFilter(item.id);
            }}
          >
            {item.label}
          </InkChoice>
        ))}
      </ScrollView>

      {(schedulesVm.loading || rulesVm.loading) && gridItems.length === 0 ? (
        <InkSpinner label={t('schedule.list.loading')} />
      ) : null}

      {isUnavailable(schedulesState) && isUnavailable(rulesState) ? (
        <ContentUnavailable
          state={schedulesState}
          reason={schedulesVm.error ?? rulesVm.error}
          onRetry={refreshAll}
        />
      ) : schedulesVm.error || rulesVm.error ? (
        <InkNotice tone="danger">{schedulesVm.error ?? rulesVm.error}</InkNotice>
      ) : null}

      {gridItems.length === 0 && !schedulesVm.loading && !rulesVm.loading ? (
        filter === 'automations' ? (
          <InkEmptyState icon="bolt" title={t('schedule.list.noRulesTitle')}>
            <InkText>{t('schedule.list.noRulesBody')}</InkText>
          </InkEmptyState>
        ) : (
          <InkEmptyState icon="schedule" title={t('schedule.list.noSchedulesTitle')}>
            <InkText>{t('schedule.list.noSchedulesBody')}</InkText>
          </InkEmptyState>
        )
      ) : (
        <View style={styles.staggeredGrid}>
          <View style={styles.column}>{leftCol.map(renderEntry)}</View>
          <View style={styles.column}>{rightCol.map(renderEntry)}</View>
        </View>
      )}

      {/* iOS Shortcuts-style Create Modal */}
      <Modal
        visible={composerOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => onCloseComposer?.()}
      >
        <Animated.View
          {...modalPan.panHandlers}
          style={[
            styles.modalSafe,
            {
              backgroundColor: theme.color.surface,
              paddingTop: insets.top + Spacing.xs,
              paddingBottom: keyboardHeight > 0 ? keyboardHeight + Spacing.sm : Math.max(insets.bottom, Spacing.md),
              transform: [{ translateY: modalDragY }],
            },
          ]}
        >
          <View style={styles.modalFlex}>
            <View style={styles.modalTopBar}>
              <GPressable
                onPress={() => {
                  void selectionTick();
                  onCloseComposer?.();
                }}
                accessibilityRole="button"
                accessibilityLabel={t('common.back')}
                style={[styles.roundBtn, { backgroundColor: theme.color.chrome, borderColor: theme.color.lineStrong }]}
              >
                <GIcon name="chevron-left" size={20} color={theme.color.text} />
              </GPressable>

              <GPressable
                onPress={() => {
                  void selectionTick();
                  setCreateKind((k) => (k === 'automation' ? 'schedule' : 'automation'));
                }}
                accessibilityRole="button"
                style={styles.kindSwitch}
              >
                <Text style={[styles.kindTitle, { color: theme.color.text }]}>
                  {createKind === 'automation' ? 'New Automation' : 'New Schedule'}
                </Text>
                <View style={{ transform: [{ rotate: '90deg' }] }}>
                  <GIcon name="chevron-right" size={14} color={theme.color.textSecondary} />
                </View>
              </GPressable>

              <GPressable
                onPress={() => {
                  void selectionTick();
                  onCloseComposer?.();
                  setTimeout(() => {
                    if (createKind === 'schedule') {
                      setSchedulePrefill({});
                      setCreatingSchedule(true);
                    } else {
                      setVisualOpen(true);
                    }
                  }, Platform.OS === 'ios' ? 320 : 0);
                }}
                accessibilityRole="button"
                style={[styles.editPill, { backgroundColor: theme.color.chrome, borderColor: theme.color.lineStrong }]}
              >
                <Text style={[styles.editPillText, { color: theme.color.text }]}>Edit</Text>
              </GPressable>
            </View>

            <View style={styles.modalCenter}>
              <View
                style={[
                  styles.glowCard,
                  {
                    backgroundColor: theme.color.chrome,
                    borderColor: theme.color.accentLine,
                  },
                ]}
              >
                <InkText size="lg" weight="bold" style={styles.builderQuestion}>
                  {createKind === 'automation'
                    ? 'What do you want your automation to do?'
                    : 'What do you want your schedule to run?'}
                </InkText>
                <InkText size="sm" tone="secondary" style={styles.builderExample}>
                  {createKind === 'automation'
                    ? '“When the front camera sees someone at night, turn on the porch light”'
                    : '“Every weekday at 8:00 AM, summarize my calendar and weather”'}
                </InkText>

                {createKind === 'automation' ? (
                  <View style={styles.modalHooks}>
                    {HOOKS.map((h) => (
                      <InkChoice
                        key={h.kind}
                        shape="pill"
                        selected={hook === h.kind}
                        onSelect={() => {
                          void selectionTick();
                          setHook(h.kind);
                        }}
                      >
                        {h.label}
                      </InkChoice>
                    ))}
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.modalBottomBar}>
              <View
                style={[
                  styles.describeRow,
                  {
                    backgroundColor: theme.color.chrome,
                    borderColor: theme.color.lineStrong,
                    borderWidth: theme.edge.hairlineWidth,
                    borderRadius: 999,
                    flex: 1,
                  },
                ]}
              >
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder={createKind === 'automation' ? 'Describe an automation' : 'Describe a schedule'}
                  placeholderTextColor={theme.color.textTertiary}
                  style={[bodyText, styles.describeInput]}
                  returnKeyType="done"
                  onSubmitEditing={startDescribed}
                />
                {description.trim().length > 0 ? (
                  <GPressable
                    onPress={startDescribed}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Create"
                    style={[styles.sendCircle, { backgroundColor: theme.color.accent }]}
                  >
                    <GIcon name="arrow-up" size={16} color={theme.color.textOnAccent} />
                  </GPressable>
                ) : null}
              </View>

              <GPressable
                onPress={() => {
                  void selectionTick();
                  onCloseComposer?.();
                }}
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel')}
                style={[styles.roundBtn, { backgroundColor: theme.color.chrome, borderColor: theme.color.lineStrong }]}
              >
                <GIcon name="x" size={18} color={theme.color.text} />
              </GPressable>
            </View>
          </View>
        </Animated.View>
      </Modal>

      <ScheduleFormSheet
        open={creatingSchedule}
        onClose={() => setCreatingSchedule(false)}
        onCreate={async (req) => {
          const err = await schedulesVm.actions.create(req);
          if (!err) setDescription('');
          return err;
        }}
        asksIfMissed={schedulesVm.data.offersRoutines}
        prefillName={schedulePrefill.name}
        prefillPrompt={schedulePrefill.prompt}
      />

      <AutomationFormSheet
        open={creatingRule}
        onClose={() => setCreatingRule(false)}
        prefill={rulePrefill}
        onSubmit={async (req) => {
          const err = await rulesVm.actions.create(req);
          if (!err) setDescription('');
          return err;
        }}
      />

      {editingRule ? (
        <AutomationFormSheet
          open
          onClose={() => setEditingRule(null)}
          rule={editingRule}
          onSubmit={(req) => rulesVm.actions.update(editingRule, req)}
          onDelete={() => rulesVm.actions.remove(editingRule)}
        />
      ) : null}

      <VisualAutomationSheet
        open={visualOpen}
        initialHook={hook}
        initialDescription={description}
        onClose={() => setVisualOpen(false)}
        onCreateSchedule={async (req) => {
          const err = await schedulesVm.actions.create(req);
          if (!err) setDescription('');
          return err;
        }}
        onCreateRule={async (req) => {
          const err = await rulesVm.actions.create(req);
          if (!err) setDescription('');
          return err;
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.md },
  filterRow: { flexDirection: 'row', gap: Spacing.sm, paddingVertical: 2 },
  staggeredGrid: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  column: { flex: 1, gap: Spacing.sm },
  modalSafe: { flex: 1 },
  modalFlex: { flex: 1, justifyContent: 'space-between', padding: Spacing.lg },
  modalTopBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kindSwitch: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6 },
  kindTitle: { fontSize: 17, fontWeight: '700' },
  editPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  editPillText: { fontSize: 15, fontWeight: '600' },
  modalCenter: { flex: 1, justifyContent: 'center', paddingVertical: Spacing.xl },
  glowCard: {
    borderRadius: 28,
    borderWidth: 1,
    padding: Spacing['2xl'],
    gap: Spacing.md,
    alignItems: 'center',
  },
  builderQuestion: { textAlign: 'center' },
  builderExample: { textAlign: 'center', fontStyle: 'italic' },
  modalHooks: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.xs, marginTop: Spacing.xs },
  modalBottomBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingTop: Spacing.sm },
  describeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    minHeight: 46,
    gap: Spacing.sm,
  },
  describeInput: { flex: 1, paddingVertical: 8 },
  sendCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
