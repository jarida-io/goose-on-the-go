/**
 * RoleChip — model role assignment badge.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { JaridaPurple, AccentPurple, Grey } from '@/constants/colors';

import { Radii } from '@/constants/radii';
import { Spacing } from '@/constants/spacing';

interface RoleChipProps {
  role: string;
  model: string;
  color: 'secondary' | 'warning' | 'success' | 'primary' | 'danger';
}

const barColors: Record<string, string> = {
  secondary: AccentPurple,
  warning: '#F5A524',
  success: '#17C964',
  primary: '#0072F5',
  danger: '#F31260',
};

const headColors: Record<string, string> = {
  secondary: JaridaPurple[700],
  warning: '#B08000',
  success: '#0E8A4A',
  primary: '#0058C4',
  danger: '#C50E44',
};

export const RoleChip = React.memo(function RoleChip({ role, model, color }: RoleChipProps) {
  return (
    <View style={styles.container}>
      <View style={[styles.bar, { backgroundColor: barColors[color] ?? AccentPurple }]} />
      <View style={styles.body}>
        <Text style={[styles.role, { color: headColors[color] ?? Grey[600] }]}>{role}</Text>
        <Text style={styles.model} numberOfLines={1}>{model}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Grey[200],
    borderRadius: Radii.md,
    overflow: 'hidden',
  },
  bar: {
    width: 4,
  },
  body: {
    flex: 1,
    padding: Spacing.sm,
  },
  role: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.12,
    marginBottom: 4,
  },
  model: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    color: Grey[700],
  },
});
