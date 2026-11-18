/**
 * MusicScreen — full Now Playing view with album art, live progress, and playback controls.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Image, Linking, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  InkButton,
  InkCard,
  InkEmptyState,
  InkEyebrow,
  InkNotice,
  InkSpinner,
  InkText,
  useInkTheme,
} from '@/components/ui/ink';

import { EqualizerBars } from '@/components/ui/equalizer-bars';
import { GIcon } from '@/components/ui/g-icon';
import { GPressable } from '@/components/ui/g-pressable';
import { Spacing } from '@/constants/spacing';
import { api } from '@/services/api-client';
import { selectionTick } from '@/services/haptics';
import type { NowPlayingResponse } from '@/services/types';

function clock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function MusicScreen() {
  const theme = useInkTheme();
  const router = useRouter();
  const [data, setData] = useState<NowPlayingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [controlling, setControlling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const res = await api.nowPlaying();
      setData(res);
      setElapsedMs(res.progress_ms ?? 0);
    } catch {
      if (!quiet) setError('Could not reach music status on your Pond.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
    const id = setInterval(() => void load(true), 5000);
    return () => clearInterval(id);
  }, [load]);

  // Smoothly advance the progress bar every second while actively playing.
  useEffect(() => {
    if (!data?.playing || !data.duration_ms) return;
    const id = setInterval(() => {
      setElapsedMs((prev) => Math.min(data.duration_ms ?? prev, prev + 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [data?.playing, data?.duration_ms]);

  const sendControl = async (action: 'play' | 'pause' | 'next' | 'previous') => {
    void selectionTick();
    setControlling(action);
    setError(null);
    try {
      await api.musicControl(action);
      setTimeout(() => void load(true), 350);
    } catch {
      setError('Could not control playback right now.');
    } finally {
      setControlling(null);
    }
  };

  const duration = data?.duration_ms ?? 0;
  const pct = duration > 0 ? Math.max(0, Math.min(100, (elapsedMs / duration) * 100)) : 0;
  const isPlaying = Boolean(data?.playing);
  const hasTrack = Boolean(data?.track && data.track.trim().length > 0);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.color.bg }]} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load(true);
            }}
          />
        }
      >
        {loading && !data ? <InkSpinner label="Checking Now Playing..." /> : null}
        {error ? <InkNotice tone="danger">{error}</InkNotice> : null}

        {data && !data.connected ? (
          data.service === 'apple' ? (
            <InkEmptyState icon="music" title="Apple Music is active">
              <InkText size="sm" tone="secondary">
                {data.player ? `Playback is routed through ${data.player}.` : 'Music playback uses Apple Music on your Pond.'}
              </InkText>
            </InkEmptyState>
          ) : (
            <InkEmptyState icon="music" title="No music service connected">
              <InkText size="sm" tone="secondary">
                {data.message || 'Connect Spotify in Connectors to see artwork, live progress, and playback controls.'}
              </InkText>
              <InkButton variant="primary" onPress={() => router.push('/(stack)/goose-connectors')}>
                Open Connectors
              </InkButton>
            </InkEmptyState>
          )
        ) : null}

        {data?.connected && data.error ? (
          <InkNotice tone="warning">{data.message || data.error}</InkNotice>
        ) : null}

        {data?.connected && !data.error ? (
          <>
            <InkCard style={[styles.artCard, { backgroundColor: theme.color.surface }]}>
              {data.album_art ? (
                <Image source={{ uri: data.album_art }} style={styles.artImage} resizeMode="cover" />
              ) : (
                <View style={[styles.artPlaceholder, { backgroundColor: theme.color.accentSoft }]}>
                  <GIcon name="music" size={64} color={theme.color.accentLine} />
                </View>
              )}
              <View style={styles.metaRow}>
                <View style={styles.metaText}>
                  <InkEyebrow>{isPlaying ? 'NOW PLAYING' : hasTrack ? 'PAUSED' : 'IDLE'}</InkEyebrow>
                  <InkText size="xl" weight="bold" numberOfLines={2}>
                    {hasTrack ? data.track : 'Nothing playing'}
                  </InkText>
                  <InkText size="md" tone="secondary" numberOfLines={1}>
                    {data.artist || (hasTrack ? 'Unknown artist' : 'Start playing on Spotify to control it here')}
                  </InkText>
                </View>
                {isPlaying ? <EqualizerBars color={theme.color.accentLine} count={6} height={24} /> : null}
              </View>

              {duration > 0 && hasTrack ? (
                <View style={styles.progressWrap}>
                  <View style={[styles.progressTrack, { backgroundColor: theme.color.lineStrong }]}>
                    <View
                      style={[
                        styles.progressFill,
                        { backgroundColor: theme.color.accent, width: `${pct}%` },
                      ]}
                    />
                  </View>
                  <View style={styles.timeRow}>
                    <InkText size="xs" tone="tertiary">
                      {clock(elapsedMs)}
                    </InkText>
                    <InkText size="xs" tone="tertiary">
                      {clock(duration)}
                    </InkText>
                  </View>
                </View>
              ) : null}

              <View style={styles.controls}>
                <GPressable
                  feedback="lift"
                  disabled={controlling !== null || data.can?.previous === false}
                  onPress={() => void sendControl('previous')}
                  accessibilityRole="button"
                  accessibilityLabel="Previous track"
                  style={[
                    styles.ctrlBtn,
                    { backgroundColor: theme.color.neutralSoft, opacity: data.can?.previous === false ? 0.4 : 1 },
                  ]}
                >
                  <GIcon name="chevron-left" size={24} color={theme.color.text} />
                </GPressable>

                <GPressable
                  feedback="lift"
                  disabled={controlling !== null || (isPlaying ? data.can?.pause === false : data.can?.resume === false)}
                  onPress={() => void sendControl(isPlaying ? 'pause' : 'play')}
                  accessibilityRole="button"
                  accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
                  style={[styles.playBtn, { backgroundColor: theme.color.accent }]}
                >
                  <GIcon
                    name={isPlaying ? 'pause' : 'play'}
                    size={28}
                    color={theme.color.textOnAccent}
                  />
                </GPressable>

                <GPressable
                  feedback="lift"
                  disabled={controlling !== null || data.can?.next === false}
                  onPress={() => void sendControl('next')}
                  accessibilityRole="button"
                  accessibilityLabel="Next track"
                  style={[
                    styles.ctrlBtn,
                    { backgroundColor: theme.color.neutralSoft, opacity: data.can?.next === false ? 0.4 : 1 },
                  ]}
                >
                  <GIcon name="chevron-right" size={24} color={theme.color.text} />
                </GPressable>
              </View>
            </InkCard>

            {data.link ? (
              <InkButton
                variant="quiet"
                onPress={() => {
                  if (data.link) void Linking.openURL(data.link);
                }}
              >
                Open in Spotify
              </InkButton>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['4xl'] },
  artCard: { gap: Spacing.lg, padding: Spacing.lg },
  artImage: { width: '100%', aspectRatio: 1, borderRadius: 16 },
  artPlaceholder: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  metaText: { flex: 1, gap: 4 },
  progressWrap: { gap: 6 },
  progressTrack: { height: 5, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xl, paddingTop: Spacing.xs },
  ctrlBtn: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  playBtn: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
});
