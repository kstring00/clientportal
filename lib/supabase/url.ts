/**
 * One place that decides what SUPABASE_URL means.
 *
 * The value must be the bare project URL. Every caller appends its own API
 * prefix — `/rest/v1/<resource>` for PostgREST, `/storage/v1/...` for Storage,
 * `/auth/v1/...` for GoTrue — so a SUPABASE_URL that already ends in `/rest/v1`
 * yields `/rest/v1/rest/v1/<resource>`, which PostgREST rejects with PGRST125
 * ("Invalid path specified in request URL") on *every* request.
 *
 * This is ported from a deployment where exactly that happened. The failure was
 * invisible from the outside: the Stripe webhook answered 200 throughout,
 * because the database error was caught and discarded well below the response.
 * So the suffix is stripped here rather than left to fail — but never silently.
 * `supabaseUrlWarning` is printed once at server start by `instrumentation.ts`,
 * so the environment value still gets fixed at source instead of the deployment
 * depending on this correction forever.
 */

/** A trailing REST prefix, with or without its own trailing slash. */
const REST_SUFFIX = /\/rest\/v1\/?$/;

export type SupabaseUrl = {
  /** The value as configured, trimmed. */
  raw: string;
  /** The bare project URL, safe to append an API prefix to. */
  url: string;
  /** True when `/rest/v1` had to be stripped — i.e. the env value is wrong. */
  corrected: boolean;
};

/** Returns null when SUPABASE_URL is unset or empty. */
export function normalizeSupabaseUrl(raw: string | undefined): SupabaseUrl | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  const corrected = REST_SUFFIX.test(trimmed);
  const url = trimmed.replace(REST_SUFFIX, "").replace(/\/$/, "");

  return { raw: trimmed, url, corrected };
}

/**
 * The startup banner for a wrong value, or null when there is nothing to say.
 * The project URL is not a secret, so it is safe to print; the secret key is
 * never touched here.
 */
export function supabaseUrlWarning(check: SupabaseUrl | null): string | null {
  if (!check?.corrected) return null;

  return [
    "",
    "  ┌────────────────────────────────────────────────────────────┐",
    "  │  SUPABASE_URL IS MISCONFIGURED — corrected in memory only   │",
    "  └────────────────────────────────────────────────────────────┘",
    "",
    `    configured:  ${check.raw}`,
    `    using:       ${check.url}`,
    "",
    "    SUPABASE_URL must be the bare project URL. This code appends",
    "    /rest/v1/<resource> itself, so the configured value would build",
    "    /rest/v1/rest/v1/<resource> and PostgREST would reject every",
    "    request with PGRST125 'Invalid path specified in request URL'.",
    "",
    "    Fix it in .env.local and in your host's project settings, then",
    "    restart. This correction is a safety net, not a substitute.",
    "",
  ].join("\n");
}
