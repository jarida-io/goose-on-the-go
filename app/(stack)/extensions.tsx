/**
 * ExtensionsScreen — the Pond's built-in extensions, and the marketplace to add more.
 *
 * Replaces the old "App Integrations" and "MCP Servers" screens: the Pond is
 * one process with a fixed set of extensions, not several remote MCP servers,
 * so there is no per-item URL or latency to show (#92).
 */

import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import React, { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import { InkButton, InkEmptyState, InkNotice, InkSegmented, InkSpinner, InkSwitch, InkText, InkTitle, InkInput } from '@/components/ui/ink';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';

import { AccentIcon } from '@/components/ui/accent-icon';
import { GKeyboardScrollView } from '@/components/ui/g-keyboard-view';
import { isIconName } from '@/constants/icons';
import { FontSize, face } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radii } from '@/constants/radii';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { useTheme } from '@/providers/theme-provider';
import { useConfirm } from '@/providers/confirm-provider';
import type { ThemeColors } from '@/constants/colors';
import type { Extension, MarketplaceExtension, SecretRequirement } from '@/services/types';
import { ContentUnavailable } from '@/components/patterns/content-unavailable';
import { isUnavailable } from '@/models/content-state';
import { useContentState } from '@/view-models/use-content-state';
import { usePullToRefresh } from '@/view-models/use-pull-to-refresh';
import { credentialFields, signInFields, useExtensions } from '@/view-models/use-extensions';

/** Which of the theme's colours each status wears; the tone flips with the scheme, the fixed values did not. */
function statusColor(status: string, colors: ThemeColors): string | undefined {
  if (status === 'connected') return colors.success;
  if (status === 'error') return colors.danger;
  if (status === 'loading') return colors.textTertiary;
  return undefined;
}

/** One literal key per status, so the key-completeness test can see every one. */
function statusLabel(status: string, t: TFunction): string | null {
  switch (status) {
    case 'connected': return t('extensions.status.connected');
    case 'error': return t('extensions.status.error');
    case 'loading': return t('extensions.status.loading');
    default: return null;
  }
}

/** Installed extension card: toggle plus whatever status the Pond reported. */
export const InstalledCard = React.memo(function InstalledCard({
  extension,
  onToggle,
  onCredentials,
  onRemove,
  signIns = [],
  signingIn,
  onSignIn,
}: {
  extension: Extension;
  onToggle: (name: string, enabled: boolean) => void;
  /** Present when the marketplace entry it came from has credentials to set. */
  onCredentials?: (name: string) => void;
  /** The accounts it signs in to, such as Spotify, from its marketplace entry. */
  signIns?: SecretRequirement[];
  /** The key of the sign-in under way, which shows as busy. */
  signingIn?: string | null;
  onSignIn?: (name: string, requirement: SecretRequirement) => void;
  /** Present only for a marketplace extension; the Pond's built-in ones stay. */
  onRemove?: (name: string) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const tone = extension.status ? statusColor(extension.status, colors) : undefined;
  const statusText = extension.status ? statusLabel(extension.status, t) : null;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.iconWrap}>
          <AccentIcon name={isIconName(extension.kind) ? extension.kind : 'package'} size={20} />
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName}>{extension.name}</Text>
          <Text style={styles.cardDesc} numberOfLines={2}>{extension.description}</Text>
        </View>
        <InkSwitch checked={extension.enabled} onChange={(next) => onToggle(extension.name, next)} />
      </View>

      {tone && statusText ? (
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: tone }]} />
          <Text style={[styles.statusText, { color: tone }]}>{statusText}</Text>
        </View>
      ) : null}

      {extension.last_error ? (
        <Text style={styles.errorText}>{extension.last_error}</Text>
      ) : null}

      {onSignIn && signIns.length > 0 ? (
        <View style={styles.signInBlock}>
          {signIns.map((req) => (
            <InkButton
              key={req.key}
              variant="quiet"
              icon="external"
              onPress={() => onSignIn(extension.name, req)}
              disabled={signingIn != null}
              loading={signingIn === req.key}
            >
              {signingIn === req.key ? t('extensions.signIn.signingIn') : t('extensions.signIn.action', { name: req.display_name })}
            </InkButton>
          ))}
          <Text style={styles.secretDesc}>{t('extensions.signIn.note')}</Text>
        </View>
      ) : null}

      {onCredentials || onRemove ? (
        <View style={styles.actionRow}>
          {onCredentials ? (
            <InkButton variant="quiet" icon="key" onPress={() => onCredentials(extension.name)}>
              {t('extensions.credentials')}
            </InkButton>
          ) : null}
          {onRemove ? (
            <InkButton variant="quiet" icon="trash" onPress={() => onRemove(extension.name)}>
              {t('common.remove')}
            </InkButton>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

type FormMode = 'install' | 'credentials';

/**
 * Every credential an extension asks for, sent with one submit. Write-only: nothing typed
 * here is read back, and what is left blank is not sent, so it keeps what the Pond holds.
 *
 * Installing, it comes first, since the Pond refuses an install that lacks a required
 * secret, and it is also the confirmation that the extension will run on the Pond.
 */
function CredentialsForm({
  item,
  mode,
  busy,
  onSubmit,
  onCancel,
}: {
  item: MarketplaceExtension;
  mode: FormMode;
  busy: boolean;
  onSubmit: (secrets: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const [values, setValues] = useState<Record<string, string>>({});
  const fields = credentialFields(item);

  const filled: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value.trim()) filled[key] = value.trim();
  }
  // An install needs every required field now; a save needs something to save.
  const ready = mode === 'install'
    ? fields.every((f) => !f.required || filled[f.key])
    : Object.keys(filled).length > 0;
  const setValue = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }));

  return (
    <View style={styles.setupCard}>
      <Text style={styles.setupTitle}>{t('extensions.setupTitle', { name: item.name })}</Text>
      <Text style={styles.secretDesc}>
        {mode === 'install'
          ? t('extensions.installConfirmBody', { name: item.name })
          : t('extensions.credentialsBody')}
      </Text>
      {fields.map((req) => {
        const chosen = req.options?.find((o) => o.value === values[req.key]);
        return (
          <View key={req.key} style={styles.secretField}>
            <View style={styles.labelRow}>
              <Text style={styles.secretLabel}>{req.display_name}</Text>
              {req.required ? <Text style={styles.secretDesc}>{t('extensions.required')}</Text> : null}
            </View>
            {req.description ? <Text style={styles.secretDesc}>{req.description}</Text> : null}
            {req.kind === 'choice' ? (
              // A choice is not a secret: its answers are shown, never typed or masked.
              <InkSegmented
                label={req.display_name}
                value={values[req.key] ?? ''}
                options={(req.options ?? []).map((o) => ({ value: o.value, label: o.label, disabled: busy }))}
                onChange={(next) => setValue(req.key, next)}
              />
            ) : (
              <InkInput
                label={req.display_name}
                type="password"
                value={values[req.key] ?? ''}
                onChange={(next) => setValue(req.key, next)}
                disabled={busy}
                placeholder={t('extensions.secretPlaceholder')}
                inputProps={{ autoComplete: 'off', spellCheck: false }}
              />
            )}
            {chosen?.description ? <Text style={styles.secretDesc}>{chosen.description}</Text> : null}
          </View>
        );
      })}
      <View style={styles.formActions}>
        <InkButton variant="quiet" onPress={onCancel} disabled={busy}>{t('common.cancel')}</InkButton>
        <InkButton variant="primary" onPress={() => onSubmit(filled)} disabled={!ready} loading={busy}>
          {mode === 'install'
            ? busy ? t('extensions.installing') : t('extensions.install')
            : busy ? t('extensions.saving') : t('common.save')}
        </InkButton>
      </View>
    </View>
  );
}

/** Marketplace entry not yet installed. */
export const MarketplaceCard = React.memo(function MarketplaceCard({
  item,
  installing,
  onInstall,
  onOpenWebSearch,
}: {
  item: MarketplaceExtension;
  installing: boolean;
  onInstall: (item: MarketplaceExtension) => void;
  onOpenWebSearch: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.iconWrap}>
          <AccentIcon name={isIconName(item.kind) ? item.kind : 'package'} size={20} />
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName}>{item.name}</Text>
          <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
        </View>
      </View>

      {item.built_in ? (
        <BuiltInNote state={item.built_in_state} onOpenWebSearch={onOpenWebSearch} />
      ) : (
        <View style={styles.categoryRow}>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>{item.category}</Text>
          </View>
          <InkButton
            variant="quiet"
            icon="plus"
            onPress={() => onInstall(item)}
            disabled={installing}
          >
            {installing ? t('extensions.installing') : t('extensions.install')}
          </InkButton>
        </View>
      )}
    </View>
  );
});

/**
 * In place of Install for an entry the Pond already covers: says so, and points at the built-in
 * capability when it still needs a key. An older Pond sends no state; the plain label then stands.
 */
function BuiltInNote({
  state,
  onOpenWebSearch,
}: {
  state: MarketplaceExtension['built_in_state'];
  onOpenWebSearch: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const line =
    state === 'on'
      ? t('extensions.builtIn.on')
      : state === 'needs_key'
        ? t('extensions.builtIn.needsKey')
        : state === 'knowledge_off'
          ? t('extensions.builtIn.knowledgeOff')
          : null;
  return (
    <View style={styles.builtIn}>
      <View style={styles.categoryBadge}>
        <Text style={styles.categoryText}>{t('extensions.builtIn.label')}</Text>
      </View>
      {line ? <Text style={styles.cardDesc}>{line}</Text> : null}
      {state === 'needs_key' ? (
        <InkButton variant="quiet" icon="search" onPress={onOpenWebSearch}>
          {t('extensions.builtIn.openWebSearch')}
        </InkButton>
      ) : null}
    </View>
  );
}

export default function ExtensionsScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const confirm = useConfirm();
  const router = useRouter();
  const { data, loading, error, failed, actions } = useExtensions();
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [form, setForm] = useState<{ item: MarketplaceExtension; mode: FormMode } | null>(null);
  const [saving, setSaving] = useState(false);
  const [signingIn, setSigningIn] = useState<string | null>(null);

  const handleToggle = useCallback(
    (name: string, enabled: boolean) => void actions.setEnabled(name, enabled),
    [actions],
  );

  const runInstall = useCallback(
    async (item: MarketplaceExtension, secrets?: Record<string, string>) => {
      setInstallingId(item.id);
      const ok = await actions.install(item, secrets);
      setInstallingId(null);
      return ok;
    },
    [actions],
  );

  /**
   * An extension runs as a program on the Pond's computer -- Filesystem is handed `/` --
   * so an install is confirmed first. One with credentials is confirmed by its form.
   */
  const handleInstall = useCallback(
    async (item: MarketplaceExtension) => {
      if (credentialFields(item).length > 0) {
        setForm({ item, mode: 'install' });
        return;
      }
      const yes = await confirm({
        title: t('extensions.installConfirmTitle', { name: item.name }),
        message: t('extensions.installConfirmBody', { name: item.name }),
        confirmLabel: t('extensions.install'),
      });
      if (yes) void runInstall(item);
    },
    [confirm, runInstall, t],
  );

  const handleCredentials = useCallback(
    (name: string) => {
      const item = data.marketplace.find((m) => m.id === name);
      if (item) setForm({ item, mode: 'credentials' });
    },
    [data.marketplace],
  );

  const confirmRemove = useCallback(
    async (name: string) => {
      const label = data.marketplace.find((m) => m.id === name)?.name ?? name;
      const yes = await confirm({
        title: t('extensions.removeConfirmTitle', { name: label }),
        message: t('extensions.removeConfirmBody', { name: label }),
        confirmLabel: t('common.remove'),
        destructive: true,
      });
      if (yes) void actions.remove(name);
    },
    [actions, confirm, data.marketplace, t],
  );

  const handleSignIn = useCallback(
    async (name: string, requirement: SecretRequirement) => {
      setSigningIn(requirement.key);
      await actions.signIn(name, requirement);
      setSigningIn(null);
    },
    [actions],
  );

  /** Closes the form only on success, so a refused submit keeps what was typed. */
  const handleSubmit = useCallback(
    async (secrets: Record<string, string>) => {
      if (!form) return;
      let ok: boolean;
      if (form.mode === 'install') {
        ok = await runInstall(form.item, Object.keys(secrets).length > 0 ? secrets : undefined);
      } else {
        setSaving(true);
        ok = await actions.saveSecrets(form.item.id, secrets);
        setSaving(false);
      }
      if (ok) setForm(null);
    },
    [actions, form, runInstall],
  );

  // A first read that failed is not an empty Pond: only `failed` decides that the list never
  // arrived. `error` with a list on screen is a pull that failed, said above the list.
  const state = useContentState({
    loading,
    failed,
    hasContent: data.installed.length > 0 || data.available.length > 0,
  });
  const unavailable = isUnavailable(state);
  const pull = usePullToRefresh(actions.refresh);

  return (
    <GKeyboardScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl {...pull} />}
    >
      {state === 'loading' ? (
        <InkSpinner label={t('extensions.loading')} />
      ) : null}

      {!unavailable && error ? (
        <View style={styles.notice}>
          <InkNotice tone="danger">{error}</InkNotice>
        </View>
      ) : null}

      {unavailable ? <ContentUnavailable state={state} reason={error} onRetry={actions.refresh} /> : null}

      {state === 'empty' ? (
        <InkEmptyState icon="package" title={t('extensions.noneTitle')}>
          <InkText>{t('extensions.noneBody')}</InkText>
        </InkEmptyState>
      ) : null}

      {data.installed.length > 0 ? (
        <View style={styles.section}>
          <InkTitle level={3}>{t('extensions.installedTitle')}</InkTitle>
          {data.installed.map((ext) => {
            // Only a marketplace install is named by a marketplace id. The Pond's built-in
            // `giap-*` extensions never are, so they get neither credentials nor Remove.
            const item = data.marketplace.find((m) => m.id === ext.name);
            return (
              <React.Fragment key={ext.name}>
                <InstalledCard
                  extension={ext}
                  onToggle={handleToggle}
                  onCredentials={item && credentialFields(item).length > 0 ? handleCredentials : undefined}
                  onRemove={item ? confirmRemove : undefined}
                  signIns={item ? signInFields(item) : undefined}
                  signingIn={signingIn}
                  onSignIn={handleSignIn}
                />
                {form?.mode === 'credentials' && form.item.id === ext.name ? (
                  <CredentialsForm
                    item={form.item}
                    mode="credentials"
                    busy={saving}
                    onSubmit={handleSubmit}
                    onCancel={() => setForm(null)}
                  />
                ) : null}
              </React.Fragment>
            );
          })}
        </View>
      ) : null}

      {data.available.length > 0 ? (
        <View style={styles.section}>
          <InkTitle level={3}>{t('extensions.marketplaceTitle')}</InkTitle>
          {data.available.map((item) => (
            <React.Fragment key={item.id}>
              <MarketplaceCard
                item={item}
                installing={installingId === item.id}
                onInstall={handleInstall}
                onOpenWebSearch={() => router.push('/(stack)/web-search')}
              />
              {form?.mode === 'install' && form.item.id === item.id ? (
                <CredentialsForm
                  item={item}
                  mode="install"
                  busy={installingId === item.id}
                  onSubmit={handleSubmit}
                  onCancel={() => setForm(null)}
                />
              ) : null}
            </React.Fragment>
          ))}
        </View>
      ) : null}

      <View style={{ height: 32 }} />
    </GKeyboardScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  notice: { marginBottom: Spacing.md, gap: Spacing.sm },
  section: { gap: Spacing.sm, marginBottom: Spacing.lg },

  /* Card */
  card: {
    backgroundColor: c.card,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: c.border,
    marginBottom: Spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.tintSoft,
    marginRight: Spacing.md,
  },
  cardInfo: { flex: 1 },
  cardName: {
    ...face('display', 'bold'),
    fontSize: FontSize.md,
    color: c.text,
  },
  cardDesc: {
    ...face('body', 'regular'),
    fontSize: FontSize.sm,
    color: c.textTertiary,
    marginTop: 2,
  },

  /* Status */
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: {
    ...face('body', 'semibold'),
    fontSize: FontSize.xs,
  },
  errorText: {
    ...face('body', 'regular'),
    fontSize: FontSize.xs,
    color: c.danger,
    marginTop: Spacing.xs,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },

  /* The accounts an installed extension signs in to. */
  signInBlock: {
    alignItems: 'flex-start',
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },

  /* A marketplace entry the Pond already covers, in place of Install. */
  builtIn: {
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },

  /* Category */
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
  },
  categoryBadge: {
    backgroundColor: c.backgroundSecondary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radii.pill,
  },
  categoryText: {
    ...face('body', 'semibold'),
    fontSize: FontSize.xs,
    color: c.textSecondary,
  },

  /* Credentials form */
  setupCard: {
    backgroundColor: c.backgroundSecondary,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
  },
  setupTitle: {
    ...face('display', 'bold'),
    fontSize: FontSize.md,
    color: c.text,
  },
  secretField: { gap: Spacing.xs },
  secretLabel: {
    ...face('body', 'semibold'),
    fontSize: FontSize.sm,
    color: c.text,
  },
  secretDesc: {
    ...face('body', 'regular'),
    fontSize: FontSize.xs,
    color: c.textTertiary,
  },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm },
  formActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm },
});
