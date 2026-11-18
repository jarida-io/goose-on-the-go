/**
 * SchedulesTab — unified Schedules & Automations in the bottom tab bar.
 */

import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { InkText, InkTitle } from '@/components/ui/ink';

import { ChromePuck, PUCK_SIZE } from '@/components/patterns/chrome-puck';
import { UnifiedSchedulesView } from '@/components/patterns/unified-schedules';
import type { ThemeColors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { useBottomBarInset, useChromeScroll } from '@/providers/chrome-provider';
import { selectionTick } from '@/services/haptics';
import { PullSectionsProvider, usePullSections, usePullToRefresh } from '@/view-models/use-pull-to-refresh';

export default function SchedulesTab() {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const bottomInset = useBottomBarInset();
  const chrome = useChromeScroll();
  const { registry, reload } = usePullSections();
  const pull = usePullToRefresh(reload);
  const [composerOpen, setComposerOpen] = useState(false);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        {...chrome}
        style={styles.container}
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomInset + PUCK_SIZE + Spacing['2xl'] }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl {...pull} />}
      >
        <InkTitle
          style={{
            fontStyle: 'normal',
            fontWeight: '800',
            fontSize: 34,
            lineHeight: 42,
            transform: [],
          }}
        >
          {t('screens.schedule')}
        </InkTitle>
        <InkText size="sm" tone="secondary" style={styles.subtitle}>
          Routines on a clock and event-driven automations.
        </InkText>

        <PullSectionsProvider value={registry}>
          <UnifiedSchedulesView
            composerOpen={composerOpen}
            onCloseComposer={() => setComposerOpen(false)}
          />
        </PullSectionsProvider>
      </ScrollView>

      <View pointerEvents="box-none" style={[styles.fabWrap, { bottom: bottomInset + Spacing.sm }]}>
        <ChromePuck
          icon="plus"
          label={t('schedule.list.newSchedule')}
          onPress={() => {
            void selectionTick();
            setComposerOpen(true);
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    container: { flex: 1 },
    scroll: { padding: Spacing.lg, gap: Spacing.md },
    subtitle: { marginBottom: Spacing.xs },
    fabWrap: { position: 'absolute', right: Spacing.lg },
  });
