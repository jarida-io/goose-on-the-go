// An in-memory Pond that answers My Pond's routes as the contract says the real one will, so every
// screen and state can be reached without one. Time is read from the clock at each call, never kept
// by timers, so nothing runs unasked and a test can move the clock.

import { ApiError } from '@/services/api-client';
import type {
  AdminAreaId,
  AdminCache,
  AdminCacheId,
  AdminFileEntry,
  AdminFileListing,
  AdminHealth,
  AdminKeepReason,
  AdminOverview,
  AdminPower,
  AdminStatus,
  AdminTask,
  AdminUnlocked,
  FactoryResetStatus,
  LongTaskState,
  PowerMode,
  PowerModeChange,
} from '@/services/types';

import { ADMIN_IDLE_MINUTES, ADMIN_PASSWORD_LENGTH, CACHE_IDS, CROCKFORD, isTaskFinished, normalizeAdminPassword } from './pond-admin';

/** The routes My Pond uses, so the real Pond and this one are driven by the same code. */
export interface PondAdminSource {
  status(): Promise<AdminStatus>;
  unlock(password: string): Promise<AdminUnlocked>;
  unlockWithKey(key: string): Promise<AdminUnlocked>;
  /** Unlocked only: this phone's key, replacing any older one. */
  enroll(): Promise<string>;
  /** Revokes this phone's key and locks it. */
  forgetKey(): Promise<void>;
  lock(): Promise<void>;
  overview(): Promise<AdminOverview>;
  files(path: string): Promise<AdminFileListing>;
  /** Resolves with the bytes freed. */
  deleteFile(path: string): Promise<number>;
  caches(): Promise<AdminCache[]>;
  /** Resolves with the bytes freed. */
  clearCache(id: AdminCacheId): Promise<number>;
  tasks(): Promise<AdminTask[]>;
  deleteTask(id: string): Promise<void>;
  deleteTaskArtifact(taskId: string, artifactId: string): Promise<void>;
  health(): Promise<AdminHealth>;
  power(): Promise<AdminPower>;
  setPowerMode(id: number): Promise<PowerModeChange>;
  restart(force: boolean): Promise<void>;
  /** Erases the Pond. Throws `pond_name_mismatch` for a typed name that doesn't match. */
  factoryReset(typedName: string): Promise<void>;
  /** Which step a reset in progress has reached; `active: false` both before one starts and after it ends. */
  factoryResetStatus(): Promise<FactoryResetStatus>;
}

/** The mock's card. Typed from memory it reads as "goose in a pond 2026", which the Pond also accepts. */
export const MOCK_ADMIN_PASSWORD = 'G00S-E1NA-P0ND-2026';
/** Wrong passwords that cost nothing, then a wait that doubles from this, as the Pond slows them. */
export const MOCK_FREE_ATTEMPTS = 5;
export const MOCK_FIRST_WAIT_SECS = 30;
export const MOCK_LONGEST_WAIT_SECS = 600;

export interface MockPondOptions {
  /** A Pond whose administrator card was never made. */
  card?: 'present' | 'missing';
  /** False for a guest's phone, which every admin route refuses. */
  member?: boolean;
  /** False for a board the service may not change the power mode of. */
  powerControl?: boolean;
  /** A key the Pond already gave this phone, as owner setup's last call does. */
  key?: string;
}

const KB = 1024;
const MB = 1024 * KB;
const GB = 1024 * MB;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

interface Node {
  name: string;
  kind: 'file' | 'directory' | 'symlink';
  bytes: number;
  area: AdminAreaId;
  /** Days before the mock was made. */
  age: number;
  keep?: AdminKeepReason;
  cache?: AdminCacheId;
  children?: Node[];
}

const file = (name: string, bytes: number, area: AdminAreaId, age: number, extra: Partial<Node> = {}): Node => ({
  name,
  kind: 'file',
  bytes,
  area,
  age,
  ...extra,
});
const dir = (name: string, area: AdminAreaId, children: Node[], extra: Partial<Node> = {}): Node => ({
  name,
  kind: 'directory',
  bytes: 0,
  area,
  age: 0,
  children,
  ...extra,
});

function sampleTree(): Node[] {
  return [
    dir('models', 'models', [
      file('gemma-4-e4b-it-qat-q4_0.gguf', 4.4 * GB, 'models', 21),
      file('gemma-4-e2b-it-q4_k_m.gguf', 3.1 * GB, 'models', 40),
      file('kokoro-v1.0.onnx', 310 * MB, 'models', 60),
      file('ggml-tiny.en.bin', 75 * MB, 'models', 60),
    ], { keep: 'managed_by_models' }),
    dir('hf_cache', 'models', [
      dir('blobs', 'models', [
        file('5f3c9e1a7b20d4e6', 1.1 * GB, 'models', 33, { cache: 'download_leftovers' }),
        file('a81d07c2e94f3b55', 290 * MB, 'models', 21),
      ]),
    ], { keep: 'managed_by_models' }),
    dir('engine', 'other', [
      dir('kv', 'kv_snapshots', [
        file('preamble-typed-3a9f.kv', 412 * MB, 'kv_snapshots', 1, { cache: 'kv_snapshots' }),
        file('preamble-voice-77c2.kv', 405 * MB, 'kv_snapshots', 2, { cache: 'kv_snapshots' }),
        file('side-call-01.kv', 96 * MB, 'kv_snapshots', 2, { cache: 'kv_snapshots' }),
        dir('suspended', 'kv_snapshots', [file('task-3n7p0x2c.kv', 210 * MB, 'kv_snapshots', 0, { keep: 'in_use' })]),
      ]),
      dir('sessions', 'other', [file('sessions.db', 48 * MB, 'other', 0, { keep: 'in_use' })]),
    ]),
    dir('accelerator', 'engine_caches', [
      dir('tensorrt', 'engine_caches', [
        file('yolox_s_fp16.engine', 38 * MB, 'engine_caches', 3, { cache: 'accelerator_caches' }),
        file('scrfd_2.5g_fp16.engine', 22 * MB, 'engine_caches', 3, { cache: 'accelerator_caches' }),
        file('adaface_ir50_fp16.engine', 96 * MB, 'engine_caches', 3, { cache: 'accelerator_caches' }),
      ]),
      dir('litert', 'engine_caches', [file('gemma_gpu_delegate.bin', 640 * MB, 'engine_caches', 9, { cache: 'accelerator_caches' })]),
    ]),
    dir('downloads', 'other', [file('gemma-3-12b-it-q4_k_m.gguf.part', 1.4 * GB, 'other', 18, { cache: 'download_leftovers' })]),
    file('pond-snapshot-2026-09-30.tar.gz', 1.2 * GB, 'other', 29),
    file('pond_system.db', 182 * MB, 'conversations', 0, { keep: 'in_use' }),
    file('pond_logs.db', 96 * MB, 'conversations', 0, { keep: 'in_use' }),
    file('pond_vectors.db', 54 * MB, 'conversations', 0, { keep: 'in_use' }),
    dir('logs', 'logs', [
      file('pond.log.2026-10-29', 18 * MB, 'logs', 0, { keep: 'in_use' }),
      file('pond.log.2026-10-28', 64 * MB, 'logs', 1),
      file('pond.log.2026-10-27', 71 * MB, 'logs', 2),
      file('pond.log.2026-10-26', 58 * MB, 'logs', 3),
    ]),
    dir('attachments', 'attachments', [
      file('7c1e2b-receipt.jpg', 2.4 * MB, 'attachments', 4),
      file('a3f09d-whiteboard.jpg', 3.1 * MB, 'attachments', 12),
      file('e81b44-lease.pdf', 860 * KB, 'attachments', 26),
    ]),
    dir('camera', 'camera', [
      dir('snapshots', 'camera', [
        file('front-door-2026-10-29T07-42-10.jpg', 410 * KB, 'camera', 0),
        file('front-door-2026-10-28T19-03-55.jpg', 395 * KB, 'camera', 1),
        file('driveway-2026-10-27T22-15-31.jpg', 452 * KB, 'camera', 2),
      ]),
    ]),
    { name: 'current-chat-model.gguf', kind: 'symlink', bytes: 44, area: 'other', age: 21 },
  ];
}

/** Everything outside the data directory, sized so the sample disk starts under 10 % free and clearing caches mends it. */
const OUTSIDE_BYTES = 43.6 * GB;
const DISK_BYTES = 64 * GB;

function bytesOf(node: Node): number {
  return node.kind === 'directory' ? (node.children ?? []).reduce((sum, c) => sum + bytesOf(c), 0) : node.bytes;
}

/** What keeps a node: its own reason, else the first reason found inside a directory. */
function keptBy(node: Node): AdminKeepReason | null {
  if (node.keep) return node.keep;
  for (const child of node.children ?? []) {
    const reason = keptBy(child);
    if (reason) return reason;
  }
  return null;
}

function walk(nodes: Node[], visit: (node: Node, parent: Node[]) => void): void {
  for (const node of [...nodes]) {
    visit(node, nodes);
    if (node.children) walk(node.children, visit);
  }
}

interface MockTask {
  task: AdminTask;
}

function sampleTasks(iso: (agoMs: number) => string): MockTask[] {
  const artifact = (id: string, title: string, kind: string, tokens: number, ago: number) => ({
    id,
    title,
    kind,
    tokens,
    created_at: iso(ago),
  });
  const task = (
    id: string,
    goal: string | null,
    state: LongTaskState,
    kind: 'general' | 'research',
    startedAgo: number,
    finishedAgo: number | null,
    artifacts: AdminTask['artifacts'],
  ): MockTask => ({
    task: {
      id,
      goal,
      another_member: goal === null,
      state,
      kind,
      created_at: iso(startedAgo),
      finished_at: finishedAgo === null ? null : iso(finishedAgo),
      has_report: state === 'completed' && kind === 'research',
      artifacts,
    },
  });
  return [
    task('lt-3n7p0x2c', 'Sort this month\'s receipts into a spending summary', 'running', 'general', 40 * MINUTE, null, [
      artifact('ar-3n7p-plan', 'Plan', 'note', 610, 38 * MINUTE),
    ]),
    task('lt-8f2k1m9q', 'Plan a weekend in Naivasha for four', 'completed', 'research', 2 * DAY, 2 * DAY - 25 * MINUTE, [
      artifact('ar-8f2k-plan', 'Plan', 'note', 820, 2 * DAY),
      artifact('ar-8f2k-stay', 'Where to stay', 'findings', 2_140, 2 * DAY - 15 * MINUTE),
      artifact('ar-8f2k-see', 'What to see', 'findings', 1_980, 2 * DAY - 20 * MINUTE),
      artifact('ar-8f2k-result', 'A weekend in Naivasha', 'draft', 3_460, 2 * DAY - 25 * MINUTE),
    ]),
    task('lt-q4w8e1r5', null, 'completed', 'research', 5 * DAY, 5 * DAY - 30 * MINUTE, [
      { id: 'ar-q4w8-plan', title: null, kind: 'note', tokens: 700, created_at: iso(5 * DAY) },
      { id: 'ar-q4w8-1', title: null, kind: 'findings', tokens: 1_800, created_at: iso(5 * DAY - 10 * MINUTE) },
      { id: 'ar-q4w8-result', title: null, kind: 'draft', tokens: 2_900, created_at: iso(5 * DAY - 30 * MINUTE) },
    ]),
    task('lt-z9y2u6t3', 'Find the cheapest flights to Mombasa in December', 'failed', 'general', 9 * DAY, 9 * DAY - 6 * MINUTE, []),
  ];
}

const MODES: PowerMode[] = [
  { id: 0, name: '15W' },
  { id: 1, name: '25W' },
  { id: 2, name: 'MAXN_SUPER' },
  { id: 3, name: '7W' },
];
/** The mode that takes CPU cores offline, which nvpmodel applies only after a restart. */
const REBOOT_MODE = 3;

function refuse(status: number, error: string, extra: Record<string, unknown> = {}, retryAfter: number | null = null): ApiError {
  return new ApiError(`mock /api/v1/admin → ${status}`, status, retryAfter, error, { error, ...extra });
}

/** A fresh mock Pond, reading `now` as its clock in milliseconds. */
export function createMockPond(options: MockPondOptions = {}, now: () => number = Date.now): PondAdminSource {
  const made = now();
  let booted = made;
  const iso = (agoMs: number) => new Date(made - agoMs).toISOString();
  const card = options.card ?? 'present';
  const member = options.member ?? true;
  const powerControl = options.powerControl ?? true;
  const secret = normalizeAdminPassword(MOCK_ADMIN_PASSWORD);

  const tree = sampleTree();
  let tasks = sampleTasks(iso);
  let lastUsed: number | null = null;
  let failures = 0;
  let coolUntil = 0;
  let liveKey: string | null = options.key ?? null;
  let enrolments = 0;
  let mode = 1;
  const idleMs = ADMIN_IDLE_MINUTES * MINUTE;

  const unlocked = () => lastUsed !== null && now() - lastUsed < idleMs;
  const expiresAt = () => (lastUsed !== null && unlocked() ? new Date(lastUsed + idleMs).toISOString() : null);
  const waiting = () => Math.max(0, Math.ceil((coolUntil - now()) / 1000));

  const needMember = () => {
    if (!member) throw refuse(403, 'admin_members_only');
  };
  const notCooling = () => {
    const wait = waiting();
    if (wait > 0) throw refuse(429, 'admin_cooling', { retry_after: wait }, wait);
  };
  /** A wrong card and a wrong key share one count, as the Pond slows them together. */
  const wrongGuess = (error: string) => {
    failures++;
    if (failures >= MOCK_FREE_ATTEMPTS) {
      const secs = Math.min(MOCK_LONGEST_WAIT_SECS, MOCK_FIRST_WAIT_SECS * 2 ** (failures - MOCK_FREE_ATTEMPTS));
      coolUntil = now() + secs * 1000;
    }
    return refuse(403, error);
  };
  const opened = () => {
    failures = 0;
    coolUntil = 0;
    lastUsed = now();
    return { unlocked: true as const, expires_at: expiresAt() };
  };
  /** Every route but status, unlock and lock: refused while locked, and each one renews the unlock. */
  const admit = () => {
    needMember();
    if (!unlocked()) {
      lastUsed = null;
      throw refuse(403, 'admin_locked');
    }
    lastUsed = now();
  };

  const find = (path: string): { node: Node; siblings: Node[] } | null => {
    const parts = path.split('/');
    let siblings = tree;
    for (let i = 0; i < parts.length; i++) {
      const node = siblings.find((n) => n.name === parts[i]);
      if (!node) return null;
      if (i === parts.length - 1) return { node, siblings };
      if (node.kind !== 'directory') return null;
      siblings = node.children ?? [];
    }
    return null;
  };
  const checkPath = (path: string) => {
    if (path.startsWith('/') || path.split('/').some((p) => p === '..' || p === '.') || path.includes('\\')) {
      throw refuse(400, 'invalid_path');
    }
  };
  /** A reason inherited from any directory above, as `models/` keeps everything in it. */
  const inheritedKeep = (path: string): AdminKeepReason | null => {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const above = find(parts.slice(0, i).join('/'));
      if (above?.node.keep) return above.node.keep;
    }
    return null;
  };
  const entry = (node: Node, parent: string): AdminFileEntry => {
    const path = parent ? `${parent}/${node.name}` : node.name;
    const reason = inheritedKeep(path) ?? keptBy(node);
    return {
      name: node.name,
      path,
      kind: node.kind,
      bytes: Math.round(bytesOf(node)),
      modified_at: iso(node.age * DAY),
      deletable: reason === null,
      reason,
    };
  };

  const dataDirBytes = () => tree.reduce((sum, n) => sum + bytesOf(n), 0);
  const disk = () => {
    const free = Math.round(DISK_BYTES - OUTSIDE_BYTES - dataDirBytes());
    return { total_bytes: DISK_BYTES, free_bytes: Math.max(0, free) };
  };
  const cacheFiles = (id: AdminCacheId) => {
    const found: Node[] = [];
    walk(tree, (node) => {
      if (node.cache === id) found.push(node);
    });
    return found;
  };

  return {
    status: async () => {
      needMember();
      const wait = waiting();
      return {
        card,
        unlocked: unlocked(),
        expires_at: expiresAt(),
        idle_minutes: ADMIN_IDLE_MINUTES,
        retry_after: wait > 0 ? wait : null,
        key: liveKey !== null,
        keys: true,
      };
    },

    unlock: async (password) => {
      needMember();
      if (card === 'missing') throw refuse(409, 'admin_card_missing');
      notCooling();
      const typed = normalizeAdminPassword(password);
      if (typed.length !== ADMIN_PASSWORD_LENGTH || [...typed].some((c) => !CROCKFORD.includes(c))) {
        throw refuse(400, 'admin_password_malformed');
      }
      if (typed !== secret) throw wrongGuess('admin_password_rejected');
      return opened();
    },

    // No card is needed: a Pond whose card was never made still opens to a key it gave.
    unlockWithKey: async (key) => {
      needMember();
      notCooling();
      if (liveKey === null || key !== liveKey) throw wrongGuess('admin_key_rejected');
      return opened();
    },

    enroll: async () => {
      admit();
      enrolments++;
      liveKey = `mock-key-${made.toString(36)}-${enrolments}`;
      return liveKey;
    },

    forgetKey: async () => {
      needMember();
      liveKey = null;
      lastUsed = null;
    },

    lock: async () => {
      needMember();
      lastUsed = null;
    },

    overview: async () => {
      admit();
      const areas = new Map<AdminAreaId, number>();
      walk(tree, (node) => {
        if (node.kind !== 'directory') areas.set(node.area, (areas.get(node.area) ?? 0) + node.bytes);
      });
      const databases = tree.filter((n) => n.name.endsWith('.db')).map((n) => ({ name: n.name, bytes: Math.round(n.bytes) }));
      return {
        disk: disk(),
        data_dir_bytes: Math.round(dataDirBytes()),
        areas: [...areas].map(([id, bytes]) => ({ id, bytes: Math.round(bytes) })).sort((a, b) => b.bytes - a.bytes),
        databases,
        counts: {
          sessions: 128,
          messages: 3_412,
          memories: 86,
          long_tasks: tasks.length,
          artifacts: tasks.reduce((sum, t) => sum + t.task.artifacts.length, 0),
          models: find('models')?.node.children?.length ?? 0,
        },
      };
    },

    files: async (path) => {
      admit();
      checkPath(path);
      let children = tree;
      if (path !== '') {
        const found = find(path);
        if (!found) throw refuse(404, 'not_found');
        if (found.node.kind !== 'directory') throw refuse(409, 'not_a_directory');
        children = found.node.children ?? [];
      }
      const entries = children.map((n) => entry(n, path)).sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name));
      return { path, entries };
    },

    deleteFile: async (path) => {
      admit();
      if (path === '') throw refuse(400, 'invalid_path');
      checkPath(path);
      const found = find(path);
      if (!found) throw refuse(404, 'not_found');
      const reason = inheritedKeep(path) ?? keptBy(found.node);
      if (reason) throw refuse(403, 'protected_path', { reason });
      const freed = Math.round(bytesOf(found.node));
      found.siblings.splice(found.siblings.indexOf(found.node), 1);
      return freed;
    },

    caches: async () => {
      admit();
      return CACHE_IDS.map((id) => {
        const files = cacheFiles(id);
        return { id, bytes: Math.round(files.reduce((sum, n) => sum + n.bytes, 0)), files: files.length };
      });
    },

    clearCache: async (id) => {
      admit();
      if (!CACHE_IDS.includes(id)) throw refuse(404, 'unknown_cache');
      let freed = 0;
      walk(tree, (node, siblings) => {
        if (node.cache !== id) return;
        freed += node.bytes;
        siblings.splice(siblings.indexOf(node), 1);
      });
      return Math.round(freed);
    },

    tasks: async () => {
      admit();
      return tasks.map(({ task }) => ({ ...task, artifacts: task.artifacts.map((a) => ({ ...a })) }));
    },

    deleteTask: async (id) => {
      admit();
      const found = tasks.find((t) => t.task.id === id);
      if (!found) throw refuse(404, 'not_found');
      if (!isTaskFinished(found.task.state)) throw refuse(409, 'task_active');
      tasks = tasks.filter((t) => t !== found);
    },

    deleteTaskArtifact: async (taskId, artifactId) => {
      admit();
      const found = tasks.find((t) => t.task.id === taskId);
      if (!found || !found.task.artifacts.some((a) => a.id === artifactId)) throw refuse(404, 'not_found');
      if (!isTaskFinished(found.task.state)) throw refuse(409, 'task_active');
      found.task = { ...found.task, artifacts: found.task.artifacts.filter((a) => a.id !== artifactId) };
    },

    health: async () => {
      admit();
      const d = disk();
      const freeShare = d.free_bytes / d.total_bytes;
      const memory = { total_bytes: 7.6 * GB, available_bytes: 1.9 * GB, swap_total_bytes: 3.8 * GB, swap_free_bytes: 3.1 * GB };
      const temperatures = [
        { zone: 'cpu', celsius: 52.3 },
        { zone: 'gpu', celsius: 49.8 },
        { zone: 'soc0', celsius: 50.1 },
        { zone: 'tj', celsius: 53 },
      ];
      const hottest = Math.max(...temperatures.map((t) => t.celsius));
      const uptime = Math.floor((now() - booted) / 1000) + (booted === made ? 3 * 3_600 + 12 * 60 : 0);
      return {
        version: '0.31.0',
        uptime_secs: uptime,
        host: { hostname: 'nano', os: 'Ubuntu 22.04.5 LTS', arch: 'aarch64', cpus: 6, uptime_secs: uptime + 41, load: [1.42, 1.18, 0.96] },
        memory,
        disk: d,
        temperatures,
        process: { rss_bytes: 2.3 * GB },
        checks: [
          { id: 'disk_space', status: freeShare < 0.05 ? 'critical' : freeShare < 0.1 ? 'warning' : 'ok' },
          { id: 'memory', status: memory.available_bytes / memory.total_bytes < 0.1 ? 'warning' : 'ok' },
          { id: 'temperature', status: hottest >= 90 ? 'critical' : hottest >= 80 ? 'warning' : 'ok' },
        ],
      };
    },

    power: async () => {
      admit();
      return {
        control: powerControl ? 'nvpmodel' : 'none',
        mode: powerControl ? (MODES.find((m) => m.id === mode) ?? null) : null,
        default_mode_id: powerControl ? 1 : null,
        modes: powerControl ? MODES.map((m) => ({ ...m })) : [],
        can_change: powerControl,
        supply: { millivolts: 19_100, milliamps: 512, milliwatts: 9_779 },
        battery: null,
      };
    },

    setPowerMode: async (id) => {
      admit();
      if (!powerControl) throw refuse(503, 'power_control_unavailable');
      const next = MODES.find((m) => m.id === id);
      if (!next) throw refuse(400, 'unknown_power_mode');
      const reboot = next.id !== mode && (next.id === REBOOT_MODE || mode === REBOOT_MODE);
      mode = next.id;
      return { mode: { ...next }, reboot_required: reboot };
    },

    restart: async (force) => {
      admit();
      if (!powerControl) throw refuse(503, 'power_control_unavailable');
      if (!force && tasks.some((t) => t.task.state === 'running')) throw refuse(409, 'long_task_running');
      // A restart ends every unlock, as the Pond keeps them in memory.
      booted = now();
      lastUsed = null;
    },

    // The typed name is already checked against `home_name` before this is ever called, so nothing
    // here refuses on it; this only simulates the wipe itself, as the real Pond's erase would.
    factoryReset: async () => {
      admit();
      tasks = [];
      tree.length = 0;
      liveKey = null;
      lastUsed = null;
      failures = 0;
      coolUntil = 0;
      mode = 1;
    },

    // The mock's reset above runs to completion in one tick, so there is never a step in
    // progress to report by the time anything polls this.
    factoryResetStatus: async () => {
      admit();
      return { active: false, current_step: null, steps_completed: 0, total_steps: 8 };
    },
  };
}
