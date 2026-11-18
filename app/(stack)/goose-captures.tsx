/**
 * Pictures you send Goose: screenshots on unless turned off, the albums whose new photos go too,
 * a picture sent by hand, and what Goose read from each, to delete. The phone is asked for its
 * photos only from here; when it refuses, the switches keep the member's choice at the Pond and
 * the screen says what to change in the phone's settings.
 */

import React, { useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { InkButton, InkCheckbox, InkChip, InkNotice, InkSheet, InkSpinner, InkSwitch, InkText } from '@/components/ui/ink';

import { ListSection, SentenceRow } from '@/components/goose/about-parts';
import { GroupRow, InsetGroup } from '@/components/goose/following';
import { RoundButton, ScreenScroll } from '@/components/goose/hub-parts';
import { ContentUnavailable } from '@/components/patterns/content-unavailable';
import { DangerQuietButton } from '@/components/pond/danger-quiet-button';
import { Spacing } from '@/constants/spacing';
import { isUnavailable } from '@/models/content-state';
import { useConfirm } from '@/providers/confirm-provider';
import { useCaptures, type UseCaptures } from '@/view-models/use-captures';
import { useContentState } from '@/view-models/use-content-state';
import { usePullToRefresh } from '@/view-models/use-pull-to-refresh';

function AlbumSheet({ vm, onClose }: { vm: UseCaptures; onClose: () => void }) {
  const { t } = useTranslation();
  const [chosen, setChosen] = useState<string[]>(vm.data.settings.albums);
  const choices = vm.albumChoices ?? [];
  return (
    <InkSheet open onClose={onClose} title={t('goose.captures.albumsChoose')} description={t('goose.captures.albumsBody')} scroll>
      <View style={styles.sheet}>
        {vm.albumChoices === null ? <InkSpinner label={t('goose.captures.loading')} /> : null}
        {choices.map((album) => (
          <InkCheckbox key={album} checked={chosen.includes(album)} label={album} onChange={(on) => setChosen((all) => (on ? [...all, album] : all.filter((a) => a !== album)))} />
        ))}
        <InkButton
          variant="primary"
          block
          onPress={async () => {
            if (await vm.actions.setAlbums(chosen)) onClose();
          }}
        >
          {t('goose.facts.save')}
        </InkButton>
      </View>
    </InkSheet>
  );
}

export default function GooseCapturesScreen() {
  const { t } = useTranslation();
  const ask = useConfirm();
  const vm = useCaptures();
  const pull = usePullToRefresh(vm.actions.reload);
  const [albums, setAlbums] = useState(false);
  const { settings, available, pending, captures } = vm.data;
  const state = useContentState({ loading: vm.loading, failed: vm.failed, hasContent: !vm.loading && !vm.failed });

  return (
    <>
      <ScreenScroll pull={pull} gap={Spacing.xl}>
        <InkText tone="secondary">{t('goose.captures.lead')}</InkText>
        {state === 'loading' ? <InkSpinner label={t('goose.captures.loading')} /> : null}
        {isUnavailable(state) ? <ContentUnavailable state={state} reason={vm.error} onRetry={vm.actions.reload} /> : null}
        {state === 'ready' ? (
          <>
            {available ? null : <InkNotice>{t('goose.captures.unavailable')}</InkNotice>}
            <InsetGroup>
              <SentenceRow
                first
                text={t('goose.captures.screenshots')}
                detail={t('goose.captures.screenshotsBody')}
                detailLines={3}
                trailing={<InkSwitch checked={settings.screenshots} label={t('goose.captures.screenshots')} onChange={(on) => void vm.actions.setScreenshots(on)} />}
              />
            </InsetGroup>
            {vm.automatic ? null : <InkNotice>{t('goose.captures.manualOnly')}</InkNotice>}
            {vm.needsAccess ? (
              <InkNotice
                tone="brand"
                action={
                  <InkButton variant="primary" icon="photo" onPress={() => void vm.actions.askAccess()}>
                    {t('goose.captures.allow')}
                  </InkButton>
                }
              >
                {t('goose.captures.needsAccess')}
              </InkNotice>
            ) : null}
            {vm.blocked ? (
              <InkNotice
                tone="warning"
                action={
                  <InkButton variant="quiet" icon="settings" onPress={() => void Linking.openSettings()}>
                    {t('goose.captures.openSettings')}
                  </InkButton>
                }
              >
                {Platform.OS === 'ios' ? t('goose.captures.deniedIos') : t('goose.captures.deniedAndroid')}
              </InkNotice>
            ) : null}
            {vm.limited ? <InkNotice>{t('goose.captures.limited')}</InkNotice> : null}

            <ListSection title={t('goose.captures.albums')}>
              <InkText size="sm" tone="secondary">
                {t('goose.captures.albumsBody')}
              </InkText>
              {settings.albums.length > 0 ? (
                <View style={styles.chips}>
                  {settings.albums.map((album) => (
                    <InkChip key={album} onRemove={() => void vm.actions.setAlbums(settings.albums.filter((a) => a !== album))}>
                      {album}
                    </InkChip>
                  ))}
                </View>
              ) : (
                <InkText tone="secondary">{t('goose.captures.albumsNone')}</InkText>
              )}
              {vm.automatic ? (
                <InkButton
                  variant="quiet"
                  icon="folder"
                  onPress={() => {
                    void vm.actions.loadAlbums();
                    setAlbums(true);
                  }}
                  style={styles.left}
                >
                  {t('goose.captures.albumsChoose')}
                </InkButton>
              ) : null}
            </ListSection>

            {available ? (
              <View style={styles.section}>
                <InkButton variant="primary" icon="photo" loading={vm.sending} disabled={vm.sending} onPress={() => void vm.actions.sendPicture()} style={styles.left}>
                  {vm.sending ? t('goose.captures.sending') : t('goose.captures.send')}
                </InkButton>
                {pending > 0 ? (
                  <InkText size="sm" tone="secondary">
                    {t('goose.captures.waiting', { count: pending })}
                  </InkText>
                ) : null}
              </View>
            ) : null}

            <ListSection title={t('goose.captures.read')}>
              {captures.length > 0 ? (
                <>
                  <InsetGroup>
                    {captures.map((capture, i) => (
                      <GroupRow
                        key={capture.id}
                        first={i === 0}
                        icon={capture.kind === 'photo' ? 'photo' : 'file'}
                        picture={capture.picture ?? undefined}
                        label={capture.description ?? capture.intent ?? capture.album ?? ''}
                        detail={[capture.intent && capture.description ? capture.intent : null, capture.album].filter(Boolean).join(', ') || null}
                        trailing={<RoundButton icon="trash" size={30} label={t('goose.captures.deleteLabel')} onPress={() => void vm.actions.remove(capture)} />}
                      />
                    ))}
                  </InsetGroup>
                  <DangerQuietButton icon="trash" disabled={vm.clearing} onPress={() => void vm.actions.removeAll(ask)}>
                    {t('goose.captures.deleteAll')}
                  </DangerQuietButton>
                </>
              ) : (
                <InkText tone="secondary">{t('goose.captures.empty')}</InkText>
              )}
            </ListSection>
          </>
        ) : null}
      </ScreenScroll>
      {albums ? <AlbumSheet vm={vm} onClose={() => setAlbums(false)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  left: { alignSelf: 'flex-start' },
  sheet: { gap: Spacing.lg, paddingBottom: Spacing.lg },
});
