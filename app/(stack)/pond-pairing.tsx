/**
 * PondPairingScreen — the pairing wizard, for joining a Pond that is already set up:
 *   0. Find the GIAP server: discovered over mDNS, scanned from the QR or a setup card, or typed
 *   1. Enter the 6-digit pairing code shown or said by the GIAP host, or its setup card's code
 *   2. Pair under the phone's own name, shown on the code step with Change
 *   3. Run the two-phase handshake and confirm; on a Pond whose pairing lock is on, wait there
 *      for its main member to let this phone in
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { InkButton, InkSpinner, InkFormField, InkInput, InkTitle } from '@/components/ui/ink';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { GIcon } from '@/components/ui/g-icon';
import { AccentIcon } from '@/components/ui/accent-icon';
import { GPressable } from '@/components/ui/g-pressable';
import { GKeyboardView, useFocusedInputReveal } from '@/components/ui/g-keyboard-view';
import { Brand } from '@/constants/colors';
import { FontSize, face } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radii } from '@/constants/radii';
import { PondApiClient } from '@/services/api-client';
import type { PakeCredential } from '@/services/cpace';
import { useServer } from '@/providers/server-provider';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import {
  fingerprintChoices,
  isInsecureDevOrigin,
  normalizePondUrl,
  pickBeforeExchange,
  pinPreview,
  validPin,
  type PinSource,
} from '@/models/connection';
import { isValidSetupCode, readSetupCode, type SetupCard } from '@/models/setup-card';
import { defaultPhoneName } from '@/models/ble-setup';
import { PairingWait } from '@/components/setup/pairing-wait';
import { PhoneName } from '@/components/setup/phone-name';
import type { HeldPairing } from '@/models/pairing-lock';
import type { PairingWaitDeps } from '@/view-models/use-pairing-wait';
import * as Device from 'expo-device';
import { insecureDevMode } from '@/services/dev-mode';
import { randomBytes } from '@/services/secure-random';
import { getInstallId } from '@/services/install-id';
import {
  clearPairingStart,
  peekPairingStart,
  takePairingPayload,
  takeSetupCard,
} from '@/services/pairing-handoff';
import { findPondAt, findPondBySetupId, type DiscoveredPond } from '@/services/discovery';
import { useDiscovery } from '@/view-models/use-discovery';
import {
  describePairingFailure,
  explainRefusedPairing,
  isClaimedRefusal,
  refusalWait,
} from '@/view-models/pairing-errors';
import { useSpokenCode, type UseSpokenCode } from '@/view-models/use-spoken-code';
import { setupNeededNow } from '@/view-models/use-setup-gate';
import { useCountdown } from '@/hooks/use-countdown';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { useTheme } from '@/providers/theme-provider';
import type { ThemeColors } from '@/constants/colors';

type Step = 0 | 1 | 2 | 3;
// Step 2 has no screen: the phone pairs under its own name, which the code step shows.
const STEPS = ['find', 'code', 'complete'] as const;

/**
 * A step's label, one literal key per branch, as the Memories tabs do: a key assembled at runtime
 * is invisible to services/__tests__/i18n.test.ts, and the exhaustive switch makes TypeScript fail
 * if a step is added without one. It takes `t` rather than reaching for a module-level
 * translator: a constant is evaluated at import, before i18next has a language.
 */
function stepLabel(step: (typeof STEPS)[number], t: TFunction): string {
  switch (step) {
    case 'find': return t('pairing.stepFind');
    case 'code': return t('pairing.stepCode');
    case 'complete': return t('pairing.stepDone');
  }
}

/** Step indicator */
function StepIndicator({ current }: { current: Step }) {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  return (
    <View style={styles.stepRow}>
      {STEPS.map((step, i) => {
        const at = current >= 2 ? current - 1 : current;
        const isActive = i === at;
        const isDone = i < at;
        return (
          <View key={step} style={styles.stepItem}>
            <View
              style={[
                styles.stepDot,
                isDone && styles.stepDotDone,
                isActive && styles.stepDotActive,
              ]}
            >
              {isDone ? (
                <GIcon name="check" size={14} color={Brand.white} />
              ) : (
                <Text style={[styles.stepNumber, isActive && styles.stepNumberActive]}>
                  {i + 1}
                </Text>
              )}
            </View>
            <Text style={[styles.stepLabel, isActive && styles.stepLabelActive]}>
              {stepLabel(step, t)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Offers the camera as an alternative to typing.
 *
 * Both steps keep their text inputs: the scanner is unavailable without camera
 * permission, and a QR that will not decode has to have a way past it.
 */
function ScanLink({ onPress }: { onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  return (
    <GPressable onPress={onPress} hitSlop={8} style={styles.scanLink}>
      <AccentIcon name="camera" size={16} />
      <Text style={styles.scanLinkText}>{t('pairing.scanQr')}</Text>
    </GPressable>
  );
}

/**
 * Normalise a hand-typed server address, or return null if it cannot be one.
 *
 * The host machine's dashboard shows a bare `host:port`, so a missing scheme is
 * the common case rather than a mistake; it defaults to https, the scheme of a
 * pinned Pond origin. An explicit `http://` LAN address is accepted only in
 * insecure development mode (see `normalizePondUrl`).
 */
export function normalizeServerUrl(raw: string): string | null {
  try { return normalizePondUrl(raw.trim().includes('://') ? raw.trim() : `https://${raw.trim()}`); }
  catch { return null; }
}

/** What the address field suggests: the plaintext listener's shape only where it is accepted. */
const ADDRESS_PLACEHOLDER = insecureDevMode ? 'http://192.168.1.10:4080' : 'https://pond.local:4443';

/**
 * The body of one wizard step.
 *
 * It scrolls, which matters for two reasons. The step content is centred, so
 * when the keyboard takes half the screen the button under the focused field
 * ends up below the fold — `GKeyboardView` lifts the container, and this makes
 * what it lifted reachable, scrolling the focused field back above the keyboard.
 * And the discovery step grows with however many hubs answer, which is not a
 * number the layout gets to assume.
 */
function StepBody({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  const scroll = useRef<ScrollView>(null);
  const reveal = useFocusedInputReveal(() => scroll.current);
  return (
    <ScrollView
      ref={scroll}
      style={styles.stepScroll}
      contentContainerStyle={[styles.stepContent, styles.stepScrollContent]}
      {...reveal}
    >
      {children}
    </ScrollView>
  );
}

/**
 * Step 0: find the Pond on this network.
 *
 * The server has always advertised `_pond._tcp.local.`; until now nothing
 * listened, so typing an address was the only way in. Discovery hands back a
 * numeric address, which is the part that matters — Android resolves no mDNS,
 * so a `.local` name is unreachable there however it arrives.
 *
 * Typing and scanning stay, one tap away. Multicast is filtered on plenty of
 * guest and office networks, and a hub that cannot be found still has to be
 * pairable.
 */
function DiscoverStep({
  onNext,
  onManual,
  onScan,
}: {
  onNext: (url: string, pin: string | undefined, unclaimed: boolean) => void;
  onManual: () => void;
  onScan: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const { data, error, actions } = useDiscovery();
  // The advertisement already carried a pin, so hand it on rather than making
  // the next step browse for the same record again. It is still only a claim:
  // the next step has the user check it against the Pond's own screen.
  const pick = (pond: DiscoveredPond) => onNext(pond.url, pond.pin, pond.unclaimed);

  return (
    <StepBody>
      {data.phase === 'searching' ? (
        <InkSpinner label={t('pairing.searching')} size={28} />
      ) : (
        <AccentIcon name="search" size={28} />
      )}

      <InkTitle level={2}>
        {data.phase === 'searching' ? t('pond.searching') : t('pairing.addressTitle')}
      </InkTitle>

      {data.phase === 'searching' ? (
        <Text style={styles.stepDesc}>{t('pairing.searching')}</Text>
      ) : null}

      {data.phase === 'empty' ? (
        <Text style={styles.stepDesc}>{t('pairing.noneFound')}</Text>
      ) : null}

      {data.phase === 'failed' ? (
        <Text style={styles.stepError}>{t('pairing.searchFailed', { error })}</Text>
      ) : null}

      {data.ponds.map((pond) => (
        <GPressable
          feedback="lift"
          key={pond.id}
          style={styles.pondRow}
          onPress={() => pick(pond)}
        >
          <AccentIcon name="wifi" size={18} />
          <View style={styles.pondInfo}>
            <Text style={styles.pondName} numberOfLines={1}>
              {pond.name}
            </Text>
            <Text style={styles.pondAddr}>
              {pond.address}:{pond.port}
              {pond.version ? ` · v${pond.version}` : ''}
            </Text>
          </View>
        </GPressable>
      ))}

      {data.phase !== 'searching' ? (
        <InkButton variant="quiet" onPress={actions.retry}>
          {t('common.searchAgain')}
        </InkButton>
      ) : null}

      <GPressable onPress={onManual} hitSlop={8} style={styles.scanLink}>
        <Text style={styles.scanLinkText}>{t('pairing.manual')}</Text>
      </GPressable>
      <ScanLink onPress={onScan} />
    </StepBody>
  );
}

/**
 * Ask the network for the pin of the Pond at `origin`, so the fingerprint field
 * does not have to be typed.
 *
 * Only the Pond's own advertisement is consulted, and only when the address and
 * port both match what was typed. Resolves null when nothing answers, which is
 * what a network that filters multicast looks like and what a Pond running a
 * server older than the `pin` TXT record looks like; the caller asks for the
 * fingerprint by hand in both cases.
 *
 * A pin learned this way is only a claim. mDNS is unauthenticated, so anything
 * on this network can answer with its own key and terminate the phone's TLS.
 * CPace pairing leaves it one guess at the code per attempt rather than the code
 * itself, and the pairing fails visibly, but a wrong pin is still not one to
 * keep. So the user confirms the pin against the Pond's own dashboard before it
 * is used (see ServerStep), the out-of-band check that a QR scan or a typed
 * fingerprint already is.
 */
async function discoverFingerprint(origin: string): Promise<{ pin: string; unclaimed: boolean } | null> {
  const { hostname, port } = new URL(origin);
  const found = await findPondAt(hostname, Number(port) || 443);
  return found?.pin ? { pin: found.pin, unclaimed: found.unclaimed } : null;
}

/**
 * The pin a plaintext development Pond reports for itself, insecure development mode only.
 *
 * Nothing is ever verified against it: a plaintext connection has no key to pin, and the
 * pin it puts into the CPace exchange binds nothing. It is kept so the exchange and the
 * saved pairing have the shape every other pairing has. Asking the user to confirm it
 * would suggest a protection that is not there, so the caller does not.
 */
async function reportedFingerprint(origin: string): Promise<string | null> {
  const info = await new PondApiClient(origin).systemInfo();
  return info.tls_spki_sha256 ?? null;
}

/** Step 0, the fallback: type the address in, and establish whose key it serves. */
function ServerStep({
  initial,
  initialPin,
  picked,
  initialUnclaimed,
  setupExchange,
  onNext,
  onSpokenInstead,
  onScan,
}: {
  initial: string;
  /** The pin discovery already learned for `initial`, when it had one. */
  initialPin: string;
  /**
   * `initial` is a Pond the user picked off a discovery list, not an address they typed.
   * With its pin in hand there is nothing to type, so the step opens on checking that pin
   * against the Pond's screen instead of on an address form waiting for Continue.
   */
  picked: boolean;
  /** The picked Pond advertised itself unclaimed, so its next exchange is a setup one. */
  initialUnclaimed: boolean;
  /** A setup card is in hand, so the exchange that follows is a setup one whatever the Pond advertises. */
  setupExchange: boolean;
  /** `pickSkipped`: the pin is still only what the Pond advertised. */
  onNext: (url: string, pin: string, unclaimed: boolean, pickSkipped: boolean) => Promise<void>;
  /** Stage the advertised pin unpicked and have the Pond say a code, for a Pond with no screen to pick against. */
  onSpokenInstead: (url: string, pin: string) => Promise<void>;
  onScan: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const [pin, setPin] = useState(initialPin);
  // A pin that came off the network rather than from the user must be confirmed
  // against the Pond's screen before it is trusted. See discoverFingerprint.
  const [pinFromNetwork, setPinFromNetwork] = useState(!!initialPin);
  const [networkUnclaimed, setNetworkUnclaimed] = useState(initialUnclaimed && !!initialPin);
  // The three previews are drawn once per pin: offering a fresh set after a wrong
  // pick would let the user guess until one works.
  const [confirming, setConfirming] = useState<{ url: string; pin: string; choices: string[] } | null>(() => {
    // Only what Continue would have reached anyway: a usable address and a well-formed pin.
    // Anything less opens on the form, where the user can see and fix it.
    if (!picked || !validPin(initialPin) || setupExchange || initialUnclaimed) return null;
    const normalized = normalizeServerUrl(initial);
    return normalized
      ? { url: normalized, pin: initialPin, choices: fingerprintChoices(initialPin, randomBytes) }
      : null;
  });
  // After a wrong pick or "none match", nothing more is taken from the network in
  // this step: only a typed fingerprint or a QR scan can continue.
  const [networkPinRefused, setNetworkPinRefused] = useState(false);
  const [url, setUrl] = useState(initial);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Whether to ask for the fingerprint at all.
   *
   * Not asked by default, because on a Pond that publishes its pin nobody
   * should have to know what a fingerprint is. An empty field with that label
   * on it reads as required however the hint under it is worded, so the field
   * appears only once the lookup has actually failed and there is nothing else
   * left to try. Arriving with a pin already in hand -- picked off the
   * discovery list -- never asks.
   */
  const [askForPin, setAskForPin] = useState(false);

  // Reach the Pond before advancing. Without this the address is only exercised
  // three steps later, during the handshake, where a typo surfaces as a failed
  // pairing rather than as a bad address on the screen that asked for it.
  const submit = useCallback(async () => {
    const normalized = normalizeServerUrl(url);
    if (!normalized) {
      setError(t('pairing.invalid'));
      return;
    }
    setChecking(true); setError(null);
    try {
      if (isInsecureDevOrigin(normalized)) {
        const reported = await reportedFingerprint(normalized);
        if (!reported || !validPin(reported)) {
          setError(t('pairing.fingerprintMissing'));
          return;
        }
        await onNext(normalized, reported, false, false);
        return;
      }
      // No fingerprint in hand is a request to look one up, not a mistake: the
      // Pond publishes its own pin beside the service phones already discover
      // it by, so the only things anybody should have to read off a screen are
      // the address and the six-digit code.
      let fingerprint = pin.trim();
      let unclaimed = networkUnclaimed;
      if (!fingerprint && networkPinRefused) {
        setAskForPin(true);
        setError(t('pairing.fingerprintMismatch'));
        return;
      }
      if (!fingerprint) {
        const discovered = await discoverFingerprint(normalized);
        if (!discovered) {
          // Only now is there a question worth putting to the user. A Pond
          // running a server older than the pin record looks like this, and so
          // does a network that filters multicast.
          setAskForPin(true);
          setError(t('pairing.fingerprintMissing'));
          return;
        }
        setPin(discovered.pin);
        setPinFromNetwork(true);
        setNetworkUnclaimed(discovered.unclaimed);
        fingerprint = discovered.pin;
        unclaimed = discovered.unclaimed;
      }
      if (!validPin(fingerprint)) {
        setError(t('pairing.invalid'));
        return;
      }
      if (pinFromNetwork || fingerprint !== pin.trim()) {
        // No pick-from-three before a setup exchange: it is bound to the Pond's real pin through the
        // channel identifier, so a spoofed pin can only fail, never succeed.
        if (setupExchange || unclaimed) {
          await onNext(normalized, fingerprint, unclaimed, true);
          return;
        }
        setConfirming({ url: normalized, pin: fingerprint, choices: fingerprintChoices(fingerprint, randomBytes) });
        return;
      }
      await onNext(normalized, fingerprint, false, false);
    }
    catch (error) { setError(error instanceof Error ? error.message : t('pairing.failed')); }
    finally { setChecking(false); }
  }, [url, pin, pinFromNetwork, networkUnclaimed, networkPinRefused, setupExchange, onNext, t]);

  const rejectMatch = useCallback(() => {
    setConfirming(null);
    setPin('');
    setPinFromNetwork(false);
    setNetworkUnclaimed(false);
    setNetworkPinRefused(true);
    setAskForPin(true);
    setError(t('pairing.fingerprintMismatch'));
  }, [t]);

  // Only the preview of the pin in hand proceeds; a decoy is the same as "none match".
  const pick = useCallback(async (choice: string) => {
    if (!confirming) return;
    if (choice !== pinPreview(confirming.pin)) { rejectMatch(); return; }
    setChecking(true); setError(null);
    try { await onNext(confirming.url, confirming.pin, false, false); }
    catch (error) { setError(error instanceof Error ? error.message : t('pairing.failed')); }
    finally { setChecking(false); setConfirming(null); }
  }, [confirming, onNext, rejectMatch, t]);

  // No pick-from-three before a spoken code: the pairing exchange binds the pin in the channel
  // identifier just as a setup one does, so a spoofed pin can only fail, never succeed.
  const speakInstead = useCallback(async () => {
    if (!confirming) return;
    setChecking(true); setError(null);
    try { await onSpokenInstead(confirming.url, confirming.pin); }
    catch (error) { setError(error instanceof Error ? error.message : t('pairing.failed')); }
    finally { setChecking(false); }
  }, [confirming, onSpokenInstead, t]);

  if (confirming) {
    return (
      <StepBody>
        <AccentIcon name="shield" size={28} />
        <InkTitle level={2}>{t('pairing.fingerprintConfirmTitle')}</InkTitle>
        <Text style={styles.stepDesc}>{t('pairing.fingerprintConfirmDesc')}</Text>
        {confirming.choices.map((choice) => (
          <GPressable
            key={choice}
            style={styles.fingerprintChoice}
            disabled={checking}
            onPress={() => void pick(choice)}
            accessibilityRole="button"
            accessibilityLabel={t('pairing.fingerprintChoiceLabel', { groups: choice.replace('sha256/', '').split(' ').join(', ') })}
          >
            <Text style={styles.pinPreview}>{choice}</Text>
          </GPressable>
        ))}
        <Text style={styles.stepDesc}>{t('pairing.fingerprintConfirmWhy')}</Text>
        {error ? <Text style={styles.stepError}>{error}</Text> : null}
        {checking ? <Text style={styles.stepDesc}>{t('pairing.fingerprintSearching')}</Text> : null}
        <InkButton variant="quiet" disabled={checking} onPress={rejectMatch}>
          {t('pairing.fingerprintNoneMatch')}
        </InkButton>
        <InkButton variant="quiet" icon="volume" disabled={checking} onPress={() => void speakInstead()}>
          {t('pairing.fingerprintNoScreen')}
        </InkButton>
      </StepBody>
    );
  }

  return (
    <StepBody>
      <AccentIcon name="search" size={28} />
      <InkTitle level={2}>{t('pairing.addressTitle')}</InkTitle>
      <InkFormField
        label={t('pairing.addressLabel')}
        hint={insecureDevMode ? t('devMode.addressHint') : undefined}
        style={styles.inputGroup}
      >
        <InkInput
          label={t('pairing.addressLabel')}
          type="url"
          value={url}
          onChange={(next) => {
            setUrl(next);
            setError(null);
          }}
          placeholder={ADDRESS_PLACEHOLDER}
          disabled={checking}
          onSubmit={submit}
        />
      </InkFormField>
      {askForPin ? (
        <InkFormField label={t('pairing.fingerprint')} hint={t('pairing.fingerprintHint')} style={styles.inputGroup}>
          <InkInput
            label={t('pairing.fingerprint')}
            value={pin}
            onChange={(next) => {
              setPin(next);
              setPinFromNetwork(false);
              setNetworkUnclaimed(false);
              setError(null);
            }}
            placeholder="sha256/..."
            disabled={checking}
            inputProps={{ autoCapitalize: 'none', autoCorrect: false, spellCheck: false }}
          />
        </InkFormField>
      ) : null}
      {error ? <Text style={styles.stepError}>{error}</Text> : null}
      <InkButton variant="primary" disabled={!url.trim()} loading={checking} onPress={submit}>
        {checking ? t('pairing.fingerprintSearching') : t('pairing.continueAction')}
      </InkButton>
      <ScanLink onPress={onScan} />
    </StepBody>
  );
}

/** A link-styled action under a step's main button. */
function TextAction({ label, onPress }: { label: string; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <GPressable onPress={onPress} hitSlop={8} style={styles.scanLink}>
      <Text style={styles.scanLinkText}>{label}</Text>
    </GPressable>
  );
}

/** Asks the Pond to read a pairing code aloud, for a household member with no card and no screen to read. */
function SpokenCodeAction({ spoken, onSpoken }: { spoken: UseSpokenCode; onSpoken: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const { data, error, actions } = spoken;
  const label = data.phase === 'asking'
    ? t('pairing.spokenAsking')
    : data.phase === 'spoken' ? t('pairing.spokenAgain') : t('pairing.spokenAsk');
  return (
    <View style={styles.inputGroup}>
      <InkButton
        variant="quiet"
        icon="volume"
        disabled={data.phase === 'asking' || data.waitSecs > 0}
        onPress={() => void actions.ask().then((said) => { if (said) onSpoken(); })}
      >
        {label}
      </InkButton>
      {error ? <Text style={styles.stepError}>{error}</Text> : null}
    </View>
  );
}

/** Step 1: the six digits the Pond is showing or saying, or the eleven on its setup card. */
function PairingCodeStep({
  credential,
  initial,
  spoken,
  phoneName,
  onPhoneName,
  onCredential,
  onNext,
  onScan,
}: {
  credential: PakeCredential;
  initial: string;
  spoken: UseSpokenCode;
  phoneName: string;
  onPhoneName: (name: string) => void;
  onCredential: (credential: PakeCredential) => void;
  onNext: (code: string) => void;
  onScan: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [code, setCode] = useState(credential === 'pairing' ? initial : '');
  const [setupDigits, setSetupDigits] = useState(credential === 'setup' ? initial : '');
  const setup = readSetupCode(setupDigits);
  const valid = /^\d{6}$/.test(code);

  if (credential === 'setup') {
    return (
      <StepBody>
        <AccentIcon name="key" size={28} />
        <InkTitle level={2}>{t('pairing.setupCodeTitle')}</InkTitle>
        <Text style={styles.stepDesc}>{t('pairing.setupCodeBody')}</Text>
        <InkFormField
          label={t('pairing.setupCodeLabel')}
          error={setup.status === 'typo' ? t('pairing.setupCodeTypo') : undefined}
          style={styles.inputGroup}
        >
          <TextInput
            style={[styles.textInput, styles.codeInput]}
            value={setup.display}
            onChangeText={(next) => setSetupDigits(readSetupCode(next).digits)}
            placeholder={t('pairing.setupCodePlaceholder')}
            placeholderTextColor={colors.textTertiary}
            selectionColor={colors.textBrand}
            cursorColor={colors.textBrand}
            accessibilityLabel={t('pairing.setupCodeLabel')}
            keyboardType="number-pad"
            autoCorrect={false}
            autoFocus
          />
        </InkFormField>
        <PhoneName value={phoneName} onChange={onPhoneName} />
        <InkButton variant="primary" disabled={setup.status !== 'valid' || !phoneName.trim()} onPress={() => onNext(setup.digits)}>
          {t('pairing.pairDevice')}
        </InkButton>
        <ScanLink onPress={onScan} />
        <SpokenCodeAction spoken={spoken} onSpoken={() => onCredential('pairing')} />
        <TextAction label={t('pairing.usePairingCode')} onPress={() => onCredential('pairing')} />
      </StepBody>
    );
  }

  return (
    <StepBody>
      <AccentIcon name="wifi" size={28} />
      <InkTitle level={2}>{t('pairing.codeTitle')}</InkTitle>
      <Text style={styles.stepDesc}>
        {spoken.data.phase === 'spoken' ? t('pairing.spokenSaid') : t('pairing.codeBody')}
      </Text>
      <InkFormField label={t('pairing.codeLabel')} style={styles.inputGroup}>
        <TextInput
          style={[styles.textInput, styles.codeInput]}
          value={code}
          onChangeText={(next) => setCode(next.replace(/\D/g, '').slice(0, 6))}
          placeholder={t('pairing.codePlaceholder')}
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.textBrand}
          cursorColor={colors.textBrand}
          accessibilityLabel={t('pairing.codeLabel')}
          keyboardType="number-pad"
          autoFocus
        />
      </InkFormField>
      <PhoneName value={phoneName} onChange={onPhoneName} />
      <InkButton variant="primary" disabled={!valid || !phoneName.trim()} onPress={() => onNext(code)}>
        {t('pairing.pairDevice')}
      </InkButton>
      <ScanLink onPress={onScan} />
      <SpokenCodeAction spoken={spoken} onSpoken={() => setCode('')} />
      <TextAction label={t('pairing.useSetupCode')} onPress={() => onCredential('setup')} />
    </StepBody>
  );
}

/** Step 0 while the wizard looks for a card's Pond or reaches an unclaimed one: nothing to do but wait. */
function WaitStep({ title, body }: { title: string; body?: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <StepBody>
      <InkSpinner label={title} size={28} />
      <InkTitle level={2}>{title}</InkTitle>
      {body ? <Text style={styles.stepDesc}>{body}</Text> : null}
    </StepBody>
  );
}

/** Step 3: run the handshake, then say how it went, or wait where the Pond's lock holds this phone. */
function CompleteStep({
  state,
  reason,
  retryLabel,
  retryDisabled,
  onRetry,
  held,
  wait,
}: {
  state: 'pending' | 'error' | 'waiting';
  reason: string | null;
  retryLabel?: string;
  /** While the Pond is cooling between setup code attempts, a retry could only be refused. */
  retryDisabled?: boolean;
  onRetry: () => void;
  /** The request this phone waits on, for `waiting`. */
  held: HeldPairing | null;
  wait: PairingWaitDeps;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { t } = useTranslation();

  if (state === 'waiting' && held) {
    return (
      <StepBody>
        <AccentIcon name="lock" size={28} />
        <InkTitle level={2}>{t('pairingLock.wait.title')}</InkTitle>
        <PairingWait held={held} {...wait} onAgain={onRetry} onCancel={onRetry} />
      </StepBody>
    );
  }
  if (state === 'pending') {
    return (
      <StepBody>
        <InkSpinner label={t('pairing.pairing')} size={36} />
        <InkTitle level={2}>{t('pairing.pairing')}</InkTitle>
        <Text style={styles.stepDesc}>{t('pairing.pairingBody')}</Text>
      </StepBody>
    );
  }
  if (state === 'error') {
    return (
      <StepBody>
        <GIcon name="x" size={28} color={colors.danger} />
        <InkTitle level={2}>{t('pairing.failed')}</InkTitle>
        <Text style={styles.stepDesc}>{reason ?? t('pairingErrors.rejected')}</Text>
        <InkButton variant="primary" disabled={retryDisabled} onPress={onRetry}>
          {retryLabel ?? t('common.retry')}
        </InkButton>
      </StepBody>
    );
  }
  // There is no success screen: pairing leaves for Home the moment it
  // succeeds, so the only states this renders are the wait and the failure.
  return (
    <StepBody>
      <InkSpinner label={t('pairing.pairing')} size={36} />
      <InkTitle level={2}>{t('pairing.pairing')}</InkTitle>
    </StepBody>
  );
}

export default function PondPairingScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const router = useRouter();
  const { serverUrl, stagePairing, cancelPairing, pair, claimPairing, recoverPairing, profileId } = useServer();
  /**
   * Whether this screen was reached with somewhere to go back to, decided once.
   *
   * Reached from inside the app to change or repair a pond, there is; reached
   * because there is no pond -- a fresh install, a sign out, or the Pond revoking
   * this phone -- the tab layout redirected here precisely because the app cannot
   * be used, and a back arrow would offer a way to a screen whose every request
   * fails.
   *
   * Captured at mount and never revised, which is the whole point. Binding the
   * header option to the live value crashed the app on every completed pairing:
   * the profile appears and the redirect starts in the same frame, and
   * react-native-screens re-evaluated canNavigateBack on a fragment that was no
   * longer in a stack -- IllegalStateException on the main thread, from
   * ScreenStackHeaderConfig.onUpdate. The condition was right; changing it while
   * the screen was being torn down was not.
   */
  const [reachedWithHistory] = useState(() => Boolean(profileId));
  // Where the welcome screen left off, if it was the way in. Read once and cleared
  // after mount; see peekPairingStart.
  const [start] = useState(peekPairingStart);
  useEffect(() => { clearPairingStart(); }, []);
  const startedUnclaimed = start?.kind === 'pond' && !!start.unclaimed;
  const [manualUrl, setManualUrl] = useState(start?.kind === 'pond' ? start.url : serverUrl);
  const [manualPin, setManualPin] = useState(start?.kind === 'pond' ? (start.pin ?? '') : '');
  // Whether the address came off a discovery list, here or on the welcome screen.
  const [picked, setPicked] = useState(start?.kind === 'pond');
  const [pickedUnclaimed, setPickedUnclaimed] = useState(startedUnclaimed);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => () => { void cancelPairing(); }, [cancelPairing]);
  // Stable per-install client_id, hydrated from SecureStorage on mount. The
  // server uses this to recognise a returning device and revoke prior tokens
  // instead of creating a duplicate entry on every re-pair.
  const clientIdRef = useRef<string>('');
  useEffect(() => {
    void getInstallId().then((id) => {
      clientIdRef.current = id;
    });
  }, []);

  const [step, setStep] = useState<Step>(0);
  const [code, setCode] = useState('');
  // An unclaimed Pond takes its setup card's code; anything else, a pairing code.
  const [credential, setCredential] = useState<PakeCredential>(startedUnclaimed ? 'setup' : 'pairing');
  const [deviceName, setDeviceName] = useState(() => defaultPhoneName(Device.deviceName, Device.modelName));
  const [cardSearch, setCardSearch] = useState<SetupCard | null>(null);
  // Held here, not in the code step, so the wizard knows a code was said when it decides on the pick.
  const spoken = useSpokenCode();
  const { ask: askSpoken, reset: resetSpoken } = spoken.actions;
  const [staged, setStaged] = useState<{ url: string; pin: string; source: PinSource } | null>(null);
  // A six-digit code typed while the pin was unpicked waits here for the pick, then goes on to naming.
  const [codeAwaitingPick, setCodeAwaitingPick] = useState(false);
  const [reaching, setReaching] = useState<{ url: string; pin: string } | null>(() =>
    start?.kind === 'pond' && start.unclaimed && start.pin ? { url: start.url, pin: start.pin } : null);
  // Step 0 searches the network by default; typing an address is the fallback
  // for a network that filters multicast, which plenty of guest wifi does. Opened
  // from the welcome screen, which has already searched, it starts past the search.
  // In insecure development mode it is the start: the plaintext listener is never
  // advertised, and Expo Go, which that mode exists for, has no mDNS module.
  const [manualEntry, setManualEntry] = useState(insecureDevMode || (start !== null && start.kind !== 'scan'));
  const openScanner = useCallback(() => router.push('/(stack)/connect-desktop'), [router]);
  // Opened to scan a setup card: the scanner goes over the wizard, which takes the card when it returns.
  const scanFirst = useRef(start?.kind === 'scan');
  useEffect(() => {
    if (!scanFirst.current) return;
    scanFirst.current = false;
    openScanner();
  }, [openScanner]);

  const stage = useCallback(async (url: string, pin: string, source: PinSource) => {
    const parsed = new URL(url);
    await stagePairing({ version: 2, host: parsed.hostname, port: Number(parsed.port) || 443, localUrls: [url] }, pin);
    setManualUrl(url);
    setStaged({ url, pin, source });
    setCodeAwaitingPick(false);
    setNotice(null);
    resetSpoken();
  }, [stagePairing, resetSpoken]);

  /**
   * Pick up a scanned payload when the scanner navigates back.
   *
   * The QR carries both halves the wizard would otherwise ask for, so a
   * successful scan skips to naming the device. The server is still probed
   * first: a QR pointing at a host the phone cannot resolve should fail here,
   * not three steps later during the handshake.
   *
   * The mDNS name is tried before the raw address because it is the better one
   * to keep — an address baked into a QR goes stale on the next DHCP lease.
   * Android resolves no mDNS at all, so on that platform the first probe is
   * expected to fail and the fallback is the one that works.
   */
  useFocusEffect(
    useCallback(() => {
      const card = takeSetupCard();
      if (card) {
        setPairingError(null);
        setNotice(null);
        setCredential('setup');
        setCode(card.code);
        setStep(0);
        setCardSearch(card);
        return;
      }
      const scanned = takePairingPayload();
      if (!scanned) return;

      let cancelled = false;
      setPairingError(null);
      void stagePairing(scanned.profile, scanned.pin).then(() => {
        if (cancelled) return;
        setStaged({ url: scanned.serverUrl, pin: scanned.pin, source: 'checked' });
        resetSpoken();
        setCredential('pairing'); setCode(scanned.code); setStep(2);
      }).catch((error) => {
        if (!cancelled) setPairingError(error instanceof Error ? error.message : t('pairing.failed'));
      });
      return () => { cancelled = true; };
    }, [stagePairing, resetSpoken, t]),
  );

  // A card names its Pond by id. Found, the card already holds the code, so only a name is left to ask.
  useEffect(() => {
    if (!cardSearch) return;
    let cancelled = false;
    void (async () => {
      try {
        const pond = await findPondBySetupId(cardSearch.id);
        if (cancelled) return;
        if (!pond?.pin) {
          setManualUrl(pond?.url ?? '');
          setManualPin('');
          setPicked(false);
          setManualEntry(true);
          setNotice(t('pairing.setupCardNotFound'));
          return;
        }
        setManualUrl(pond.url);
        // No pick-from-three: a completed setup exchange is bound to the Pond's real pin through
        // the channel identifier, so a spoofed pin can only fail, never succeed.
        await stage(pond.url, pond.pin, 'advertised');
        if (!cancelled) setStep(2);
      } catch (error) {
        if (cancelled) return;
        setPairingError(error instanceof Error ? error.message : t('pairing.failed'));
        setPicked(false);
        setManualEntry(true);
      } finally {
        if (!cancelled) setCardSearch(null);
      }
    })();
    return () => { cancelled = true; };
  }, [cardSearch, stage, t]);

  // An unclaimed Pond is reached without the pick-from-three too, since its next exchange is a setup one.
  useEffect(() => {
    if (!reaching) return;
    let cancelled = false;
    void (async () => {
      try {
        await stage(reaching.url, reaching.pin, 'advertised');
        if (!cancelled) { setCredential('setup'); setStep(1); }
      } catch (error) {
        if (cancelled) return;
        setPairingError(error instanceof Error ? error.message : t('pairing.failed'));
        setManualUrl(reaching.url);
        setManualPin(reaching.pin);
        setPicked(true);
        setPickedUnclaimed(true);
        setManualEntry(true);
      } finally {
        if (!cancelled) setReaching(null);
      }
    })();
    return () => { cancelled = true; };
  }, [reaching, stage, t]);

  const [completionState, setCompletionState] = useState<'pending' | 'error' | 'waiting'>('pending');
  const [completionReason, setCompletionReason] = useState<string | null>(null);
  // The request a locked Pond is holding for this phone. In this component's memory and nowhere else.
  const [held, setHeld] = useState<HeldPairing | null>(null);
  // Set when the Pond turned out to be claimed, so the way on is a pairing code instead of the card.
  const [claimed, setClaimed] = useState(false);
  const { left: coolingLeft, start: startCooling, stop: stopCooling } = useCountdown();

  const runPair = useCallback(
    async (name: string) => {
      setStep(3);
      setCompletionState('pending');
      setCompletionReason(null);
      setHeld(null);
      setClaimed(false);
      stopCooling();
      const toPairingCode = () => { setCredential('pairing'); setCode(''); setClaimed(true); };
      try {
        const clientId = clientIdRef.current || (await getInstallId());
        clientIdRef.current = clientId;
        const resp = await pair({ clientId, pairingCode: code, credential, deviceName: name });
        if (resp.accepted) {
          // Leave on success rather than waiting to be dismissed: for Home, or for owner setup on a
          // Pond nobody has set up yet, as a freshly claimed one is.
          router.replace((await setupNeededNow()) ? '/(onboarding)/owner-setup' : '/(tabs)');
        } else if (resp.held) {
          // The code was right and the Pond's lock is on: its main member decides.
          setHeld(resp.held);
          setCompletionState('waiting');
        } else {
          setCompletionState('error');
          setCompletionReason(explainRefusedPairing(resp.rejection_reason, t, credential));
          if (resp.rejection_reason === 'setup_code_unavailable') toPairingCode();
        }
      } catch (e) {
        // A throw is anything but a plain refusal: a Pond too old to pair with,
        // answers that did not verify, a refusal carried as an HTTP error, or no
        // answer at all.
        setCompletionState('error');
        setCompletionReason(describePairingFailure(e, t, credential));
        const wait = refusalWait(e, 'setup_code_cooling');
        if (wait) startCooling(wait);
        if (isClaimedRefusal(e)) toPairingCode();
      }
    },
    [code, credential, pair, router, startCooling, stopCooling, t],
  );

  // Let in by the main member or by the recovery PIN: the pairing is kept, and this leaves as any pairing does.
  const onPaired = useCallback(() => {
    void setupNeededNow().then((needed) => router.replace(needed ? '/(onboarding)/owner-setup' : '/(tabs)'));
  }, [router]);

  // Step 2 is the moment everything is in hand; pairing starts by itself, under the name shown.
  useEffect(() => {
    if (step !== 2) return;
    const name = deviceName.trim() || defaultPhoneName(Device.deviceName, Device.modelName);
    const timer = setTimeout(() => void runPair(name), 0);
    return () => clearTimeout(timer);
  }, [step, runPair, deviceName]);

  const onServerNext = useCallback(async (url: string, pin: string, unclaimed: boolean, pickSkipped: boolean) => {
    await stage(url, pin, pickSkipped ? 'advertised' : 'checked');
    if (unclaimed) setCredential('setup');
    const waiting = codeAwaitingPick && credential === 'pairing' && /^\d{6}$/.test(code);
    // A scanned card, or a code typed before the pick, already gave the code: only a name is left.
    setStep(waiting || (credential === 'setup' && isValidSetupCode(code)) ? 2 : 1);
  }, [stage, credential, code, codeAwaitingPick]);

  const onSpokenInstead = useCallback(async (url: string, pin: string) => {
    await stage(url, pin, 'advertised');
    setCredential('pairing');
    setCode('');
    setStep(1);
    void askSpoken();
  }, [stage, askSpoken]);

  const onCodeNext = useCallback((nextCode: string) => {
    setCode(nextCode);
    if (staged && pickBeforeExchange({ pin: staged.source, credential, codeSpoken: spoken.data.phase === 'spoken' })) {
      // A code read off a dashboard or a terminal means this household has a screen to pick against.
      setManualUrl(staged.url); setManualPin(staged.pin); setPicked(true); setPickedUnclaimed(false);
      setManualEntry(true); setCodeAwaitingPick(true); setNotice(t('pairing.fingerprintBeforeCode'));
      setStep(0);
      return;
    }
    setStep(2);
  }, [staged, credential, spoken.data.phase, t]);

  return (
    <GKeyboardView style={styles.container}>
      {/*
        The stack draws its own back control as `headerLeft`, because this
        nested navigator suppresses the system one. `headerBackVisible` governs
        only that suppressed native button, so it never decided anything here:
        with history it brought the native arrow back *beside* the stack's own,
        and without history the stack's own still offered a way out of a screen
        the app was redirected to because it cannot work yet. Hiding
        `headerLeft` is what the condition always meant.
      */}
      <Stack.Screen
        options={
          reachedWithHistory
            ? { gestureEnabled: true }
            : { headerLeft: () => null, gestureEnabled: false }
        }
      />
      <StepIndicator current={step} />
      {pairingError ? <Text style={styles.stepError}>{pairingError}</Text> : null}
      {notice && step === 0 && !cardSearch ? <Text style={styles.stepDesc}>{notice}</Text> : null}
      {step === 0 &&
        (cardSearch ? (
          <WaitStep title={t('pairing.setupCardSearching')} body={t('pairing.setupCardSearchingBody')} />
        ) : reaching ? (
          <WaitStep title={t('pairing.fingerprintSearching')} />
        ) : manualEntry ? (
          <ServerStep
            initial={manualUrl}
            initialPin={manualPin}
            picked={picked}
            initialUnclaimed={pickedUnclaimed}
            setupExchange={credential === 'setup'}
            onNext={onServerNext}
            onSpokenInstead={onSpokenInstead}
            onScan={openScanner}
          />
        ) : (
          <DiscoverStep
            onNext={(url, pin, unclaimed) => {
              if (unclaimed && pin) {
                setPairingError(null);
                setReaching({ url, pin });
                return;
              }
              setManualUrl(url); setManualPin(pin ?? ''); setPicked(true); setPickedUnclaimed(unclaimed); setManualEntry(true);
            }}
            onManual={() => { setPicked(false); setPickedUnclaimed(false); setManualEntry(true); }}
            onScan={openScanner}
          />
        ))}
      {step === 1 && (
        <PairingCodeStep
          credential={credential}
          initial={code}
          spoken={spoken}
          phoneName={deviceName}
          onPhoneName={setDeviceName}
          onCredential={setCredential}
          onNext={onCodeNext}
          onScan={openScanner}
        />
      )}
      {step >= 2 && (
        <CompleteStep
          state={step === 2 ? 'pending' : completionState}
          reason={coolingLeft > 0 ? t('pairingErrors.setupCooling', { count: coolingLeft }) : completionReason}
          retryLabel={claimed ? t('pairing.claimedNext') : undefined}
          retryDisabled={coolingLeft > 0}
          onRetry={() => { setHeld(null); setStep(1); }}
          held={held}
          wait={{ claim: claimPairing, recover: recoverPairing, onPaired }}
        />
      )}
    </GKeyboardView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
      paddingHorizontal: Spacing.lg,
    },

    /* Step indicator */
    stepRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: Spacing.xl,
    },
    stepItem: { alignItems: 'center', flex: 1 },
    stepDot: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: c.backgroundSecondary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    stepDotActive: { backgroundColor: c.tint },
    stepDotDone: { backgroundColor: c.success },
    stepNumber: {
      ...face('display', 'bold'),
      fontSize: FontSize.sm,
      color: c.textTertiary,
    },
    stepNumberActive: { color: Brand.white },
    stepLabel: {
      ...face('body', 'regular'),
      fontSize: 10,
      color: c.textTertiary,
    },
    stepLabelActive: {
      ...face('body', 'semibold'),
      color: c.textBrand,
    },

    /* Step content. Left-aligned: a wizard reads as a form, and centred body
       copy makes every line start in a different place. */
    stepContent: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: Spacing.lg,
      gap: Spacing.lg,
    },
    stepDesc: {
      ...face('body', 'regular'),
      fontSize: FontSize.base,
      color: c.textTertiary,
      lineHeight: FontSize.base * 1.5,
    },
    fingerprintChoice: {
      width: '100%',
      alignItems: 'center',
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.lg,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    // The fingerprint is read aloud against the Pond's own screen, so it is set
    // in the mono face at a size where each group of four is unambiguous.
    pinPreview: {
      ...face('mono', 'regular'),
      fontSize: FontSize.lg,
      color: c.text,
      letterSpacing: 1,
    },
    // Copied off a printed card group by group, so every digit keeps a fixed-width column.
    codeInput: {
      ...face('mono', 'regular'),
      fontSize: FontSize.lg,
      letterSpacing: 1,
    },
    stepError: {
      ...face('body', 'regular'),
      fontSize: FontSize.sm,
      color: c.danger,
      lineHeight: FontSize.sm * 1.5,
    },
    scanLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingVertical: Spacing.sm,
    },
    scanLinkText: {
      ...face('body', 'semibold'),
      fontSize: FontSize.base,
      color: c.textBrand,
    },

    // stepContent fills with `flex: 1`, which a scroll view's content container
    // may not use — `flexGrow` keeps that while letting the content grow past
    // the screen.
    stepScroll: { flex: 1 },
    stepScrollContent: { flex: undefined, flexGrow: 1, paddingVertical: Spacing.lg },

    /* Discovered ponds */
    pondRow: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.lg,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    pondInfo: { flex: 1 },
    pondName: {
      ...face('body', 'semibold'),
      fontSize: FontSize.base,
      color: c.text,
    },
    pondAddr: {
      ...face('body', 'regular'),
      fontSize: FontSize.sm,
      color: c.textTertiary,
    },

    /* Input groups */
    inputGroup: { width: '100%' },
    // The code fields keep their own input for the mono digits; the frame is Ink's field.
    textInput: {
      backgroundColor: c.card,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: c.borderStrong,
      minHeight: 44,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      ...face('body', 'regular'),
      fontSize: FontSize.base,
      color: c.text,
    },
  });
