/**
 * Date and size formatting.
 *
 * Dates render on the server and the client, so they must not depend on the
 * viewer's locale or timezone drifting between the two — everything here is
 * explicit UTC with a fixed locale, which keeps server and client output
 * identical and avoids a hydration mismatch.
 */

const DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const DATE_SHORT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const DATE_TIME = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

function toDate(value: string | null | undefined) {
  if (!value) return null;
  // A bare date (2026-09-08) is parsed as UTC midnight by design: treating it as
  // local time shifts it a day backwards for anyone west of Greenwich.
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | null | undefined) {
  const date = toDate(value);
  return date ? DATE.format(date) : "—";
}

export function formatDateShort(value: string | null | undefined) {
  const date = toDate(value);
  return date ? DATE_SHORT.format(date) : "—";
}

/** Used where an approval record must be unambiguous about when it happened. */
export function formatDateTime(value: string | null | undefined) {
  const date = toDate(value);
  return date ? DATE_TIME.format(date) : "—";
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** ISO date for a <time dateTime> attribute. */
export function isoDate(value: string | null | undefined) {
  const date = toDate(value);
  return date ? date.toISOString() : undefined;
}
