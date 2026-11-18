/**
 * Choosing which model does one job. Only models on the Pond that can do the job are offered; the
 * rest are a download away.
 */

import React, { useMemo } from 'react';
import { RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { DownloadRow } from '@/components/settings/model-rows';
import { RadioRow } from '@/components/settings/setting-controls';
import { SettingsGroup, SettingsHeader, SettingsRow, TILE_INSET } from '@/components/settings/settings-list';
import { SettingsScroll } from '@/components/settings/settings-scroll';
import {
  candidatesFor,
  downloadsByModel,
  formatMegabytes,
  isDownloaded,
  MODEL_ROLES,
  pondModelId,
  recommendations,
  roleOf,
  rollbackTarget,
  titleOf,
  usesOf,
} from '@/models/model-library';
import { selectionTick } from '@/services/haptics';
import type { ModelRole } from '@/services/types';
import { roleAboutKey, roleLabelKey, useModelLibrary } from '@/view-models/use-model-library';
import { usePullToRefresh } from '@/view-models/use-pull-to-refresh';

export default function ModelRoleScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ role?: string }>();
  const role: ModelRole = MODEL_ROLES.includes(params.role as ModelRole) ? (params.role as ModelRole) : 'chat';
  const lib = useModelLibrary();
  const pull = usePullToRefresh(lib.actions.refresh);
  const candidates = candidatesFor(lib.models, role);
  const lastWorking = rollbackTarget(lib.models, role, lib.lastWorking[role]);
  const downloads = useMemo(
    () =>
      downloadsByModel(lib.downloads).filter((d) => {
        if (d.status === 'done' || d.status === 'cancelled') return false;
        const model = lib.models.find((m) => pondModelId(m) === d.modelId);
        return model ? roleOf(model) === role : true;
      }),
    [lib.downloads, lib.models, role],
  );
  const suggested = useMemo(
    () => recommendations(lib.models).filter((m) => roleOf(m) === role && m.category !== 'tts').slice(0, 4),
    [lib.models, role],
  );
  const offPondCount = useMemo(
    () => lib.models.filter((m) => !isDownloaded(m) && roleOf(m) === role && m.category !== 'tts').length,
    [lib.models, role],
  );
  const titleFor = (modelId: string) => {
    const model = lib.models.find((m) => pondModelId(m) === modelId);
    return model ? titleOf(model) : modelId.split('/').pop() ?? modelId;
  };

  return (
    <SettingsScroll refreshControl={<RefreshControl {...pull} />}>
      <SettingsHeader icon="models" tile="purple" title={t(roleLabelKey(role))} description={t(roleAboutKey(role))} />
      {lastWorking ? (
        <SettingsGroup inset={TILE_INSET}>
          <SettingsRow
            label={t('models.library.switchBack', { name: titleOf(lastWorking) })}
            description={t('models.library.switchBackHint')}
            icon="refresh"
            tile="purple"
            action
            disabled={lib.busy !== null}
            onPress={() => {
              void selectionTick();
              void lib.actions.rollBack(role);
            }}
          />
        </SettingsGroup>
      ) : null}
      <SettingsGroup>
        {candidates.length === 0 ? <SettingsRow label={t('models.library.noCandidates')} /> : null}
        {candidates.map((m) => {
          const holds = usesOf(m).includes(role);
          return (
            <RadioRow
              key={m.id}
              label={titleOf(m)}
              description={[formatMegabytes(m.size_mb), m.engine?.label].filter(Boolean).join(' · ') || null}
              selected={holds}
              disabled={lib.busy !== null}
              onSelect={() => {
                if (holds) return;
                void selectionTick();
                void lib.actions.activate(m);
              }}
            />
          );
        })}
      </SettingsGroup>
      <SettingsGroup inset={TILE_INSET}>
        <SettingsRow
          label={t('models.library.catalog')}
          icon="download"
          tile="blue"
          value={offPondCount > 0 ? String(offPondCount) : null}
          accessory="next"
          onPress={() => {
            void selectionTick();
            router.push('/(stack)/settings-model-catalog');
          }}
        />
        {role === 'chat' ? (
          <SettingsRow
            label={t('models.library.search')}
            icon="search"
            tile="blue"
            accessory="next"
            onPress={() => {
              void selectionTick();
              router.push('/(stack)/settings-model-search');
            }}
          />
        ) : null}
      </SettingsGroup>
      {downloads.length > 0 ? (
        <SettingsGroup title={t('models.library.section.downloading')}>
          {downloads.map((d) => (
            <DownloadRow key={d.modelId} download={d} title={titleFor(d.modelId)} onControl={(action) => void lib.actions.control(d.modelId, action)} />
          ))}
        </SettingsGroup>
      ) : null}
      {suggested.length > 0 ? (
        <SettingsGroup title={t('models.library.section.recommended')} footer={t('models.library.footer.recommended')}>
          {suggested.map((m) => (
            <SettingsRow
              key={m.id}
              label={titleOf(m)}
              description={[m.recommended?.reason, formatMegabytes(m.size_mb)].filter(Boolean).join(' · ')}
              accessory="next"
              onPress={() => {
                void selectionTick();
                router.push({ pathname: '/(stack)/settings-model', params: { id: m.id } } as never);
              }}
            />
          ))}
        </SettingsGroup>
      ) : null}
    </SettingsScroll>
  );
}
