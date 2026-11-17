/**
 * The back control in every stack screen's header.
 *
 * These screens are pushed from the tab group through the *root* stack, so the nested navigator in
 * `app/(stack)/_layout.tsx` has exactly one entry in its own history and suppresses the system back
 * button. Without this, every one of them is a dead end reachable only by the edge-swipe gesture --
 * which is invisible, and which a person who has turned it off does not have at all.
 *
 * A screen with history of its own, such as a folder opened in place in Files, passes `onPress` to
 * go back through that first; it decides when to hand back to the router.
 */

import { useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { GIcon } from '@/components/ui/g-icon';
import { GPressable } from '@/components/ui/g-pressable';
import { useTheme } from '@/providers/theme-provider';
import { selectionTick } from '@/services/haptics';

export function BackButton({ onPress }: { onPress?: () => void }) {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const back = useCallback(() => {
    void selectionTick();
    if (onPress) onPress();
    else router.back();
  }, [onPress, router]);

  return (
    <GPressable onPress={back} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')}>
      <GIcon name="chevron-left" size={22} color={colors.textBrand} />
    </GPressable>
  );
}
