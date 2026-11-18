import { File, Paths } from 'expo-file-system';
import {
  readCollection,
  readList,
  readReportImage,
  readSavedItem,
  readWebWatch,
  readWebWatchDetail,
  type ReportImage,
  type SavedCollection,
  type SavedItem,
  type SavedKind,
  type WatchFilters,
  type WebWatch,
  type WebWatchDetail,
} from '@/models/web-watches';

import { assertPondTrust, PondTrustError, pondTrustFailed } from './pond-trust';
import { isInsecureDevOrigin, isLocalPairingUrl, normalizePondUrl } from '@/models/connection';
import { readWebSearch } from '@/models/web-search';
import { readRoute, type RemoteRoute, type RouteState } from '@/models/ngrok-tunnel';
import { readPrefills } from '@/models/agents';
import { readRoomVoiceEvent, readVoiceAgent, readVoicePrints, readVoiceRoom, readVoiceTake } from '@/models/voice-room';
import { readInterview, readInterviewOffer, readMemberNotes } from '@/models/interview';
import { readHub, type MeHub } from '@/models/hub';
import { readInterest, readInterests, readInterestInterview, readPortrait, type InterestInterview, type Interest, type Portrait } from '@/models/interests';
import {
  readDigest,
  readDigestList,
  readHistory,
  readNewsFeed,
  readNewsSettings,
  readStoryDetail,
  type Digest,
  type DigestSummary,
  type NewsFeed,
  type NewsSettings,
  type Story,
  type StoryDetail,
} from '@/models/news';
import {
  readHookSources,
  readPlace,
  readTodo,
  readTodoOffers,
  readTodos,
  type HookSources,
  type Place,
  type Todo,
  type TodoOffer,
} from '@/models/todos';
import { readCart, readCartItem, type CartItem } from '@/models/cart';
import { readConnector, readConnectors, type Connector } from '@/models/connectors';
import { readAbout, readArchived, readFact, type AboutFact, type AboutProfile, type ArchivedFact } from '@/models/about';
import { readCard, type CardKind, type ContextCard } from '@/models/cards';
import { readGooseActivity, type GooseActivityList } from '@/models/goose-activity';
import { readGooseNotes, type GooseNotes } from '@/models/goose-notes';
import { readIdea, readIdeas, type Idea } from '@/models/ideas';
import {
  readKept,
  readMemberInterview,
  type InterviewAnswer,
  type InterviewApproval,
  type InterviewKept,
  type MemberInterview,
} from '@/models/member-interview';
import {
  APPROVAL_REQUIRED,
  readHeldPairing,
  readPairingLock,
  readPairingRequests,
  type HeldPairing,
  type PairingLock,
  type PairingRequest,
} from '@/models/pairing-lock';
import { readScreenshots, type Screenshots } from '@/models/screenshots';
import {
  readAnchor,
  readAnchors,
  readDeliverable,
  type Anchor,
  type Deliverable,
} from '@/models/anchors';
import { readQuestionBatches, watchAsks, type QuestionBatch } from '@/models/questions';
import { readFactSheet, readRules, readSheetFact, type DontRule, type FactSheet, type SheetFact } from '@/models/fact-sheet';
import { readEngineJobs, readIntentions, type EngineJob, type Intention } from '@/models/engine-log';
import { readLedger, readLedgerEntry, readSpecialists, type Ledger, type LedgerEntry, type Specialist } from '@/models/specialists';
import { readCaptures, readCaptureSettings, type CaptureSettings, type Captures } from '@/models/captures';
import { readCatalog, type CatalogItem } from '@/models/catalog';
import {
  readIdeaCard,
  readIdeaCardDeeper,
  readIdeaCardDone,
  readIdeaCardSet,
  readSetState,
  type IdeaCard,
  type IdeaCardDeeper,
  type IdeaCardDone,
  type IdeaCardSet,
  type IdeaSetState,
} from '@/models/idea-cards';
import { readLongTask, readLongTaskReport, readResearchAvailability, reportFileName } from '@/models/long-tasks';
import {
  readAdminKey,
  readAdminStatus,
  readCaches,
  readFileListing,
  readFreed,
  readHealth,
  readModeChange,
  readOverview,
  readPower,
  readReliability,
  readTasks,
  readUnlocked,
} from '@/models/pond-admin';
/**
 * PondApiClient — HTTP client for goose-in-a-pond.
 *
 * Implements the GIAP ↔ GOTG handshake protocol:
 *   1. handshakeInit    — POST /api/v1/handshake/pake/init   → challenge + the Pond's CPace share
 *   2. handshakeVerify  — POST /api/v1/handshake/pake/verify → tokens + the Pond's confirmation
 *   3. pair             — runs both with the six-digit code or a setup card's (see services/cpace.ts)
 *   4. handshakeRefresh                                      → fresh tokens
 *
 * The active session token is automatically attached to every request as
 * `Authorization: Bearer <token>`. On 401, the client tries one refresh
 * before bubbling the error up to the caller.
 */

import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

import { confirmationMatches, NONCE_BYTES, respond, type PakeCredential } from './cpace';
import { randomBytes } from './secure-random';
import { timeoutSignal } from './http';
import { readSse, type SseEvent } from './sse';
import type { ServerNotification } from './notification-stream';
import type {
  RoomVoiceEvent,
  VoiceAgent,
  VoiceAgentPatch,
  VoicePrints,
  VoiceTakeInput,
  VoiceTakeResult,
  HomeLocationResult,
  WakeCheck,
  VoiceRoom,
  AdminCache,
  AdminCacheId,
  AdminFileListing,
  AdminHealth,
  AdminReliability,
  AdminOverview,
  AdminPower,
  AdminStatus,
  AdminTask,
  AdminUnlocked,
  PowerModeChange,
  DeepResearchAvailability,
  LongTaskReportWire,
  ReportFormat,
  LongTask,
  LongTaskArtifactBody,
  AgentPrefills,
  AgentRecipe,
  AgentSuggestion,
  RecipeValidation,
  ActivityPurge,
  RidePoint,
  RideQuote,
  Room,
  ActivityResponse,
  ActivitySummary,
  ActivityWindow,
  CameraEvent,
  CameraEventMetadata,
  CameraInfo,
  CommissionDeviceRequest,
  CommissionDeviceResponse,
  CreateDeviceRequest,
  Device,
  DiscoveredDevice,
  DeviceEvent,
  DeviceSelf,
  MemberNotes,
  ProfileInterview,
  CartWriteWire,
  InterestWriteWire,
  InterviewApproveWire,
  NewsSettingsWire,
  StoryVoteWire,
  TodoAnswerWire,
  TodoWriteWire,
  AnchorPatchWire,
  AnchorStopWire,
  CaptureSettingsWire,
  CaptureWire,
  DeliverableRejectWire,
  IdeaCardDismissWire,
  FactCategoryWire,
  FactPatchWire,
  LedgerPatchWire,
  NewAnchorWire,
  QuestionAnswerWire,
  QuestionBatchAnswerWire,
  DeviceStatePatch,
  EventCategory,
  Extension,
  ExtensionSecretsResult,
  LogEntry,
  LogStreamEvent,
  LogStreamStatus,
  DeveloperDebug,
  SecretSaveResult,
  TelemetrySummary,
  TurnMetrics,
  MarketplaceExtension,
  ChatFrame,
  ActiveRun,
  ChatStreamRequest,
  ChatTurn,
  MatterStatus,
  ConsolidationEvent,
  MemoryFragment,
  Reminder,
  Proposal,
  ProposalDecision,
  ProposalDecisionResult,
  ProposalList,
  SaveMemoryRequest,
  UpdateMemoryRequest,
  PromptExtra,
  SavePromptExtraRequest,
  ModelActiveRoles,
  ActiveChatRole,
  ModelRollbackResult,
  ModelCapabilities,
  ModelEntry,
  ModelListResponse,
  ModelMemoryStatus,
  NowPlayingResponse,
  OAuthProvider,
  OAuthSignInStatus,
  OAuthStart,
  Profile,
  CreateScheduleRequest,
  Rule,
  RuleRequest,
  Schedule,
  ScheduleResultEvent,
  ScheduleRun,
  UpdateScheduleRequest,
  SessionMessage,
  SessionSummary,
  OfferAnswer,
  SuggestionList,
  SystemInfo,
  ToolCallResult,
  TranscribeResponse,
  UpcomingSchedule,
  UpdateDeviceRequest,
  UsageSummary,
  WeatherResponse,
  WebSearchKeyResult,
  WebSearchState,
  DetectedPlace,
  PondSettings,
  RetitleResult,
  RetitleOneResult,
  TtsApplyResult,
  ZoneChoice,
  DiskUsage,
  DownloadAction,
  DownloadEntry,
  HfModel,
  HelperModel,
  HfModelFile,
  ModelRole,
  OnboardCompletion,
  OnboardStatus,
  ProfilePrefs,
  WarmupStatus,
  FaceOverview,
  FacePerson,
  FaceRegistration,
  FaceThreshold,
  VisionConfig,
  VisionStatus,
  PromptTemplate,
} from './types';
import { MODEL_CATEGORIES } from './types';

/**
 * A non-2xx response, carrying the pieces a caller needs to react properly —
 * chiefly the status and, on a 429, how long the server asked us to wait.
 * Without `retryAfterSecs` a caller can only guess, and guessing badly is how
 * a client ends up hammering an endpoint it has already been throttled on.
 */
/** A route answer, or a throw: a body that is not one must not pass for the Pond's state. */
function routeOrThrow(raw: unknown): RouteState {
  const state = readRoute(raw);
  if (!state) throw new Error('The Pond answered the remote access route with something unexpected');
  return state;
}

/** How long a turn waits for this phone's place before it is sent without one. */
const PLACE_WAIT_MS = 1_500;

/** `work`'s value if it settles within `ms` and before `signal` aborts; undefined otherwise. */
function within<T>(work: Promise<T>, ms: number, signal?: AbortSignal): Promise<T | undefined> {
  return new Promise((resolve) => {
    const done = (value: T | undefined) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', give);
      resolve(value);
    };
    const give = () => done(undefined);
    const timer = setTimeout(give, ms);
    if (signal?.aborted) give();
    else signal?.addEventListener('abort', give);
    work.then(done, give);
  });
}

export class ApiError extends Error {
  readonly status: number;
  readonly retryAfterSecs: number | null;
  /**
   * The Pond's own `{"error": "..."}` sentence, when it sent one. A 400 from
   * the scheduler says which field was wrong ("invalid cron expression", "a
   * rule needs at least one action"), which a form can show where a status
   * code could not. English, from the server: not for general display. Some
   * refusals carry a code here instead, such as enrollment's `stale_identity`,
   * which a caller matches rather than shows.
   */
  readonly detail: string | null;
  /** The refusal's parsed JSON, for a route whose answer is more than a sentence, such as `missing_fields`. */
  readonly body: unknown;

  constructor(message: string, status: number, retryAfterSecs: number | null, detail: string | null = null, body: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfterSecs = retryAfterSecs;
    this.detail = detail;
    this.body = body;
  }

  /** True when retrying later could plausibly succeed. */
  get isRetryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

/** Parse a `Retry-After` header. Only the delta-seconds form is used here. */
function parseRetryAfter(res: Response): number | null {
  const raw = res.headers.get('Retry-After');
  if (!raw) return null;
  const secs = Number(raw.trim());
  return Number.isFinite(secs) && secs >= 0 ? secs : null;
}

export interface HandshakeResponse {
  accepted: boolean;
  session_token: string | null;
  refresh_token?: string | null;
  expires_at?: string | null;
  hostname: string;
  server_version: string;
  capabilities: string[];
  rejection_reason: string | null;
  /**
   * The Pond's CPace confirmation tag, T_server, as lowercase hex. Present on an
   * accepted pairing and on one held by the pairing lock, and checked by
   * {@link PondApiClient.pair} before any token or request in this response is kept.
   */
  server_proof?: string | null;
  /**
   * The Pond's pairing lock is on: the code was right, and the phone now waits for the main
   * member. Present only once the Pond's confirmation has verified. In memory only.
   */
  held?: HeldPairing;
}

/** What the Pond says of a phone that came back for its held request. */
export type PairingClaim =
  | { status: 'waiting' }
  | { status: 'paired'; response: HandshakeResponse }
  | { status: 'declined' }
  | { status: 'gone' };

/** What the Pond says of a recovery PIN: the pairing, or why not. */
export type PairingRecovery =
  | PairingClaim
  | { status: 'wrong_pin'; triesLeft: number | null }
  | { status: 'cooling'; retryAfterSecs: number }
  | { status: 'no_pin' };

/** The Pond's answer to `pake/init`: the challenge and its CPace share. */
export interface PakeChallenge {
  challenge_id: string;
  /** 32 bytes, standard base64: the Pond's half of sid. */
  challenge: string;
  expires_at: string;
  /** The only suite there is; anything else is refused. */
  suite: string;
  /** Ya, the Pond's 32-byte ristretto255 share, standard base64. */
  share: string;
}

/** The Pond's answer to `handshake/spoken-code`. It never carries the code, only that one was said. */
export interface SpokenCode {
  spoken: true;
  expires_at: string;
}

/** The suite `pake/init` must answer with. */
const PAKE_SUITE = 'CPACE-RISTR255-SHA512';

/**
 * The pairing protocol this app speaks, as `/system/info` reports it.
 *
 * There is exactly one: no fallback, and no negotiation. A Pond reporting
 * anything else is too old to pair with, and the user is told to update it.
 */
export const PAIRING_PROTOCOL = 3;

/** The Pond does not speak {@link PAIRING_PROTOCOL}. Shown as "update the Pond". */
export class PondOutdatedError extends Error {
  constructor(reported: unknown) {
    super(`Pond reports pairing protocol ${String(reported)}, this app needs ${PAIRING_PROTOCOL}`);
    this.name = 'PondOutdatedError';
  }
}

/** Standard base64 of `bytes`. */
function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Bytes of standard base64 `b64`; throws on anything that is not. */
function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** The Pond's hex confirmation tag as bytes; anything that is not hex is an empty tag, which never matches. */
function parseTag(hex: string | null | undefined): Uint8Array {
  try { return hexToBytes(hex ?? ''); } catch { return new Uint8Array(0); }
}

/** How long to wait for /health before calling the Pond unreachable. */
const HEALTH_TIMEOUT_MS = 3_000;

/** A Pond's tailnet address: Tailscale's CGNAT range or its ULA prefix. */
function isTailnetUrl(url: string): boolean {
  const host = url.replace(/^https?:\/\/\[?/, '').split(/[\]/:]/)[0] ?? '';
  const octets = host.split('.').map(Number);
  if (octets.length === 4 && octets[0] === 100 && octets[1] >= 64 && octets[1] < 128) return true;
  return host.toLowerCase().startsWith('fd7a:115c:a1e0:');
}

/**
 * Why a health probe got no answer, as a word an engineer can act on: `timeout`, or the
 * platform's exception class (`ConnectException`, `UnknownHostException`, ...), or `network`.
 * Never the message itself, which carries addresses.
 */
function probeFailureReason(error: unknown): string {
  if (error instanceof Error && error.name === 'AbortError') return 'timeout';
  const message = error instanceof Error ? error.message : String(error);
  return /(\w+(?:Exception|Error))\b/.exec(message)?.[1] ?? 'network';
}

/**
 * Route selection publishes only "disconnected"; this says which route failed and how. On
 * 2026-10-28 a phone on mobile data could not reach its Pond and the log said nothing more.
 */
function logProbeFailure(url: string, reason: string, latencyMs: number): void {
  console.info('[connection] probe got no answer', {
    kind: 'route_probe_failed', route: isTailnetUrl(url) ? 'remote' : 'local', reason, latencyMs,
  });
}

/** Default ceiling for an ordinary request. A Pond on the LAN is close by. */
const REQUEST_TIMEOUT_MS = 15_000;
const PICTURES_TIMEOUT_MS = 30_000;

/**
 * Matter commissioning gets its own, far longer budget: the server allows itself
 * 180s for the radio work, so anything shorter here would abandon a commission
 * that was still going to succeed.
 */
const COMMISSION_TIMEOUT_MS = 190_000;

/**
 * Installing an extension, or restarting one with new credentials. The Pond
 * spawns it (`npx -y <package>`, which downloads the package the first time)
 * and answers only once it has started, which can take minutes. At the default
 * 15s the request was abandoned while the install was still going.
 */
const INSTALL_TIMEOUT_MS = 300_000;

/**
 * A chat turn, which is a language model generating on the Pond's own hardware.
 *
 * The default 15s is a LAN round trip, and this is not one: a 4B model on a
 * small box takes tens of seconds before the first token, and the route answers
 * whole rather than streaming, so nothing arrives until it is finished. At 15s
 * every answer was abandoned mid-generation and reported as a fetch error.
 */
const CHAT_TIMEOUT_MS = 180_000;

/**
 * How long a streaming turn may go silent before it is taken for dead.
 *
 * Not a budget for the turn: a turn can run for minutes. The Pond writes a
 * keep-alive comment after 15s without a frame, so a live stream is never quiet
 * for long, and a minute of nothing means the connection has gone.
 */
const STREAM_IDLE_MS = 60_000;

/**
 * A turn waiting on Goose's questions: the Pond holds the stream silent for up to 10 minutes
 * before the `ask` tool gives up, so the guard waits that long and a little more.
 */
export const ASK_WAIT_IDLE_MS = 11 * 60_000;

/** A chat stream's frames, watched for an `ask` call, and the stall guard that follows them. */
function askAwareStream(onFrame: (frame: ChatFrame) => void, waiting: ReadonlySet<string> = new Set()): { onFrame: (frame: ChatFrame) => void; idleMs: () => number } {
  let asks = waiting;
  return {
    onFrame: (frame) => {
      asks = watchAsks(asks, frame);
      onFrame(frame);
    },
    idleMs: () => (asks.size > 0 ? ASK_WAIT_IDLE_MS : STREAM_IDLE_MS),
  };
}

/** Transcription pads every clip to a 30s window, and the first speech call loads a model. */
const VOICE_TIMEOUT_MS = 45_000;
/** The speaker model is about 26 MB; over a slow Wi-Fi it takes a while. */
const MODEL_DOWNLOAD_TIMEOUT_MS = 180_000;

/** A face sample is detected, aligned and embedded on the Pond's own CPU before it answers. */
const FACE_TIMEOUT_MS = 45_000;

/**
 * Switching the speaking tier fetches its weights before the Pond answers, tens of megabytes. At the
 * default 15s a first switch on a fresh Pond was abandoned mid-download and reported as a failure.
 */
const TTS_APPLY_TIMEOUT_MS = 180_000;

/**
 * An event, as the frame it carries.
 *
 * `[DONE]` is an older end marker pond-desktop still honours; the Pond itself
 * ends with a `{done: true}` frame. A line that is not JSON is skipped — one
 * garbled frame should not end a turn that is otherwise arriving.
 */
function deliver(event: SseEvent, onFrame: (frame: ChatFrame) => void): void {
  if (event.data === '[DONE]') {
    onFrame({ done: true });
    return;
  }
  let frame: ChatFrame;
  try {
    frame = JSON.parse(event.data) as ChatFrame;
  } catch {
    return;
  }
  const seq = event.id === undefined ? NaN : Number(event.id);
  onFrame(Number.isFinite(seq) ? { ...frame, seq } : frame);
}

/**
 * Read a response body, tolerating the ones that have none.
 *
 * DELETE and the action routes answer 204, and `res.json()` throws on an empty
 * body — which would have turned every successful delete into an error the
 * caller had to special-case.
 */
async function parseBody<T>(res: Response): Promise<T | undefined> {
  if (res.status === 204) return undefined;
  const text = await res.text();
  if (text.length === 0) return undefined;
  return JSON.parse(text) as T;
}

/** A handshake refusal, read from one body: the Pond names a wait in `retry_after` as well as in Retry-After. */
async function handshakeRefusal(message: string, res: Response): Promise<ApiError> {
  return refusalOf(message, res, (await parseBody<Record<string, unknown>>(res).catch(() => undefined)) ?? {});
}

function refusalOf(message: string, res: Response, body: Record<string, unknown>): ApiError {
  const detail = typeof body.error === 'string' && body.error.trim() ? body.error : null;
  const wait = body.retry_after;
  const bodyWait = typeof wait === 'number' && Number.isFinite(wait) && wait >= 0 ? wait : null;
  return new ApiError(message, res.status, parseRetryAfter(res) ?? bodyWait, detail, body);
}

/** Why a verify was refused: the Pond names it in `rejection_reason` and again in `error`. */
function heldReason(resp: HandshakeResponse): string | null {
  const error = (resp as { error?: unknown }).error;
  return resp.rejection_reason ?? (typeof error === 'string' ? error : null);
}

/** A verify's answer with the held request read, and its secret under no other name. */
function withHeld(resp: HandshakeResponse, held: HeldPairing | null): HandshakeResponse {
  const out: HandshakeResponse & { pairing_request?: unknown } = { ...resp, rejection_reason: heldReason(resp) };
  delete out.pairing_request;
  if (held) out.held = held;
  return out;
}

/** A refusal's JSON body, or null for any other body. */
async function errorBody(res: Response): Promise<unknown> {
  try {
    return (await parseBody<unknown>(res)) ?? null;
  } catch {
    return null;
  }
}

/** The `error` string of a refusal's body, or null. */
function detailOf(body: unknown): string | null {
  const error = (body as { error?: unknown } | null)?.error;
  return typeof error === 'string' && error.trim() ? error : null;
}

async function errorDetail(res: Response): Promise<string | null> {
  return detailOf(await errorBody(res));
}

/** The guard's refusal of every protected route until the Pond's owner has finished setting it up. */
export const ONBOARDING_REQUIRED = 'onboarding_required';

/**
 * The Pond's 501 for consolidation when its build has no runner, as opposed to the setting being
 * off (`start_consolidation` in `pond-api/src/routes.rs`). The two want different fixes.
 */
export const CONSOLIDATION_NOT_BUILT = 'Memory consolidation is not available in this build';


/**
 * Unwrap a collection that may arrive bare or inside an envelope.
 *
 * The envelope is input, not a guarantee. Nine wrappers declared the body as
 * `{ key: T[] } | T[]` and returned `res.key` for the object case, which types as
 * `T[]` whatever the server actually sent -- so a Pond answering `{}`, or an
 * envelope carrying a null list, produced `undefined`. That reached a screen as
 * state and threw on the first `.find` or `.map`, which is how opening AI Models
 * killed the app rather than showing the empty state it already has.
 *
 * A shape the client did not expect is an empty collection, and every one of
 * these screens has something to say about an empty collection.
 */
/** A reader's answer, or a throw: a body that is not the answer must not pass for an empty one. */
function required<T>(value: T | null, what: string): T {
  if (value === null) throw new Error(`The Pond answered ${what} with something unexpected`);
  return value;
}

function collection<T>(res: unknown, key: string): T[] {
  if (Array.isArray(res)) return res as T[];
  const value = (res as Record<string, unknown> | null | undefined)?.[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * One camera event from the Pond, whichever build sent it. An older Pond sends no `snapshot_url`
 * and no `acknowledged` on its stream, and a camera that posts its own events carries `metadata`
 * as the JSON text it posted; all three read as what they are. Anything with no id or no kind is
 * not an event.
 */
export function readCameraEvent(raw: unknown): CameraEvent | null {
  const e = raw as Record<string, unknown> | null;
  if (!e || typeof e.id !== 'number' || typeof e.event_type !== 'string') return null;
  let metadata: unknown = e.metadata;
  if (typeof metadata === 'string') {
    try {
      metadata = JSON.parse(metadata);
    } catch {
      metadata = null;
    }
  }
  return {
    id: e.id,
    camera_id: typeof e.camera_id === 'string' ? e.camera_id : '',
    event_type: e.event_type,
    confidence: typeof e.confidence === 'number' ? e.confidence : null,
    snapshot_path: typeof e.snapshot_path === 'string' ? e.snapshot_path : null,
    snapshot_url: typeof e.snapshot_url === 'string' && e.snapshot_url ? e.snapshot_url : null,
    metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? (metadata as CameraEventMetadata) : null,
    acknowledged: e.acknowledged === true,
    created_at: typeof e.created_at === 'string' ? e.created_at : '',
  };
}

/** Refresh responses that mean the Pond will not accept this refresh token. */
const REFRESH_REFUSED = [400, 401, 403, 404, 410];

export class PondApiClient {
  private baseUrl: string;
  private token: string | null = null;
  private refreshToken: string | null = null;
  /** Called after a refresh succeeds so the caller can re-persist the pair. */
  private onTokensRotated: ((session: string, refresh: string) => void) | null = null;
  /** Called with what the Pond says it can do, each time a refresh is accepted. */
  private onCapabilities: ((capabilities: string[]) => void) | null = null;
  /** The refresh every concurrent 401 waits on, rather than each starting its own. */
  private refreshInFlight: Promise<HandshakeResponse | null> | null = null;

  private recovery: (() => Promise<string | null>) | null = null;
  private authRevoked: (() => void) | null = null;
  private onboardingRequired: (() => void) | null = null;
  private identityEpoch = 0;
  setRecovery(recover: (() => Promise<string | null>) | null) { this.recovery = recover; }
  /** Whether a session is loaded, so background work can tell a running app from a cold start. */
  get signedIn(): boolean { return this.token !== null; }

  /**
   * Called when the Pond refuses this phone's credentials and a refresh cannot
   * replace them -- the device was unregistered, or its session was revoked.
   *
   * Distinct from `setRecovery`, which exists for a transport that might come
   * back. This one cannot be recovered from by trying again, and saying so is
   * what stops the connection banner alternating between "connected" (the
   * token-less health probe still succeeds) and "reconnecting" (every real
   * request still fails).
   */
  setAuthRevoked(onRevoked: (() => void) | null) { this.authRevoked = onRevoked; }
  /** Called when the Pond refuses a request because its owner has not finished setting it up. */
  setOnboardingRequired(onRequired: (() => void) | null) { this.onboardingRequired = onRequired; }
  invalidateIdentity() { this.identityEpoch++; this.token = null; this.refreshToken = null; }

  constructor(baseUrl = 'https://127.0.0.1:4443') {
    this.baseUrl = normalizePondUrl(baseUrl);
  }

  setBaseUrl(url: string) {
    this.baseUrl = normalizePondUrl(url);
  }

  /** Where this phone is, for each turn, while the person shares it (`services/phone-place.ts`). */
  private turnPlace: (() => Promise<string | undefined>) | null = null;

  /** Installed at launch by `loadPhonePlacePreference`, which keeps location out of this client. */
  setTurnPlace(source: () => Promise<string | undefined>) {
    this.turnPlace = source;
  }

  setToken(token: string | null) {
    this.token = token;
  }

  /**
   * Whether this client holds a session token and something persists its
   * rotation -- in the app, the ServerProvider that restored the pairing. A
   * push wake-up that finds one uses this client as it is rather than restoring
   * a second copy of the pairing beside it.
   *
   * The rotation handler is part of the test because a refresh without it
   * rotates the pair in memory only, and the next launch reads a refresh token
   * the Pond has already retired. The provider clears the handler when it
   * unmounts, which is when a background caller has to restore its own.
   */
  get hasSession(): boolean {
    return this.token !== null && this.onTokensRotated !== null;
  }

  setRefreshToken(token: string | null) {
    this.refreshToken = token;
  }

  setOnTokensRotated(cb: ((session: string, refresh: string) => void) | null) {
    this.onTokensRotated = cb;
  }

  setOnCapabilities(cb: ((capabilities: string[]) => void) | null) {
    this.onCapabilities = cb;
  }

  /**
   * Every request to the Pond goes through here: the pin is checked, redirects
   * are refused, and a request is cut off at `timeoutMs` unless the caller
   * passes its own `signal`. A stream passes `null`, since silence there is
   * the stream's to judge.
   */
  private async send(url: string, init: RequestInit, timeoutMs: number | null = REQUEST_TIMEOUT_MS): Promise<Response> {
    const epoch = this.identityEpoch;
    const origin = new URL(url).origin;
    await assertPondTrust(origin);
    if (epoch !== this.identityEpoch) throw new Error('Pond profile changed');
    const headers = new Headers(init.headers);
    // The marker asks PondTls to pin this request, and PondTls refuses it over plain HTTP.
    // A plaintext development origin has no pin, so it goes out as an ordinary fetch.
    if (!isInsecureDevOrigin(origin)) headers.set('X-Pond-Transport', '1');
    const response = await fetch(url, { ...init, headers, redirect: 'error',
      signal: init.signal ?? (timeoutMs === null ? undefined : timeoutSignal(timeoutMs)) });
    if (epoch !== this.identityEpoch) throw new Error('Pond profile changed');
    if (response.status >= 300 && response.status < 400) throw new Error('Pond redirect rejected');
    return response;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  }

  /**
   * Probe the server's unauthenticated /health route.
   *
   * Never throws: an unreachable Pond is an expected state here, not an error,
   * so callers get `ok: false` rather than a rejection to handle.
   */
  async health(): Promise<{ ok: boolean; latencyMs: number; trustFailure?: boolean }> {
    const start = Date.now();
    try {
      const res = await this.send(`${this.baseUrl}/api/v1/health`, {
        headers: {},
        signal: timeoutSignal(HEALTH_TIMEOUT_MS),
      });
      if (!res.ok) logProbeFailure(this.baseUrl, `http_${res.status}`, Date.now() - start);
      return { ok: res.ok, latencyMs: Date.now() - start };
    } catch (error) {
      const trustFailure = await pondTrustFailed(this.baseUrl).catch(() => true);
      logProbeFailure(this.baseUrl, trustFailure ? 'trust' : probeFailureReason(error), Date.now() - start);
      return { ok: false, latencyMs: Date.now() - start, trustFailure };
    }
  }

  /**
   * Phase 1: open a CPace run. The Pond commits to its newest pairing code,
   * answers with its share, and holds its secret scalar for 60 seconds.
   *
   * The Pond compares `channelBinding` with its own pin only as an early,
   * readable refusal (`channel_binding_mismatch`). The binding that protects
   * anything is the pin inside the CPace generator; see services/cpace.ts.
   */
  async handshakeInit(input: {
    clientId: string;
    channelBinding: string;
    /** This phone's half of sid, {@link NONCE_BYTES} from the platform CSPRNG. */
    clientNonce: Uint8Array;
    credential?: PakeCredential;
    clientType?: string;
    clientVersion?: string;
  }): Promise<PakeChallenge> {
    const res = await this.send(`${this.baseUrl}/api/v1/handshake/pake/init`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        client_id: input.clientId,
        client_type: input.clientType ?? 'gotg',
        client_version: input.clientVersion ?? '1.0.0',
        channel_binding: input.channelBinding,
        client_nonce: toBase64(input.clientNonce),
        // Absent means pairing, so a pairing init is still the request the Pond's vectors pin.
        ...(input.credential && input.credential !== 'pairing' ? { credential: input.credential } : {}),
      }),
    });
    if (!res.ok) throw await handshakeRefusal(`handshake/pake/init failed: ${res.status}`, res);
    return (await res.json()) as PakeChallenge;
  }

  /** Phase 2: send this phone's CPace share and its confirmation tag. */
  async handshakeVerify(input: {
    challengeId: string;
    /** Yb, sent as standard base64. */
    share: Uint8Array;
    /** T_client, sent as lowercase hex. */
    confirm: Uint8Array;
    deviceName?: string;
  }): Promise<HandshakeResponse> {
    const res = await this.send(`${this.baseUrl}/api/v1/handshake/pake/verify`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        challenge_id: input.challengeId,
        device_name: input.deviceName ?? null,
        share: toBase64(input.share),
        confirm: bytesToHex(input.confirm),
      }),
    });
    if (!res.ok) throw await handshakeRefusal(`handshake/pake/verify failed: ${res.status}`, res);
    return (await res.json()) as HandshakeResponse;
  }

  /**
   * Pair with the six-digit code, or claim with a setup card's, over CPace. On
   * success the session+refresh tokens are stored on this client (use
   * {@link setOnTokensRotated} to persist).
   *
   * Throws {@link PondOutdatedError} before sending anything when the Pond does
   * not report {@link PAIRING_PROTOCOL}, and {@link PondTrustError} when the
   * Pond's answers do not check out: a malformed or invalid share, or an
   * acceptance without the confirmation tag only the code's holder can make.
   */
  async pair(input: {
    clientId: string;
    /** The six pairing digits, or the eleven setup digits without dashes when `credential` is setup. */
    pairingCode: string;
    credential?: PakeCredential;
    deviceName?: string;
    /**
     * The Pond public-key pin this connection is pinned to. It goes into the
     * CPace channel identifier, so a phone pinned to any key but the Pond's runs
     * a different generator and the exchange fails. On a plaintext development
     * origin it is the pin the Pond reported for itself, which binds nothing.
     */
    channelBinding: string;
  }): Promise<HandshakeResponse> {
    const epoch = this.identityEpoch;
    const info = await this.systemInfo();
    if (info.protocol !== PAIRING_PROTOCOL) {
      console.warn('[pairing] Pond reports pairing protocol', info.protocol ?? 'none', 'and needs an update');
      throw new PondOutdatedError(info.protocol);
    }
    if (isInsecureDevOrigin(this.baseUrl)) {
      console.warn('[pairing] over a plaintext development connection: the pin binds nothing');
    }
    const clientNonce = randomBytes(NONCE_BYTES);
    const init = await this.handshakeInit({
      clientId: input.clientId,
      channelBinding: input.channelBinding,
      clientNonce,
      credential: input.credential,
    });
    if (epoch !== this.identityEpoch) throw new Error('Pond profile changed');
    let exchange: ReturnType<typeof respond>;
    try {
      if (init.suite !== PAKE_SUITE) throw new Error(`unexpected suite ${String(init.suite)}`);
      exchange = respond({
        code: input.pairingCode,
        pin: input.channelBinding,
        clientId: input.clientId,
        credential: input.credential,
        challenge: fromBase64(init.challenge),
        clientNonce,
        initiatorShare: fromBase64(init.share),
        random: randomBytes,
      });
    } catch (error) {
      // A Pond that speaks protocol 3 does not send these. Whatever did is not
      // to be answered with a share derived from the code.
      console.warn('[pairing] refused the Pond\'s CPace answer:', error instanceof Error ? error.message : error);
      throw new PondTrustError();
    }
    const resp = await this.handshakeVerify({
      challengeId: init.challenge_id,
      share: exchange.share,
      confirm: exchange.confirm,
      deviceName: input.deviceName,
    });
    if (epoch !== this.identityEpoch) throw new Error('Pond profile changed');
    // The Pond's confirmation. Without it, something that terminated this
    // connection with its own certificate could invent an acceptance and a token
    // of its own, and this phone would be paired with the interceptor. Only the
    // party that ran CPace with the right code and the same pin can produce it.
    // A pairing the lock holds is confirmed the same way: the phone will come back to this Pond
    // for tokens, and must not come back to something that only claimed to hold it.
    const held = !resp.accepted && heldReason(resp) === APPROVAL_REQUIRED ? readHeldPairing((resp as { pairing_request?: unknown }).pairing_request) : null;
    if ((resp.accepted || held) && !confirmationMatches(parseTag(resp.server_proof), exchange.expectedServerConfirm)) {
      console.warn('[pairing] the Pond\'s confirmation did not verify; no token kept');
      this.token = null;
      this.refreshToken = null;
      throw new PondTrustError();
    }
    if (resp.accepted && resp.session_token) this.keepPairing(resp);
    if (held && Array.isArray(resp.capabilities)) held.capabilities = resp.capabilities;
    return withHeld(resp, held);
  }

  /** Keep an accepted pairing's tokens on this client, and tell whoever persists them. */
  private keepPairing(resp: HandshakeResponse): void {
    if (!resp.session_token) return;
    this.token = resp.session_token;
    this.refreshToken = resp.refresh_token ?? null;
    if (resp.refresh_token && this.onTokensRotated) {
      this.onTokensRotated(resp.session_token, resp.refresh_token);
    }
  }

  /** The answer to a claim or a recovery, when it is one of the four a waiting phone can get. */
  private readClaim(status: number, body: Record<string, unknown>, held: HeldPairing): PairingClaim | null {
    if (status === 202) return { status: 'waiting' };
    if (status === 410) return { status: 'gone' };
    if (status === 403) return body.status === 'declined' ? { status: 'declined' } : null;
    if (status !== 200) return null;
    if (body.status === 'waiting') return { status: 'waiting' };
    const session = typeof body.session_token === 'string' ? body.session_token : '';
    if (body.accepted !== true || !session) return null;
    const response: HandshakeResponse = {
      accepted: true,
      session_token: session,
      refresh_token: typeof body.refresh_token === 'string' ? body.refresh_token : null,
      expires_at: typeof body.expires_at === 'string' ? body.expires_at : null,
      hostname: typeof body.hostname === 'string' ? body.hostname : '',
      server_version: typeof body.server_version === 'string' ? body.server_version : '',
      capabilities: Array.isArray(body.capabilities) ? body.capabilities.filter((c): c is string => typeof c === 'string') : (held.capabilities ?? []),
      rejection_reason: null,
    };
    this.keepPairing(response);
    return { status: 'paired', response };
  }

  /** Ask one of the two routes a waiting phone has. The body carries the claim secret, so nothing here logs it. */
  private async askHeld(route: 'claim' | 'recover', held: HeldPairing, pin?: string) {
    const epoch = this.identityEpoch;
    const res = await this.send(`${this.baseUrl}/api/v1/handshake/pairing-request/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: held.requestId, claim_secret: held.claimSecret, ...(pin === undefined ? {} : { pin }) }),
    });
    const parsed = await errorBody(res);
    if (epoch !== this.identityEpoch) throw new Error('Pond profile changed');
    const body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    return { claim: this.readClaim(res.status, body, held), refusal: refusalOf(`handshake/pairing-request/${route} failed: ${res.status}`, res, body) };
  }

  /**
   * Come back for a pairing the lock is holding. Answers whether the phone still waits, was let
   * in (the tokens are then kept on this client, as `pair` keeps them), was declined, or waited
   * too long. Throws only for an answer that is none of those: off the home network, or no answer.
   */
  async claimPairingRequest(held: HeldPairing): Promise<PairingClaim> {
    const { claim, refusal } = await this.askHeld('claim', held);
    if (!claim) throw refusal;
    return claim;
  }

  /** The main member's new phone lets itself in with the Pond's recovery PIN. */
  async recoverPairingRequest(held: HeldPairing, pin: string): Promise<PairingRecovery> {
    const { claim, refusal } = await this.askHeld('recover', held, pin);
    if (claim) return claim;
    if (refusal.detail === 'wrong_pin') {
      const left = (refusal.body as { tries_left?: unknown } | null)?.tries_left;
      return { status: 'wrong_pin', triesLeft: typeof left === 'number' && Number.isFinite(left) && left >= 0 ? left : null };
    }
    if (refusal.detail === 'pin_cooling') {
      const wait = (refusal.body as { retry_after_secs?: unknown } | null)?.retry_after_secs;
      const secs = typeof wait === 'number' && Number.isFinite(wait) && wait > 0 ? wait : refusal.retryAfterSecs;
      return { status: 'cooling', retryAfterSecs: secs && secs > 0 ? Math.ceil(secs) : 60 };
    }
    if (refusal.detail === 'no_recovery_pin') return { status: 'no_pin' };
    throw refusal;
  }

  /**
   * Ask the Pond to read a pairing code aloud, for a phone with no card and no screen to read one from.
   * No token and no body: the Pond answers only LAN peers, and only someone in earshot learns the code.
   */
  async requestSpokenCode(): Promise<SpokenCode> {
    const res = await this.send(`${this.baseUrl}/api/v1/handshake/spoken-code`, { method: 'POST', headers: {} });
    if (!res.ok) throw await handshakeRefusal(`handshake/spoken-code failed: ${res.status}`, res);
    const body = await parseBody<{ spoken?: unknown; expires_at?: unknown }>(res);
    if (body?.spoken !== true) throw new Error('Pond did not confirm that it said a code');
    return { spoken: true, expires_at: typeof body.expires_at === 'string' ? body.expires_at : '' };
  }

  /** Exchange the stored refresh token for a fresh pair. */
  async handshakeRefresh(): Promise<HandshakeResponse | null> {
    if (!this.refreshToken) return null;
    const epoch = this.identityEpoch;
    const res = await this.send(`${this.baseUrl}/api/v1/handshake/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: this.refreshToken }),
    });
    if (!res.ok) {
      // Only the Pond refusing the refresh token says these credentials are dead.
      // A rate limit, a restart or a gateway error says nothing about them, and
      // treating it as a refusal revoked -- and since #59, wiped -- a pairing
      // whose refresh token was still good.
      if (REFRESH_REFUSED.includes(res.status)) return null;
      throw new ApiError(`handshake/refresh → ${res.status}`, res.status, parseRetryAfter(res));
    }
    const body = (await res.json()) as HandshakeResponse;
    if (epoch !== this.identityEpoch) throw new Error('Pond profile changed');
    if (body.accepted && body.session_token) {
      this.token = body.session_token;
      this.refreshToken = body.refresh_token ?? null;
      if (body.refresh_token && this.onTokensRotated) {
        this.onTokensRotated(body.session_token, body.refresh_token);
      }
      if (Array.isArray(body.capabilities)) this.onCapabilities?.(body.capabilities);
    }
    return body;
  }

  /** Revoke the current session token on the server. */
  async handshakeRevoke(): Promise<void> {
    if (!this.token) return;
    const response = await this.send(`${this.baseUrl}/api/v1/handshake/revoke`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ token: this.token }),
    });
    if (!response.ok) throw new ApiError('Pond revocation failed', response.status, parseRetryAfter(response));
    const result = await response.json();
    // An ApiError, not a bare Error: the Pond answered, which is what tells unpairing this apart
    // from a Pond that could not be reached at all.
    if (result?.revoked !== true) throw new ApiError('Pond revocation was not acknowledged', response.status, null);
    this.token = null;
    this.refreshToken = null;
  }

  /**
   * Wrapper around `fetch` that attaches the bearer token and transparently
   * refreshes once on 401. Returns the parsed JSON body.
   *
   * Concurrent 401s share one refresh. Without that, a screen firing several
   * requests at once on a stale token would send a refresh per request, and
   * every one but the first would present an already-rotated refresh token —
   * turning one recoverable expiry into a forced re-pair.
   */
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!path.startsWith('/api/') || path.startsWith('//')) throw new Error('Invalid Pond API path');
    const epoch = this.identityEpoch;
    let sentWith = this.token;
    const doFetch = () => {
      sentWith = this.token;
      return this.send(`${this.baseUrl}${path}`, {
        ...init,
        headers: { ...this.headers(), ...(init.headers ?? {}) },
        signal: init.signal ?? timeoutSignal(REQUEST_TIMEOUT_MS),
      });
    };

    let res: Response;
    try { res = await doFetch(); }
    catch (error) {
      if (init.signal?.aborted || epoch !== this.identityEpoch || !this.recovery) throw error;
      const recovered = await this.recovery();
      if (!recovered || epoch !== this.identityEpoch || !['GET', 'HEAD'].includes((init.method ?? 'GET').toUpperCase())) throw error;
      this.setBaseUrl(recovered);
      res = await doFetch();
    }
    if (res.status === 401) res = await this.afterUnauthorized(res, doFetch, () => sentWith);
    // Still refused after the one refresh this client allows itself: the
    // credentials are dead rather than stale, and no retry will revive them.
    // Reported once here so the whole app can settle, instead of each screen
    // discovering it separately and asking the transport to reconnect.
    if (res.status === 401 && epoch === this.identityEpoch) this.authRevoked?.();
    if (!res.ok) {
      const body = await errorBody(res);
      const detail = detailOf(body);
      if (res.status === 403 && detail === ONBOARDING_REQUIRED && epoch === this.identityEpoch) this.onboardingRequired?.();
      // Message format unchanged — existing logs stay readable.
      throw new ApiError(
        `${init.method ?? 'GET'} ${path} → ${res.status}`,
        res.status,
        parseRetryAfter(res),
        detail,
        body,
      );
    }
    // A Pond without the route answers with its dashboard page and a 200: that is a missing route.
    if (/^text\/html\b/i.test(res.headers.get('content-type') ?? '')) {
      throw new ApiError(`${init.method ?? 'GET'} ${path} → 404 (the Pond answered with a page)`, 404, null, null, null);
    }
    return (await parseBody<T>(res)) as T;
  }

  /**
   * `request` without the JSON: the authenticated `Response` itself, for a body
   * that is a stream of events or a run of audio bytes rather than a document.
   *
   * Same bearer, same single refresh on 401, same `ApiError` on refusal. No
   * default timeout: a stream decides for itself when silence means dead, and
   * a caller that wants a ceiling passes its own `signal`.
   */
  async open(path: string, init: RequestInit = {}): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    let sentWith = this.token;
    const doFetch = () => {
      sentWith = this.token;
      return this.send(url, { ...init, headers: { ...this.headers(), ...(init.headers ?? {}) } }, null);
    };

    let res = await doFetch();
    if (res.status === 401) res = await this.afterUnauthorized(res, doFetch, () => sentWith);
    if (!res.ok) {
      const body = await errorBody(res);
      const detail = detailOf(body);
      if (res.status === 403 && detail === ONBOARDING_REQUIRED) this.onboardingRequired?.();
      throw new ApiError(
        `${init.method ?? 'GET'} ${path} → ${res.status}`,
        res.status,
        parseRetryAfter(res),
        detail,
        body,
      );
    }
    return res;
  }

  /**
   * A picture the Pond holds, in the shape `expo-image` loads.
   *
   * Attachment routes take the bearer header and nothing else — no cookie, no
   * token in the query — so a bare URI draws a broken image. The path is the
   * relative `url` the messages route returns.
   */
  imageSource(path: string): { uri: string; headers?: Record<string, string> } {
    const uri = /^https?:/i.test(path) ? path : `${this.baseUrl}${path}`;
    return this.token ? { uri, headers: { Authorization: `Bearer ${this.token}` } } : { uri };
  }

  /** Local enrollment stays on the selected LAN endpoint even if normal traffic roams.
   * No recovery or token rotation is attempted: the caller must restart explicitly
   * after an expired session or ambiguous failure. Server peer checks remain authoritative.
   */
  async requestLocal<T>(endpoint: string, path: string, init: RequestInit = {}): Promise<T> {
    if (!isLocalPairingUrl(endpoint)) throw new Error('Local Pond endpoint required');
    if (!path.startsWith('/api/') || path.startsWith('//')) throw new Error('Invalid Pond API path');
    const response = await this.send(`${normalizePondUrl(endpoint)}${path}`, {
      ...init,
      headers: { ...this.headers(), ...(init.headers ?? {}) },
      signal: init.signal ?? timeoutSignal(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new ApiError(`${init.method ?? 'GET'} ${path} → ${response.status}`, response.status, parseRetryAfter(response),
        await errorDetail(response));
    }
    return (await parseBody<T>(response)) as T;
  }

  /**
   * After a 401: retry with a token another request has already refreshed, or refresh once.
   *
   * Coalescing alone is not enough. A request sent with the old token whose 401 arrives after the
   * shared refresh has finished would start a second one, which revokes the token the first
   * request just retried with; that retry's 401 then reads as dead credentials and unpairs the
   * phone. On 2026-11-09 one expiry became seven rotations in a second and a forced re-pair. So a
   * 401 for a token that has since been replaced is answered with the new one, and only a 401 for
   * the current token refreshes.
   */
  private async afterUnauthorized(
    res: Response,
    doFetch: () => Promise<Response>,
    sentWith: () => string | null,
  ): Promise<Response> {
    if (this.token && this.token !== sentWith()) {
      res = await doFetch();
      if (res.status !== 401) return res;
    }
    if (!this.refreshToken) return res;
    const refreshed = await this.refreshOnce();
    if (!refreshed?.accepted) return res;
    res = await doFetch();
    // A refresh that finished while this retry was out replaced the token it carried.
    if (res.status === 401 && this.token && this.token !== sentWith()) res = await doFetch();
    return res;
  }

  /** Used by SSE without starting a competing token rotation. */
  async refreshAuthentication(): Promise<boolean> { return !!(await this.refreshOnce())?.accepted; }

  /** Coalesce concurrent refreshes into the single in-flight attempt. */
  private refreshOnce(): Promise<HandshakeResponse | null> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.handshakeRefresh().finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }

  // ── Devices and Matter ──────────────────────────────────────

  /** `GET /devices`. The server wraps the list in an envelope; callers get the list. */
  async listDevices(): Promise<Device[]> {
    const res = await this.request<{ devices?: Device[] } | Device[]>('/api/v1/devices');
    return collection<Device>(res, 'devices');
  }

  registerDevice(req: CreateDeviceRequest): Promise<Device> {
    return this.post<Device>('/api/v1/devices', req);
  }

  updateDevice(id: string, req: UpdateDeviceRequest): Promise<Device> {
    return this.put<Device>(`/api/v1/devices/${encodeURIComponent(id)}`, req);
  }

  /**
   * `DELETE /devices/{id}`. The server refuses bridged Matter endpoints — ids
   * shaped `matter-<node>-<endpoint>` — because one node is not one device.
   */
  deleteDevice(id: string): Promise<void> {
    return this.del<void>(`/api/v1/devices/${encodeURIComponent(id)}`);
  }

  /**
   * `POST /devices/commission`. Accepts a QR payload (`MT:…`), an 11/21-digit
   * manual code, or a bare 8-digit passcode.
   *
   * The setup code is a credential — never log the request. The server budgets
   * 180s for this, so it gets its own longer timeout rather than the default.
   */
  commissionDevice(req: CommissionDeviceRequest): Promise<CommissionDeviceResponse> {
    return this.request<CommissionDeviceResponse>('/api/v1/devices/commission', {
      method: 'POST',
      body: JSON.stringify(req),
      signal: timeoutSignal(COMMISSION_TIMEOUT_MS),
    });
  }

  /**
   * `GET /devices/discovered`: what the Pond can see waiting to be added. A Pond from before the
   * list answers 404; one whose Matter controller is not up answers 502 or 503.
   */
  async discoveredDevices(): Promise<DiscoveredDevice[]> {
    const res = await this.request<{ devices?: DiscoveredDevice[] } | DiscoveredDevice[]>('/api/v1/devices/discovered');
    return collection<DiscoveredDevice>(res, 'devices');
  }

  /** `GET /rooms`. A Pond from before rooms had ids answers 404. */
  async listRooms(): Promise<Room[]> {
    const res = await this.request<{ rooms?: Room[] } | Room[]>('/api/v1/rooms');
    return collection<Room>(res, 'rooms');
  }

  createRoom(name: string): Promise<Room> {
    return this.post<Room>('/api/v1/rooms', { name });
  }

  renameRoom(id: string, name: string): Promise<Room> {
    return this.put<Room>(`/api/v1/rooms/${encodeURIComponent(id)}`, { name });
  }

  /** `DELETE /rooms/{id}`. Refused with 409 while a device is still in the room. */
  deleteRoom(id: string): Promise<void> {
    return this.del<void>(`/api/v1/rooms/${encodeURIComponent(id)}`);
  }

  matterStatus(): Promise<MatterStatus> {
    return this.get<MatterStatus>('/api/v1/matter/status');
  }

  /**
   * Actuate a device.
   *
   * There is no REST control route. Actuation goes through the LLM-free MCP
   * dispatch path, which is deny-by-default: `DIRECT_DISPATCH_ALLOWLIST` on the
   * server permits `set_device_state` and `get_device_state` and little else, so
   * this is the only shape that works.
   *
   * `key` is the tap's idempotency key, sent on every attempt at the same tap so a
   * Pond that honours keys runs it once. Such a Pond echoes it as `idempotency_key`;
   * an older one ignores the header and its answer carries none.
   */
  setDeviceState(
    deviceId: string,
    patch: DeviceStatePatch,
    key?: string,
  ): Promise<ToolCallResult & { idempotency_key?: string }> {
    return this.request('/api/v1/tools/invoke', {
      method: 'POST',
      headers: key ? { 'Idempotency-Key': key } : undefined,
      body: JSON.stringify({ server: 'giap-device-control', tool: 'set_device_state', args: { device_id: deviceId, ...patch } }),
    });
  }

  /**
   * Read a device's current state.
   *
   * The counterpart to the above, and the reason it exists: `is_online` is
   * reachability, not power. Labelling a button from it is what once offered
   * "Turn on" to a contact sensor.
   */
  getDeviceState(deviceId: string): Promise<ToolCallResult> {
    return this.post<ToolCallResult>('/api/v1/tools/invoke', {
      server: 'giap-device-control',
      tool: 'get_device_state',
      args: { device_id: deviceId },
    });
  }

  /**
   * What changes on the Pond's devices, as it happens, instead of reading every device again.
   * `afterSeq` resumes after the last event seen; without it the stream starts from now. Resolves
   * when the stream ends; a Pond without the route refuses it with a 404.
   */
  async streamDeviceEvents(
    onEvent: (event: DeviceEvent) => void,
    signal?: AbortSignal,
    onOpen?: () => void,
    afterSeq?: number,
  ): Promise<void> {
    const query = afterSeq != null ? `?after_seq=${afterSeq}` : '';
    const res = await this.open(`/api/v1/devices/events${query}`, {
      headers: { Accept: 'text/event-stream' },
      signal,
    });
    onOpen?.();
    await readSse(
      res,
      (event) => {
        try {
          onEvent({ type: event.event, ...JSON.parse(event.data || '{}') } as DeviceEvent);
        } catch {
          // A frame that is not JSON carries nothing to act on.
        }
      },
      { idleMs: STREAM_IDLE_MS },
    );
  }

  // ── Chat ────────────────────────────────────────────────────

  /**
   * One turn of conversation.
   *
   * The Pond answers whole rather than in pieces on this route, and it creates
   * the session when `sessionId` is absent — which is why the reply carries the
   * id back: a first message is also how a conversation begins.
   *
   * `voiceMode` is sent but has no effect here: the handler calls `chat_once`,
   * which hardcodes it off, and drops images the same way. Turns that need
   * either go through `streamChat`.
   */
  sendChat(
    message: string,
    sessionId?: string | null,
    voiceMode = false,
  ): Promise<ChatTurn> {
    return this.request<ChatTurn>('/api/v1/chat', {
      method: 'POST',
      body: JSON.stringify({
        message,
        ...(sessionId ? { session_id: sessionId } : {}),
        voice_mode: voiceMode,
      }),
      signal: timeoutSignal(CHAT_TIMEOUT_MS),
    });
  }

  /**
   * One turn, read as the Pond produces it: text as it is written, each tool as
   * it is called and as it answers.
   *
   * Resolves when the stream ends, whichever way. Whether it ended well is in
   * the frames — a `done`, or an `{error}` with nothing after it — so a caller
   * decides from what it saw, not from this promise.
   *
   * The Pond holds four streams open at most and refuses a fifth with 503, so a
   * stream that is given up on must be cancelled rather than abandoned: pass a
   * `signal` and abort it.
   */
  async streamChat(
    body: ChatStreamRequest,
    onFrame: (frame: ChatFrame) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const place = this.turnPlace ? await within(this.turnPlace(), PLACE_WAIT_MS, signal) : undefined;
    const res = await this.open('/api/v1/chat/stream', {
      method: 'POST',
      headers: { Accept: 'text/event-stream' },
      body: JSON.stringify(place ? { ...body, device_place: place } : body),
      signal,
    });
    const stream = askAwareStream(onFrame);
    await readSse(res, (event) => deliver(event, stream.onFrame), { idleMs: stream.idleMs });
  }

  /**
   * Pick a resumable turn back up after the connection dropped.
   *
   * `afterSeq` is exclusive. A 410 means the Pond restarted and the run is gone,
   * a 404 that it finished long enough ago to be forgotten; either way the
   * answer, if there is one, is in the session's saved messages. `waitingAsks`
   * are the `ask` calls seen before the drop, which keep the stall guard patient.
   */
  async reattachRun(
    runId: string,
    afterSeq: number,
    epoch: number | string | undefined,
    onFrame: (frame: ChatFrame) => void,
    signal?: AbortSignal,
    waitingAsks?: ReadonlySet<string>,
  ): Promise<void> {
    const q = new URLSearchParams({ after_seq: String(afterSeq) });
    if (epoch !== undefined) q.set('epoch', String(epoch));
    const res = await this.open(
      `/api/v1/chat/runs/${encodeURIComponent(runId)}/events?${q.toString()}`,
      { headers: { Accept: 'text/event-stream' }, signal },
    );
    const stream = askAwareStream(onFrame, waitingAsks);
    await readSse(res, (event) => deliver(event, stream.onFrame), { idleMs: stream.idleMs });
  }

  /**
   * The resumable turn the Pond is running, or just ran, for a conversation:
   * what a phone that lost track of one needs to follow it again. Null when the
   * Pond holds none for it, which is the ordinary answer.
   */
  async activeRun(sessionId: string): Promise<ActiveRun | null> {
    try {
      return await this.get<ActiveRun>(`/api/v1/sessions/${encodeURIComponent(sessionId)}/active-run`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  }

  /**
   * Stop a turn the Pond is still running. Cooperative: it may say one more
   * thing. A 404 means the run already ended on its own, which is not a
   * failure from the caller's side.
   */
  async cancelRun(runId: string): Promise<void> {
    try {
      await this.post(`/api/v1/chat/runs/${encodeURIComponent(runId)}/cancel`, {});
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) throw e;
    }
  }

  /** What the Pond would offer to answer next. `sessionId` decides whose data it can read. */
  listSuggestions(sessionId?: string | null): Promise<SuggestionList> {
    const q = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : '';
    return this.get<SuggestionList>(`/api/v1/suggestions${q}`);
  }

  /** Tell the Pond a composed suggestion was used, so it stops offering it. */
  takeSuggestion(id: string): Promise<unknown> {
    return this.post(`/api/v1/suggestions/${encodeURIComponent(id)}/taken`, {});
  }

  /**
   * The name the household gave the Pond for its owner, for a greeting.
   *
   * `GET /settings` is where pond-desktop reads it, not the profiles list. Null
   * when unset; a greeting then leaves the name out rather than inventing one.
   */
  async userName(): Promise<string | null> {
    const settings = await this.get<{ user_name?: string | null }>('/api/v1/settings');
    return settings.user_name?.trim() || null;
  }

  // ── Voice ───────────────────────────────────────────────────

  /**
   * Speech to text. WAV only — the Pond sniffs the RIFF header and rejects
   * anything else — sent as the multipart field `audio`. Under 2 MiB, which is
   * about a minute at 16 kHz mono.
   */
  async transcribe(fileUri: string): Promise<string> {
    const form = new FormData();
    // A real `File` — it implements `Blob` — not the `{uri,name,type}` shape older RN
    // FormData once special-cased; this RN's FormData rejects anything that isn't one.
    form.append('audio', new File(fileUri), 'speech.wav');
    const res = await this.send(`${this.baseUrl}/api/v1/transcribe`, {
      method: 'POST',
      // No Content-Type: the runtime writes the multipart boundary itself.
      headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
      body: form,
      signal: timeoutSignal(VOICE_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new ApiError(`POST /api/v1/transcribe → ${res.status}`, res.status, parseRetryAfter(res));
    }
    const body = (await res.json()) as TranscribeResponse;
    return body.text?.trim() ?? '';
  }

  /**
   * Text to speech: the whole text as a 24 kHz mono WAV, and Kokoro shapes its
   * pauses. `last: false` when more of the same reply follows, so the audio
   * ends in the gap before it instead of at rest. The first call after the
   * Pond starts loads its voice model, which can take seconds.
   */
  async speak(text: string, signal?: AbortSignal, last = true): Promise<ArrayBuffer> {
    const res = await this.send(`${this.baseUrl}/api/v1/tts`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ text, last }),
      signal: timeoutSignal(VOICE_TIMEOUT_MS, signal),
    });
    if (!res.ok) {
      throw new ApiError(`POST /api/v1/tts → ${res.status}`, res.status, parseRetryAfter(res));
    }
    return res.arrayBuffer();
  }

  // ── Room voice, the Voice agent and Voice Match ─────────────

  async voiceRoom(): Promise<VoiceRoom> {
    const room = readVoiceRoom(await this.get<unknown>('/api/v1/voice/room'));
    if (!room) throw new Error('The Pond answered the room voice status with something unexpected');
    return room;
  }

  async setVoiceRoom(enabled: boolean): Promise<VoiceRoom> {
    const room = readVoiceRoom(await this.put<unknown>('/api/v1/voice/room', { enabled }));
    if (!room) throw new Error('The Pond answered the room voice switch with something unexpected');
    return room;
  }

  /** Stops what the Pond is saying in the room, as talking over it would. */
  interruptVoiceRoom(): Promise<void> {
    return this.post<void>('/api/v1/voice/room/interrupt', {});
  }

  /** Asks the room not to listen for `seconds`; asking again before it runs out renews it. */
  pauseVoiceRoom(seconds: number): Promise<void> {
    return this.post<void>('/api/v1/voice/room/pause', { seconds });
  }

  resumeVoiceRoom(): Promise<void> {
    return this.post<void>('/api/v1/voice/room/resume', {});
  }

  /** The room's voice events until the stream ends; abort `signal` to close it. */
  async streamVoiceRoom(onEvent: (event: RoomVoiceEvent) => void, signal?: AbortSignal, onOpen?: () => void): Promise<void> {
    const res = await this.open('/api/v1/voice/room/events', { headers: { Accept: 'text/event-stream' }, signal });
    onOpen?.();
    await readSse(
      res,
      (frame) => {
        try {
          const event = readRoomVoiceEvent(JSON.parse(frame.data));
          if (event) onEvent(event);
        } catch {
          // A frame that is not JSON carries nothing to act on.
        }
      },
      { idleMs: STREAM_IDLE_MS },
    );
  }

  async voiceAgent(): Promise<VoiceAgent> {
    const agent = readVoiceAgent(await this.get<unknown>('/api/v1/agents/voice'));
    if (!agent) throw new Error('The Pond answered the Voice agent with something unexpected');
    return agent;
  }

  /** A 422 carries `errors` as `/recipes/validate` does; a guest is refused with 403. */
  async updateVoiceAgent(patch: VoiceAgentPatch): Promise<VoiceAgent> {
    const agent = readVoiceAgent(await this.put<unknown>('/api/v1/agents/voice', patch));
    if (!agent) throw new Error('The Pond answered the Voice agent save with something unexpected');
    return agent;
  }

  /** Back to the agent the Pond shipped. */
  async resetVoiceAgent(): Promise<VoiceAgent> {
    const agent = readVoiceAgent(await this.del<unknown>('/api/v1/agents/voice'));
    if (!agent) throw new Error('The Pond answered the Voice agent reset with something unexpected');
    return agent;
  }

  async voicePrints(): Promise<VoicePrints> {
    const prints = readVoicePrints(await this.get<unknown>('/api/v1/voice/prints'));
    if (!prints) throw new Error('The Pond answered Voice Match with something unexpected');
    return prints;
  }

  /**
   * `GET /voice/prints/model/file`: the Pond's speaker model, written to the app's cache for the
   * wake word's voice check; the native side checks its checksum before keeping it. 409
   * `model_not_ready` while the Pond has not finished fetching it.
   */
  async downloadSpeakerModel(): Promise<string> {
    const path = '/api/v1/voice/prints/model/file';
    const res = await this.send(`${this.baseUrl}${path}`, {
      headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
    }, MODEL_DOWNLOAD_TIMEOUT_MS);
    if (!res.ok) {
      const body = await errorBody(res);
      throw new ApiError(`GET ${path} → ${res.status}`, res.status, parseRetryAfter(res), detailOf(body), body);
    }
    const file = new File(Paths.cache, `speaker-model-${Date.now().toString(36)}.onnx`);
    file.create({ overwrite: true });
    file.write(new Uint8Array(await res.arrayBuffer()));
    return file.uri;
  }

  /** A 202: the Pond fetches the speaker model again. */
  retryVoicePrintModel(): Promise<void> {
    return this.post<void>('/api/v1/voice/prints/model', {});
  }

  /**
   * One sentence read while teaching Goose a voice, as a 16 kHz mono WAV. `voiceMatch` false tunes
   * the wake phrase only and stores no print. 422 `no_speech` and `no_wake_phrase` (with `heard_as`)
   * and 409 `model_not_ready` are refusals by name. `replaces` says a missed sentence again on its
   * own, in place of that take; 422 `retake_not_found` when the run it was in has ended.
   */
  async voiceTake(take: VoiceTakeInput): Promise<VoiceTakeResult> {
    const form = new FormData();
    form.append('audio', new File(take.fileUri), 'take.wav');
    form.append('prompt', take.prompt);
    if (take.profileId) form.append('profile_id', take.profileId);
    form.append('voice_match', take.voiceMatch ? 'true' : 'false');
    if (take.replaces) form.append('replaces', take.replaces);
    const res = await this.send(`${this.baseUrl}/api/v1/voice/takes`, {
      method: 'POST',
      // No Content-Type: the runtime writes the multipart boundary itself.
      headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
      body: form,
      signal: timeoutSignal(VOICE_TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await errorBody(res);
      throw new ApiError(`POST /api/v1/voice/takes → ${res.status}`, res.status, parseRetryAfter(res), detailOf(body), body);
    }
    const result = readVoiceTake(await res.json());
    if (!result) throw new Error('The Pond answered a voice take with something unexpected');
    return result;
  }

  /**
   * `POST /voice/wake/check`: whether a speech segment this phone heard opens with the household's
   * wake phrase, matched by the Pond with its learned pronunciations. Only the verdict and the phrase
   * come back; the Pond keeps nothing. 503 `speech_recognition_unavailable` and 413
   * `segment_too_long` are refusals by name. The phone asks for the whole phrase (`phrase_only`): a
   * segment it sends was already near the phrase, so a bare "goose" after other words is not enough.
   */
  async checkWakeSegment(fileUri: string): Promise<WakeCheck> {
    const form = new FormData();
    form.append('audio', new File(fileUri), 'segment.wav');
    form.append('phrase_only', 'true');
    const res = await this.send(`${this.baseUrl}/api/v1/voice/wake/check`, {
      method: 'POST',
      // No Content-Type: the runtime writes the multipart boundary itself.
      headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
      body: form,
      signal: timeoutSignal(VOICE_TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await errorBody(res);
      throw new ApiError(`POST /api/v1/voice/wake/check → ${res.status}`, res.status, parseRetryAfter(res), detailOf(body), body);
    }
    const body: unknown = await res.json();
    const check = body as Partial<WakeCheck> | null;
    if (typeof check?.heard !== 'boolean' || typeof check.phrase !== 'string') {
      throw new Error('The Pond answered a wake check with something unexpected');
    }
    return { heard: check.heard, phrase: check.phrase };
  }

  /** Forget a member's voice. Their face, profile and memories stay. */
  forgetVoicePrints(profileId: string): Promise<void> {
    return this.del<void>(`/api/v1/voice/prints/${encodeURIComponent(profileId)}`);
  }

  // ── Sessions ────────────────────────────────────────────────

  /**
   * Every conversation, or with `surfaces` only those begun there. `unknown` names the ones begun
   * before the Pond recorded where; a Pond older than the filter ignores it and answers them all.
   */
  async listSessions(surfaces?: readonly string[]): Promise<SessionSummary[]> {
    const query = surfaces?.length ? `?surface=${surfaces.map(encodeURIComponent).join(',')}` : '';
    const res = await this.request<{ sessions?: SessionSummary[] } | SessionSummary[]>(
      `/api/v1/sessions${query}`,
    );
    return collection<SessionSummary>(res, 'sessions');
  }

  getSession(id: string): Promise<SessionSummary> {
    return this.get<SessionSummary>(`/api/v1/sessions/${encodeURIComponent(id)}`);
  }

  async listSessionMessages(id: string, limit?: number): Promise<SessionMessage[]> {
    const q = limit ? `?limit=${limit}` : '';
    const res = await this.request<{ messages?: SessionMessage[] } | SessionMessage[]>(
      `/api/v1/sessions/${encodeURIComponent(id)}/messages${q}`,
    );
    return collection<SessionMessage>(res, 'messages');
  }

  deleteSession(id: string): Promise<void> {
    return this.del<void>(`/api/v1/sessions/${encodeURIComponent(id)}`);
  }

  /** Take or pass over what a message offers. A 409 means it was already answered. */
  answerOffer(sessionId: string, messageId: string, take: boolean): Promise<OfferAnswer> {
    return this.post<OfferAnswer>(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}/offer`,
      { take },
    );
  }

  renameSession(id: string, title: string): Promise<void> {
    return this.request<void>(`/api/v1/sessions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    });
  }

  usageSummary(): Promise<UsageSummary> {
    return this.get<UsageSummary>('/api/v1/usage/summary');
  }

  // ── Notifications ───────────────────────────────────────────

  /**
   * This phone's notifications the Pond has not yet seen delivered, oldest
   * first. The Pond reads the device from the token; a push wake carries only
   * an id, so this is where the alert's text and time come from.
   * Accepts a bare array or `{ notifications: [...] }`; anything else is an
   * empty list. Each item is as the Pond sent it, so `readNotification` checks
   * it before use.
   */
  async pendingNotifications(): Promise<ServerNotification[]> {
    const res = await this.request<{ notifications?: ServerNotification[] }>('/api/v1/notifications/pending');
    return collection<ServerNotification>(res, 'notifications');
  }

  /**
   * Marks one notification delivered to this phone, so it is not pulled or
   * flushed to the stream again. A 404 means it was never this phone's.
   * `shown` says the phone put it in front of the person, which the Pond records apart.
   */
  async acknowledgeNotification(id: string, shown = false): Promise<void> {
    await this.post(`/api/v1/notifications/${encodeURIComponent(id)}/ack`, shown ? { shown: true } : {});
  }

  /** Tells the Pond the person tapped one of this phone's notices. A 404 means it was never this phone's. */
  async notificationOpened(id: string): Promise<void> {
    await this.request<unknown>(`/api/v1/notifications/${encodeURIComponent(id)}/opened`, { method: 'POST' });
  }

  // ── Reminders ───────────────────────────────────────────────

  /**
   * Pending reminders, most recently said first, narrowed by the Pond to the
   * household member this phone is paired as. The Pond pages at 100 by default.
   */
  async listReminders(): Promise<Reminder[]> {
    const res = await this.request<{ reminders?: Reminder[] } | Reminder[]>('/api/v1/reminders');
    return collection<Reminder>(res, 'reminders');
  }

  /**
   * Takes a reminder off the list for good: the Pond has no route that brings
   * one back. A 404 means nothing was waiting under that id for this caller,
   * which includes one somebody else already dismissed.
   */
  async dismissReminder(id: string): Promise<void> {
    await this.post(`/api/v1/reminders/${encodeURIComponent(id)}/dismiss`, {});
  }

  // ── Proposals (shown as "Suggestions") ──────────────────────

  /**
   * The live proposals addressed to this caller, newest first. `sessionId` is
   * required and never defaulted: the Pond answers 400 without it, and 403 when
   * it cannot resolve the caller to exactly one household member.
   */
  async listProposals(sessionId: string): Promise<Proposal[]> {
    const res = await this.get<ProposalList>(`/api/v1/proposals?session_id=${encodeURIComponent(sessionId)}`);
    return res.proposals ?? [];
  }

  /**
   * Accept (`approve`) or decline (`reject`) one proposal. Approving records the
   * decision and executes nothing. 404 covers expired, already decided and
   * unknown alike; 409 is the Pond refusing that status change.
   */
  decideProposal(id: string, sessionId: string, decision: ProposalDecision): Promise<ProposalDecisionResult> {
    return this.post<ProposalDecisionResult>(`/api/v1/proposals/${encodeURIComponent(id)}/decide`, {
      session_id: sessionId,
      decision,
    });
  }

  // ── Memory ──────────────────────────────────────────────────

  /** The household's 50 most recent. The Pond takes no limit or filter. */
  async listMemories(): Promise<MemoryFragment[]> {
    const res = await this.request<{ memories?: MemoryFragment[] } | MemoryFragment[]>('/api/v1/memories');
    return collection<MemoryFragment>(res, 'memories');
  }

  saveMemory(req: SaveMemoryRequest): Promise<MemoryFragment> {
    return this.post<MemoryFragment>('/api/v1/memories', req);
  }

  /** Rewords and/or re-tiers in place; the Pond keeps the id, age, usage and segment. */
  updateMemory(id: string, change: UpdateMemoryRequest): Promise<void> {
    return this.put<void>(`/api/v1/memories/${encodeURIComponent(id)}`, change);
  }

  deleteMemory(id: string): Promise<void> {
    return this.del<void>(`/api/v1/memories/${encodeURIComponent(id)}`);
  }

  // ── Prompt extras ───────────────────────────────────────────

  /** Every note, on or off, in the order the Pond sends them. */
  async listPromptExtras(): Promise<PromptExtra[]> {
    const res = await this.request<{ extras?: PromptExtra[] } | PromptExtra[]>('/api/v1/agent/extras');
    return collection<PromptExtra>(res, 'extras');
  }

  /** Upsert by `key`: the Pond replaces a note already under that key without saying so. */
  savePromptExtra(req: SavePromptExtraRequest): Promise<void> {
    return this.post<void>('/api/v1/agent/extras', req);
  }

  deletePromptExtra(key: string): Promise<void> {
    return this.del<void>(`/api/v1/agent/extras/${encodeURIComponent(key)}`);
  }

  // ── Prompt templates (soul, heartbeat, scratchpad, presets) ──────

  /** Lists built-in and customized prompt templates: `GET /api/v1/prompts`. */
  async listPromptTemplates(): Promise<PromptTemplate[]> {
    return this.get<PromptTemplate[]>('/api/v1/prompts');
  }

  /** Gets a single prompt template by name. */
  async getPromptTemplate(name: string): Promise<PromptTemplate> {
    return this.get<PromptTemplate>(`/api/v1/prompts/${encodeURIComponent(name)}`);
  }

  /** Saves a customized prompt template content: `PUT /api/v1/prompts/{name}`. */
  async updatePromptTemplate(name: string, content: string, description?: string): Promise<PromptTemplate> {
    return this.put<PromptTemplate>(`/api/v1/prompts/${encodeURIComponent(name)}`, {
      content,
      ...(description === undefined ? {} : { description }),
    });
  }

  /** Resets a customized prompt template to its built-in factory default: `POST /api/v1/prompts/{name}/reset`. */
  async resetPromptTemplate(name: string): Promise<PromptTemplate> {
    return this.post<PromptTemplate>(`/api/v1/prompts/${encodeURIComponent(name)}/reset`, {});
  }

  /**
   * Run consolidation now, reporting each stage. Resolves once the run ends,
   * whichever way. A 501 means it is off in the Pond's settings or missing
   * from its build; `ApiError.detail` says which.
   *
   * Only the phone that started a run hears its progress: the Pond has no
   * route that reports a run already going.
   */
  async streamConsolidation(onEvent: (event: ConsolidationEvent) => void, signal?: AbortSignal): Promise<void> {
    const res = await this.open('/api/v1/memory/consolidate', {
      method: 'POST',
      headers: { Accept: 'text/event-stream' },
      signal,
    });
    await readSse(
      res,
      (event) => {
        try {
          onEvent(JSON.parse(event.data) as ConsolidationEvent);
        } catch {
          // A frame that is not JSON carries nothing to act on.
        }
      },
      { idleMs: STREAM_IDLE_MS },
    );
  }

  /** Cancels between stages; a stage already asking a model finishes first. */
  stopConsolidation(): Promise<void> {
    return this.post<void>('/api/v1/memory/consolidate/stop', {});
  }

  // ── Models ──────────────────────────────────────────────────

  /**
   * Every model the Pond has, flattened out of its six category buckets.
   *
   * A Pond with no model repository configured answers the same shape with
   * every bucket empty, so an absent key means "none of that kind" rather than
   * an error. Reading `res.models` here is what crashed the Models screen: the
   * server has never sent that key.
   */
  async listModels(): Promise<ModelEntry[]> {
    const res = await this.request<ModelListResponse>('/api/v1/models');
    return MODEL_CATEGORIES.flatMap((category) =>
      // A bucket that is missing, null or not a list answers nothing rather than
      // throwing: the screen maps over what comes back.
      (Array.isArray(res?.[category]) ? res[category] : []).map((m) => ({
        ...m,
        // The row's own category names the route; the bucket only groups it.
        pond_category: typeof m.category === 'string' && m.category ? m.category : category,
        category,
        id: `${category}:${m.name}`,
      })),
    );
  }

  modelCapabilities(): Promise<ModelCapabilities> {
    return this.get<ModelCapabilities>('/api/v1/models/capabilities');
  }

  activeModelRoles(): Promise<ModelActiveRoles> {
    return this.get<ModelActiveRoles>('/api/v1/models/active-roles');
  }

  modelMemoryStatus(): Promise<ModelMemoryStatus> {
    return this.get<ModelMemoryStatus>('/api/v1/models/memory-status');
  }

  /** Give a model a job. The Pond refuses a request that names no role. */
  activateModel(category: string, name: string, role: ModelRole): Promise<void> {
    return this.post<void>(
      `/api/v1/models/${encodeURIComponent(category)}/${encodeURIComponent(name)}/activate`,
      { role },
    );
  }

  /**
   * Return chat to the model that last answered before the latest switch. 404
   * `nothing_to_roll_back` when there is none; `activeChatRole` says beforehand.
   */
  rollbackModel(): Promise<ModelRollbackResult> {
    return this.post<ModelRollbackResult>('/api/v1/models/rollback', { role: 'chat' });
  }

  /** The models in use beside the catalogue rows. An older Pond sends none, which reads as none. */
  async helperModels(): Promise<HelperModel[]> {
    const roles = await this.get<{ helpers?: HelperModel[] }>('/api/v1/models/active-roles');
    return Array.isArray(roles?.helpers) ? roles.helpers : [];
  }

  /** The chat entry of `GET /models/active-roles`, which `ModelActiveRoles` flattens away. */
  async activeChatRole(): Promise<ActiveChatRole> {
    const roles = await this.get<{ chat?: ActiveChatRole }>('/api/v1/models/active-roles');
    return roles.chat ?? { model_id: null };
  }

  diskUsage(): Promise<DiskUsage> {
    return this.get<DiskUsage>('/api/v1/models/disk-usage');
  }

  async downloadProgress(): Promise<DownloadEntry[]> {
    const res = await this.get<{ downloads?: DownloadEntry[] }>('/api/v1/models/download/progress');
    return Array.isArray(res?.downloads) ? res.downloads : [];
  }

  /** Start fetching a catalogue model. Picture support comes with it unless `pictures` is false. */
  downloadModel(category: string, name: string, pictures: boolean): Promise<unknown> {
    return this.post<unknown>(
      `/api/v1/models/${encodeURIComponent(category)}/${encodeURIComponent(name)}/download`,
      { pictures },
    );
  }

  addPictureSupport(category: string, name: string): Promise<unknown> {
    return this.post<unknown>(
      `/api/v1/models/${encodeURIComponent(category)}/${encodeURIComponent(name)}/companions/pictures`,
      {},
    );
  }

  /** Pause, resume or stop every file of a model's download. */
  controlDownload(modelId: string, action: DownloadAction): Promise<unknown> {
    return this.post<unknown>('/api/v1/models/download/control', { model_id: modelId, action });
  }

  /** Remove a model's file from the Pond. A 409 means it is in use. */
  deleteModel(category: string, name: string): Promise<void> {
    return this.del<void>(`/api/v1/models/${encodeURIComponent(category)}/${encodeURIComponent(name)}`);
  }

  /** The Pond answers a refused search as a 200 with `error`; raise it rather than show no results. */
  async searchModels(query: string): Promise<HfModel[]> {
    const res = await this.get<{ models?: HfModel[]; error?: string }>(
      `/api/v1/models/search/gguf?q=${encodeURIComponent(query)}`,
    );
    if (res?.error) throw new Error(res.error);
    return Array.isArray(res?.models) ? res.models : [];
  }

  async modelFiles(repo: string): Promise<HfModelFile[]> {
    // The Pond passes the repo through unencoded: Hugging Face refuses `owner%2Fname`.
    const res = await this.get<{ files?: HfModelFile[]; error?: string }>(
      `/api/v1/models/search/gguf/files?repo=${repo.split('/').map(encodeURIComponent).join('/')}`,
    );
    if (res?.error) throw new Error(res.error);
    return Array.isArray(res?.files) ? res.files : [];
  }

  downloadModelFile(file: HfModelFile, pictures: boolean): Promise<unknown> {
    return this.post<unknown>('/api/v1/models/download/url', {
      url: file.url,
      category: 'gguf',
      filename: file.filename,
      pictures,
    });
  }

  // ── Schedules ───────────────────────────────────────────────

  async listSchedules(): Promise<Schedule[]> {
    const res = await this.request<{ schedules?: Schedule[] } | Schedule[]>('/api/v1/schedules');
    return collection<Schedule>(res, 'schedules');
  }

  createSchedule(req: CreateScheduleRequest): Promise<Schedule> {
    return this.post<Schedule>('/api/v1/schedules', req);
  }

  updateSchedule(id: string, req: UpdateScheduleRequest): Promise<Schedule> {
    return this.put<Schedule>(`/api/v1/schedules/${encodeURIComponent(id)}`, req);
  }

  deleteSchedule(id: string): Promise<void> {
    return this.del<void>(`/api/v1/schedules/${encodeURIComponent(id)}`);
  }

  pauseSchedule(id: string): Promise<void> {
    return this.post<void>(`/api/v1/schedules/${encodeURIComponent(id)}/pause`, {});
  }

  resumeSchedule(id: string): Promise<void> {
    return this.post<void>(`/api/v1/schedules/${encodeURIComponent(id)}/resume`, {});
  }

  runScheduleNow(id: string): Promise<void> {
    return this.post<void>(`/api/v1/schedules/${encodeURIComponent(id)}/run-now`, {});
  }

  /**
   * Settles a missed run the Pond is asking about: run it late, or skip it. The first phone to
   * answer settles it; a later answer is a 409.
   */
  answerMissedRun(id: string, answer: 'run' | 'skip'): Promise<void> {
    return this.post<void>(`/api/v1/schedules/${encodeURIComponent(id)}/missed/${answer}`, {});
  }

  async listScheduleRuns(id: string, limit = 20): Promise<ScheduleRun[]> {
    const res = await this.request<{ runs?: ScheduleRun[] } | ScheduleRun[]>(
      `/api/v1/schedules/${encodeURIComponent(id)}/runs?limit=${limit}`,
    );
    return collection<ScheduleRun>(res, 'runs');
  }

  /**
   * Runs starting and finishing, as the scheduler reports them. Resolves when
   * the stream ends, whichever way; the caller decides whether to reopen it.
   * `onOpen` is called once the Pond has accepted it, which is how a caller
   * that reopens it knows it is back.
   *
   * The Pond takes no stream permit for this one, so holding it open costs no
   * chat stream. A screen that leaves still aborts `signal`: an abandoned
   * stream stays open and keeps delivering to a screen that is gone.
   */
  async streamScheduleEvents(
    onEvent: (event: ScheduleResultEvent) => void,
    signal?: AbortSignal,
    onOpen?: () => void,
  ): Promise<void> {
    const res = await this.open('/api/v1/schedules/events', {
      headers: { Accept: 'text/event-stream' },
      signal,
    });
    onOpen?.();
    await readSse(
      res,
      (event) => {
        try {
          onEvent(JSON.parse(event.data) as ScheduleResultEvent);
        } catch {
          // A frame that is not JSON carries nothing to act on.
        }
      },
      { idleMs: STREAM_IDLE_MS },
    );
  }

  // ── Rules ───────────────────────────────────────────────────
  //
  // Sensor-triggered automations. They live in the scheduler's table but have
  // their own routes, and no run-now: a rule fires when a reading matches.

  async listRules(): Promise<Rule[]> {
    const res = await this.request<{ rules?: Rule[] } | Rule[]>('/api/v1/rules');
    return collection<Rule>(res, 'rules');
  }

  createRule(req: RuleRequest): Promise<Rule> {
    return this.post<Rule>('/api/v1/rules', req);
  }

  updateRule(id: string, req: RuleRequest): Promise<Rule> {
    return this.put<Rule>(`/api/v1/rules/${encodeURIComponent(id)}`, req);
  }

  deleteRule(id: string): Promise<void> {
    return this.del<void>(`/api/v1/rules/${encodeURIComponent(id)}`);
  }

  pauseRule(id: string): Promise<void> {
    return this.post<void>(`/api/v1/rules/${encodeURIComponent(id)}/pause`, {});
  }

  resumeRule(id: string): Promise<void> {
    return this.post<void>(`/api/v1/rules/${encodeURIComponent(id)}/resume`, {});
  }

  // ── Camera events ───────────────────────────────────────────

  /**
   * What one camera saw, newest first. The Pond lists a single camera per call
   * and has no "every camera" read: without `camera_id` it answers for the
   * camera named `default`. `limit` defaults to 20 there and is capped at 100.
   */
  async listCameraEvents(cameraId: string, limit?: number): Promise<CameraEvent[]> {
    const qs = new URLSearchParams({ camera_id: cameraId });
    if (limit) qs.set('limit', String(limit));
    const res = await this.request<{ events?: unknown[] } | unknown[]>(
      `/api/v1/camera/events?${qs.toString()}`,
    );
    return collection<unknown>(res, 'events').flatMap((raw) => {
      const event = readCameraEvent(raw);
      return event ? [event] : [];
    });
  }

  /**
   * Mark an event as seen. The route reads no body, and answers 200 for an id
   * it has no row for too, since the update simply touches nothing.
   */
  acknowledgeCameraEvent(id: number): Promise<void> {
    return this.request<void>(`/api/v1/camera/events/${encodeURIComponent(String(id))}/acknowledge`, {
      method: 'PATCH',
    });
  }

  /**
   * Events as the vision pipeline records them, one frame each. Resolves when the stream ends,
   * whichever way; the caller decides whether to reopen it. `onOpen` is called once the Pond has
   * accepted it. A frame that is not an event is dropped. With cameras off in Privacy the Pond
   * answers 403 `cameras_disabled`, which an `ApiError` carries in `body`.
   */
  async streamVisionEvents(
    onEvent: (event: CameraEvent) => void,
    signal?: AbortSignal,
    onOpen?: () => void,
  ): Promise<void> {
    const res = await this.open('/api/v1/vision/events/stream', {
      headers: { Accept: 'text/event-stream' },
      signal,
    });
    onOpen?.();
    await readSse(
      res,
      (frame) => {
        if (frame.event !== 'vision_event') return;
        try {
          const event = readCameraEvent(JSON.parse(frame.data));
          if (event) onEvent(event);
        } catch {
          // A frame that is not JSON carries nothing to act on.
        }
      },
      { idleMs: STREAM_IDLE_MS },
    );
  }

  // ── Vision ──────────────────────────────────────────────────

  /** What the pipeline is doing now: running, reconnecting, off, or held back by Privacy. */
  visionStatus(): Promise<VisionStatus> {
    return this.get<VisionStatus>('/api/v1/vision/status');
  }

  /** The bus as the pipeline holds it. The phone edits the same values through the settings. */
  visionConfig(): Promise<VisionConfig> {
    return this.get<VisionConfig>('/api/v1/vision/config');
  }

  updateVisionConfig(patch: Partial<Omit<VisionConfig, 'supported_signals' | 'active_cameras' | 'event_listener_count'>>): Promise<VisionConfig> {
    return this.put<VisionConfig>('/api/v1/vision/config', patch);
  }

  /** The cameras the Pond knows. An older Pond calls `live` `is_live` and has no timestamp. */
  async listCameras(): Promise<CameraInfo[]> {
    const res = await this.get<{ cameras?: unknown[] }>('/api/v1/cameras');
    return collection<Record<string, unknown>>(res, 'cameras').flatMap((raw) => {
      if (typeof raw?.id !== 'string' || !raw.id) return [];
      return [
        {
          id: raw.id,
          live: raw.live === true || raw.is_live === true,
          last_frame_at: typeof raw.last_frame_at === 'string' ? raw.last_frame_at : null,
          snapshot_url: typeof raw.snapshot_url === 'string' ? raw.snapshot_url : null,
          stream_url: typeof raw.stream_url === 'string' ? raw.stream_url : null,
        },
      ];
    });
  }

  /** Where a camera's latest frame is. The Pond answers a JPEG, or 403 `cameras_disabled`. */
  cameraSnapshotPath(cameraId: string): string {
    return `/api/v1/camera/${encodeURIComponent(cameraId)}/snapshot`;
  }

  /**
   * A picture the Pond serves, as a `data:` URI the image view can draw.
   *
   * It is read here, over the same pinned transport as every other request, instead of being
   * handed to the image view as a URL and a header. Expo's image loader on iOS keeps its own
   * session, which the Pond's pin does not reach, so a Pond with its own certificate would draw
   * nothing there. Here the bearer travels in a header, never in the address, and only to the
   * Pond this client is paired with: a path that is not the Pond's own API is refused.
   */
  async fetchImage(path: string, signal?: AbortSignal): Promise<string> {
    if (!path.startsWith('/api/') || path.startsWith('//')) throw new Error('Invalid Pond API path');
    const res = await this.open(path, {
      headers: { Accept: 'image/*' },
      signal: signal ?? timeoutSignal(REQUEST_TIMEOUT_MS),
    });
    const type = res.headers.get('Content-Type')?.split(';')[0].trim() || 'image/jpeg';
    return `data:${type};base64,${toBase64(new Uint8Array(await res.arrayBuffer()))}`;
  }

  // ── Faces ───────────────────────────────────────────────────

  /**
   * Every household member, with how many samples of their face the pond holds. Without a face
   * build the Pond still answers 200, with `available: false`.
   */
  async listFaces(): Promise<FaceOverview> {
    const res = await this.get<{
      available?: unknown;
      default_threshold?: unknown;
      people?: unknown[];
    }>('/api/v1/faces');
    const people = collection<Record<string, unknown>>(res, 'people').flatMap((raw): FacePerson[] => {
      if (typeof raw?.profile_id !== 'string' || !raw.profile_id) return [];
      return [
        {
          profile_id: raw.profile_id,
          name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : raw.profile_id,
          enrollments: typeof raw.enrollments === 'number' ? raw.enrollments : 0,
          threshold: typeof raw.threshold === 'number' ? raw.threshold : null,
          last_enrolled_at: typeof raw.last_enrolled_at === 'string' ? raw.last_enrolled_at : null,
        },
      ];
    });
    return {
      available: res?.available === true,
      default_threshold: typeof res?.default_threshold === 'number' ? res.default_threshold : 0,
      people,
    };
  }

  /**
   * Take one sample of a member's face from the Pond's own camera, which sees them in the light
   * and from the angle recognition will. Refusals say why in `reason`: `no_frame` (the camera has
   * shown nothing), `no_face` (a frame with nobody facing it), `cameras_disabled` (Privacy).
   */
  registerFaceFromCamera(profileId: string, cameraId?: string): Promise<FaceRegistration> {
    return this.request<FaceRegistration>('/api/v1/faces/register-from-camera', {
      method: 'POST',
      body: JSON.stringify({ profile_id: profileId, ...(cameraId ? { camera_id: cameraId } : {}) }),
      signal: timeoutSignal(FACE_TIMEOUT_MS),
    });
  }

  /** One sample from a photo on this phone, a JPEG file. The Pond answers 422 for one it cannot use. */
  async registerFacePhoto(profileId: string, fileUri: string): Promise<FaceRegistration> {
    const form = new FormData();
    form.append('profile_id', profileId);
    form.append('image', new File(fileUri), 'face.jpg');
    const res = await this.send(`${this.baseUrl}/api/v1/faces/register`, {
      method: 'POST',
      // No Content-Type: the runtime writes the multipart boundary itself.
      headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
      body: form,
      signal: timeoutSignal(FACE_TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await errorBody(res);
      throw new ApiError(`POST /api/v1/faces/register → ${res.status}`, res.status, parseRetryAfter(res), detailOf(body), body);
    }
    return (await res.json()) as FaceRegistration;
  }

  getFaceThreshold(profileId: string): Promise<FaceThreshold> {
    return this.get<FaceThreshold>(`/api/v1/faces/profile/${encodeURIComponent(profileId)}/threshold`);
  }

  /** A strictness for one person alone, 0 to 1; a higher one asks the face to match more closely. */
  setFaceThreshold(profileId: string, threshold: number): Promise<FaceThreshold> {
    return this.put<FaceThreshold>(`/api/v1/faces/profile/${encodeURIComponent(profileId)}/threshold`, { threshold });
  }

  /** Back to the pond's own strictness. */
  clearFaceThreshold(profileId: string): Promise<FaceThreshold> {
    return this.del<FaceThreshold>(`/api/v1/faces/profile/${encodeURIComponent(profileId)}/threshold`);
  }

  /** Forget a member's face and nothing else. A Pond without the route answers 404 or 405. */
  forgetFaceSamples(profileId: string): Promise<{ faces_deleted: number }> {
    return this.del<{ faces_deleted: number }>(`/api/v1/faces/profile/${encodeURIComponent(profileId)}`);
  }

  /** Forget every sample of a member's face, and their voice print. Their profile and memories stay. */
  forgetFace(profileId: string): Promise<{ profile_id: string; face_embeddings_deleted: number; voice_prints_deleted?: number }> {
    return this.del<{ profile_id: string; face_embeddings_deleted: number; voice_prints_deleted?: number }>(
      `/api/v1/users/${encodeURIComponent(profileId)}/biometrics`,
    );
  }

  // ── Logs and activity ───────────────────────────────────────

  async listLogs(params?: { limit?: number; level?: string }): Promise<LogEntry[]> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.level) qs.set('level', params.level);
    const q = qs.toString();
    const res = await this.request<{ logs?: LogEntry[] } | LogEntry[]>(
      `/api/v1/logs${q ? `?${q}` : ''}`,
    );
    return collection<LogEntry>(res, 'logs');
  }

  /**
   * The Pond's activity, newest first. `since` is inclusive and `until`
   * exclusive, both RFC3339; there is no cursor, so the next page back is the
   * oldest timestamp seen, passed as `until`. At most 1000 per read.
   */
  listActivity(params?: {
    limit?: number;
    since?: string;
    until?: string;
    category?: EventCategory;
    session_id?: string;
  }): Promise<ActivityResponse> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.since) qs.set('since', params.since);
    if (params?.until) qs.set('until', params.until);
    if (params?.category) qs.set('category', params.category);
    if (params?.session_id) qs.set('session_id', params.session_id);
    const q = qs.toString();
    return this.get<ActivityResponse>(`/api/v1/activity${q ? `?${q}` : ''}`);
  }

  activitySummary(window?: ActivityWindow): Promise<ActivitySummary> {
    const q = window ? `?window=${encodeURIComponent(window)}` : '';
    return this.get<ActivitySummary>(`/api/v1/activity/summary${q}`);
  }

  /**
   * Delete the household's activity history, all of it. The operational log
   * and telemetry are separate stores and are kept.
   */
  clearActivity(): Promise<ActivityPurge> {
    return this.del<ActivityPurge>('/api/v1/activity');
  }

  /**
   * The operational log as CSV, newest 10,000 rows. The Pond applies no
   * filter to an export, so none is offered here.
   */
  async exportLogsCsv(): Promise<string> {
    const res = await this.open('/api/v1/logs/export', { headers: { Accept: 'text/csv' } });
    return res.text();
  }

  /**
   * The operational log as the Pond stores it: a `status` frame first, then each line, and a
   * `skipped` frame when the phone fell behind and lines were dropped. Resolves when the stream
   * ends; the caller decides whether to reopen it. The Pond allows four at once and answers a
   * fifth 503, so a screen that leaves must abort `signal`.
   */
  async streamLogs(
    onEvent: (event: LogStreamEvent) => void,
    signal?: AbortSignal,
    onOpen?: () => void,
  ): Promise<void> {
    const res = await this.open('/api/v1/logs/stream', {
      headers: { Accept: 'text/event-stream' },
      signal,
    });
    onOpen?.();
    await readSse(
      res,
      (event) => {
        try {
          const data = JSON.parse(event.data);
          if (event.event === 'status') onEvent({ kind: 'status', status: data as LogStreamStatus });
          else if (event.event === 'log') onEvent({ kind: 'log', entry: data as LogEntry });
          else if (event.event === 'skipped') onEvent({ kind: 'skipped', count: Number(data.count) || 0 });
        } catch {
          // A frame that is not JSON carries nothing to act on.
        }
      },
      { idleMs: STREAM_IDLE_MS },
    );
  }

  // ── Developer mode ──────────────────────────────────────────
  //
  // Only a Jarida test Pond has one. Its debug switch shows household content in the Pond's
  // logs; a home Pond refuses it (409 `not_a_test_pond`), whatever the phone sends.

  developerDebug(): Promise<DeveloperDebug> {
    return this.get<DeveloperDebug>('/api/v1/developer/debug');
  }

  setDeveloperDebug(enabled: boolean): Promise<DeveloperDebug> {
    return this.put<DeveloperDebug>('/api/v1/developer/debug', { enabled });
  }

  // ── Telemetry ───────────────────────────────────────────────

  telemetrySummary(sessionId: string): Promise<TelemetrySummary> {
    return this.get<TelemetrySummary>(
      `/api/v1/telemetry/summary?session_id=${encodeURIComponent(sessionId)}`,
    );
  }

  /** Every turn of one conversation, first to last. */
  async telemetryTurns(sessionId: string): Promise<TurnMetrics[]> {
    const res = await this.get<{ turns?: TurnMetrics[] } | TurnMetrics[]>(
      `/api/v1/telemetry/turns?session_id=${encodeURIComponent(sessionId)}`,
    );
    return collection<TurnMetrics>(res, 'turns');
  }

  // ── Extensions and the marketplace ──────────────────────────

  async listExtensions(): Promise<Extension[]> {
    const res = await this.request<{ extensions?: Extension[] } | Extension[]>(
      '/api/v1/extensions',
    );
    return collection<Extension>(res, 'extensions');
  }

  /** The Pond routes this path to PATCH and DELETE only; a PUT is refused. */
  setExtensionEnabled(name: string, enabled: boolean): Promise<void> {
    return this.patch<void>(`/api/v1/extensions/${encodeURIComponent(name)}`, { enabled });
  }

  /** `DELETE /extensions/{name}`: stops it and forgets its config. Stored secrets stay. */
  removeExtension(name: string): Promise<void> {
    return this.del<void>(`/api/v1/extensions/${encodeURIComponent(name)}`);
  }

  /**
   * Store an installed extension's credentials, bulk, as `{ KEY: value }`. The Pond
   * also restarts the extension, since a stdio extension's environment is fixed
   * when it is spawned.
   */
  setExtensionSecrets(name: string, secrets: Record<string, string>): Promise<ExtensionSecretsResult> {
    return this.request<ExtensionSecretsResult>(`/api/v1/extensions/${encodeURIComponent(name)}/secrets`, {
      method: 'POST',
      body: JSON.stringify(secrets),
      signal: timeoutSignal(INSTALL_TIMEOUT_MS),
    });
  }

  async listMarketplace(): Promise<MarketplaceExtension[]> {
    const res = await this.get<{ extensions: MarketplaceExtension[] }>('/api/v1/marketplace');
    return res.extensions;
  }

  /**
   * The Pond answers 428 when a required secret is neither in `secrets` nor
   * already stored, so credentials go with the install rather than after it.
   * Its own signal also keeps `request()` from running connection recovery
   * when the long wait runs out.
   */
  installMarketplaceExtension(id: string, secrets?: Record<string, string>): Promise<void> {
    return this.request<void>(`/api/v1/marketplace/${encodeURIComponent(id)}/install`, {
      method: 'POST',
      body: JSON.stringify(secrets ? { secrets } : {}),
      signal: timeoutSignal(INSTALL_TIMEOUT_MS),
    });
  }

  // ── Secrets and OAuth ───────────────────────────────────────

  /**
   * The names of the secrets the pond holds, never their values. The client is
   * deliberately incapable of reading one back: it stores references, and the
   * server keeps the material.
   */
  async listSecretKeys(): Promise<string[]> {
    const res = await this.get<{ keys?: unknown } | null>('/api/v1/secrets');
    const keys = res?.keys;
    // `request<T>` casts whatever it parsed, so a body that is not the listing must not pass as an
    // empty one: that would tell somebody their keys are gone.
    if (!Array.isArray(keys)) throw new Error('The Pond answered the secret listing with something unexpected');
    return keys.filter((key): key is string => typeof key === 'string');
  }

  /**
   * `PUT /secrets/{key}` with `{ value }`: stores or replaces the value, which is never sent back.
   * The Pond then restarts every enabled extension that reads this key, and names the ones that
   * could not restart, so a saved key that nothing is using yet can be said so.
   */
  async setSecret(key: string, value: string): Promise<SecretSaveResult> {
    const res = await this.put<{ restarted?: unknown; restart_errors?: unknown } | null>(
      `/api/v1/secrets/${encodeURIComponent(key)}`,
      { value },
    );
    const restarted = Array.isArray(res?.restarted)
      ? res.restarted.filter((name): name is string => typeof name === 'string')
      : [];
    const errors = res?.restart_errors;
    const restartFailed = errors && typeof errors === 'object' && !Array.isArray(errors) ? Object.keys(errors) : [];
    return { restarted, restartFailed };
  }

  /** `DELETE /secrets/{key}`, a 204. The Pond stops the extensions that cannot run without it. */
  deleteSecret(key: string): Promise<void> {
    return this.del<void>(`/api/v1/secrets/${encodeURIComponent(key)}`);
  }

  async listOAuthProviders(): Promise<OAuthProvider[]> {
    const res = await this.get<{ providers: OAuthProvider[] }>('/api/v1/oauth/providers');
    return res.providers;
  }

  /**
   * Start a sign-in for the secret an extension asks for. The Pond accepts a provider id or the
   * secret's key, and keeps the tokens itself when the provider sends the browser back.
   */
  startOAuth(provider: string, extensionId?: string): Promise<OAuthStart> {
    return this.post<OAuthStart>('/api/v1/oauth/authorize', {
      provider,
      ...(extensionId ? { extension_id: extensionId } : {}),
    });
  }

  /** How the sign-in started with this `state` stands. Asked by sign-in, not by provider. */
  oauthStatus(state: string): Promise<OAuthSignInStatus> {
    return this.get<OAuthSignInStatus>(`/api/v1/oauth/status/${encodeURIComponent(state)}`);
  }

  // ── Web search ──────────────────────────────────────────────
  // The household's own Brave Search key, held by the Pond. Every route needs the paired token,
  // and none of them returns the key: the phone can set it, check it and remove it, never read it.

  /**
   * Whether the Pond has a key and what Brave last made of it.
   *
   * A body that is not `{configured, status}` throws rather than passing for an answer: the cast in
   * `request` would otherwise hand the screen an `undefined` to index. A Pond without the route
   * answers 404, which the caller reads as "this Pond cannot search the web yet".
   */
  async webSearchState(): Promise<WebSearchState> {
    const state = readWebSearch(await this.get<unknown>('/api/v1/web-search'));
    if (!state) throw new Error('The Pond answered the web search status with something unexpected');
    return state;
  }

  /**
   * Store a Brave key. The Pond checks it with one request to Brave before keeping it, so this
   * takes as long as Brave does, and a key Brave refuses is a 422 with nothing stored.
   *
   * A 200 means the key is stored, so a body that cannot say how it fared is read as `unverified`
   * rather than as a failure that would have somebody paste the same key again.
   */
  async setWebSearchKey(key: string): Promise<WebSearchKeyResult> {
    const state = readWebSearch(await this.put<unknown>('/api/v1/web-search/key', { key }));
    return { configured: true, status: state?.configured ? state.status : 'unverified' };
  }

  /** `DELETE /web-search/key`, a 204. Goose stops being offered the tool on the next turn. */
  removeWebSearchKey(): Promise<void> {
    return this.del<void>('/api/v1/web-search/key');
  }

  // ── Remote access route (ngrok) ─────────────────────────────

  /** Which way phones reach the Pond from outside, and what this phone may change from here. */
  async remoteRoute(): Promise<RouteState> {
    return routeOrThrow(await this.get<unknown>('/api/v1/remote-access/route'));
  }

  /**
   * Switch between the built-in network and ngrok. `reservedAddress` is sent only when it
   * changes: empty clears it. The Pond refuses ngrok from away without a reserved address.
   */
  async chooseRemoteRoute(route: RemoteRoute, reservedAddress?: string): Promise<RouteState> {
    const body = reservedAddress === undefined ? { route } : { route, reservedAddress };
    return routeOrThrow(await this.put<unknown>('/api/v1/remote-access/route', body));
  }

  /** Store the household's ngrok authtoken. The Pond opens one session with it first. */
  async setNgrokAuthtoken(authtoken: string): Promise<RouteState> {
    return routeOrThrow(await this.put<unknown>('/api/v1/remote-access/route/token', { authtoken }));
  }

  async forgetNgrokAuthtoken(): Promise<RouteState> {
    return routeOrThrow(await this.del<unknown>('/api/v1/remote-access/route/token'));
  }

  // ── Pond settings ───────────────────────────────────────────

  /** The Pond's whole settings record. */
  getSettings(): Promise<PondSettings> {
    return this.get<PondSettings>('/api/v1/settings');
  }

  /**
   * Send only what changed: every key sent is marked as the household's choice for good. Keep the
   * answer, not the patch, since the Pond canonicalises, geocodes and widens what it is sent.
   */
  updateSettings(patch: Partial<PondSettings>): Promise<PondSettings> {
    return this.put<PondSettings>('/api/v1/settings', patch);
  }

  /** Every IANA zone the Pond knows, with its offset now. */
  async listTimeZones(): Promise<ZoneChoice[]> {
    const res = await this.get<{ zones?: ZoneChoice[] }>('/api/v1/time/zones');
    return Array.isArray(res?.zones) ? res.zones : [];
  }

  /** Where the Pond thinks this home is, from a zone or a typed place. Saves nothing. */
  /**
   * `PUT /location/device`: this phone's fix for the Pond's location, from the household network
   * only (403 `not_on_home_network` otherwise). It replaces only a guessed location unless
   * `replace` says the person asked for it.
   */
  setLocationFromPhone(fix: { latitude: number; longitude: number; accuracy_m: number; name?: string; replace: boolean }): Promise<HomeLocationResult> {
    return this.put<HomeLocationResult>('/api/v1/location/device', fix);
  }

  detectLocation(req: { system_zone?: string; typed_name?: string }): Promise<DetectedPlace> {
    return this.post<DetectedPlace>('/api/v1/location/detect', req);
  }

  /** Storing a voice setting waits for the engine to reload; this downloads and switches now. */
  applyTts(change: { voice?: string; speed?: number; quality?: string }): Promise<TtsApplyResult> {
    return this.request<TtsApplyResult>('/api/v1/voice/tts/apply', {
      method: 'POST',
      body: JSON.stringify(change),
      signal: timeoutSignal(TTS_APPLY_TIMEOUT_MS),
    });
  }

  /** Forget the wake word's learned pronunciations. */
  resetWakeWordCalibration(): Promise<void> {
    return this.del<void>('/api/v1/voice/calibrate');
  }

  /** Wake the job that names conversations. It names them as it goes. */
  retitleSessions(): Promise<RetitleResult> {
    return this.post<RetitleResult>('/api/v1/sessions/retitle', {});
  }

  /** Ask the model to name one conversation now. Replaces even a hand-typed name: asking is consent. */
  retitleSession(id: string): Promise<RetitleOneResult> {
    return this.post<RetitleOneResult>(`/api/v1/sessions/${encodeURIComponent(id)}/retitle`, {});
  }

  // ── Profiles ────────────────────────────────────────────────

  async listProfiles(): Promise<Profile[]> {
    const res = await this.get<{ profiles: Profile[] }>('/api/v1/profiles');
    return res.profiles;
  }

  createProfile(displayName: string, avatarEmoji?: string): Promise<Profile> {
    return this.post<Profile>('/api/v1/profiles', {
      display_name: displayName,
      avatar_emoji: avatarEmoji,
    });
  }

  deleteProfile(id: string): Promise<void> {
    return this.del<void>(`/api/v1/profiles/${encodeURIComponent(id)}`);
  }

  /** Replaces the member's whole preference map: a key left out is deleted. */
  setProfilePrefs(id: string, preferences: Record<string, string>): Promise<ProfilePrefs> {
    return this.patch<ProfilePrefs>(`/api/v1/profiles/${encodeURIComponent(id)}`, { preferences });
  }

  // ── Owner setup ─────────────────────────────────────────────

  onboardStatus(): Promise<OnboardStatus> {
    return this.get<OnboardStatus>('/api/v1/onboard/status');
  }

  /** Progress only moves forward: recording an earlier step answers the current one unchanged. */
  recordOnboardStep(step: string): Promise<OnboardStatus> {
    return this.post<OnboardStatus>(`/api/v1/onboard/step/${encodeURIComponent(step)}`, {});
  }

  /** A 400 naming `missing_fields` is an answer here, not a failure: it says which steps to revisit. */
  async completeOnboarding(): Promise<OnboardCompletion> {
    try {
      const body = await this.post<unknown>('/api/v1/onboard/complete', {});
      const adminKey = readAdminKey(body, 'admin_key');
      const interview = readInterviewOffer(body);
      return { completed: true, ...(adminKey ? { adminKey } : {}), ...(interview ? { interview } : {}) };
    } catch (e) {
      const fields = e instanceof ApiError && e.status === 400 ? (e.body as { missing_fields?: unknown } | null)?.missing_fields : null;
      if (!Array.isArray(fields)) throw e;
      return { completed: false, missing: fields.filter((f): f is string => typeof f === 'string') };
    }
  }

  warmup(): Promise<WarmupStatus> {
    return this.get<WarmupStatus>('/api/v1/warmup');
  }

  /**
   * Have the Pond say a short sample in `voice` on its own speaker (goose-in-a-pond#579, P4): the way
   * to hear a voice during setup, when `/tts` answers loopback only. A 202 means it is speaking;
   * refusals are 404 `unknown_voice`, 429 with Retry-After, and 503 `voice_unavailable`. An older Pond
   * answers 404 with no code, having no such route.
   */
  async voiceSample(voice: string): Promise<void> {
    await this.post<unknown>('/api/v1/voice/sample', { voice });
  }

  /** Which household member this device belongs to, as the Pond sees it. */
  deviceSelf(): Promise<DeviceSelf> {
    return this.get<DeviceSelf>('/api/v1/devices/self');
  }

  // ── A member's notes and setup interview ────────────────────
  // Each answers only that member's own device: anyone else gets a 403, and an unknown member a 404.

  async memberNotes(profileId: string): Promise<MemberNotes> {
    return readMemberNotes(await this.get<unknown>(`/api/v1/profiles/${encodeURIComponent(profileId)}/notes`));
  }

  /** Upsert by `key`. A refusal is a 400 whose `code` is one of `/agent/extras`'. */
  async saveMemberNote(profileId: string, note: PromptExtra): Promise<void> {
    const { key, ...body } = note;
    await this.put<unknown>(`/api/v1/profiles/${encodeURIComponent(profileId)}/notes/${encodeURIComponent(key)}`, body);
  }

  async deleteMemberNote(profileId: string, key: string): Promise<void> {
    await this.del<unknown>(`/api/v1/profiles/${encodeURIComponent(profileId)}/notes/${encodeURIComponent(key)}`);
  }

  async interview(profileId: string): Promise<ProfileInterview> {
    return readInterview(await this.get<unknown>(`/api/v1/profiles/${encodeURIComponent(profileId)}/interview`), profileId);
  }

  /**
   * Start the interview, take it up again, or begin a new round once one is done. The session it
   * answers already holds the Pond's question, so the phone opens it and waits for the member.
   */
  async startInterview(profileId: string): Promise<ProfileInterview> {
    return readInterview(await this.post<unknown>(`/api/v1/profiles/${encodeURIComponent(profileId)}/interview`, {}), profileId);
  }

  /** Save the drafted notes; the keys saved. A 409 `no_draft` means there was nothing waiting. */
  async approveInterview(profileId: string): Promise<string[]> {
    const res = await this.post<{ saved?: unknown }>(`/api/v1/profiles/${encodeURIComponent(profileId)}/interview/approve`, {});
    return Array.isArray(res?.saved) ? res.saved.filter((k): k is string => typeof k === 'string') : [];
  }

  /** The Pond's own description of itself: hostname and version. */
  systemInfo(): Promise<SystemInfo> {
    return this.get<SystemInfo>('/api/v1/system/info');
  }

  /** Outdoor weather where the Pond is configured to be, in Celsius. */
  weather(): Promise<WeatherResponse> {
    return this.get<WeatherResponse>('/api/v1/weather');
  }

  /** What Spotify is playing, as the Pond reports it. */
  nowPlaying(): Promise<NowPlayingResponse> {
    return this.get<NowPlayingResponse>('/api/v1/music/now-playing');
  }

  /** Active schedules, soonest first. The Pond sends a bare array; an envelope is tolerated. */
  async upcomingSchedules(limit: number): Promise<UpcomingSchedule[]> {
    const res = await this.get<{ schedules: UpcomingSchedule[] } | UpcomingSchedule[]>(
      `/api/v1/schedules/upcoming?limit=${encodeURIComponent(String(limit))}`,
    );
    return Array.isArray(res) ? res : res.schedules;
  }

  // ── Rides ───────────────────────────────────────────────────
  // The Pond knows whose ride it is from this phone's pairing; no request names a member.

  /** An upfront fare from where the phone is. Books nothing. */
  quoteRide(pickup: Omit<RidePoint, 'name'> & { name?: string }, dropoff: RidePoint): Promise<RideQuote> {
    return this.post<RideQuote>('/api/v1/rides/quote', { pickup, dropoff });
  }

  getRide(id: string): Promise<RideQuote> {
    return this.get<RideQuote>(`/api/v1/rides/${encodeURIComponent(id)}`);
  }

  /** Book the ride at the quoted fare. A fare is confirmed at most once. */
  confirmRide(id: string): Promise<RideQuote> {
    return this.post<RideQuote>(`/api/v1/rides/${encodeURIComponent(id)}/confirm`, {});
  }

  declineRide(id: string): Promise<void> {
    return this.post<void>(`/api/v1/rides/${encodeURIComponent(id)}/decline`, {});
  }

  /** Cancel a booked ride. The ride company may charge a cancellation fee. */
  cancelRide(id: string): Promise<void> {
    return this.post<void>(`/api/v1/rides/${encodeURIComponent(id)}/cancel`, {});
  }

  /**
   * Every recipe the Pond holds, agents and plain recipes alike. A body that is not a list throws
   * rather than passing for an empty one, which would tell somebody their agents were gone.
   */
  async listRecipes(): Promise<AgentRecipe[]> {
    const res = await this.get<unknown>('/api/v1/recipes');
    if (!Array.isArray(res)) throw new Error('The Pond answered the recipe listing with something unexpected');
    return res.filter(
      (r): r is AgentRecipe =>
        !!r && typeof r === 'object' && typeof r.id === 'string' && typeof r.name === 'string' && typeof r.yaml === 'string',
    );
  }

  /** The Pond makes the member whose paired device sends it the owner. A name already taken is replaced. */
  createRecipe(req: { name: string; description: string; yaml: string }): Promise<AgentRecipe> {
    return this.post<AgentRecipe>('/api/v1/recipes', req);
  }

  /** A 422 when a copy of a shipped agent would widen its tools. */
  updateRecipe(id: string, patch: { description?: string; yaml?: string; active?: boolean }): Promise<AgentRecipe> {
    return this.put<AgentRecipe>(`/api/v1/recipes/${encodeURIComponent(id)}`, patch);
  }

  /** `DELETE /recipes/{id}`, a 204. Its schedules and events stop with it. */
  deleteRecipe(id: string): Promise<void> {
    return this.del<void>(`/api/v1/recipes/${encodeURIComponent(id)}`);
  }

  /** Checks an agent's `giap_role` block without saving; a refused block is a 200 naming each field. */
  validateRecipe(yaml: string, name?: string): Promise<RecipeValidation> {
    return this.post<RecipeValidation>('/api/v1/recipes/validate', name ? { yaml, name } : { yaml });
  }

  /** The shipped agents this Pond can run for this member, less those declined or already on. */
  async listAgentSuggestions(): Promise<AgentSuggestion[]> {
    const res = await this.get<AgentSuggestion[] | { suggestions?: AgentSuggestion[] }>('/api/v1/agents/suggestions');
    return collection<AgentSuggestion>(res, 'suggestions');
  }

  /** Copies the template into this member's recipes: a 201 with the recipe, a 409 if it is already on. */
  async enableAgentSuggestion(template: string): Promise<AgentRecipe> {
    const res = await this.post<AgentRecipe | { recipe: AgentRecipe }>(
      `/api/v1/agents/suggestions/${encodeURIComponent(template)}/enable`,
      {},
    );
    return res && typeof res === 'object' && 'recipe' in res ? res.recipe : res;
  }

  /** A 204; the card stays hidden for this member for good. */
  dismissAgentSuggestion(template: string): Promise<void> {
    return this.post<void>(`/api/v1/agents/suggestions/${encodeURIComponent(template)}/dismiss`, {});
  }

  /** Each agent's saved prefill and the compile pass running now, if any. A 404 is a Pond that predates them. */
  async agentPrefills(): Promise<AgentPrefills> {
    const state = readPrefills(await this.get<unknown>('/api/v1/agents/prefills'));
    if (!state) throw new Error('The Pond answered the prefill listing with something unexpected');
    return state;
  }

  /** A 202: the snapshot is thrown away now and compiled again at the Pond's next quiet moment. */
  rebuildAgentPrefill(name: string): Promise<void> {
    return this.post<void>(`/api/v1/agents/${encodeURIComponent(name)}/prefill/rebuild`, {});
  }

  /** A 202, for every agent at once. */
  rebuildAllPrefills(): Promise<void> {
    return this.post<void>('/api/v1/agents/prefills/rebuild', {});
  }

  /** One long task, its steps and its artifacts. A 404 is a task this member does not reach, or none. */
  async longTask(id: string): Promise<LongTask> {
    const task = readLongTask(await this.get<unknown>(`/api/v1/long-tasks/${encodeURIComponent(id)}`));
    if (!task) throw new Error('The Pond answered the long task with something unexpected');
    return task;
  }

  /** One artifact's whole body, for reading a task's result. */
  async longTaskArtifact(taskId: string, artifactId: string): Promise<LongTaskArtifactBody> {
    const res = await this.get<Partial<LongTaskArtifactBody> | null>(
      `/api/v1/long-tasks/${encodeURIComponent(taskId)}/artifacts/${encodeURIComponent(artifactId)}`,
    );
    if (!res || typeof res.body !== 'string') throw new Error('The Pond answered the artifact with something unexpected');
    return { id: res.id ?? artifactId, title: res.title ?? '', kind: res.kind ?? '', summary: res.summary ?? '', body: res.body };
  }

  /** Whether this member may ask for deep research. A 404 is a Pond that predates it. */
  async deepResearchAvailability(): Promise<DeepResearchAvailability> {
    const answer = readResearchAvailability(await this.get<unknown>('/api/v1/long-tasks/deep-research'));
    if (!answer) throw new Error('The Pond answered the research check with something unexpected');
    return answer;
  }

  /** The whole report, as long as its plan made it. A 404 is an unknown task, or a Pond without the route. */
  async longTaskReport(id: string): Promise<LongTaskReportWire> {
    const report = readLongTaskReport(await this.get<unknown>(`/api/v1/long-tasks/${encodeURIComponent(id)}/report`));
    if (!report) throw new Error('The Pond answered the report with something unexpected');
    return report;
  }

  /** The report as a file to keep. `ics` is a 404 when the plan saved no dated events. */
  async longTaskExport(id: string, format: ReportFormat): Promise<{ name: string; body: string }> {
    const res = await this.open(`/api/v1/long-tasks/${encodeURIComponent(id)}/export?format=${format}`, {
      signal: timeoutSignal(REQUEST_TIMEOUT_MS),
    });
    return { name: reportFileName(res.headers.get('Content-Disposition'), format), body: await res.text() };
  }

  /** Stops a task; a step under way finishes first. A 409 once it has already ended. */
  cancelLongTask(id: string): Promise<void> {
    return this.post<void>(`/api/v1/long-tasks/${encodeURIComponent(id)}/cancel`, {});
  }

  // The pairing lock, as a paired member sees it. Changing it, and answering the phones that
  // wait, is the main member's: anyone else is refused with 403 `pairing_main_member_only`.

  async pairingLock(): Promise<PairingLock> {
    return required(readPairingLock(await this.get<unknown>('/api/v1/pairing/lock')), 'the pairing lock');
  }

  async setPairingLock(locked: boolean): Promise<void> {
    await this.put<unknown>('/api/v1/pairing/lock', { locked });
  }

  /** A 400 `pin_not_six_to_twelve_digits` for a PIN the Pond will not take. */
  async setRecoveryPin(pin: string): Promise<void> {
    await this.put<unknown>('/api/v1/pairing/recovery-pin', { pin });
  }

  async clearRecoveryPin(): Promise<void> {
    await this.del<unknown>('/api/v1/pairing/recovery-pin');
  }

  async pairingRequests(): Promise<PairingRequest[]> {
    return readPairingRequests(await this.get<unknown>('/api/v1/pairing/requests'));
  }

  /** Let a waiting phone in, as the member its code named unless `profileId` names another. */
  async approvePairingRequest(id: string, profileId?: string): Promise<void> {
    await this.post<unknown>(`/api/v1/pairing/requests/${encodeURIComponent(id)}/approve`, profileId ? { profile_id: profileId } : {});
  }

  async declinePairingRequest(id: string): Promise<void> {
    await this.post<unknown>(`/api/v1/pairing/requests/${encodeURIComponent(id)}/decline`, {});
  }

  // My Pond: every route below but status, unlock and lock answers 403 `admin_locked` until unlocked.

  /** Reading the status never renews the unlock, so it is the one admin route that may be polled. */
  async adminStatus(): Promise<AdminStatus> {
    return required(readAdminStatus(await this.get<unknown>('/api/v1/admin/status')), 'the administrator status');
  }

  async adminUnlock(password: string): Promise<AdminUnlocked> {
    return required(readUnlocked(await this.post<unknown>('/api/v1/admin/unlock', { password })), 'the unlock');
  }

  /** A 403 `admin_key_rejected` for a key the Pond revoked or replaced, which counts as a wrong guess. */
  async adminUnlockWithKey(key: string): Promise<AdminUnlocked> {
    return required(readUnlocked(await this.post<unknown>('/api/v1/admin/unlock', { key })), 'the unlock');
  }

  /** Unlocked only: this phone's own key, replacing any older one. The Pond shows it this once. */
  async adminEnroll(): Promise<string> {
    return required(readAdminKey(await this.post<unknown>('/api/v1/admin/enroll', {})), 'the key');
  }

  /** A 204: this phone's key is revoked and the phone locked. */
  async adminForgetKey(): Promise<void> {
    await this.del<unknown>('/api/v1/admin/key');
  }

  /** A 204. */
  adminLock(): Promise<void> {
    return this.post<void>('/api/v1/admin/lock', {});
  }

  async adminOverview(): Promise<AdminOverview> {
    return required(readOverview(await this.get<unknown>('/api/v1/admin/overview')), 'the overview');
  }

  /** One directory, `''` being the data directory itself. */
  async adminFiles(path: string): Promise<AdminFileListing> {
    const raw = await this.get<unknown>(`/api/v1/admin/files?path=${encodeURIComponent(path)}`);
    return required(readFileListing(raw, path), 'the file listing');
  }

  /** Resolves with the bytes freed. */
  async adminDeleteFile(path: string): Promise<number> {
    return readFreed(await this.del<unknown>(`/api/v1/admin/files?path=${encodeURIComponent(path)}`));
  }

  async adminCaches(): Promise<AdminCache[]> {
    return required(readCaches(await this.get<unknown>('/api/v1/admin/caches')), 'the cache listing');
  }

  /** Resolves with the bytes freed. */
  async adminClearCache(id: AdminCacheId): Promise<number> {
    return readFreed(await this.post<unknown>(`/api/v1/admin/caches/${encodeURIComponent(id)}/clear`, {}));
  }

  async adminTasks(): Promise<AdminTask[]> {
    return required(readTasks(await this.get<unknown>('/api/v1/admin/tasks')), 'the task listing');
  }

  /** A 409 `task_active` until the task has finished or been stopped. */
  async adminDeleteTask(id: string): Promise<void> {
    await this.del<unknown>(`/api/v1/admin/tasks/${encodeURIComponent(id)}`);
  }

  async adminDeleteTaskArtifact(taskId: string, artifactId: string): Promise<void> {
    await this.del<unknown>(`/api/v1/admin/tasks/${encodeURIComponent(taskId)}/artifacts/${encodeURIComponent(artifactId)}`);
  }

  async adminHealth(): Promise<AdminHealth> {
    return required(readHealth(await this.get<unknown>('/api/v1/admin/health')), 'the health report');
  }

  /** Whether notices arrived and messages were answered, over the last `days` (the Pond takes 1 to 90). */
  async adminReliability(days: number): Promise<AdminReliability> {
    return required(readReliability(await this.get<unknown>(`/api/v1/admin/reliability?days=${Math.round(days)}`)), 'the reliability report');
  }

  async adminPower(): Promise<AdminPower> {
    return required(readPower(await this.get<unknown>('/api/v1/admin/power')), 'the power report');
  }

  async adminSetPowerMode(id: number): Promise<PowerModeChange> {
    return required(readModeChange(await this.put<unknown>('/api/v1/admin/power/mode', { id })), 'the power mode change');
  }

  /** A 202; a 409 `long_task_running` unless `force`, which loses the running step. */
  async adminRestart(force: boolean): Promise<void> {
    await this.post<unknown>('/api/v1/admin/power/restart', force ? { force: true } : {});
  }

  // ── Web watches and saved cards ─────────────────────────────

  /** The caller's own web watches, newest first. */
  async listWebWatches(): Promise<WebWatch[]> {
    return readList(await this.get<unknown>('/api/v1/web-watches'), readWebWatch);
  }

  /** One watch with the items it last saw and its newest changes. */
  async webWatch(id: string): Promise<WebWatchDetail> {
    const watch = readWebWatchDetail(await this.get<unknown>(`/api/v1/web-watches/${encodeURIComponent(id)}`));
    if (!watch) throw new Error('The Pond answered the watch with something unexpected');
    return watch;
  }

  async editWebWatch(
    id: string,
    edit: { paused?: boolean; interval_hours?: number; filters?: WatchFilters; looking_for?: string },
  ): Promise<WebWatch> {
    const watch = readWebWatch(await this.patch<unknown>(`/api/v1/web-watches/${encodeURIComponent(id)}`, edit));
    if (!watch) throw new Error('The Pond answered the watch with something unexpected');
    return watch;
  }

  deleteWebWatch(id: string): Promise<void> {
    return this.del<void>(`/api/v1/web-watches/${encodeURIComponent(id)}`);
  }

  /** The caller's cards and the household's shared ones, of one collection when named. */
  async listSavedItems(collection?: string): Promise<SavedItem[]> {
    const query = collection ? `?collection=${encodeURIComponent(collection)}` : '';
    return readList(await this.get<unknown>(`/api/v1/saved-items${query}`), readSavedItem);
  }

  async savedCollections(): Promise<SavedCollection[]> {
    return readList(await this.get<unknown>('/api/v1/saved-items/collections'), readCollection);
  }

  async savedItem(id: string): Promise<SavedItem> {
    const item = readSavedItem(await this.get<unknown>(`/api/v1/saved-items/${encodeURIComponent(id)}`));
    if (!item) throw new Error('The Pond answered the card with something unexpected');
    return item;
  }

  /** Keeps a card, such as an option a task found; the Pond bounds what it stores. */
  async saveItem(card: Record<string, unknown> & { kind: SavedKind; title: string }): Promise<SavedItem> {
    const item = readSavedItem(await this.post<unknown>('/api/v1/saved-items', card));
    if (!item) throw new Error('The Pond answered the card with something unexpected');
    return item;
  }

  /** `collection: null` takes the card out of its collection. */
  async editSavedItem(
    id: string,
    edit: { title?: string; body?: string; collection?: string | null; shared?: boolean },
  ): Promise<SavedItem> {
    const item = readSavedItem(await this.patch<unknown>(`/api/v1/saved-items/${encodeURIComponent(id)}`, edit));
    if (!item) throw new Error('The Pond answered the card with something unexpected');
    return item;
  }

  deleteSavedItem(id: string): Promise<void> {
    return this.del<void>(`/api/v1/saved-items/${encodeURIComponent(id)}`);
  }

  /** Pictures the Pond keeps for the pages an answer cites or read; none from an older Pond. */
  async pagePictures(pages: string[]): Promise<ReportImage[]> {
    try {
      // The Pond fetches a picture it has not kept while asked, in up to three 8 s steps: past the usual 15 s.
      const res = await this.request<unknown>('/api/v1/report-images/for-pages', {
        method: 'POST',
        body: JSON.stringify({ pages }),
        signal: timeoutSignal(PICTURES_TIMEOUT_MS),
      });
      return readList(res, readReportImage);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 405)) return [];
      throw e;
    }
  }

  /** "Watch price": a watch on the card's own page, which tells this member when its price drops. */
  async watchSavedItem(id: string, body: { max_price?: number } = {}): Promise<WebWatch> {
    const watch = readWebWatch(await this.post<unknown>(`/api/v1/saved-items/${encodeURIComponent(id)}/watch`, body));
    if (!watch) throw new Error('The Pond answered the watch with something unexpected');
    return watch;
  }

  // ── My Goose: the member's hub (docs/MY-GOOSE-HUB.md) ────────
  // Every route acts for the calling member. A Pond without `/me/hub` answers 404, and the phone
  // keeps its older My Goose; a route that starts work on the Pond's lane answers 202.

  /** What this Pond serves of My Goose, or null for an answer that is not the hub. */
  async meHub(): Promise<MeHub | null> {
    return readHub(await this.get<unknown>('/api/v1/me/hub'));
  }

  async interests(): Promise<Interest[]> {
    return readInterests(await this.get<unknown>('/api/v1/me/interests'));
  }

  async addInterest(body: InterestWriteWire & { topic: string }): Promise<Interest> {
    return required(readInterest(await this.post<unknown>('/api/v1/me/interests', body)), 'the interest');
  }

  async editInterest(id: string, body: InterestWriteWire): Promise<Interest> {
    return required(readInterest(await this.patch<unknown>(`/api/v1/me/interests/${encodeURIComponent(id)}`, body)), 'the interest');
  }

  async deleteInterest(id: string): Promise<void> {
    await this.del<unknown>(`/api/v1/me/interests/${encodeURIComponent(id)}`);
  }

  async interestInterview(): Promise<InterestInterview> {
    return readInterestInterview(await this.get<unknown>('/api/v1/me/interests/interview'));
  }

  /** Starts the interview, resumes it, or begins a new round once one is done. */
  async startInterestInterview(): Promise<InterestInterview> {
    return readInterestInterview(await this.post<unknown>('/api/v1/me/interests/interview', {}));
  }

  /** Answers `thinking` until the next question is written; the phone reads it again until then. */
  async answerInterestInterview(answer: { text?: string; choices?: string[] }): Promise<InterestInterview> {
    return readInterestInterview(await this.post<unknown>('/api/v1/me/interests/interview/answer', answer));
  }

  async finishInterestInterview(): Promise<InterestInterview> {
    return readInterestInterview(await this.post<unknown>('/api/v1/me/interests/interview/finish', {}));
  }

  /** How many interests were saved. */
  async approveInterestInterview(body: InterviewApproveWire): Promise<number> {
    const res = await this.post<{ saved?: unknown }>('/api/v1/me/interests/interview/approve', body);
    return typeof res?.saved === 'number' && Number.isFinite(res.saved) ? res.saved : body.keep.length;
  }

  /** The Pond's account of the member, or null before the first is written (a 404). */
  async portrait(): Promise<Portrait | null> {
    try {
      return readPortrait(await this.get<unknown>('/api/v1/me/portrait'));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  }

  async newsSettings(): Promise<NewsSettings> {
    return readNewsSettings(await this.get<unknown>('/api/v1/me/news/settings'));
  }

  /** A partial write: only the fields sent change. */
  async saveNewsSettings(change: Partial<NewsSettingsWire>): Promise<NewsSettings> {
    return readNewsSettings(await this.put<unknown>('/api/v1/me/news/settings', change));
  }

  async news(): Promise<NewsFeed> {
    return readNewsFeed(await this.get<unknown>('/api/v1/me/news'));
  }

  /** One interest's page: only its stories, newest first, up to 30. */
  async newsFor(interestId: string): Promise<NewsFeed> {
    return readNewsFeed(await this.get<unknown>(`/api/v1/me/news?interest=${encodeURIComponent(interestId)}`));
  }

  async markStoryRead(id: string): Promise<void> {
    await this.post<unknown>(`/api/v1/me/news/stories/${encodeURIComponent(id)}/read`, {});
  }

  /** What the member read in the last 30 days. */
  async newsHistory(): Promise<Story[]> {
    return readHistory(await this.get<unknown>('/api/v1/me/news/history'));
  }

  /** Up and down tune that interest's topics; `wrong` hides the story and keeps the note. */
  async storyFeedback(id: string, vote: StoryVoteWire, note?: string): Promise<void> {
    await this.post<unknown>(`/api/v1/me/news/stories/${encodeURIComponent(id)}/feedback`, note ? { vote, note } : { vote });
  }

  async story(id: string): Promise<StoryDetail> {
    return required(readStoryDetail(await this.get<unknown>(`/api/v1/me/news/stories/${encodeURIComponent(id)}`)), 'the story');
  }

  async digests(): Promise<DigestSummary[]> {
    return readDigestList(await this.get<unknown>('/api/v1/me/news/digests'));
  }

  async digest(id: string): Promise<Digest> {
    return required(readDigest(await this.get<unknown>(`/api/v1/me/news/digests/${encodeURIComponent(id)}`)), 'the digest');
  }

  /**
   * The digest read aloud in the Pond's voice, as WAV bytes. `path` is the digest's own `listen`,
   * which the reader has already kept to the Pond's API. Synthesis can take a while on a small
   * Pond, so it gets the voice timeout rather than the usual one.
   */
  async digestAudio(path: string, signal?: AbortSignal): Promise<ArrayBuffer> {
    if (!path.startsWith('/api/') || path.startsWith('//')) throw new Error('Invalid Pond API path');
    const res = await this.open(path, { headers: { Accept: 'audio/wav' }, signal: timeoutSignal(VOICE_TIMEOUT_MS, signal) });
    return res.arrayBuffer();
  }

  /** Reads the digest on the house speaker now. */
  async speakDigest(id: string): Promise<void> {
    await this.post<unknown>(`/api/v1/me/news/digests/${encodeURIComponent(id)}/speak`, {});
  }

  async refreshNews(): Promise<void> {
    await this.post<unknown>('/api/v1/me/news/refresh', {});
  }

  async todos(state: 'open' | 'done' | 'all' = 'open'): Promise<Todo[]> {
    return readTodos(await this.get<unknown>(`/api/v1/me/todos?state=${state}`));
  }

  async addTodo(body: TodoWriteWire & { kind: 'todo' | 'reminder'; text: string }): Promise<Todo> {
    return required(readTodo(await this.post<unknown>('/api/v1/me/todos', body)), 'the to-do');
  }

  /** `hooks`, when sent, replaces every hook the to-do had. */
  async editTodo(id: string, body: TodoWriteWire): Promise<Todo> {
    return required(readTodo(await this.patch<unknown>(`/api/v1/me/todos/${encodeURIComponent(id)}`, body)), 'the to-do');
  }

  async deleteTodo(id: string): Promise<void> {
    await this.del<unknown>(`/api/v1/me/todos/${encodeURIComponent(id)}`);
  }

  /** The member's answer to Goose asking whether it is done. */
  async answerTodo(id: string, answer: TodoAnswerWire, snoozeMinutes?: number): Promise<Todo> {
    const body = snoozeMinutes ? { answer, snooze_minutes: snoozeMinutes } : { answer };
    return required(readTodo(await this.post<unknown>(`/api/v1/me/todos/${encodeURIComponent(id)}/answer`, body)), 'the to-do');
  }

  /** Dated mentions from chats, offered as to-dos. */
  async todoOffers(): Promise<TodoOffer[]> {
    return readTodoOffers(await this.get<unknown>('/api/v1/me/todos/offers'));
  }

  /** Adds the offer as a to-do, at the time the Pond worked out or the one sent. */
  async acceptTodoOffer(reminderId: string, dueAt?: string): Promise<Todo> {
    const body = dueAt ? { due_at: dueAt } : {};
    return required(readTodo(await this.post<unknown>(`/api/v1/me/todos/offers/${encodeURIComponent(reminderId)}/accept`, body)), 'the to-do');
  }

  async declineTodoOffer(reminderId: string): Promise<void> {
    await this.post<unknown>(`/api/v1/me/todos/offers/${encodeURIComponent(reminderId)}/decline`, {});
  }

  /** The places and the things a to-do can be hooked to; a connector added on the Pond shows up here. */
  async hookSources(): Promise<HookSources> {
    return readHookSources(await this.get<unknown>('/api/v1/me/hooks/sources'));
  }

  async addPlace(body: { label: string; lat: number; lng: number; radius_m?: number }): Promise<Place> {
    return required(readPlace(await this.post<unknown>('/api/v1/me/places', body)), 'the place');
  }

  async deletePlace(id: string): Promise<void> {
    await this.del<unknown>(`/api/v1/me/places/${encodeURIComponent(id)}`);
  }

  /** The phone's geofence saying the member arrived at or left a place. */
  async placeEvent(id: string, transition: 'arrive' | 'leave'): Promise<void> {
    await this.post<unknown>(`/api/v1/me/places/${encodeURIComponent(id)}/event`, { transition });
  }

  async cart(): Promise<CartItem[]> {
    return readCart(await this.get<unknown>('/api/v1/me/cart'));
  }

  /** Starts watching a link; the item answers `checking` until the Pond has read the page. */
  async addToCart(body: CartWriteWire & { url: string }): Promise<CartItem> {
    return required(readCartItem(await this.post<unknown>('/api/v1/me/cart', body)), 'the watched link');
  }

  async cartItem(id: string): Promise<CartItem> {
    return required(readCartItem(await this.get<unknown>(`/api/v1/me/cart/${encodeURIComponent(id)}`)), 'the watched link');
  }

  async editCartItem(id: string, body: CartWriteWire): Promise<CartItem> {
    return required(readCartItem(await this.patch<unknown>(`/api/v1/me/cart/${encodeURIComponent(id)}`, body)), 'the watched link');
  }

  async deleteCartItem(id: string): Promise<void> {
    await this.del<unknown>(`/api/v1/me/cart/${encodeURIComponent(id)}`);
  }

  async checkCartItem(id: string): Promise<CartItem> {
    return required(readCartItem(await this.post<unknown>(`/api/v1/me/cart/${encodeURIComponent(id)}/check`, {})), 'the watched link');
  }

  async connectors(): Promise<Connector[]> {
    return readConnectors(await this.get<unknown>('/api/v1/me/connectors'));
  }

  async connectConnector(id: string, fields: Record<string, string | boolean>): Promise<Connector> {
    return required(readConnector(await this.post<unknown>(`/api/v1/me/connectors/${encodeURIComponent(id)}/connect`, { fields })), 'the connector');
  }

  async disconnectConnector(id: string): Promise<Connector> {
    return required(readConnector(await this.post<unknown>(`/api/v1/me/connectors/${encodeURIComponent(id)}/disconnect`, {})), 'the connector');
  }

  /** A new webhook connector. Its address comes back on this answer only. */
  async makeWebhook(name: string): Promise<Connector> {
    return required(readConnector(await this.post<unknown>('/api/v1/me/connectors/webhook', { name })), 'the webhook');
  }

  async ideas(): Promise<{ ideas: Idea[]; state: 'idle' | 'thinking' }> {
    return readIdeas(await this.get<unknown>('/api/v1/me/ideas'));
  }

  /** Goose starts its part; the idea answers `working`. */
  async ideaGoose(id: string): Promise<Idea> {
    return required(readIdea(await this.post<unknown>(`/api/v1/me/ideas/${encodeURIComponent(id)}/goose`, {})), 'the idea');
  }

  /** The idea's steps become the member's to-dos. */
  async ideaMine(id: string): Promise<{ idea: Idea; todos: Todo[] }> {
    const res = await this.post<{ idea?: unknown; todos?: unknown }>(`/api/v1/me/ideas/${encodeURIComponent(id)}/mine`, {});
    return { idea: required(readIdea(res?.idea), 'the idea'), todos: readTodos(res?.todos) };
  }

  async dismissIdea(id: string): Promise<void> {
    await this.post<unknown>(`/api/v1/me/ideas/${encodeURIComponent(id)}/dismiss`, {});
  }

  async refreshIdeas(): Promise<void> {
    await this.post<unknown>('/api/v1/me/ideas/refresh', {});
  }

  /** One idea's own page: `GET /me/ideas/{id}`. */
  async idea(id: string): Promise<Idea> {
    return required(readIdea(await this.get<unknown>(`/api/v1/me/ideas/${encodeURIComponent(id)}`)), 'the idea');
  }

  // ── Cards sent to chat ───────────────────────────────────────

  /** What a chat about this card would be given: what the member read, and Goose's notes. */
  async card(kind: CardKind, id: string): Promise<ContextCard> {
    return required(readCard(await this.get<unknown>(`/api/v1/me/cards/${kind}/${encodeURIComponent(id)}`)), 'the card');
  }

  // ── About you: the member's profile ──────────────────────────

  async about(): Promise<AboutProfile> {
    return readAbout(await this.get<unknown>('/api/v1/me/about'));
  }

  /** A fact the member writes about themselves, filed under the word they pick. */
  async addAboutFact(content: string, about: string): Promise<AboutFact> {
    return required(readFact(await this.post<unknown>('/api/v1/me/about', { content, about })), 'the fact');
  }

  async editAboutFact(id: string, change: { content?: string; about?: string }): Promise<AboutFact> {
    return required(readFact(await this.patch<unknown>(`/api/v1/me/about/${encodeURIComponent(id)}`, change)), 'the fact');
  }

  async deleteAboutFact(id: string): Promise<void> {
    await this.del<unknown>(`/api/v1/me/about/${encodeURIComponent(id)}`);
  }

  /** Rows the Pond set aside when it re-sorted older memories, each with its reason. */
  async archivedAbout(): Promise<ArchivedFact[]> {
    return readArchived(await this.get<unknown>('/api/v1/me/about/archived'));
  }

  async restoreAboutFact(id: string): Promise<AboutFact> {
    return required(readFact(await this.post<unknown>(`/api/v1/me/about/${encodeURIComponent(id)}/restore`, {})), 'the fact');
  }

  // ── The one interview ────────────────────────────────────────

  async memberInterview(): Promise<MemberInterview> {
    return readMemberInterview(await this.get<unknown>('/api/v1/me/interview'));
  }

  /** Starts it, picks it up where it stopped, or begins again once done. */
  async startMemberInterview(): Promise<MemberInterview> {
    return readMemberInterview(await this.post<unknown>('/api/v1/me/interview', {}));
  }

  async answerMemberInterview(answer: InterviewAnswer): Promise<MemberInterview> {
    return readMemberInterview(await this.post<unknown>('/api/v1/me/interview/answer', answer));
  }

  /** Stops asking and writes up what there is. */
  async finishMemberInterview(): Promise<MemberInterview> {
    return readMemberInterview(await this.post<unknown>('/api/v1/me/interview/finish', {}));
  }

  async approveMemberInterview(approval: InterviewApproval): Promise<InterviewKept> {
    return readKept(await this.post<unknown>('/api/v1/me/interview/approve', approval));
  }

  // ── Goose's own notes ────────────────────────────────────────

  async gooseNotes(): Promise<GooseNotes> {
    return readGooseNotes(await this.get<unknown>('/api/v1/me/notes'));
  }

  async deleteGooseNote(id: string): Promise<void> {
    await this.del<unknown>(`/api/v1/me/notes/${encodeURIComponent(id)}`);
  }

  // ── What Goose did by itself ─────────────────────────────────

  async gooseActivity(): Promise<GooseActivityList> {
    return readGooseActivity(await this.get<unknown>('/api/v1/me/goose/activity'));
  }

  async undoGooseActivity(id: string): Promise<void> {
    await this.post<unknown>(`/api/v1/me/goose/activity/${encodeURIComponent(id)}/undo`, {});
  }

  async markGooseActivitySeen(): Promise<void> {
    await this.post<unknown>('/api/v1/me/goose/activity/seen', {});
  }

  // ── Ideas from screenshots (opt-in) ──────────────────────────

  async screenshots(): Promise<Screenshots> {
    return readScreenshots(await this.get<unknown>('/api/v1/me/screenshots'));
  }

  /** Turning it off forgets every screenshot still waiting to be read. */
  async setScreenshots(enabled: boolean): Promise<Screenshots> {
    return readScreenshots(await this.put<unknown>('/api/v1/me/screenshots', { enabled }));
  }

  /** One screenshot for the Pond to read once; answers how many are waiting. */
  async sendScreenshot(image: string, mimeType: string, takenAt?: string): Promise<number> {
    const res = await this.post<{ pending?: unknown }>('/api/v1/me/screenshots', {
      image,
      mime_type: mimeType,
      ...(takenAt ? { taken_at: takenAt } : {}),
    });
    return typeof res?.pending === 'number' ? res.pending : 0;
  }

  async deleteScreenshotNote(id: string): Promise<void> {
    await this.del<unknown>(`/api/v1/me/screenshots/${encodeURIComponent(id)}`);
  }

  /** Every note, and every screenshot still waiting. */
  async deleteAllScreenshotNotes(): Promise<void> {
    await this.del<unknown>('/api/v1/me/screenshots');
  }

  async catalog(): Promise<CatalogItem[]> {
    return readCatalog(await this.get<unknown>('/api/v1/me/catalog'));
  }

  // The idea engine: plans, what Goose makes for them, its questions, the fact sheet, the
  // don't-list, the specialists, the ledger, the heartbeat's jobs and the pictures sent to it. A
  // Pond serves each part its `/me/hub` names; a member an anchor is shared with is refused (403)
  // everything but reading it and answering its questions.

  async anchors(): Promise<Anchor[]> {
    return readAnchors(await this.get<unknown>('/api/v1/me/anchors'));
  }

  async anchor(id: string): Promise<Anchor> {
    return required(readAnchor(await this.get<unknown>(`/api/v1/me/anchors/${encodeURIComponent(id)}`)), 'the plan');
  }

  /** 201 for a new one, or 200 with the one the member already has under that title. */
  async addAnchor(body: NewAnchorWire): Promise<Anchor> {
    return required(readAnchor(await this.post<unknown>('/api/v1/me/anchors', body)), 'the plan');
  }

  async editAnchor(id: string, body: AnchorPatchWire): Promise<Anchor> {
    return required(readAnchor(await this.patch<unknown>(`/api/v1/me/anchors/${encodeURIComponent(id)}`, body)), 'the plan');
  }

  async confirmAnchor(id: string): Promise<Anchor> {
    return required(readAnchor(await this.post<unknown>(`/api/v1/me/anchors/${encodeURIComponent(id)}/confirm`, {})), 'the plan');
  }

  /** A candidate fades; 409 for one already confirmed. */
  async dismissAnchor(id: string): Promise<void> {
    await this.post<unknown>(`/api/v1/me/anchors/${encodeURIComponent(id)}/dismiss`, {});
  }

  async stopAnchor(id: string, body: AnchorStopWire): Promise<void> {
    await this.post<unknown>(`/api/v1/me/anchors/${encodeURIComponent(id)}/stop`, body);
  }

  async shareAnchor(id: string, profileIds: string[]): Promise<Anchor> {
    return required(readAnchor(await this.put<unknown>(`/api/v1/me/anchors/${encodeURIComponent(id)}/shares`, { profile_ids: profileIds })), 'the plan');
  }

  async deliverable(id: string): Promise<Deliverable> {
    return required(readDeliverable(await this.get<unknown>(`/api/v1/me/deliverables/${encodeURIComponent(id)}`)), 'what Goose made');
  }

  /** 202: a job is queued, or the open one moved ahead. 409 once it was rejected or its plan is over. */
  async refreshDeliverable(id: string): Promise<void> {
    await this.post<unknown>(`/api/v1/me/deliverables/${encodeURIComponent(id)}/refresh`, {});
  }

  async rejectDeliverable(id: string, body: DeliverableRejectWire): Promise<void> {
    await this.post<unknown>(`/api/v1/me/deliverables/${encodeURIComponent(id)}/reject`, body);
  }

  async deliverableSeen(id: string): Promise<void> {
    await this.post<unknown>(`/api/v1/me/deliverables/${encodeURIComponent(id)}/seen`, {});
  }

  // Idea cards (pond docs/architecture/idea-cards.md, section 4): served when `/me/hub` says so.

  async ideaCards(): Promise<IdeaCardSet> {
    return readIdeaCardSet(await this.get<unknown>('/api/v1/me/idea-cards'));
  }

  /** 202 with the set's state; a set already on its way is not started twice. */
  async refreshIdeaCards(): Promise<IdeaSetState> {
    return readSetState(await this.post<unknown>('/api/v1/me/idea-cards/refresh', {}));
  }

  async doIdeaCard(id: string): Promise<IdeaCardDone> {
    return readIdeaCardDone(await this.post<unknown>(`/api/v1/me/idea-cards/${encodeURIComponent(id)}/do`, {}));
  }

  async saveIdeaCard(id: string, saved: boolean): Promise<IdeaCard> {
    return required(readIdeaCard(await this.post<unknown>(`/api/v1/me/idea-cards/${encodeURIComponent(id)}/${saved ? 'save' : 'unsave'}`, {})), 'the idea');
  }

  async dismissIdeaCard(id: string, body: IdeaCardDismissWire): Promise<void> {
    await this.post<unknown>(`/api/v1/me/idea-cards/${encodeURIComponent(id)}/dismiss`, body);
  }

  /** Finds or makes the card's plan and queues its first piece of work. */
  async deeperIdeaCard(id: string): Promise<IdeaCardDeeper> {
    return readIdeaCardDeeper(await this.post<unknown>(`/api/v1/me/idea-cards/${encodeURIComponent(id)}/deeper`, {}));
  }

  /** The body as a Markdown file to share; a 404 before anything is written. */
  async deliverableFile(id: string): Promise<{ name: string; body: string }> {
    const res = await this.open(`/api/v1/me/deliverables/${encodeURIComponent(id)}/file`, { signal: timeoutSignal(REQUEST_TIMEOUT_MS) });
    return { name: reportFileName(res.headers.get('Content-Disposition'), 'markdown'), body: await res.text() };
  }

  /** Open and waiting batches, newest first; `sessionId` narrows them to one chat's. */
  async questions(sessionId?: string): Promise<QuestionBatch[]> {
    const query = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : '';
    return readQuestionBatches(await this.get<unknown>(`/api/v1/me/questions${query}`));
  }

  /** Every answer in one request; resumes a chat turn still waiting on them. */
  async answerQuestionBatch(id: string, body: QuestionBatchAnswerWire): Promise<void> {
    await this.post<unknown>(`/api/v1/me/questions/batches/${encodeURIComponent(id)}/answer`, body);
  }

  /** The member's Done: Goose goes ahead with what it has. */
  async enoughQuestions(id: string): Promise<void> {
    await this.post<unknown>(`/api/v1/me/questions/batches/${encodeURIComponent(id)}/enough`, {});
  }

  /** 422 for no choice and no words, or two choices where one is asked; 409 once it is closed. */
  async answerQuestion(id: string, body: QuestionAnswerWire): Promise<void> {
    await this.post<unknown>(`/api/v1/me/questions/${encodeURIComponent(id)}/answer`, body);
  }

  async skipQuestion(id: string): Promise<void> {
    await this.post<unknown>(`/api/v1/me/questions/${encodeURIComponent(id)}/skip`, {});
  }

  async engineJobs(limit = 30): Promise<EngineJob[]> {
    return readEngineJobs(await this.get<unknown>(`/api/v1/me/engine/jobs?limit=${Math.max(1, Math.min(100, Math.round(limit)))}`));
  }

  async facts(): Promise<FactSheet> {
    return readFactSheet(await this.get<unknown>('/api/v1/me/facts'));
  }

  /** The line is the member's own; the answer is the whole sheet. */
  async addFact(category: FactCategoryWire, fact: string): Promise<FactSheet> {
    return readFactSheet(await this.post<unknown>('/api/v1/me/facts', { category, fact }));
  }

  /** 409 when another line already says that. */
  async editFact(id: string, change: FactPatchWire): Promise<SheetFact> {
    return required(readSheetFact(await this.patch<unknown>(`/api/v1/me/facts/${encodeURIComponent(id)}`, change)), 'the line');
  }

  async deleteFact(id: string): Promise<void> {
    await this.del<unknown>(`/api/v1/me/facts/${encodeURIComponent(id)}`);
  }

  async rebuildFacts(): Promise<void> {
    await this.post<unknown>('/api/v1/me/facts/rebuild', {});
  }

  async dontList(): Promise<DontRule[]> {
    return readRules(await this.get<unknown>('/api/v1/me/dont'));
  }

  async addDont(rule: string, strength: 'never' | 'avoid' = 'never'): Promise<DontRule[]> {
    return readRules(await this.post<unknown>('/api/v1/me/dont', { rule, strength }));
  }

  /** The list left after, or null from a Pond that answers 204. */
  async deleteDont(id: string): Promise<DontRule[] | null> {
    const res = await this.del<unknown>(`/api/v1/me/dont/${encodeURIComponent(id)}`);
    return res ? readRules(res) : null;
  }

  async specialists(): Promise<Specialist[]> {
    return readSpecialists(await this.get<unknown>('/api/v1/me/agents'));
  }

  /** Off answers an offer with "declined", which is never offered again. */
  async setSpecialist(id: string, on: boolean): Promise<Specialist[]> {
    return readSpecialists(await this.put<unknown>(`/api/v1/me/agents/${encodeURIComponent(id)}`, { on }));
  }

  /** 409 while Budget is not on. */
  async ledger(month?: string): Promise<Ledger> {
    const query = month && /^\d{4}-\d{2}$/.test(month) ? `?month=${month}` : '';
    return readLedger(await this.get<unknown>(`/api/v1/me/ledger${query}`));
  }

  async editLedgerEntry(id: string, change: LedgerPatchWire): Promise<LedgerEntry> {
    return required(readLedgerEntry(await this.patch<unknown>(`/api/v1/me/ledger/${encodeURIComponent(id)}`, change)), 'the entry');
  }

  async deleteLedgerEntry(id: string): Promise<void> {
    await this.del<unknown>(`/api/v1/me/ledger/${encodeURIComponent(id)}`);
  }

  async intentions(state: 'waiting' | 'settled' = 'waiting'): Promise<Intention[]> {
    return readIntentions(await this.get<unknown>(`/api/v1/me/intentions?state=${state}`));
  }

  /** A waiting one is withdrawn; 409 for one carried out or expired. */
  async withdrawIntention(id: string): Promise<void> {
    await this.del<unknown>(`/api/v1/me/intentions/${encodeURIComponent(id)}`);
  }

  async captures(): Promise<Captures> {
    return readCaptures(await this.get<unknown>('/api/v1/me/captures'));
  }

  async setCaptureSettings(change: CaptureSettingsWire): Promise<CaptureSettings> {
    return readCaptureSettings(await this.put<unknown>('/api/v1/me/captures/settings', change));
  }

  /** One picture for the Pond to read once; answers how many wait. A 429 means the Pond is full. */
  async sendCapture(body: CaptureWire): Promise<number> {
    const res = await this.post<{ pending?: unknown }>('/api/v1/me/captures', body);
    return typeof res?.pending === 'number' ? res.pending : 0;
  }

  async deleteCapture(id: string): Promise<void> {
    await this.del<unknown>(`/api/v1/me/captures/${encodeURIComponent(id)}`);
  }

  async deleteAllCaptures(): Promise<void> {
    await this.del<unknown>('/api/v1/me/captures');
  }

  // ── Verb helpers ────────────────────────────────────────────

  private get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  /**
   * Tell the Pond this device is still here.
   *
   * The Pond derives `is_online` at read time from `last_seen` against a
   * five-minute threshold, and nothing refreshes a phone's row after pairing
   * writes it once -- so the row ages out and the phone's own card reports
   * "offline" while the app is open and in use. That is the one direction the
   * answer must not be wrong in: offline is what somebody opens this screen to
   * check.
   *
   * The route already exists on the Pond and had no caller.
   */
  deviceHeartbeat(deviceId: string): Promise<void> {
    return this.post<void>(`/api/v1/devices/${encodeURIComponent(deviceId)}/heartbeat`, {});
  }

  /** Tell the Pond this phone has taken a notice, so it stops holding it; `shown` when the person was shown it. */
  ackNotification(id: string, shown = false): Promise<void> {
    return this.post<void>(`/api/v1/notifications/${encodeURIComponent(id)}/ack`, shown ? { shown: true } : {});
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) });
  }

  private put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PUT', body: JSON.stringify(body) });
  }

  private patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
  }

  private del<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }
}

/** Singleton instance */
export const api = new PondApiClient();
