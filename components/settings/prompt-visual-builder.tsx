import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { InkChip, InkText, InkTextArea, useInkTheme } from '@/components/ui/ink';
import { GPressable } from '@/components/ui/g-pressable';
import { GIcon } from '@/components/ui/g-icon';
import { Spacing } from '@/constants/spacing';
import { selectionTick } from '@/services/haptics';

export interface PromptSection {
  id: string;
  tag: string | null;
  body: string;
}

const TAG_LABELS: Record<string, string> = {
  identity: 'Identity',
  personality: 'Personality',
  tone: 'Tone & Style',
  rules: 'Rules',
  boundaries: 'Boundaries',
  heartbeat: 'Check-in Routine',
  scratchpad: 'Memory & Notes',
  context: 'Home Context',
  instructions: 'Instructions',
};

const TEMPLATE_VARS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'assistant_name', label: 'Assistant name' },
  { key: 'user_name', label: 'Your name' },
  { key: 'personality', label: 'Personality' },
  { key: 'timezone', label: 'Timezone' },
  { key: 'location', label: 'Location' },
];

const QUICK_TRAITS: ReadonlyArray<{ label: string; text: string }> = [
  { label: 'Be concise', text: 'Keep replies short and to the point.' },
  { label: 'Ask before acting', text: 'Always ask before making irreversible changes.' },
  { label: 'Warm & friendly', text: 'Keep a warm, supportive tone.' },
  { label: 'Use bullet points', text: 'Use clear bullet points when listing steps or options.' },
];

const SECTION_PRESETS: ReadonlyArray<{ tag: string; label: string }> = [
  { tag: 'tone', label: '+ Tone' },
  { tag: 'rules', label: '+ Rules' },
  { tag: 'boundaries', label: '+ Boundaries' },
];

function labelForTag(tag: string | null): string {
  if (!tag) return 'Instructions';
  const lower = tag.toLowerCase();
  if (TAG_LABELS[lower]) return TAG_LABELS[lower];
  const spaced = tag.replace(/[_-]+/g, ' ').trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : 'Section';
}

/** Splits XML-tagged blocks (`<tag>...</tag>`) into editable sections while keeping plain text intact. */
export function parsePromptSections(content: string): PromptSection[] {
  const tagRe = /<([a-zA-Z0-9_-]+)>\s*([\s\S]*?)\s*<\/\1>/g;
  const sections: PromptSection[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = tagRe.exec(content)) !== null) {
    const before = content.slice(lastIndex, match.index).trim();
    if (before) {
      sections.push({ id: `plain-${idx++}`, tag: null, body: before });
    }
    sections.push({ id: `${match[1]}-${idx++}`, tag: match[1], body: match[2].trim() });
    lastIndex = match.index + match[0].length;
  }

  const after = content.slice(lastIndex).trim();
  if (after || sections.length === 0) {
    sections.push({ id: `plain-${idx++}`, tag: null, body: after });
  }
  return sections;
}

export function serializePromptSections(sections: PromptSection[]): string {
  return sections
    .map((s) => (s.tag ? `<${s.tag}>\n${s.body.trim()}\n</${s.tag}>` : s.body.trim()))
    .filter(Boolean)
    .join('\n\n');
}

export function PromptVisualBuilder({
  content,
  onChange,
}: {
  content: string;
  onChange: (next: string) => void;
}) {
  const theme = useInkTheme();
  const sections = useMemo(() => parsePromptSections(content), [content]);
  const [focusedIdx, setFocusedIdx] = useState(0);
  const activeIdx = Math.min(focusedIdx, Math.max(0, sections.length - 1));

  const updateSection = (index: number, body: string) => {
    const next = sections.map((s, i) => (i === index ? { ...s, body } : s));
    onChange(serializePromptSections(next));
  };

  const removeSection = (index: number) => {
    if (sections.length <= 1) return;
    void selectionTick();
    const next = sections.filter((_, i) => i !== index);
    setFocusedIdx(Math.max(0, index - 1));
    onChange(serializePromptSections(next));
  };

  const addSection = (tag: string) => {
    void selectionTick();
    const next = [...sections, { id: `${tag}-${sections.length}`, tag, body: '' }];
    setFocusedIdx(next.length - 1);
    onChange(serializePromptSections(next));
  };

  const appendToActive = (snippet: string) => {
    void selectionTick();
    const current = sections[activeIdx];
    if (!current) return;
    const trimmed = current.body.trimEnd();
    const sep = trimmed.length === 0 ? '' : trimmed.endsWith('\n') ? '' : ' ';
    updateSection(activeIdx, `${trimmed}${sep}${snippet}`);
  };

  const activeBody = sections[activeIdx]?.body ?? '';

  return (
    <View style={styles.root}>
      {sections.map((section, index) => {
        const isActive = index === activeIdx;
        return (
          <View
            key={`${section.tag ?? 'plain'}-${index}`}
            style={[
              styles.sectionCard,
              {
                backgroundColor: theme.color.surface,
                borderColor: isActive ? theme.color.accentLine : theme.color.chrome,
              },
            ]}
          >
            <View style={styles.sectionHeader}>
              <GPressable onPress={() => setFocusedIdx(index)} style={styles.sectionTitlePress}>
                <Text style={[styles.sectionTitle, { color: theme.color.text }]}>
                  {labelForTag(section.tag)}
                </Text>
              </GPressable>
              {sections.length > 1 ? (
                <GPressable
                  onPress={() => removeSection(index)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${labelForTag(section.tag)}`}
                >
                  <GIcon name="x" size={16} color={theme.color.textTertiary} />
                </GPressable>
              ) : null}
            </View>
            <InkTextArea
              value={section.body}
              onChange={(text) => {
                setFocusedIdx(index);
                updateSection(index, text);
              }}
              rows={Math.max(3, Math.min(8, section.body.split('\n').length + 1))}
              placeholder={`Describe ${labelForTag(section.tag).toLowerCase()}...`}
            />
          </View>
        );
      })}

      <View style={styles.paletteGroup}>
        <InkText size="sm" tone="secondary">
          Insert context into {labelForTag(sections[activeIdx]?.tag ?? null)}
        </InkText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {TEMPLATE_VARS.map((v) => {
            const token = `{{${v.key}}}`;
            const present = activeBody.includes(token);
            return (
              <InkChip key={v.key} selected={present} onPress={() => appendToActive(token)}>
                {present ? `✓ ${v.label}` : `+ ${v.label}`}
              </InkChip>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.paletteGroup}>
        <InkText size="sm" tone="secondary">
          Quick traits
        </InkText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {QUICK_TRAITS.map((trait) => {
            const present = activeBody.includes(trait.text);
            return (
              <InkChip key={trait.label} selected={present} onPress={() => !present && appendToActive(trait.text)}>
                {trait.label}
              </InkChip>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.paletteGroup}>
        <InkText size="sm" tone="secondary">
          Add section
        </InkText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {SECTION_PRESETS.map((preset) => (
            <InkChip key={preset.tag} selected={false} onPress={() => addSection(preset.tag)}>
              {preset.label}
            </InkChip>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: Spacing.md,
  },
  sectionCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: Spacing.sm,
    gap: Spacing.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  sectionTitlePress: {
    flex: 1,
    paddingVertical: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  paletteGroup: {
    gap: Spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingVertical: 2,
  },
});
