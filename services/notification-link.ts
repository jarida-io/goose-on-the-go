/**
 * The link a Pond notification asks the phone to open: a ride in Uber, or
 * directions in a maps app.
 *
 * The Pond puts it in `Notification.data` as
 * `{ action: "open_url", kind: "ride" | "directions", url, label }`. Only
 * https links on the hosts below are accepted, so a notification can open the
 * ride or maps app and nothing else. The check runs twice: when the
 * notification arrives, and again when it is tapped, because the tap reads
 * back data that has been stored in the phone's notification shade.
 */

/** Hosts whose links open Uber, Google Maps or Apple Maps. */
const ALLOWED_HOSTS = new Set(['m.uber.com', 'www.google.com', 'maps.apple.com']);

export type LinkKind = 'ride' | 'directions';

export interface NotificationLink {
  kind: LinkKind;
  url: string;
  /** Shown as the notification's call to action, e.g. "Open Uber". */
  label: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The URL if it is https on an allowed host, else null. */
export function allowedUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) return null;
  // Google's host serves far more than maps; only its directions path is a maps link.
  if (parsed.hostname === 'www.google.com' && !parsed.pathname.startsWith('/maps')) return null;
  // What was checked is the parse, so the parse is what gets stored and opened. iOS reads
  // a backslash differently: `https://m.uber.com\@evil.example/` passes here as m.uber.com,
  // and opened as written it goes to evil.example.
  return parsed.href;
}

/** The link in a notification's `data`, or null when it carries none or one we refuse. */
export function linkFromData(data: unknown): NotificationLink | null {
  if (!isRecord(data) || data.action !== 'open_url') return null;
  const url = allowedUrl(data.url);
  if (!url) return null;
  const kind: LinkKind = data.kind === 'ride' ? 'ride' : 'directions';
  const label =
    typeof data.label === 'string' && data.label.trim()
      ? data.label.trim()
      : kind === 'ride'
        ? 'Open ride'
        : 'Open directions';
  return { kind, url, label };
}
