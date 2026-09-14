/**
 * GRadioGroup — Radio option selector.
 *
 * Renders a group of radio buttons in either vertical or horizontal
 * orientation. Each option can have an optional description line.
 *
 * @example
 *   <GRadioGroup
 *     options={[
 *       { value: 'gpt4', label: 'GPT-4', description: 'Most capable model' },
 *       { value: 'claude', label: 'Claude' },
 *     ]}
 *     value={selected}
 *     onValueChange={setSelected}
 *   />
 */

import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Grey, AccentPurple } from '@/constants/colors';

import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GRadioOption {
  value: string;
  label: string;
  description?: string;
}

export type GRadioOrientation = 'vertical' | 'horizontal';

export interface GRadioGroupProps {
  options: GRadioOption[];
  value: string;
  onValueChange: (value: string) => void;
  orientation?: GRadioOrientation;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GRadioGroup({
  options,
  value,
  onValueChange,
  orientation = 'vertical',
}: GRadioGroupProps) {
  return (
    <View
      style={[
        styles.group,
        orientation === 'horizontal' && styles.groupHorizontal,
      ]}
    >
      {options.map((option) => (
        <RadioItem
          key={option.value}
          option={option}
          isSelected={option.value === value}
          onSelect={onValueChange}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// RadioItem
// ---------------------------------------------------------------------------

interface RadioItemProps {
  option: GRadioOption;
  isSelected: boolean;
  onSelect: (value: string) => void;
}

const RadioItem = React.memo(function RadioItem({
  option,
  isSelected,
  onSelect,
}: RadioItemProps) {
  const handlePress = useCallback(
    () => onSelect(option.value),
    [onSelect, option.value],
  );

  return (
    <Pressable onPress={handlePress} style={styles.item}>
      <View
        style={[
          styles.circle,
          isSelected ? styles.circleSelected : styles.circleUnselected,
        ]}
      >
        {isSelected && <View style={styles.innerDot} />}
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.label}>{option.label}</Text>
        {option.description && (
          <Text style={styles.description}>{option.description}</Text>
        )}
      </View>
    </Pressable>
  );
});

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const CIRCLE_SIZE = 16;
const DOT_SIZE = 8;

const styles = StyleSheet.create({
  group: {
    gap: Spacing.md,
  },
  groupHorizontal: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.lg,
  },

  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  circleSelected: {
    borderColor: AccentPurple,
  },
  circleUnselected: {
    borderColor: Grey[300],
  },
  innerDot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: AccentPurple,
  },

  textContainer: {
    marginLeft: Spacing.sm,
    flexShrink: 1,
  },
  label: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
    color: Grey[700],
  },
  description: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Grey[500],
    marginTop: 2,
  },
});
