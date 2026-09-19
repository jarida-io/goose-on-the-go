import i18n from '@/services/i18n';
import { normalizeHttpsUrl, validPin } from '@/models/connection';
/**
 * PondPairingScreen — 4-step pairing wizard:
 *   0. Find the GIAP server: discovered over mDNS, scanned from the QR, or typed
 *   1. Enter the 6-digit pairing code shown on the GIAP host
 *   2. Name this device
 *   3. Run the two-phase handshake and confirm
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { InkButton } from '@jarida/ink/native';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useFocusEffect, useRouter } from 'expo-router';
import { GIcon } from '@/components/ui/g-icon';
import { GKeyboardView } from '@/components/ui/g-keyboard-view';
import { Grey, JaridaPurple, Brand, Semantic } from '@/constants/colors';
import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radii } from '@/constants/radii';
import { ApiError } from '@/services/api-client';
import { useServer } from '@/providers/server-provider';
import { getInstallId } from '@/services/install-id';
import { takePairingPayload } from '@/services/pairing-handoff';
import { type DiscoveredPond } from '@/services/discovery';
import { useDiscovery } from '@/view-models/use-discovery';

type Step = 0 | 1 | 2 | 3;
const STEP_LABELS = ['Find Pond', 'Pairing Code', 'Name Device', 'Complete'];

/** Step indicator */
function StepIndicator({ current }: { current: Step }) {
  return (
    <View style={styles.stepRow}>
      {STEP_LABELS.map((label, i) => {
        const isActive = i === current;
        const isDone = i < current;
        return (
          <View key={label} style={styles.stepItem}>
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
              {label}
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
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.scanLink}>
      <GIcon name="camera" size={16} color={JaridaPurple[500]} />
      <Text style={styles.scanLinkText}>Scan QR code instead</Text>
    </Pressable>
  );
}

/**
 * Normalise a hand-typed server address, or return null if it cannot be one.
 *
 * The host machine's dashboard shows a bare `host:port`, so a missing scheme is
 * the common case rather than a mistake; it defaults to http, which is what a
 * Pond on the LAN actually serves.
 */
export function normalizeServerUrl(raw: string): string | null {
  try { return normalizeHttpsUrl(raw.trim().includes('://') ? raw.trim() : `https://${raw.trim()}`); }
  catch { return null; }
}

/**
 * The body of one wizard step.
 *
 * It scrolls, which matters for two reasons. The step content is centred, so
 * when the keyboard takes half the screen the button under the focused field
 * ends up below the fold — `GKeyboardView` lifts the container, and this makes
 * what it lifted reachable. And the discovery step grows with however many hubs
 * answer, which is not a number the layout gets to assume.
 */
function StepBody({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      style={styles.stepScroll}
      contentContainerStyle={[styles.stepContent, styles.stepScrollContent]}
      keyboardShouldPersistTaps="handled"
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
  onNext: (url: string) => void;
  onManual: () => void;
  onScan: () => void;
}) {
  const { data, error, actions } = useDiscovery();
  const picking: string | null = null;
  const pickError: string | null = null;
  const pick = (pond: DiscoveredPond) => onNext(pond.url);

  return (
    <StepBody>
      {data.phase === 'searching' ? (
        <ActivityIndicator color={JaridaPurple[500]} />
      ) : (
        <GIcon name="search" size={28} color={JaridaPurple[500]} />
      )}

      <Text style={styles.stepTitle}>
        {data.phase === 'searching' ? 'Looking for your Pond' : 'Connect to GIAP'}
      </Text>

      {data.phase === 'searching' ? (
        <Text style={styles.stepDesc}>Searching this Wi-Fi network.</Text>
      ) : null}

      {data.phase === 'empty' ? (
        <Text style={styles.stepDesc}>
          No Pond answered on this network. Check that it is running and that this phone is on
          the same Wi-Fi, or enter its address below.
        </Text>
      ) : null}

      {data.phase === 'failed' ? (
        <Text style={styles.stepError}>
          {error} You can still enter the address by hand.
        </Text>
      ) : null}

      {data.ponds.map((pond) => (
        <Pressable
          key={pond.id}
          style={styles.pondRow}
          disabled={picking !== null}
          onPress={() => void pick(pond)}
        >
          {picking === pond.id ? (
            <ActivityIndicator size="small" color={JaridaPurple[500]} />
          ) : (
            <GIcon name="wifi" size={18} color={JaridaPurple[500]} />
          )}
          <View style={styles.pondInfo}>
            <Text style={styles.pondName} numberOfLines={1}>
              {pond.name}
            </Text>
            <Text style={styles.pondAddr}>
              {pond.address}:{pond.port}
              {pond.version ? ` · v${pond.version}` : ''}
            </Text>
          </View>
        </Pressable>
      ))}

      {pickError ? <Text style={styles.stepError}>{pickError}</Text> : null}

      {data.phase !== 'searching' ? (
        <InkButton variant="quiet" onPress={actions.retry}>
          Search again
        </InkButton>
      ) : null}

      <Pressable onPress={onManual} hitSlop={8} style={styles.scanLink}>
        <Text style={styles.scanLinkText}>Enter address manually</Text>
      </Pressable>
      <ScanLink onPress={onScan} />
    </StepBody>
  );
}

function ServerStep({
  initial,
  onNext,
  onScan,
}: {
  initial: string;
  onNext: (url: string, pin: string) => Promise<void>;
  onScan: () => void;
}) {
  const [pin, setPin] = useState('');
  const [url, setUrl] = useState(initial);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reach the Pond before advancing. Without this the address is only exercised
  // three steps later, during the handshake, where a typo surfaces as a failed
  // pairing rather than as a bad URL on the screen that asked for it.
  const submit = useCallback(async () => {
    const normalized = normalizeServerUrl(url);
    if (!normalized || !validPin(pin.trim())) {
      setError(i18n.t('pairing.invalid'));
      return;
    }
    setChecking(true); setError(null);
    try { await onNext(normalized, pin.trim()); }
    catch (error) { setError(error instanceof Error ? error.message : i18n.t('pairing.failed')); }
    finally { setChecking(false); }
  }, [url, pin, onNext]);

  return (
    <StepBody>
      <GIcon name="search" size={28} color={JaridaPurple[500]} />
      <Text style={styles.stepTitle}>Connect to GIAP</Text>
      <Text style={styles.stepDesc}>
        Enter the URL of your Goose In A Pond server — shown in the dashboard
        banner on the host machine.
      </Text>
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Server URL</Text>
        <TextInput
          style={styles.textInput}
          value={url}
          onChangeText={(t) => {
            setUrl(t);
            setError(null);
          }}
          placeholder="https://pond.local:4443"
          placeholderTextColor={Grey[400]}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!checking}
        />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>{i18n.t('pairing.fingerprint')}</Text>
        <TextInput style={styles.textInput} value={pin} onChangeText={setPin}
          placeholder="sha256/..." autoCapitalize="none" autoCorrect={false} editable={!checking} />
        <Text style={styles.stepDesc}>{i18n.t('pairing.fingerprintHint')}</Text>
      </View>
      {error ? <Text style={styles.stepError}>{error}</Text> : null}
      <InkButton
        variant="primary"
        disabled={!url.trim() || checking}
        onPress={submit}
      >
        {checking ? 'Checking…' : 'Continue'}
      </InkButton>
      <ScanLink onPress={onScan} />
    </StepBody>
  );
}

/** Step 1: Pairing code */
function PairingCodeStep({
  initial,
  onNext,
  onScan,
}: {
  initial: string;
  onNext: (code: string) => void;
  onScan: () => void;
}) {
  const [code, setCode] = useState(initial);
  const valid = /^\d{6}$/.test(code);
  return (
    <StepBody>
      <GIcon name="wifi" size={28} color={JaridaPurple[500]} />
      <Text style={styles.stepTitle}>Enter Pairing Code</Text>
      <Text style={styles.stepDesc}>
        The 6-digit code is shown on the GIAP host&apos;s dashboard or terminal
        when the server starts. It expires after 10 minutes.
      </Text>
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Code</Text>
        <TextInput
          style={styles.textInput}
          value={code}
          onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
          placeholder="123456"
          placeholderTextColor={Grey[400]}
          keyboardType="number-pad"
          autoFocus
        />
      </View>
      <InkButton
        variant="primary"
        disabled={!valid}
        onPress={() => onNext(code)}
      >
        Continue
      </InkButton>
      <ScanLink onPress={onScan} />
    </StepBody>
  );
}

/** Step 2: Name Device */
function NameStep({ onNext }: { onNext: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <StepBody>
      <GIcon name="edit" size={28} color={JaridaPurple[500]} />
      <Text style={styles.stepTitle}>Name This Phone</Text>
      <Text style={styles.stepDesc}>
        This name shows up in the GIAP devices list — pick something you&apos;ll
        recognize.
      </Text>
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Device Name</Text>
        <TextInput
          style={styles.textInput}
          value={name}
          onChangeText={setName}
          placeholder="e.g., Emmanuel's iPhone"
          placeholderTextColor={Grey[400]}
        />
      </View>
      <InkButton
        variant="primary"
        disabled={!name.trim()}
        onPress={() => onNext(name.trim())}
      >
        Pair Device
      </InkButton>
    </StepBody>
  );
}

/** Step 3: Run handshake + show outcome. */
/**
 * Turn the server's rejection code into something a person can act on.
 *
 * `rejection_reason` is a closed set from pond-core's handshake verifier, and it
 * was rendered raw — someone who mistyped a digit was shown "invalid_mac". The
 * cases are split because they call for different things: a stale challenge only
 * needs the same code re-sent, while an expired code needs a new one fetched
 * from the Pond.
 *
 * The 60-second challenge lifetime is worth naming rather than folding into a
 * generic retry message. It is far shorter than the code's ten minutes, so it is
 * the limit a user actually hits.
 */
/**
 * Describe a failure that never reached the verifier — a transport or HTTP
 * error rather than a rejected code.
 *
 * The 429 case is the one that matters. GIAP gives pairing its own rate-limit
 * budget (30/60s, with /handshake/verify further limited to 10/60s), and it
 * sends Retry-After when it throttles. Showing "handshake/init failed: 429",
 * which is what this screen used to print, tells a user nothing and invites
 * them to hammer the button — which is how a phone spends the budget it needs
 * to recover. Naming the wait turns a dead end into an instruction.
 */
function describeTransportFailure(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 429) {
      const wait = e.retryAfterSecs;
      return wait
        ? `Your Pond is rate-limiting pairing attempts. Wait ${wait} second${wait === 1 ? '' : 's'} and try again.`
        : 'Your Pond is rate-limiting pairing attempts. Wait a minute and try again.';
    }
    if (e.status >= 500) {
      return 'Your Pond returned an error while pairing. Check that it is still running, then try again.';
    }
    return `Your Pond refused the pairing request (HTTP ${e.status}).`;
  }
  return 'Could not reach your Pond. Check that the phone is on the same network and the server is running.';
}

function explainRejection(reason: string | null): string {
  switch (reason) {
    case 'invalid_mac':
    case 'bad_mac_hex':
      return 'That pairing code did not match. Check the six digits on your Pond and try again \u2014 a wrong code costs nothing but this attempt.';
    case 'challenge_expired':
    case 'challenge_used':
    case 'unknown_challenge':
      return 'This attempt took too long \u2014 the server holds a challenge for only 60 seconds. Enter the same code again; you do not need a new one.';
    case 'no_active_pairing_code':
      return 'Your Pond has no pairing code right now. Codes last 10 minutes \u2014 open the dashboard on the host machine to show a fresh one.';
    default:
      return 'The server rejected the pairing attempt. Double-check the code and try again.';
  }
}

function CompleteStep({
  state,
  reason,
  onDone,
  onRetry,
}: {
  state: 'pending' | 'ok' | 'error';
  reason: string | null;
  onDone: () => void;
  onRetry: () => void;
}) {
  if (state === 'pending') {
    return (
      <StepBody>
        <ActivityIndicator size="large" color={JaridaPurple[500]} />
        <Text style={styles.stepTitle}>Pairing…</Text>
        <Text style={styles.stepDesc}>
          Verifying the code and exchanging tokens with your GIAP server.
        </Text>
      </StepBody>
    );
  }
  if (state === 'error') {
    return (
      <StepBody>
        <GIcon name="x" size={28} color={Semantic.danger} />
        <Text style={styles.stepTitle}>Pairing failed</Text>
        <Text style={styles.stepDesc}>
          {reason ?? 'The server rejected the pairing attempt. Double-check the code and try again.'}
        </Text>
        <InkButton variant="primary" onPress={onRetry}>
          Try again
        </InkButton>
      </StepBody>
    );
  }
  return (
    <StepBody>
      <GIcon name="check" size={28} color={Semantic.success} />
      <Text style={styles.stepTitle}>All Set!</Text>
      <Text style={styles.stepDesc}>
        Your phone is paired. The session token is stored securely on this
        device and used for every API call.
      </Text>
      <InkButton variant="primary" onPress={onDone}>
        Go to Home
      </InkButton>
    </StepBody>
  );
}

export default function PondPairingScreen() {
  const router = useRouter();
  const { serverUrl, stagePairing, cancelPairing, pair } = useServer();
  const [manualUrl, setManualUrl] = useState(serverUrl);
  const [pairingError, setPairingError] = useState<string | null>(null);
  useEffect(() => () => { void cancelPairing(); }, [cancelPairing]);
  // Stable per-install client_id, hydrated from SecureStorage on mount. The
  // server uses this to recognize a returning device and revoke prior tokens
  // instead of creating a duplicate entry on every re-pair.
  const clientIdRef = useRef<string>('');
  useEffect(() => {
    void getInstallId().then((id) => {
      clientIdRef.current = id;
    });
  }, []);

  const [step, setStep] = useState<Step>(0);
  const [code, setCode] = useState('');
  // Step 0 searches the network by default; typing an address is the fallback
  // for a network that filters multicast, which plenty of guest wifi does.
  const [manualEntry, setManualEntry] = useState(false);
  const openScanner = useCallback(() => router.push('/(stack)/connect-desktop'), [router]);

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
      const scanned = takePairingPayload();
      if (!scanned) return;

      let cancelled = false;
      setPairingError(null);
      void stagePairing(scanned.profile, scanned.pin).then(() => {
        if (!cancelled) { setCode(scanned.code); setStep(2); }
      }).catch((error) => {
        if (!cancelled) setPairingError(error instanceof Error ? error.message : i18n.t('pairing.failed'));
      });
      return () => { cancelled = true; };
    }, [stagePairing]),
  );
  const [completionState, setCompletionState] =
    useState<'pending' | 'ok' | 'error'>('pending');
  const [completionReason, setCompletionReason] = useState<string | null>(null);

  const runPair = useCallback(
    async (deviceName: string) => {
      setStep(3);
      setCompletionState('pending');
      setCompletionReason(null);
      try {
        const clientId = clientIdRef.current || (await getInstallId());
        clientIdRef.current = clientId;
        const resp = await pair({
          clientId,
          pairingCode: code,
          deviceName,
        });
        if (resp.accepted) {
          setCompletionState('ok');
        } else {
          setCompletionState('error');
          setCompletionReason(explainRejection(resp.rejection_reason));
        }
      } catch (e) {
        // A throw means the request never reached the verifier, so there is no
        // rejection_reason to explain — only an HTTP or transport failure.
        setCompletionState('error');
        setCompletionReason(e instanceof ApiError && e.status === 403 ? i18n.t('pairing.lan') : describeTransportFailure(e));
      }
    },
    [code, pair],
  );

  const onServerNext = useCallback(async (url: string, pin: string) => {
    const parsed = new URL(url);
    await stagePairing({ version: 2, host: parsed.hostname, port: Number(parsed.port) || 443, localUrls: [url] }, pin);
    setManualUrl(url); setStep(1);
  }, [stagePairing]);

  const onCodeNext = useCallback((nextCode: string) => {
    setCode(nextCode);
    setStep(2);
  }, []);

  const done = useCallback(() => router.back(), [router]);

  return (
    <GKeyboardView style={styles.container}>
      <StepIndicator current={step} />
      {pairingError ? <Text style={styles.stepError}>{pairingError}</Text> : null}
      {step === 0 &&
        (manualEntry ? (
          <ServerStep initial={manualUrl} onNext={onServerNext} onScan={openScanner} />
        ) : (
          <DiscoverStep
            onNext={(url) => { setManualUrl(url); setManualEntry(true); }}
            onManual={() => setManualEntry(true)}
            onScan={openScanner}
          />
        ))}
      {step === 1 && (
        <PairingCodeStep initial={code} onNext={onCodeNext} onScan={openScanner} />
      )}
      {step === 2 && <NameStep onNext={runPair} />}
      {step === 3 && (
        <CompleteStep
          state={completionState}
          reason={completionReason}
          onDone={done}
          onRetry={() => setStep(1)}
        />
      )}
    </GKeyboardView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Grey[50],
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
    backgroundColor: Grey[200],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  stepDotActive: { backgroundColor: JaridaPurple[500] },
  stepDotDone: { backgroundColor: Semantic.success },
  stepNumber: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Grey[500],
  },
  stepNumberActive: { color: Brand.white },
  stepLabel: {
    fontFamily: FontFamily.body,
    fontSize: 10,
    color: Grey[500],
  },
  stepLabelActive: {
    color: JaridaPurple[600],
    fontWeight: FontWeight.semibold,
  },

  /* Step content */
  stepContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.lg,
  },
  stepTitle: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Brand.charcoal,
    textAlign: 'center',
  },
  stepDesc: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: Grey[500],
    textAlign: 'center',
    lineHeight: FontSize.base * 1.5,
  },
  stepError: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Semantic.danger,
    textAlign: 'center',
    lineHeight: FontSize.sm * 1.5,
  },
  scanLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  scanLinkText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: JaridaPurple[500],
  },

  // stepContent centres with `flex: 1`, which a scroll view's content container
  // may not use — `flexGrow` keeps the centring while letting the content grow
  // past the screen.
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
    borderColor: Grey[200],
    backgroundColor: Brand.white,
  },
  pondInfo: { flex: 1 },
  pondName: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Brand.charcoal,
  },
  pondAddr: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Grey[500],
  },

  /* Input groups */
  inputGroup: { width: '100%' },
  inputLabel: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Grey[700],
    marginBottom: Spacing.xs,
  },
  textInput: {
    backgroundColor: Brand.white,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Grey[200],
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: Brand.charcoal,
  },
});
