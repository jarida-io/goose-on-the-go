/**
 * Models: which model does each job on the Pond, what is downloading, what is on the Pond, and
 * where to get more. Laid out like iPhone Storage: what it costs first, then what holds the space.
 */

import React from 'react';
import { RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { InkSpinner } from '@/components/ui/ink';

import { ContentUnavailable } from '@/components/patterns/content-unavailable';
import { isUnavailable } from '@/models/content-state';
import { useContentState } from '@/view-models/use-content-state';
import { usePullToRefresh } from '@/view-models/use-pull-to-refresh';
import { SettingsGroup, SettingsHeader, SettingsRow, TILE_INSET } from '@/components/settings/settings-list';
import { SettingsScroll } from '@/components/settings/settings-scroll';
import { voiceName } from '@/components/settings/special-rows';
import {
  formatBytes,
  formatMegabytes,
  holderOf,
  MODEL_ROLES,
  titleOf,
} from '@/models/model-library';
import { selectionTick } from '@/services/haptics';
import type { ModelRole } from '@/services/types';
import { roleLabelKey, useModelLibrary } from '@/view-models/use-model-library';
import { usePondSettings } from '@/view-models/use-pond-settings';

function roleHintKey(role: ModelRole) {
  switch (role) {
    case 'chat':
      return 'models.library.roleHint.chat' as const;
    case 'asr':
      return 'models.library.roleHint.asr' as const;
    case 'tts':
      return 'models.library.roleHint.tts' as const;
    case 'embedding':
      return 'models.library.roleHint.embedding' as const;
  }
}

const ROLE_ICON = { chat: 'chat', asr: 'ear', tts: 'voice', embedding: 'memory' } as const;
const ROLE_TILE = { chat: 'purple', asr: 'pink', tts: 'pink', embedding: 'teal' } as const;

export default function ModelsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const lib = useModelLibrary();
  const state = useContentState({ loading: !lib.readFailed, failed: lib.readFailed, hasContent: lib.loaded });
  const { settings } = usePondSettings();
  const pull = usePullToRefresh(lib.actions.refresh);

  const go = (pathname: string, params?: Record<string, string>) => {
    void selectionTick();
    router.push((params ? { pathname, params } : pathname) as never);
  };

  const holderText = (role: ModelRole) => {
    if (role === 'tts' && settings) return voiceName(settings.voice_tts_voice, t);
    const holder = holderOf(lib.models, role);
    return holder ? titleOf(holder) : t('models.library.nothing');
  };

  const disk = formatBytes(lib.disk?.total_bytes);
  const budget = formatMegabytes(lib.memory?.budget_mb);

  return (
    <SettingsScroll refreshControl={<RefreshControl {...pull} />}>
      <SettingsHeader
        icon="models"
        tile="purple"
        title={t('screens.models')}
        description={[t('models.library.page'), disk ? t('models.library.storage', { size: disk }) : null, budget ? t('models.library.budget', { size: budget }) : null]
          .filter(Boolean)
          .join(' ')}
      />

      {!lib.loaded ? (
        isUnavailable(state) ? (
          <ContentUnavailable state={state} reason={lib.error} onRetry={lib.actions.refresh} />
        ) : (
          <InkSpinner label={t('settings.loading')} />
        )
      ) : (
        <>
          <SettingsGroup title={t('models.library.section.jobs')} footer={t('models.library.footer.jobs')} inset={TILE_INSET}>
            {MODEL_ROLES.map((role) => (
              <SettingsRow
                key={role}
                label={t(roleLabelKey(role))}
                description={t(roleHintKey(role))}
                icon={ROLE_ICON[role]}
                tile={ROLE_TILE[role]}
                value={holderText(role)}
                accessory="next"
                onPress={() => (role === 'tts' ? go('/(stack)/settings-speaking') : go('/(stack)/settings-model-role', { role }))}
              />
            ))}
          </SettingsGroup>
        </>
      )}
    </SettingsScroll>
  );
}
