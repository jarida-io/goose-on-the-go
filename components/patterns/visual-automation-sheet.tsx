/**
 * VisualAutomationSheet — Apple Shortcuts-style manual visual automation builder.
 *
 * Lets the user visually assemble an automation from chips and action blocks:
 * - Pick the Hook (Clock, Camera, Sensor, Device) and cadence/trigger chip
 * - Tap visual action pills (Ask Goose, Send Notification, Control Device, Weather, Music, Briefing)
 *   to stack action blocks in the canvas above
 * - Search/filter the action library by category chips
 * - Save directly as a Clock Schedule or Hook Rule
 */

import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import {
  InkButton,
  InkChoice,
  InkEyebrow,
  InkInput,
  InkNotice,
  InkSheet,
  InkText,
  inkText,
  useInkTheme,
} from '@/components/ui/ink';

import { GIcon } from '@/components/ui/g-icon';
import { GPressable } from '@/components/ui/g-pressable';
import type { IconName } from '@/constants/icons';
import { Spacing } from '@/constants/spacing';
import { createRequest, deviceTimeZone, emptyDraft } from '@/models/schedule';
import { selectionTick } from '@/services/haptics';
import type { CreateScheduleRequest, RuleRequest, TriggerAction, TriggerSource } from '@/services/types';
import { supports, useDevices } from '@/view-models/use-devices';

type HookKind = 'clock' | 'camera' | 'sensor' | 'device';
type ActionCategory = 'all' | 'goose' | 'notify' | 'devices' | 'media';

interface ActionBlock {
  uid: string;
  kind: 'ask' | 'notify' | 'device_on' | 'device_off' | 'weather' | 'music' | 'briefing';
  label: string;
  icon: IconName;
  tint: string;
  prompt?: string;
  deviceId?: string;
  deviceName?: string;
}

interface ActionTemplate {
  kind: ActionBlock['kind'];
  category: Exclude<ActionCategory, 'all'>;
  label: string;
  hint: string;
  icon: IconName;
  tint: string;
  defaultPrompt?: string;
}

const HOOK_OPTIONS: { kind: HookKind; label: string; icon: IconName }[] = [
  { kind: 'clock', label: 'Clock', icon: 'schedule' },
  { kind: 'camera', label: 'Camera', icon: 'camera' },
  { kind: 'sensor', label: 'Sensor', icon: 'sensor' },
  { kind: 'device', label: 'Device', icon: 'device' },
];

const CLOCK_PRESETS = [
  { id: 'morning', label: 'Every morning (8 AM)', timing: 'daily' as const, hour: 8, minute: 0 },
  { id: 'evening', label: 'Every evening (8 PM)', timing: 'daily' as const, hour: 20, minute: 0 },
  { id: 'hourly', label: 'Every hour', timing: 'hourly' as const, hour: 0, minute: 0 },
  { id: 'weekdays', label: 'Weekdays (9 AM)', timing: 'weekly' as const, hour: 9, minute: 0 },
];

const CAMERA_PRESETS = ['Person detected', 'Package arrived', 'Motion at night', 'Unfamiliar face'];

const CATEGORIES: { id: ActionCategory; label: string; icon: IconName }[] = [
  { id: 'all', label: 'All', icon: 'sparkle' },
  { id: 'goose', label: 'Goose', icon: 'agent' },
  { id: 'notify', label: 'Notify', icon: 'bell' },
  { id: 'devices', label: 'Controls', icon: 'appliance' },
  { id: 'media', label: 'Media', icon: 'music' },
];

const TEMPLATES: ActionTemplate[] = [
  {
    kind: 'notify',
    category: 'notify',
    label: 'Send Notification',
    hint: 'Alert your phone with a message',
    icon: 'bell',
    tint: '#22C55E',
    defaultPrompt: 'Automation triggered',
  },
  {
    kind: 'ask',
    category: 'goose',
    label: 'Ask Goose',
    hint: 'Run a prompt with your Pond',
    icon: 'agent',
    tint: '#8B5CF6',
    defaultPrompt: 'Summarize what just happened and tell me if anything needs attention.',
  },
  {
    kind: 'weather',
    category: 'goose',
    label: 'Check Weather',
    hint: 'Include current outdoor conditions',
    icon: 'partly-sunny',
    tint: '#38BDF8',
    defaultPrompt: 'Check the outdoor weather and forecast for today.',
  },
  {
    kind: 'briefing',
    category: 'goose',
    label: 'Daily Briefing',
    hint: 'Weather, schedule, and top news',
    icon: 'news',
    tint: '#F59E0B',
    defaultPrompt: 'Give me a briefing: weather, upcoming routines, and top news.',
  },
  {
    kind: 'music',
    category: 'media',
    label: 'Play Music',
    hint: 'Resume or control playback',
    icon: 'music',
    tint: '#EC4899',
    defaultPrompt: 'Resume music playback.',
  },
  {
    kind: 'device_on',
    category: 'devices',
    label: 'Turn Device On',
    hint: 'Switch on a smart-home device',
    icon: 'power',
    tint: '#10B981',
  },
  {
    kind: 'device_off',
    category: 'devices',
    label: 'Turn Device Off',
    hint: 'Switch off a smart-home device',
    icon: 'power',
    tint: '#64748B',
  },
];

export interface VisualAutomationSheetProps {
  open: boolean;
  initialHook?: HookKind;
  initialDescription?: string;
  onClose: () => void;
  onCreateSchedule: (req: CreateScheduleRequest) => Promise<string | null>;
  onCreateRule: (req: RuleRequest) => Promise<string | null>;
}

export function VisualAutomationSheet({
  open,
  initialHook = 'clock',
  initialDescription = '',
  onClose,
  onCreateSchedule,
  onCreateRule,
}: VisualAutomationSheetProps) {
  const theme = useInkTheme();
  const { data: devicesData } = useDevices();
  const switchDevices = useMemo(
    () => devicesData.devices.filter((d) => supports(d, 'power')),
    [devicesData.devices],
  );

  const [name, setName] = useState('');
  const [hook, setHook] = useState<HookKind>(initialHook);
  const [clockPreset, setClockPreset] = useState(CLOCK_PRESETS[0].id);
  const [cameraPreset, setCameraPreset] = useState(CAMERA_PRESETS[0]);
  const [blocks, setBlocks] = useState<ActionBlock[]>([]);
  const [category, setCategory] = useState<ActionCategory>('all');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setHook(initialHook);
      setName(initialDescription.trim().slice(0, 48));
      setBlocks(
        initialDescription.trim()
          ? [
              {
                uid: `b-${Date.now()}`,
                kind: 'ask',
                label: 'Ask Goose',
                icon: 'agent',
                tint: '#8B5CF6',
                prompt: initialDescription.trim(),
              },
            ]
          : [],
      );
      setSearch('');
      setCategory('all');
      setError(null);
    }
  }

  const addBlock = useCallback(
    (tpl: ActionTemplate) => {
      void selectionTick();
      const firstDev = switchDevices[0];
      setBlocks((prev) => [
        ...prev,
        {
          uid: `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          kind: tpl.kind,
          label: tpl.label,
          icon: tpl.icon,
          tint: tpl.tint,
          prompt: tpl.defaultPrompt,
          deviceId: firstDev?.id,
          deviceName: firstDev?.name,
        },
      ]);
    },
    [switchDevices],
  );

  const removeBlock = useCallback((uid: string) => {
    void selectionTick();
    setBlocks((prev) => prev.filter((b) => b.uid !== uid));
  }, []);

  const cycleDevice = useCallback(
    (uid: string) => {
      if (switchDevices.length === 0) return;
      void selectionTick();
      setBlocks((prev) =>
        prev.map((b) => {
          if (b.uid !== uid) return b;
          const idx = switchDevices.findIndex((d) => d.id === b.deviceId);
          const next = switchDevices[(idx + 1) % switchDevices.length];
          return { ...b, deviceId: next.id, deviceName: next.name };
        }),
      );
    },
    [switchDevices],
  );

  const filteredTemplates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return TEMPLATES.filter((tpl) => {
      if (category !== 'all' && tpl.category !== category) return false;
      if (!q) return true;
      return tpl.label.toLowerCase().includes(q) || tpl.hint.toLowerCase().includes(q);
    });
  }, [category, search]);

  const save = useCallback(async () => {
    if (blocks.length === 0) {
      setError('Add at least one action chip below.');
      return;
    }
    setSaving(true);
    setError(null);

    const autoName =
      name.trim() ||
      `${HOOK_OPTIONS.find((h) => h.kind === hook)?.label ?? 'Custom'}: ${blocks[0].label}`;

    if (hook === 'clock') {
      const preset = CLOCK_PRESETS.find((p) => p.id === clockPreset) ?? CLOCK_PRESETS[0];
      const base = emptyDraft(deviceTimeZone(), true);
      const promptParts = blocks.map((b) => {
        if (b.kind === 'device_on' || b.kind === 'device_off') {
          const stateWord = b.kind === 'device_on' ? 'on' : 'off';
          return `Turn ${b.deviceName || 'the device'} ${stateWord}.`;
        }
        if (b.kind === 'notify') return `Notify me: ${b.prompt || autoName}`;
        return b.prompt || b.label;
      });
      const built = createRequest({
        ...base,
        name: autoName,
        timing: preset.timing,
        time: { hour: preset.hour, minute: preset.minute },
        weekdays: preset.timing === 'weekly' ? [1, 2, 3, 4, 5] : base.weekdays,
        prompt: promptParts.join('\n'),
      });
      if (!built.ok) {
        setError(built.error);
        setSaving(false);
        return;
      }
      const err = await onCreateSchedule(built.req);
      setSaving(false);
      if (err) setError(err);
      else onClose();
      return;
    }

    const source: TriggerSource =
      hook === 'camera'
        ? { kind: 'camera', signal: cameraPreset }
        : hook === 'sensor'
          ? { kind: 'sensor' }
          : { kind: 'device' };

    const actions: TriggerAction[] = blocks.map((b) => {
      if (b.kind === 'notify') {
        return { type: 'notify', title: autoName, body: b.prompt || autoName };
      }
      if ((b.kind === 'device_on' || b.kind === 'device_off') && b.deviceId) {
        return {
          type: 'device_power',
          device_id: b.deviceId,
          on: b.kind === 'device_on',
        };
      }
      return { type: 'agent_prompt', prompt: b.prompt || b.label };
    });

    const err = await onCreateRule({
      name: autoName,
      source,
      actions,
    });
    setSaving(false);
    if (err) setError(err);
    else onClose();
  }, [blocks, cameraPreset, clockPreset, hook, name, onClose, onCreateRule, onCreateSchedule]);

  const bodyText = inkText(theme, { size: 'sm', color: theme.color.text }).style;

  return (
    <InkSheet open={open} onClose={onClose} title="Visual Automation Builder" scroll>
      <View style={styles.sheet}>
        <InkInput
          label="Automation Name"
          value={name}
          onChange={setName}
          placeholder="e.g. Porch light on arrival"
        />

        {/* WHEN (Hook) */}
        <View style={styles.section}>
          <InkEyebrow>WHEN (HOOK)</InkEyebrow>
          <View style={styles.chips}>
            {HOOK_OPTIONS.map((opt) => (
              <InkChoice
                key={opt.kind}
                selected={hook === opt.kind}
                onSelect={() => {
                  void selectionTick();
                  setHook(opt.kind);
                }}
              >
                {opt.label}
              </InkChoice>
            ))}
          </View>
          {hook === 'clock' ? (
            <View style={styles.chips}>
              {CLOCK_PRESETS.map((p) => (
                <InkChoice
                  key={p.id}
                  selected={clockPreset === p.id}
                  onSelect={() => {
                    void selectionTick();
                    setClockPreset(p.id);
                  }}
                >
                  {p.label}
                </InkChoice>
              ))}
            </View>
          ) : null}
          {hook === 'camera' ? (
            <View style={styles.chips}>
              {CAMERA_PRESETS.map((sig) => (
                <InkChoice
                  key={sig}
                  selected={cameraPreset === sig}
                  onSelect={() => {
                    void selectionTick();
                    setCameraPreset(sig);
                  }}
                >
                  {sig}
                </InkChoice>
              ))}
            </View>
          ) : null}
        </View>

        {/* DO (Stacked Visual Action Blocks) */}
        <View style={styles.section}>
          <InkEyebrow>DO (ACTIONS)</InkEyebrow>
          {blocks.length === 0 ? (
            <View
              style={[
                styles.emptyCanvas,
                {
                  borderColor: theme.color.lineStrong,
                  borderRadius: theme.radius.lg,
                },
              ]}
            >
              <InkText size="sm" tone="tertiary" style={styles.emptyCanvasText}>
                Add action chips from below to build your automation.
              </InkText>
            </View>
          ) : (
            <View style={styles.canvasList}>
              {blocks.map((block, idx) => (
                <View key={block.uid} style={styles.blockWrap}>
                  {idx > 0 ? (
                    <View style={styles.connector}>
                      <GIcon name="arrow-down" size={14} color={theme.color.textTertiary} />
                    </View>
                  ) : null}
                  <View
                    style={[
                      styles.blockCard,
                      {
                        backgroundColor: theme.color.surface,
                        borderColor: theme.color.lineStrong,
                        borderWidth: theme.edge.hairlineWidth,
                        borderRadius: theme.radius.lg,
                      },
                    ]}
                  >
                    <View style={styles.blockTop}>
                      <View style={[styles.blockIcon, { backgroundColor: block.tint + '22' }]}>
                        <GIcon name={block.icon} size={16} color={block.tint} />
                      </View>
                      <InkText size="sm" weight="semibold" style={styles.flex}>
                        {block.label}
                      </InkText>
                      <GPressable
                        onPress={() => removeBlock(block.uid)}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${block.label}`}
                      >
                        <GIcon name="x" size={16} color={theme.color.textTertiary} />
                      </GPressable>
                    </View>
                    {block.kind === 'device_on' || block.kind === 'device_off' ? (
                      <GPressable
                        onPress={() => cycleDevice(block.uid)}
                        style={[styles.deviceChip, { backgroundColor: theme.color.neutralSoft }]}
                      >
                        <InkText size="xs" weight="medium">
                          {block.deviceName ? `Device: ${block.deviceName} (tap to switch)` : 'No switchable device found'}
                        </InkText>
                      </GPressable>
                    ) : (
                      <TextInput
                        value={block.prompt ?? ''}
                        onChangeText={(txt) =>
                          setBlocks((prev) =>
                            prev.map((b) => (b.uid === block.uid ? { ...b, prompt: txt } : b)),
                          )
                        }
                        placeholder="Details for this step..."
                        placeholderTextColor={theme.color.textTertiary}
                        multiline
                        style={[
                          bodyText,
                          styles.blockInput,
                          { backgroundColor: theme.color.chrome, borderRadius: theme.radius.md },
                        ]}
                      />
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Action Library Drawer */}
        <View
          style={[
            styles.drawer,
            {
              backgroundColor: theme.color.surface,
              borderColor: theme.color.lineStrong,
              borderWidth: theme.edge.hairlineWidth,
              borderRadius: theme.radius.xl,
            },
          ]}
        >
          <View
            style={[
              styles.searchBar,
              { backgroundColor: theme.color.chrome, borderRadius: theme.radius.pill },
            ]}
          >
            <GIcon name="search" size={15} color={theme.color.textTertiary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search actions"
              placeholderTextColor={theme.color.textTertiary}
              style={[bodyText, styles.searchInput]}
            />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
            {CATEGORIES.map((cat) => (
              <InkChoice
                key={cat.id}
                selected={category === cat.id}
                onSelect={() => {
                  void selectionTick();
                  setCategory(cat.id);
                }}
              >
                {cat.label}
              </InkChoice>
            ))}
          </ScrollView>

          <View style={styles.tplList}>
            {filteredTemplates.map((tpl) => (
              <GPressable
                key={tpl.kind}
                feedback="tint"
                onPress={() => addBlock(tpl)}
                accessibilityRole="button"
                style={[styles.tplPill, { backgroundColor: theme.color.chrome, borderRadius: theme.radius.lg }]}
              >
                <View style={[styles.tplIcon, { backgroundColor: tpl.tint + '22' }]}>
                  <GIcon name={tpl.icon} size={16} color={tpl.tint} />
                </View>
                <View style={styles.flex}>
                  <InkText size="sm" weight="semibold">
                    {tpl.label}
                  </InkText>
                  <InkText size="xs" tone="tertiary">
                    {tpl.hint}
                  </InkText>
                </View>
                <GIcon name="plus" size={16} color={theme.color.accentLine} />
              </GPressable>
            ))}
          </View>
        </View>

        {error ? <InkNotice tone="danger">{error}</InkNotice> : null}

        <InkButton variant="primary" block loading={saving} disabled={saving} onPress={() => void save()}>
          Save Automation
        </InkButton>
      </View>
    </InkSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: Spacing.md, paddingBottom: Spacing.xl },
  section: { gap: Spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  emptyCanvas: {
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: Spacing.lg,
    alignItems: 'center',
  },
  emptyCanvasText: { textAlign: 'center' },
  canvasList: { gap: 4 },
  blockWrap: { gap: 4 },
  connector: { alignItems: 'center', paddingVertical: 2 },
  blockCard: { padding: Spacing.sm, gap: Spacing.xs },
  blockTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  blockIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  blockInput: { paddingHorizontal: 10, paddingVertical: 8 },
  deviceChip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  drawer: { padding: Spacing.md, gap: Spacing.sm },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 38,
    gap: 8,
  },
  searchInput: { flex: 1, paddingVertical: 0 },
  catRow: { gap: Spacing.xs, paddingVertical: 2 },
  tplList: { gap: Spacing.xs },
  tplPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  tplIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
