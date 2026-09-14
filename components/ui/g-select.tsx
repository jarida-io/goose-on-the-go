/**
 * GSelect — Modal-based picker for mobile.
 *
 * Renders as a pressable input row with a chevron icon. On press,
 * presents a full-height Modal containing a FlatList of options.
 *
 * @example
 *   <GSelect
 *     label="Model"
 *     options={[
 *       { key: 'gpt4', label: 'GPT-4' },
 *       { key: 'claude', label: 'Claude' },
 *     ]}
 *     selectedKey={model}
 *     onSelectionChange={setModel}
 *     placeholder="Pick a model..."
 *   />
 */

import React, { useCallback, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Brand, Grey, JaridaPurple, AccentPurple } from '@/constants/colors';

import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { Radii } from '@/constants/radii';
import { Spacing } from '@/constants/spacing';
import { GIcon } from './g-icon';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GSelectOption {
  key: string;
  label: string;
}

export interface GSelectProps {
  label?: string;
  options: GSelectOption[];
  selectedKey?: string;
  onSelectionChange?: (key: string) => void;
  placeholder?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GSelect({
  label,
  options,
  selectedKey,
  onSelectionChange,
  placeholder = 'Select...',
}: GSelectProps) {
  const [open, setOpen] = useState(false);

  const selectedOption = options.find((o) => o.key === selectedKey);

  const handleSelect = useCallback(
    (key: string) => {
      onSelectionChange?.(key);
      setOpen(false);
    },
    [onSelectionChange],
  );

  const renderItem = useCallback(
    ({ item }: { item: GSelectOption }) => {
      const isSelected = item.key === selectedKey;
      return (
        <Pressable
          onPress={() => handleSelect(item.key)}
          style={[styles.option, isSelected && styles.optionSelected]}
        >
          <Text
            style={[
              styles.optionText,
              isSelected && styles.optionTextSelected,
            ]}
          >
            {item.label}
          </Text>
          {isSelected && (
            <GIcon name="check" size={16} color={JaridaPurple[700]} />
          )}
        </Pressable>
      );
    },
    [selectedKey, handleSelect],
  );

  const keyExtractor = useCallback((item: GSelectOption) => item.key, []);

  return (
    <View style={styles.wrapper}>
      {label && <Text style={styles.label}>{label}</Text>}

      <Pressable onPress={() => setOpen(true)} style={styles.trigger}>
        <Text
          style={[
            styles.triggerText,
            !selectedOption && styles.placeholder,
          ]}
          numberOfLines={1}
        >
          {selectedOption?.label ?? placeholder}
        </Text>
        <GIcon name="chevron" size={16} color={Grey[400]} />
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{label ?? 'Select'}</Text>
            <Pressable onPress={() => setOpen(false)}>
              <Text style={styles.modalClose}>Done</Text>
            </Pressable>
          </View>
          <FlatList
            data={options}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    fontFamily: FontFamily.body,
    color: Grey[600],
    marginBottom: Spacing.xs,
  },

  // Trigger (looks like GInput bordered)
  trigger: {
    height: 40,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Grey[300],
    backgroundColor: Brand.white,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  triggerText: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: Grey[900],
  },
  placeholder: {
    color: Grey[400],
  },

  // Modal
  modal: {
    flex: 1,
    backgroundColor: Brand.white,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Grey[200],
  },
  modalTitle: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Grey[900],
  },
  modalClose: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: AccentPurple,
  },
  listContent: {
    paddingVertical: Spacing.sm,
  },

  // Option row
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  optionSelected: {
    backgroundColor: JaridaPurple[50],
  },
  optionText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: Grey[700],
  },
  optionTextSelected: {
    color: JaridaPurple[700],
    fontWeight: FontWeight.semibold,
  },
});
