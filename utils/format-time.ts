/** Small relative-time formatter for schedule/automation cards — no date library installed, native Date only. */

export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  const isSameDay = date.toDateString() === now.toDateString();
  if (isSameDay) return `Today ${time}`;

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (date.toDateString() === tomorrow.toDateString()) return `Tomorrow ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;

  const dateLabel = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${dateLabel}, ${time}`;
}
