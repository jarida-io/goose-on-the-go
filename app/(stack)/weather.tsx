/**
 * WeatherScreen — full outdoor conditions, sun times, and 3-day forecast for the Pond's location.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  InkBadge,
  InkButton,
  InkCard,
  InkEmptyState,
  InkEyebrow,
  InkNotice,
  InkSpinner,
  InkText,
  inkText,
  useInkTheme,
} from '@/components/ui/ink';

import { GIcon } from '@/components/ui/g-icon';
import { GPressable } from '@/components/ui/g-pressable';
import { Spacing } from '@/constants/spacing';
import { conditionIcon } from '@/models/weather-card';
import { api } from '@/services/api-client';
import type { WeatherResponse } from '@/services/types';

function formatSunTime(raw?: string): string {
  if (!raw) return '—';
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  const match = raw.match(/T?(\d{2}:\d{2})/);
  return match ? match[1] : raw;
}

export default function WeatherScreen() {
  const theme = useInkTheme();
  const router = useRouter();
  const [data, setData] = useState<WeatherResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await api.weather();
      setData(res);
    } catch {
      setError('Could not load weather from your Pond.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const icon = data
    ? conditionIcon(data.cond ?? '', typeof data.is_day === 'boolean' ? data.is_day : null)
    : 'cloud';

  const heroTint = !data
    ? theme.color.surface
    : data.is_day === false
      ? '#1B1A3A'
      : (data.cond ?? '').toLowerCase().includes('rain') || (data.cond ?? '').toLowerCase().includes('storm')
        ? '#1A2738'
        : '#1E293B';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.color.bg }]} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
      >
        {loading && !data ? <InkSpinner label="Reading outdoor weather..." /> : null}
        {error ? <InkNotice tone="danger">{error}</InkNotice> : null}

        {data && !data.enabled ? (
          <InkEmptyState icon="cloud" title="Local weather is off">
            <InkText size="sm" tone="secondary">
              Turn on local weather in My Home so Goose can check conditions and forecasts.
            </InkText>
            <InkButton variant="primary" onPress={() => router.push('/(stack)/settings-household')}>
              Open My Home
            </InkButton>
          </InkEmptyState>
        ) : null}

        {data && data.enabled && typeof data.temp === 'number' ? (
          <>
            <InkCard raised contentStyle={styles.hero}>
              <View style={styles.heroTop}>
                <View style={styles.heroPlaceRow}>
                  <GIcon name="pin" size={14} color={theme.color.accentLine} />
                  <InkText size="sm" weight="semibold">
                    {data.location_name || 'Pond Location'}
                  </InkText>
                </View>
                <InkBadge tone={data.is_day === false ? 'info' : 'neutral'}>
                  {data.is_day === false ? 'Night' : 'Daytime'}
                </InkBadge>
              </View>

              <View style={styles.heroMain}>
                <GIcon name={icon} size={56} color={data.is_day === false ? '#A5B4FC' : '#FCD34D'} />
                <View style={styles.heroTempWrap}>
                  <Text
                    style={[
                      inkText(theme, { role: 'display', size: '3xl', weight: theme.weight.bold }).style,
                      styles.heroTemp,
                    ]}
                  >
                    {Math.round(data.temp)}°C
                  </Text>
                  <InkText size="md" weight="medium" tone="secondary">
                    {data.cond || 'Current conditions'}
                  </InkText>
                  {typeof data.hi === 'number' && typeof data.lo === 'number' ? (
                    <InkText size="xs" tone="secondary">
                      High {Math.round(data.hi)}°C · Low {Math.round(data.lo)}°C
                    </InkText>
                  ) : null}
                </View>
              </View>
            </InkCard>

            <View style={styles.statRow}>
              <InkCard raised={false} style={styles.statCard} contentStyle={styles.statTile}>
                <View style={styles.statHead}>
                  <GIcon name="droplet" size={15} color={theme.color.accentLine} />
                  <InkEyebrow>HUMIDITY</InkEyebrow>
                </View>
                <InkText size="xl" weight="bold">
                  {typeof data.hum === 'number' ? `${Math.round(data.hum)}%` : '—'}
                </InkText>
              </InkCard>

              <InkCard raised={false} style={styles.statCard} contentStyle={styles.statTile}>
                <View style={styles.statHead}>
                  <GIcon name="fan" size={15} color={theme.color.accentLine} />
                  <InkEyebrow>WIND</InkEyebrow>
                </View>
                <InkText size="xl" weight="bold">
                  {typeof data.wind === 'number' ? `${Math.round(data.wind)} km/h` : '—'}
                </InkText>
              </InkCard>
            </View>

            <View style={styles.statRow}>
              <InkCard raised={false} style={styles.statCard} contentStyle={styles.statTile}>
                <View style={styles.statHead}>
                  <GIcon name="sun" size={15} color="#FBBF24" />
                  <InkEyebrow>SUNRISE</InkEyebrow>
                </View>
                <InkText size="lg" weight="bold">
                  {formatSunTime(data.sunrise)}
                </InkText>
              </InkCard>

              <InkCard raised={false} style={styles.statCard} contentStyle={styles.statTile}>
                <View style={styles.statHead}>
                  <GIcon name="moon" size={15} color="#A5B4FC" />
                  <InkEyebrow>SUNSET</InkEyebrow>
                </View>
                <InkText size="lg" weight="bold">
                  {formatSunTime(data.sunset)}
                </InkText>
              </InkCard>
            </View>

            {data.forecast && data.forecast.length > 0 ? (
              <InkCard raised={false} contentStyle={styles.forecastCard}>
                <InkEyebrow>UPCOMING FORECAST</InkEyebrow>
                <View style={styles.forecastList}>
                  {data.forecast.map((day, idx) => (
                    <View
                      key={`${day.d}-${idx}`}
                      style={[
                        styles.forecastRow,
                        idx > 0 && { borderTopWidth: theme.edge.hairlineWidth, borderTopColor: theme.color.line },
                      ]}
                    >
                      <InkText size="md" weight="semibold" style={styles.forecastDay}>
                        {day.d}
                      </InkText>
                      <GIcon
                        name={conditionIcon(day.i, true)}
                        size={20}
                        color={theme.color.accentLine}
                      />
                      <InkText size="md" weight="bold" style={styles.forecastTemp}>
                        {Math.round(day.t)}°C
                      </InkText>
                    </View>
                  ))}
                </View>
              </InkCard>
            ) : null}

            <GPressable onPress={() => router.push('/(stack)/settings-household')} accessibilityRole="button">
              <InkCard raised={false} contentStyle={styles.locationFooter}>
                <View style={styles.locationWords}>
                  <InkText size="sm" weight="semibold">
                    Weather location
                  </InkText>
                  <InkText size="xs" tone="secondary">
                    Change where Goose checks local weather in My Home
                  </InkText>
                </View>
                <GIcon name="chevron-right" size={18} color={theme.color.textTertiary} />
              </InkCard>
            </GPressable>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing['4xl'] },
  hero: { gap: Spacing.md, padding: Spacing.lg },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroPlaceRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroMain: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  heroTempWrap: { flex: 1, gap: 2 },
  heroTemp: { fontSize: 48, lineHeight: 54 },
  statRow: { flexDirection: 'row', gap: Spacing.sm },
  statCard: { flex: 1 },
  statTile: { gap: Spacing.xs },
  statHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  forecastCard: { gap: Spacing.sm },
  forecastList: { marginTop: Spacing.xs },
  forecastRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.sm },
  forecastDay: { width: 72 },
  forecastTemp: { minWidth: 54, textAlign: 'right' },
  locationFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  locationWords: { flex: 1, gap: 2 },
});
