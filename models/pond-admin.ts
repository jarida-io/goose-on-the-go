// My Pond's wire shapes read defensively, and the pure pieces its screens share. The Pond may ship
// a field this phone does not know yet; an unknown value reads as the safest thing it could mean.

import type {
  AdminAreaId,
  AdminCache,
  AdminCacheId,
  AdminCheckId,
  AdminCheckStatus,
  AdminEntryKind,
  AdminFileEntry,
  AdminFileListing,
  AdminHealth,
  AdminKeepReason,
  AdminOverview,
  AdminPower,
  AdminStatus,
  AdminTask,
  AdminTaskArtifact,
  AdminUnlocked,
  FactoryResetStatus,
  FactoryResetStep,
  LongTaskState,
  PowerMode,
  PowerModeChange,
} from '@/services/types';

/** The Pond locks My Pond after this long without an admin request. */
export const ADMIN_IDLE_MINUTES = 15;
export const ADMIN_PASSWORD_LENGTH = 16;
/** Crockford base32: no I, L, O or U, so a printed card reads back without ambiguity. */
export const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const AREA_IDS: readonly AdminAreaId[] = ['models', 'conversations', 'kv_snapshots', 'engine_caches', 'attachments', 'camera', 'logs', 'other'];
export const CACHE_IDS: readonly AdminCacheId[] = ['kv_snapshots', 'download_leftovers', 'accelerator_caches'];
const TASK_STATES: readonly LongTaskState[] = ['planning', 'running', 'awaiting_approval', 'paused', 'completed', 'failed', 'cancelled'];
const ENDED: readonly LongTaskState[] = ['completed', 'failed', 'cancelled'];

/** What a person typed from the card, as the Pond reads it: the case, dashes and spaces dropped. */
export function normalizeAdminPassword(raw: string): string {
  let out = '';
  for (const ch of raw) {
    if (ch === '-' || /\s/.test(ch)) continue;
    const c = ch.toUpperCase();
    out += c === 'O' ? '0' : c === 'I' || c === 'L' ? '1' : c;
  }
  return out;
}

/** The typed password in the card's own groups, `XXXX-XXXX-XXXX-XXXX`, as it is typed. */
export function formatAdminPassword(raw: string): string {
  const chars = normalizeAdminPassword(raw);
  return chars.match(/.{1,4}/g)?.join('-') ?? '';
}

export type AdminPasswordProblem = 'empty' | 'short' | 'long' | 'not_on_card';

/** Why the password cannot be sent yet, or null when it is sixteen characters from the card. */
export function adminPasswordProblem(raw: string): AdminPasswordProblem | null {
  const chars = normalizeAdminPassword(raw);
  if (chars.length === 0) return 'empty';
  if ([...chars].some((c) => !CROCKFORD.includes(c))) return 'not_on_card';
  if (chars.length < ADMIN_PASSWORD_LENGTH) return 'short';
  if (chars.length > ADMIN_PASSWORD_LENGTH) return 'long';
  return null;
}

const record = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
const countOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const textOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function readDisk(v: unknown): { total_bytes: number; free_bytes: number } | null {
  const d = record(v);
  if (!d) return null;
  const total = count(d.total_bytes);
  return { total_bytes: total, free_bytes: Math.min(count(d.free_bytes), total) };
}

export function readAdminStatus(raw: unknown): AdminStatus | null {
  const s = record(raw);
  if (!s) return null;
  const retry = countOrNull(s.retry_after);
  const idle = countOrNull(s.idle_minutes);
  return {
    // Only an explicit "missing" stops the form: otherwise the Pond is the one to say so.
    card: s.card === 'missing' ? 'missing' : 'present',
    unlocked: s.unlocked === true,
    expires_at: textOrNull(s.expires_at),
    idle_minutes: idle && idle > 0 ? idle : ADMIN_IDLE_MINUTES,
    retry_after: retry && retry > 0 ? Math.ceil(retry) : null,
    key: s.key === true,
    keys: typeof s.key === 'boolean',
  };
}

/** A phone's key to My Pond: `key` from `POST /admin/enroll`, `admin_key` from owner setup's last call. */
export function readAdminKey(raw: unknown, field: 'key' | 'admin_key' = 'key'): string | null {
  const key = record(raw)?.[field];
  return typeof key === 'string' && key.trim() !== '' ? key : null;
}

export function readUnlocked(raw: unknown): AdminUnlocked | null {
  const u = record(raw);
  if (!u || u.unlocked !== true) return null;
  return { unlocked: true, expires_at: textOrNull(u.expires_at) };
}

export function areaId(v: unknown): AdminAreaId {
  return AREA_IDS.includes(v as AdminAreaId) ? (v as AdminAreaId) : 'other';
}

export function readOverview(raw: unknown): AdminOverview | null {
  const o = record(raw);
  if (!o) return null;
  // Two ids this phone does not know both read as Other, so they are one row, not two.
  const areas = new Map<AdminAreaId, number>();
  for (const item of list(o.areas)) {
    const a = record(item);
    if (!a) continue;
    const id = areaId(a.id);
    areas.set(id, (areas.get(id) ?? 0) + count(a.bytes));
  }
  const counts = record(o.counts) ?? {};
  return {
    disk: readDisk(o.disk) ?? { total_bytes: 0, free_bytes: 0 },
    data_dir_bytes: count(o.data_dir_bytes),
    areas: [...areas].map(([id, bytes]) => ({ id, bytes })).sort((a, b) => b.bytes - a.bytes),
    databases: list(o.databases).flatMap((item) => {
      const d = record(item);
      return d && typeof d.name === 'string' ? [{ name: d.name, bytes: count(d.bytes) }] : [];
    }),
    counts: {
      sessions: countOrNull(counts.sessions),
      messages: countOrNull(counts.messages),
      memories: countOrNull(counts.memories),
      long_tasks: countOrNull(counts.long_tasks),
      artifacts: countOrNull(counts.artifacts),
      models: countOrNull(counts.models),
    },
  };
}

const ENTRY_KINDS: readonly AdminEntryKind[] = ['file', 'directory', 'symlink'];

function readEntry(item: unknown): AdminFileEntry | null {
  const e = record(item);
  if (!e || typeof e.name !== 'string' || e.name === '' || typeof e.path !== 'string') return null;
  const deletable = e.deletable === true;
  const reason: AdminKeepReason | null = deletable
    ? null
    : e.reason === 'in_use' || e.reason === 'managed_by_models'
      ? e.reason
      : 'protected';
  return {
    name: e.name,
    path: e.path,
    // A kind this phone does not know is not entered: only a directory is.
    kind: ENTRY_KINDS.includes(e.kind as AdminEntryKind) ? (e.kind as AdminEntryKind) : 'file',
    bytes: count(e.bytes),
    modified_at: textOrNull(e.modified_at),
    deletable,
    reason,
  };
}

export function readFileListing(raw: unknown, asked: string): AdminFileListing | null {
  const l = record(raw);
  if (!l || !Array.isArray(l.entries)) return null;
  const entries = l.entries.flatMap((item) => {
    const entry = readEntry(item);
    return entry ? [entry] : [];
  });
  return {
    path: typeof l.path === 'string' ? l.path : asked,
    entries: entries.sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name)),
  };
}

export function readCaches(raw: unknown): AdminCache[] | null {
  const c = record(raw);
  if (!c || !Array.isArray(c.caches)) return null;
  // A cache this phone cannot describe is not offered: clearing it would be a guess at its cost.
  return c.caches.flatMap((item) => {
    const k = record(item);
    if (!k || !CACHE_IDS.includes(k.id as AdminCacheId)) return [];
    return [{ id: k.id as AdminCacheId, bytes: count(k.bytes), files: count(k.files) }];
  });
}

/** `{freed_bytes}`, or zero when the Pond did not say. */
export function readFreed(raw: unknown): number {
  return count(record(raw)?.freed_bytes);
}

function readArtifact(item: unknown): AdminTaskArtifact | null {
  const a = record(item);
  if (!a || typeof a.id !== 'string') return null;
  return { id: a.id, title: textOrNull(a.title), kind: text(a.kind), tokens: count(a.tokens), created_at: textOrNull(a.created_at) };
}

export function readTasks(raw: unknown): AdminTask[] | null {
  const t = record(raw);
  if (!t || !Array.isArray(t.tasks)) return null;
  return t.tasks.flatMap((item) => {
    const task = record(item);
    if (!task || typeof task.id !== 'string') return [];
    const another = task.another_member === true;
    return [
      {
        id: task.id,
        goal: another ? null : textOrNull(task.goal),
        another_member: another,
        state: TASK_STATES.includes(task.state as LongTaskState) ? (task.state as LongTaskState) : null,
        kind: task.kind === 'research' ? 'research' : 'general',
        created_at: textOrNull(task.created_at),
        finished_at: textOrNull(task.finished_at),
        has_report: task.has_report === true,
        artifacts: list(task.artifacts).flatMap((a) => {
          const artifact = readArtifact(a);
          return artifact ? [{ ...artifact, title: another ? null : artifact.title }] : [];
        }),
      },
    ];
  });
}

/** Only a task the Pond says has ended may be deleted; a state this phone does not know may still run. */
export function isTaskFinished(state: LongTaskState | null): boolean {
  return state !== null && ENDED.includes(state);
}

const CHECK_IDS: readonly AdminCheckId[] = ['disk_space', 'memory', 'temperature'];

function checkStatus(v: unknown): AdminCheckStatus {
  if (v === 'ok' || v === 'critical') return v;
  // A status this phone cannot read is not taken for good news.
  return 'warning';
}

export function readHealth(raw: unknown): AdminHealth | null {
  const h = record(raw);
  if (!h) return null;
  const host = record(h.host) ?? {};
  const memory = record(h.memory);
  const proc = record(h.process);
  return {
    version: text(h.version),
    uptime_secs: countOrNull(h.uptime_secs),
    host: {
      hostname: text(host.hostname),
      os: text(host.os),
      arch: text(host.arch),
      cpus: countOrNull(host.cpus),
      uptime_secs: countOrNull(host.uptime_secs),
      load: list(host.load).filter((n): n is number => typeof n === 'number' && Number.isFinite(n)).slice(0, 3),
    },
    memory: memory
      ? {
          total_bytes: count(memory.total_bytes),
          available_bytes: count(memory.available_bytes),
          swap_total_bytes: count(memory.swap_total_bytes),
          swap_free_bytes: count(memory.swap_free_bytes),
        }
      : null,
    disk: readDisk(h.disk),
    temperatures: list(h.temperatures).flatMap((item) => {
      const t = record(item);
      return t && typeof t.zone === 'string' && typeof t.celsius === 'number' && Number.isFinite(t.celsius)
        ? [{ zone: t.zone, celsius: t.celsius }]
        : [];
    }),
    process: proc ? { rss_bytes: count(proc.rss_bytes) } : null,
    checks: list(h.checks).flatMap((item) => {
      const c = record(item);
      if (!c) return [];
      return [{ id: CHECK_IDS.includes(c.id as AdminCheckId) ? (c.id as AdminCheckId) : 'other', status: checkStatus(c.status) }];
    }),
  };
}

/** True when any check is not ok, which is when the Health row carries its badge. */
export function healthNeedsAttention(health: AdminHealth | null): boolean {
  return !!health && health.checks.some((c) => c.status !== 'ok');
}

function readMode(v: unknown): PowerMode | null {
  const m = record(v);
  return m && typeof m.id === 'number' && Number.isInteger(m.id) ? { id: m.id, name: text(m.name) || String(m.id) } : null;
}

export function readPower(raw: unknown): AdminPower | null {
  const p = record(raw);
  if (!p) return null;
  const control = p.control === 'nvpmodel' ? 'nvpmodel' : 'none';
  const supply = record(p.supply);
  const battery = record(p.battery);
  const modes = list(p.modes).flatMap((m) => {
    const mode = readMode(m);
    return mode ? [mode] : [];
  });
  return {
    control,
    mode: readMode(p.mode),
    default_mode_id: typeof p.default_mode_id === 'number' && Number.isInteger(p.default_mode_id) ? p.default_mode_id : null,
    modes,
    // A Pond with no control it can name is one this phone does not try to change.
    can_change: p.can_change === true && control !== 'none',
    supply: supply
      ? { millivolts: count(supply.millivolts), milliamps: count(supply.milliamps), milliwatts: count(supply.milliwatts) }
      : null,
    battery:
      battery && typeof battery.percent === 'number' && Number.isFinite(battery.percent)
        ? { percent: Math.max(0, Math.min(100, battery.percent)), charging: battery.charging === true }
        : null,
  };
}

export function readModeChange(raw: unknown): PowerModeChange | null {
  const c = record(raw);
  if (!c) return null;
  return { mode: readMode(c.mode), reboot_required: c.reboot_required === true };
}

const FACTORY_RESET_STEPS: readonly FactoryResetStep[] = [
  'exporting',
  'pausing',
  'notifying_household',
  'revoking_devices',
  'erasing_data',
  'speaking_goodbye',
  'reopening_onboarding',
  'forgetting_wifi',
];

export function readFactoryResetStatus(raw: unknown): FactoryResetStatus | null {
  const s = record(raw);
  if (!s) return null;
  const step = FACTORY_RESET_STEPS.find((candidate) => candidate === s.current_step) ?? null;
  return {
    active: s.active === true,
    current_step: step,
    steps_completed: count(s.steps_completed),
    total_steps: count(s.total_steps) || FACTORY_RESET_STEPS.length,
  };
}

/** One step of the way from the data directory to `path`; the root's name is null. */
export interface Crumb {
  name: string | null;
  path: string;
}

export function breadcrumbs(path: string): Crumb[] {
  const parts = path.split('/').filter(Boolean);
  return [{ name: null, path: '' }, ...parts.map((name, i) => ({ name, path: parts.slice(0, i + 1).join('/') }))];
}

/** A size in the units people read: bytes, KB, MB, GB or TB, in powers of 1024. */
export function sizeWords(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1024) return `${Math.max(0, Math.round(Number.isFinite(bytes) ? bytes : 0))} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  // A tenth of a gigabyte is still a model's worth of difference; a tenth of a megabyte is not.
  return `${value >= 10 && unit < 2 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** How much of the disk is in use, as a fraction for the meter; zero for a disk the Pond did not measure. */
export function diskUsed(disk: { total_bytes: number; free_bytes: number }): { used: number; fraction: number } {
  const used = Math.max(0, disk.total_bytes - disk.free_bytes);
  return { used, fraction: disk.total_bytes > 0 ? used / disk.total_bytes : 0 };
}

/** Whole minutes until `expires_at`, rounded up so "1 min" lasts until the lock; null when unknown. */
export function minutesLeft(expiresAt: string | null, now: number): number | null {
  if (!expiresAt) return null;
  const at = Date.parse(expiresAt);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, Math.ceil((at - now) / 60_000));
}

/** What the Pond keeps, in the four parts My Pond draws: the three that can be acted on, and the rest. */
export type AreaGroupId = 'models' | 'engine_caches' | 'kv_snapshots' | 'rest';
export const AREA_GROUPS: readonly AreaGroupId[] = ['models', 'engine_caches', 'kv_snapshots', 'rest'];

/** All four parts in a fixed order, so the bar and its legend never trade places between reads. */
export function groupAreas(areas: readonly { id: string; bytes: number }[]): { id: AreaGroupId; bytes: number }[] {
  const bytes = new Map<AreaGroupId, number>(AREA_GROUPS.map((id) => [id, 0]));
  for (const area of areas) {
    const id: AreaGroupId = area.id === 'models' || area.id === 'engine_caches' || area.id === 'kv_snapshots' ? area.id : 'rest';
    bytes.set(id, (bytes.get(id) ?? 0) + count(area.bytes));
  }
  return AREA_GROUPS.map((id) => ({ id, bytes: bytes.get(id) ?? 0 }));
}

export type TaskFilter = 'all' | 'finished' | 'working';

/** How many tasks each filter shows. A state this phone does not know counts as working, as it may be. */
export function taskCounts(tasks: readonly AdminTask[]): Record<TaskFilter, number> {
  const finished = tasks.filter((t) => isTaskFinished(t.state)).length;
  return { all: tasks.length, finished, working: tasks.length - finished };
}

export function filterTasks(tasks: readonly AdminTask[], filter: TaskFilter): AdminTask[] {
  if (filter === 'all') return [...tasks];
  return tasks.filter((t) => isTaskFinished(t.state) === (filter === 'finished'));
}

/** The one task whose report is the screen's main action: the first of the member's own that finished with one. */
export function leadReport(tasks: readonly AdminTask[]): string | null {
  return tasks.find((t) => !t.another_member && t.state === 'completed' && t.has_report)?.id ?? null;
}

/** About how many words a saved piece holds, from its tokens, to the nearest ten; null for an empty one. */
export function approxWords(tokens: number): number | null {
  if (!Number.isFinite(tokens) || tokens <= 0) return null;
  return Math.max(10, Math.round((tokens * 0.75) / 10) * 10);
}

/** The heat readings worth a tile each: all of them up to `max`, else the hottest `max`. */
export function heatZones(temps: readonly { zone: string; celsius: number }[], max = 6): { zone: string; celsius: number }[] {
  return temps.length <= max ? [...temps] : [...temps].sort((a, b) => b.celsius - a.celsius).slice(0, max);
}

/** The worst of the checks: ok only when every one is, and the ids of those that are not. */
export function healthSummary(health: AdminHealth): { status: AdminCheckStatus; notOk: AdminCheckId[] } {
  const notOk = health.checks.filter((c) => c.status !== 'ok');
  const status: AdminCheckStatus = notOk.some((c) => c.status === 'critical') ? 'critical' : notOk.length > 0 ? 'warning' : 'ok';
  return { status, notOk: [...new Set(notOk.map((c) => c.id))] };
}

/**
 * The reading a check is judged on: percent of the disk free, percent of memory available, or the
 * hottest zone in degrees. Null when the Pond sent nothing to read it from.
 */
export function checkReading(health: AdminHealth, id: AdminCheckId): number | null {
  switch (id) {
    case 'disk_space':
      return health.disk && health.disk.total_bytes > 0 ? (health.disk.free_bytes * 100) / health.disk.total_bytes : null;
    case 'memory':
      return health.memory && health.memory.total_bytes > 0 ? (health.memory.available_bytes * 100) / health.memory.total_bytes : null;
    case 'temperature':
      return health.temperatures.length > 0 ? Math.max(...health.temperatures.map((t) => t.celsius)) : null;
    case 'other':
      return null;
  }
}
