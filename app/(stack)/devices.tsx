/**
 * DevicesTab — the devices this Pond has, grouped by the rooms they are in.
 *
 * Every control here is gated on the device's own `capabilities`. That list is
 * what the Matter controller derived from the device's clusters, and it is the
 * fact that stops a contact sensor being offered a power button — an unmapped
 * device arrives with an empty list, which means no controls rather than an
 * error.
 *
 * Reachable devices sort first. A household accumulates rows for things that
 * were unplugged or replaced, and the one being reached for is almost never the
 * dead one.
 *
 * Above them, one row for the pairing lock: whether a new phone has to ask, and
 * how many are asking. It leads to the page that answers them.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  InkButton,
  InkCard,
  InkChoice,
  InkEmptyState,
  InkEyebrow,
  InkNotice,
  InkSpinner,
  InkSwitch,
  InkText,
  InkTitle,
  useInkTheme,
} from '@/components/ui/ink';

import { GIcon } from '@/components/ui/g-icon';
import { GPressable } from '@/components/ui/g-pressable';
import { GRoundButton } from '@/components/ui/g-round-button';
import { useBottomBarInset, useChromeScroll } from '@/providers/chrome-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { selectionTick, toggle } from '@/services/haptics';
import { deviceStyle } from '@/constants/device-style';
import { ALL_ROOMS, UNASSIGNED_ROOM, isAppWindow, roomLabel, supports, useDevices } from '@/view-models/use-devices';
import { lockSummaryWords, usePairingLockSummary } from '@/view-models/use-pairing-lock';
import { ContentUnavailable } from '@/components/patterns/content-unavailable';
import { DeviceEditSheet } from '@/components/patterns/device-edit-sheet';
import { isUnavailable } from '@/models/content-state';
import { useContentState } from '@/view-models/use-content-state';
import type { Device } from '@/services/types';
import { Grey } from '@/constants/colors';
import type { ThemeColors } from '@/constants/colors';
import { FontSize, face } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radii } from '@/constants/radii';

/**
 * Device card. The switch appears only for devices that accept one; a tap opens its name and room.
 * A switch that was just tapped sits where it was put, greyed out, until the Pond confirms it.
 */
const DeviceCard = React.memo(function DeviceCard({
  device,
  power,
  waiting,
  onToggle,
  onEdit,
}: {
  device: Device;
  power: boolean | undefined;
  /** The power asked for and not yet confirmed. */
  waiting: boolean | undefined;
  onToggle: (device: Device, on: boolean) => void;
  onEdit: (device: Device) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const { icon, color } = deviceStyle(device);
  const canPower = supports(device, 'power');
  const on = power ?? false;
  const lit = on && device.is_online;

  const handleToggle = useCallback(
    (next: boolean) => {
      void toggle();
      onToggle(device, next);
    },
    [device, onToggle],
  );

  /**
   * What the device is doing where it says so, and reachability where it does
   * not. Online is not the same fact as on, and it is labelled as one. A
   * dashboard window is open or not, which is no fault either way.
   */
  const appWindow = isAppWindow(device);
  const offline = !device.is_online && !appWindow;
  const detail = appWindow
    ? t(device.is_online ? 'devices.app.open' : 'devices.app.notOpen')
    : offline
      ? t('common.offline')
      : waiting !== undefined
        ? t('devices.waitingForPond')
        : power === undefined
          ? t('common.online')
          : t(power ? 'common.on' : 'common.off');

  return (
    <InkCard style={styles.card} pressable onPress={() => onEdit(device)}>
      <View style={styles.cardTop}>
        <View style={[styles.iconWrap, { backgroundColor: color + '1F' }]}>
          <GIcon name={icon} size={17} color={lit ? color : Grey[500]} />
        </View>
        {canPower ? (
          <InkSwitch
            checked={waiting ?? on}
            onChange={handleToggle}
            disabled={!device.is_online || waiting !== undefined}
          />
        ) : null}
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {device.name}
      </Text>
      <Text style={[styles.detail, (offline || waiting !== undefined) && styles.detailMuted]}>
        {detail}
      </Text>
    </InkCard>
  );
});

type DeviceSubMenu = 'smart' | 'pairing' | 'cameras' | 'audio';

const SUB_MENUS: ReadonlyArray<{ id: DeviceSubMenu; label: string }> = [
  { id: 'smart', label: 'Smart devices' },
  { id: 'pairing', label: 'Pairing' },
  { id: 'cameras', label: 'Cameras' },
  { id: 'audio', label: 'Audio' },
];

function SubMenuRow({
  icon,
  title,
  description,
  onPress,
  divided = false,
}: {
  icon: Parameters<typeof GIcon>[0]['name'];
  title: string;
  description: string;
  onPress: () => void;
  divided?: boolean;
}) {
  const theme = useInkTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <GPressable
      onPress={() => {
        void selectionTick();
        onPress();
      }}
      accessibilityRole="button"
      style={[
        styles.subRow,
        divided && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.color.chrome },
      ]}
    >
      <View style={[styles.subIcon, { backgroundColor: theme.color.chrome }]}>
        <GIcon name={icon} size={17} color={theme.color.accentLine} />
      </View>
      <View style={styles.subText}>
        <InkText weight="semibold">{title}</InkText>
        <InkText size="xs" tone="secondary">
          {description}
        </InkText>
      </View>
      <GIcon name="chevron-right" size={16} color={theme.color.textTertiary} />
    </GPressable>
  );
}

export default function DevicesTab() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const router = useRouter();
  const { data, loading, failed, error, actions } = useDevices();
  const pairing = usePairingLockSummary();
  // A pull draws its own spinner at the top of the list, so the one in the
  // list body stands down while it runs rather than showing two.
  const [pulling, setPulling] = useState(false);
  const [subMenu, setSubMenu] = useState<DeviceSubMenu>('smart');
  const [activeRoom, setActiveRoom] = useState(ALL_ROOMS);
  const [editing, setEditing] = useState<Device | null>(null);
  const chrome = useChromeScroll();
  const bottomInset = useBottomBarInset();

  // A room with nothing in it has nothing to switch here; Home management is where it is kept.
  const occupiedRooms = useMemo(() => data.rooms.filter((r) => r.devices.length > 0), [data.rooms]);
  const visibleRooms = useMemo(
    () => (activeRoom === ALL_ROOMS ? occupiedRooms : occupiedRooms.filter((r) => r.id === activeRoom)),
    [activeRoom, occupiedRooms],
  );

  const handleToggle = useCallback(
    (device: Device, on: boolean) => void actions.setState(device, { power: on }),
    [actions],
  );

  const refreshPairing = pairing.actions.refresh;
  const handleRefresh = useCallback(() => {
    void selectionTick();
    void actions.refresh();
    void refreshPairing();
  }, [actions, refreshPairing]);

  const handlePull = useCallback(async () => {
    setPulling(true);
    try {
      await Promise.all([actions.refresh(), refreshPairing()]);
    } finally {
      setPulling(false);
    }
  }, [actions, refreshPairing]);

  const handleEdit = useCallback((device: Device) => {
    void selectionTick();
    setEditing(device);
  }, []);

  const namedRooms = useMemo(
    () => data.rooms.filter((r) => r.id !== UNASSIGNED_ROOM).map((r) => ({ id: r.id, name: r.name })),
    [data.rooms],
  );

  const pickRoom = useCallback((room: string) => {
    void selectionTick();
    setActiveRoom(room);
  }, []);

  const total = data.devices.length;
  const state = useContentState({ loading, failed, hasContent: total > 0 });
  const unavailable = isUnavailable(state);
  const nothingReachable = total > 0 && data.onlineCount === 0;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.headerActions}>
              <GRoundButton
                icon="refresh"
                label={t('devices.refreshList')}
                onPress={handleRefresh}
                busy={loading}
              />
              {total > 0 ? (
                <GRoundButton
                  icon="plus"
                  tone="primary"
                  label={t('devices.addDevice')}
                  onPress={() => router.push('/(stack)/commission-device')}
                />
              ) : null}
            </View>
          ),
        }}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabsRow}
      >
        {SUB_MENUS.map((item) => (
          <InkChoice
            key={item.id}
            role="radio"
            shape="pill"
            selected={subMenu === item.id}
            onSelect={() => {
              void selectionTick();
              setSubMenu(item.id);
            }}
          >
            {item.label}
          </InkChoice>
        ))}
      </ScrollView>

      {subMenu === 'smart' ? (
        <>
          <View style={styles.header}>
            <Text style={styles.subtitle} numberOfLines={1}>
              {t('devices.count', { count: total })}
              {total > 0 ? ` · ${t('devices.online', { count: data.onlineCount })}` : ''}
              {data.staleFor ? ` · ${t('devices.updatedAgo', { ago: data.staleFor })}` : ''}
            </Text>
          </View>

          {/* Room tabs, derived from the rooms devices are actually in. The
              view-model returns none when there is only one room to show. A tab
              is a room id, not a name: "All" and "Unassigned" are ids too, and
              each comes with its words. */}
          {data.roomTabs.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.tabsScroll}
              contentContainerStyle={styles.tabsRow}
            >
              {data.roomTabs.map((tab) => (
                <InkChoice
                  key={tab.id}
                  role="radio"
                  shape="pill"
                  selected={activeRoom === tab.id}
                  onSelect={() => pickRoom(tab.id)}
                >
                  {tab.label}
                </InkChoice>
              ))}
            </ScrollView>
          ) : null}
        </>
      ) : null}

      {subMenu === 'pairing' ? (
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: bottomInset + Spacing['2xl'] }]}>
          <InkCard raised={false} contentStyle={styles.subCard}>
            <InkEyebrow>PAIRING & ACCESS</InkEyebrow>
            <SubMenuRow
              icon="lock"
              title={t('screens.pairingLock')}
              description={pairing.data?.locked ? 'Locked — new phones require approval' : 'Unlocked — pairing codes work directly'}
              onPress={() => router.push('/(stack)/pairing-lock')}
            />
            <SubMenuRow
              icon="plus"
              title="Pair smart device"
              description="Add a Matter or smart home device to your Pond"
              divided
              onPress={() => router.push('/(stack)/commission-device')}
            />
            <SubMenuRow
              icon="link"
              title="Pond Wi-Fi & Bluetooth"
              description="Connect speakers, keyboards, sensors, and Wi-Fi networks"
              divided
              onPress={() => router.push('/(stack)/pond-connections')}
            />
            <SubMenuRow
              icon="device"
              title="Pair another phone"
              description="Set up Goose On The Go on a household phone"
              divided
              onPress={() => router.push('/(stack)/pond-pairing')}
            />
          </InkCard>
        </ScrollView>
      ) : subMenu === 'cameras' ? (
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: bottomInset + Spacing['2xl'] }]}>
          <InkCard raised={false} contentStyle={styles.subCard}>
            <InkEyebrow>CAMERAS & VISION</InkEyebrow>
            <SubMenuRow
              icon="camera"
              title={t('screens.settingsCameras')}
              description="Camera feeds, detection settings, and room coverage"
              onPress={() => router.push('/(stack)/settings-cameras')}
            />
            <SubMenuRow
              icon="eye"
              title={t('screens.visionEvents')}
              description="Recent people, pets, and motion sightings"
              divided
              onPress={() => router.push('/(stack)/vision-events')}
            />
            <SubMenuRow
              icon="face"
              title={t('screens.faces')}
              description="Manage known household faces for recognition"
              divided
              onPress={() => router.push('/(stack)/faces')}
            />
            <SubMenuRow
              icon="bolt"
              title={t('screens.visionAutomations')}
              description="Automations triggered by camera sightings"
              divided
              onPress={() => router.push('/(stack)/vision-automations')}
            />
          </InkCard>
        </ScrollView>
      ) : subMenu === 'audio' ? (
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: bottomInset + Spacing['2xl'] }]}>
          <InkCard raised={false} contentStyle={styles.subCard}>
            <InkEyebrow>POND AUDIO & VOICE</InkEyebrow>
            <SubMenuRow
              icon="voice"
              title={t('screens.voiceAgent')}
              description="In-room microphone, speaker, and wake word activity"
              onPress={() => router.push('/(stack)/voice-agent')}
            />
            <SubMenuRow
              icon="speaker"
              title={t('screens.settingsSpeaking')}
              description="Speaking voice, accent, pace, and quality"
              divided
              onPress={() => router.push('/(stack)/settings-speaking')}
            />
            <SubMenuRow
              icon="ear"
              title={t('screens.settingsListening')}
              description="Wake word sensitivity and listening preferences"
              divided
              onPress={() => router.push('/(stack)/settings-listening')}
            />
            <SubMenuRow
              icon="link"
              title="Bluetooth speakers & accessories"
              description="Scan and connect audio devices to your Pond"
              divided
              onPress={() => router.push('/(stack)/pond-connections')}
            />
          </InkCard>
        </ScrollView>
      ) : (
      <ScrollView
        {...chrome}
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomInset }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={() => void handlePull()} />}
      >
        {/* The controller can take minutes to come up on first use, and nothing
            can be commissioned until it has. Say so rather than failing later. */}
        {data.matter?.state === 'connecting' ? (
          <InkNotice tone="info">{t('devices.matterStarting')}</InkNotice>
        ) : null}
        {data.matter?.state === 'unreachable' ? (
          <InkNotice tone="warning">{t('devices.matterUnreachable')}</InkNotice>
        ) : null}

        {/* Said once at the top rather than on every card. Twenty-two rows each
            reading "Offline" is the same fact repeated, not twenty-two facts. */}
        {nothingReachable && !loading ? (
          <View style={styles.notice}>
            <InkNotice tone="warning">{t('devices.allOfflineBody')}</InkNotice>
          </View>
        ) : null}

        {/* Grey on their cards too; listed here because this is where they can be taken back. */}
        {data.queued.length > 0 ? (
          <InkCard>
            <View style={styles.notice}>
              <Text style={[styles.detail, styles.detailMuted]}>{t('devices.queuedTitle')}</Text>
              {data.queued.map((c) => {
                const name = data.devices.find((d) => d.id === c.deviceId)?.name ?? c.deviceId;
                return (
                  <View key={c.key} style={styles.queuedRow}>
                    <Text style={[styles.detail, styles.detailMuted]}>
                      {t(c.patch.power ? 'devices.queuedOn' : 'devices.queuedOff', { name })}
                    </Text>
                    <InkButton variant="quiet" onPress={() => actions.cancel(c.deviceId)}>
                      {t('common.cancel')}
                    </InkButton>
                  </View>
                );
              })}
            </View>
          </InkCard>
        ) : null}

        {pairing.data ? (
          <InkCard
            style={styles.pairing}
            pressable
            onPress={() => {
              void selectionTick();
              router.push('/(stack)/pairing-lock');
            }}
          >
            <View style={styles.pairingRow}>
              <GIcon name={pairing.data.locked ? 'lock' : 'unlock'} size={18} color={Grey[500]} />
              <View style={styles.pairingText}>
                <Text style={styles.name}>{t('screens.pairingLock')}</Text>
                <Text style={styles.detail}>{lockSummaryWords(pairing.data)}</Text>
              </View>
              <GIcon name="chevron-right" size={18} color={Grey[500]} />
            </View>
          </InkCard>
        ) : null}

        {loading && !pulling ? <InkSpinner label={t('pond.checking')} /> : null}

        {/* A pull that failed with the grid already on screen. A list that did not load is said
            once, in place of the grid; a switch the Pond refused is said in the snackbar. */}
        {!unavailable && error ? (
          <View style={styles.notice}>
            <InkNotice tone="danger">{error}</InkNotice>
          </View>
        ) : null}

        {/* A list that failed to load is unknown, not empty: "No devices yet" would be a claim
            nobody made. */}
        {unavailable ? <ContentUnavailable state={state} reason={error} onRetry={actions.refresh} /> : null}
        {state === 'empty' ? (
          <InkEmptyState
            icon="device"
            title={t('devices.noneTitle')}
            action={
              <InkButton
                variant="primary"
                onPress={() => router.push('/(stack)/commission-device')}
              >
                {t('devices.addDevice')}
              </InkButton>
            }
          >
            <InkText>{t('devices.noneBody')}</InkText>
          </InkEmptyState>
        ) : null}

        {visibleRooms.map((room) => (
          <View key={room.id} style={styles.roomSection}>
            {/* One room needs no heading — the screen is already that room. */}
            {occupiedRooms.length > 1 ? <InkTitle level={3}>{roomLabel(room)}</InkTitle> : null}
            <View style={styles.grid}>
              {room.devices.map((d) => (
                <DeviceCard
                  key={d.id}
                  device={d}
                  power={data.powerById[d.id]}
                  waiting={data.waitingById[d.id]}
                  onToggle={handleToggle}
                  onEdit={handleEdit}
                />
              ))}
            </View>
          </View>
        ))}

      </ScrollView>
      )}

      {editing ? (
        <DeviceEditSheet
          key={editing.id}
          device={editing}
          rooms={namedRooms}
          roomsEditable={data.roomsEditable}
          onClose={() => setEditing(null)}
          onSave={actions.edit}
          roomNamed={actions.roomNamed}
        />
      ) : null}
    </SafeAreaView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    notice: { marginBottom: Spacing.md },
    queuedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    pairing: { marginBottom: Spacing.lg },
    pairingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    pairingText: { flex: 1, gap: 2 },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.xs,
      paddingBottom: Spacing.xs,
    },
    // Takes the width the buttons leave, and may shrink so the count line
    // truncates rather than pushing the buttons off the row.
    headerText: { flex: 1, minWidth: 0 },
    subtitle: {
      ...face('body', 'regular'),
      fontSize: FontSize.sm,
      color: c.textTertiary,
    },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },

    // Pins this ScrollView's own height to its content instead of letting it
    // compete for leftover flex space in the column layout below — without
    // this, filtering to a room with fewer devices frees up vertical space
    // that gets redistributed into the tab pills instead of staying blank,
    // stretching them tall.
    tabsScroll: { flexGrow: 0, flexShrink: 0 },
    tabsRow: {
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.xs,
      /* Room for the plate under each pill. */
      gap: Spacing.sm,
      alignItems: 'center',
    },

    scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
    roomSection: { marginBottom: Spacing.lg, gap: Spacing.md },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },

    /* InkCard draws its own face and plate. Adding a background, a border and a
       radius on top of that is what turned each card into a purple slab. */
    card: { width: '47%', gap: 2 },
    cardTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: Spacing.xs,
    },
    iconWrap: {
      width: 34,
      height: 34,
      borderRadius: Radii.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    name: {
      ...face('body', 'semibold'),
      fontSize: FontSize.sm,
      color: c.text,
    },
    detail: {
      ...face('body', 'regular'),
      fontSize: FontSize.xs,
      color: c.textSecondary,
    },
    detailMuted: { color: c.textTertiary },
    subCard: { padding: Spacing.md, gap: Spacing.xs },
    subRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
    subIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    subText: { flex: 1, gap: 2 },
  });
