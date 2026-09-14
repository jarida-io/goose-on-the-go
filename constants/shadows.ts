/**
 * Jarida Design System — Platform-aware Shadows
 */

import { Platform, type ViewStyle } from 'react-native';

import { AccentPurple } from './colors';

function shadow(
  ios: { offsetY: number; opacity: number; radius: number; color?: string },
  elevation: number,
): ViewStyle {
  return Platform.select({
    ios: {
      shadowColor: ios.color ?? '#1C1C1C',
      shadowOffset: { width: 0, height: ios.offsetY },
      shadowOpacity: ios.opacity,
      shadowRadius: ios.radius,
    },
    android: { elevation },
    default: {},
  })!;
}

export const Shadows = {
  xs: shadow({ offsetY: 1, opacity: 0.06, radius: 1 }, 1),
  sm: shadow({ offsetY: 1, opacity: 0.08, radius: 3 }, 2),
  md: shadow({ offsetY: 4, opacity: 0.08, radius: 10 }, 4),
  lg: shadow({ offsetY: 12, opacity: 0.12, radius: 28 }, 8),
  brand: shadow({ offsetY: 10, opacity: 0.28, radius: 24, color: AccentPurple }, 8),
} as const;
