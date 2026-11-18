// The Pond's data folder, one folder at a time, largest first. What the Pond keeps says why.

import React, { useCallback, useEffect, useRef } from 'react';
import { BackHandler, RefreshControl, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Stack, useFocusEffect } from 'expo-router';
import { InkButton, InkSpinner, useInkTheme } from '@/components/ui/ink';

import { BackButton, BackTitle } from '@/components/navigation/back-button';
import { AdminLockView } from '@/components/pond/admin-lock';
import { SettingsGroup, SettingsMessage } from '@/components/settings/settings-list';
import { SettingsNotice, SettingsScroll } from '@/components/settings/settings-scroll';
import { useSettingsColors, useSettingsStyles, type SettingsColors, type SettingsMetrics, type SettingsType } from '@/components/settings/settings-theme';
import { GIcon } from '@/components/ui/g-icon';
import { GPressable } from '@/components/ui/g-pressable';
import { TileColors } from '@/constants/colors';
import type { IconName } from '@/constants/icons';
import { Spacing } from '@/constants/spacing';
import { sizeWords } from '@/models/pond-admin';
import { useTheme } from '@/providers/theme-provider';
import { confirm, selectionTick } from '@/services/haptics';
import type { AdminFileEntry } from '@/services/types';
import { dayWords, keptLine } from '@/view-models/pond-admin-words';
import { usePondFiles } from '@/view-models/use-pond-files';

const KIND_ICON: Record<AdminFileEntry['kind'], IconName> = {
  directory: 'folder',
  file: 'file',
  symlink: 'link',
};

function EntryRow({
  entry,
  removing,
  onOpen,
  onRemove,
}: {
  entry: AdminFileEntry;
  removing: string | null;
  onOpen: (entry: AdminFileEntry) => void;
  onRemove: (entry: AdminFileEntry) => void;
}) {
  const { t } = useTranslation();
  const styles = useSettingsStyles(makeStyles);
  const colors = useSettingsColors();
  const theme = useInkTheme();
  const { isDark } = useTheme();
  const folder = entry.kind === 'directory';
  const kept = !entry.deletable;
  const day = dayWords(entry.modified_at, new Date());
  const line = kept && entry.reason ? keptLine(entry.reason) : day ? t('myPond.files.modified', { when: day }) : null;
  const size = sizeWords(entry.bytes);
  const iconColor = folder ? (isDark ? theme.color.infoFg : TileColors.blue) : kept ? colors.textTertiary : colors.textSecondary;

  const body = (
    <>
      <GIcon name={KIND_ICON[entry.kind]} size={22} color={iconColor} />
      <View style={styles.names}>
        <Text style={styles.name} numberOfLines={1}>
          {entry.name}
        </Text>
        {line ? <Text style={styles.line}>{line}</Text> : null}
      </View>
      <Text style={styles.size}>{size}</Text>
      {folder ? (
        <GIcon name="chevron-right" size={18} color={colors.textTertiary} strokeWidth={2.5} />
      ) : kept ? (
        <GIcon name="lock" size={16} color={colors.textTertiary} />
      ) : null}
    </>
  );

  return (
    // The delete control sits beside the row, not in it: a button inside a pressable row is hidden
    // from screen readers, and on the web it is a button inside a button.
    <View style={styles.entry}>
      {folder ? (
        <GPressable feedback="none"
          onPress={() => onOpen(entry)}
          accessibilityRole="button"
          accessibilityLabel={t('myPond.files.open', { name: entry.name })}
          accessibilityHint={[size, line].filter(Boolean).join(', ')}
          style={({ pressed }) => [styles.row, entry.deletable && styles.rowBeforeDelete, pressed && { backgroundColor: colors.pressed }]}
        >
          {body}
        </GPressable>
      ) : (
        <View style={[styles.row, entry.deletable && styles.rowBeforeDelete]}>{body}</View>
      )}
      {entry.deletable ? (
        <GPressable
          disabled={removing !== null}
          onPress={() => onRemove(entry)}
          accessibilityRole="button"
          accessibilityLabel={t('myPond.files.deleteNamed', { name: entry.name })}
          style={styles.delete}
        >
          {removing === entry.path ? (
            <InkSpinner label={t('myPond.files.deleting')} size={16} />
          ) : (
            <GIcon name="trash" size={18} color={colors.danger} />
          )}
        </GPressable>
      ) : null}
    </View>
  );
}

export default function PondFilesScreen() {
  const { t } = useTranslation();
  const styles = useSettingsStyles(makeStyles);
  const colors = useSettingsColors();
  const { gate, path, crumbs, entries, total, loading, failed, error, notice, removing, actions } = usePondFiles();

  // A folder is opened in place, so it is not in the stack's history: back, from the header or
  // the phone, steps up one folder, and only leaves Files from the data directory itself.
  //
  // Not usePreventRemove: Files is the only entry in the nested stack, so back removes that whole
  // stack from the root one, and the screen's own beforeRemove never fires. Each way back is
  // caught where it starts instead.
  // The listing shows while the gate is still checking as well as once it is unlocked: opened
  // straight from a link or a notice, Files lists the folder before the gate has answered.
  const locked = gate.phase !== 'unlocked' && gate.phase !== 'checking';
  const inFolder = path !== '' && !locked;
  const up = useRef(actions.up);
  useEffect(() => {
    up.current = actions.up;
  });
  const stepUp = useCallback(() => up.current(), []);
  useFocusEffect(
    useCallback(() => {
      if (!inFolder) return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        void selectionTick();
        stepUp();
        return true;
      });
      return () => sub.remove();
    }, [inFolder, stepUp]),
  );
  const header = (
    <Stack.Screen
      options={{
        headerLeft: () => <BackButton onPress={inFolder ? stepUp : undefined} />,
        headerTitle: ({ children }) => <BackTitle onPress={inFolder ? stepUp : undefined}>{children}</BackTitle>,
      }}
    />
  );

  const open = useCallback(
    (entry: AdminFileEntry) => {
      void selectionTick();
      actions.open(entry);
    },
    [actions],
  );

  const remove = useCallback(
    async (entry: AdminFileEntry) => {
      if (await actions.remove(entry)) void confirm();
    },
    [actions],
  );

  if (locked) {
    return (
      <SettingsScroll typing>
        {header}
        <AdminLockView onRetry={() => void actions.refresh()} />
      </SettingsScroll>
    );
  }

  return (
    <SettingsScroll refreshControl={<RefreshControl refreshing={false} onRefresh={() => void actions.refresh()} />}>
      {header}
      <View style={styles.where} accessibilityLabel={t('myPond.files.where')}>
        <View style={styles.pill}>
          <GIcon name="server" size={14} color={colors.accent} strokeWidth={2.2} />
          {crumbs.map((crumb, i) => {
            const last = i === crumbs.length - 1;
            const label = crumb.name ?? t('myPond.files.root');
            return (
              <View key={crumb.path} style={styles.crumb}>
                {i > 0 ? <GIcon name="chevron-right" size={12} color={colors.accent} strokeWidth={2.5} /> : null}
                {last ? (
                  <Text style={styles.crumbHere} accessibilityRole="header">
                    {label}
                  </Text>
                ) : (
                  <GPressable
                    // The pill is shorter than a finger; the reach makes up the rest of 44.
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                    onPress={() => {
                      void selectionTick();
                      actions.goTo(crumb.path);
                    }}
                    accessibilityRole="link"
                    accessibilityLabel={t('myPond.files.goTo', { name: label })}
                  >
                    <Text style={styles.crumbLink}>{label}</Text>
                  </GPressable>
                )}
              </View>
            );
          })}
        </View>
        {!loading && !failed ? <Text style={styles.total}>{t('myPond.files.total', { size: sizeWords(total) })}</Text> : null}
      </View>

      <Text style={styles.hint}>{t('myPond.files.hint')}</Text>

      <View accessibilityLiveRegion="polite">{notice ? <SettingsNotice tone="success">{notice}</SettingsNotice> : null}</View>
      {error && !failed ? <SettingsNotice tone="danger">{error}</SettingsNotice> : null}

      {loading ? (
        <InkSpinner label={t('myPond.files.loading')} />
      ) : failed ? (
        <View style={styles.failed}>
          <SettingsMessage tone="danger">{error ?? t('myPond.files.readFailed')}</SettingsMessage>
          <InkButton variant="quiet" icon="refresh" onPress={() => void actions.refresh()}>
            {t('common.retry')}
          </InkButton>
        </View>
      ) : entries.length === 0 ? (
        <SettingsMessage>{path === '' ? t('myPond.files.emptyRoot') : t('myPond.files.empty')}</SettingsMessage>
      ) : (
        <SettingsGroup>
          {entries.map((entry) => (
            <EntryRow key={entry.path} entry={entry} removing={removing} onOpen={open} onRemove={(e) => void remove(e)} />
          ))}
        </SettingsGroup>
      )}

      <View style={styles.shield}>
        <GIcon name="shield" size={16} color={colors.textSecondary} />
        <Text style={styles.shieldText}>{t('myPond.files.shield')}</Text>
      </View>
    </SettingsScroll>
  );
}

const makeStyles = (c: SettingsColors, type: SettingsType, m: SettingsMetrics) => ({
  where: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, alignItems: 'center' as const, gap: Spacing.sm, marginBottom: Spacing.md },
  pill: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
    borderRadius: m.radius.pill,
    backgroundColor: c.accentSoft,
  },
  crumb: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  crumbLink: { ...type.value, color: c.accent, textDecorationLine: 'underline' as const },
  crumbHere: { ...type.value, color: c.accent },
  total: type.value,
  hint: { ...type.prose, marginBottom: Spacing.lg },
  failed: { alignItems: 'center' as const, gap: Spacing.md },
  entry: { flexDirection: 'row' as const, alignItems: 'stretch' as const },
  row: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: Spacing.md,
    minHeight: 58,
    paddingHorizontal: m.rowH,
    paddingVertical: Spacing.sm + 2,
  },
  rowBeforeDelete: { paddingRight: 0 },
  names: { flex: 1, minWidth: 0, gap: 1 },
  name: type.label,
  line: type.description,
  size: { ...type.value, fontVariant: ['tabular-nums' as const] },
  delete: { width: m.tapMin, alignSelf: 'center' as const, height: m.tapMin, marginRight: 6, alignItems: 'center' as const, justifyContent: 'center' as const },
  shield: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: Spacing.sm },
  shieldText: { ...type.prose, flex: 1 },
});
