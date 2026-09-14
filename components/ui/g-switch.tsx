/**
 * GSwitch — Toggle switch with optional label.
 *
 * Wraps React Native's built-in Switch with Jarida brand colors.
 *
 * @example
 *   <GSwitch label="Dark Mode" value={isDark} onValueChange={setIsDark} />
 */

import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { Brand, Grey, AccentPurple } from '@/constants/colors';

import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

export interface GSwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  label?: string;
}

export function GSwitch({
  value,
  onValueChange,
  disabled = false,
  label,
}: GSwitchProps) {
  return (
    <View style={styles.container}>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: Grey[300], true: AccentPurple }}
        thumbColor={Brand.white}
        ios_backgroundColor={Grey[300]}
      />
      {label && (
        <Text style={[styles.label, disabled && styles.labelDisabled]}>
          {label}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    marginLeft: Spacing.sm,
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
    color: Grey[700],
  },
  labelDisabled: {
    color: Grey[400],
  },
});
