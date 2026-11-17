/**
 * An icon in the member's chosen accent colour (Appearance > Theme colour). For the marks that
 * used a fixed purple and so stayed purple whatever accent the app was drawn in.
 */

import React from 'react';

import { GIcon, type GIconProps } from '@/components/ui/g-icon';
import { useTheme } from '@/providers/theme-provider';

export function AccentIcon(props: Omit<GIconProps, 'color'>) {
  const { colors } = useTheme();
  return <GIcon {...props} color={colors.textBrand} />;
}
