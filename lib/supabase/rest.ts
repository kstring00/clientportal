/**
 * PostgREST access, in two flavours that must not be confused.
 *
 *   userRest  — sends the caller's access token. RLS applies. Use this for
 *               anything a signed-in person is reading or writing on their own
 *               behalf. If a policy would hide the row, this call cannot see it,
 *               which is the property the whole portal rests on.
 *
 *   adminRest — sends the secret key. RLS is BYPASSED. Only for server routes
 *               that have already established the caller is an admin, and for
 *               the Stripe webhook, which has no user at all.
 *
 * The rule: if you can express an operation with `userRest`, use `userRest`.
 * Reaching for `adminRest` to "make it work" is how a portal grows a hole.
 */

import { normalizeSupabaseUrl } from "./url";

type RequestOptions = RequestInit & {
  /** Ask PostgREST to return the affected rows. */
  returnRepresentation?: boolean;
};

function config() {
  const supabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL);
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !secretKey) {
    throw new Error(
      "Supabase server environment is not configured. See .env.example.",
    );
  }

  return { url: supabaseUrl.url, secretKey };
}

/**
 * A PostgREST response that was not ok, carrying the HTTP status.
 *
 * The status is the entire point of this class. The reference implementation
 * once collapsed every failure into "already handled", so a Supabase outage
 * during a Stripe webhook looked identical to a duplicate delivery — and the
 * handler answered 200, telling Stripe to stop retrying. Payments were being
 * dropped rather than deferred. Callers need to tell a rejected write (409 on a
 * unique violation) from an unreachable datastore, and they cannot do that
 * without the status.
 */
export class PortalRestError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(`Supabase request failed with status ${status}.`);
    this.name = "PortalRestError";
    this.status = status;
    this.detail = detail;
  }
}

async function parse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/**
 * Privileged. Bypasses RLS. Never call this on a path that has not already
 * checked the caller is an admin.
 */
export async function adminRest<T>(
  resource: string,
  options: RequestOptions = {},
): Promise<T> {
  const { url, secretKey } = config();
  const { returnRepresentation = false, headers, ...init } = options;

  const response = await fetch(`${url}/rest/v1/${resource}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      ...(returnRepresentation ? { Prefer: "return=representation" } : {}),
      ...headers,
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    // The key is on the request, never in the log.
    console.error("Supabase admin REST failed", response.status, detail.slice(0, 500));
    throw new PortalRestError(response.status, detail);
  }

  return parse<T>(response);
}

/**
 * Acts as the signed-in user. RLS applies, so this is the safe default: a bug
 * in a query cannot reach another client's rows, because the database will not
 * return them.
 */
export async function userRest<T>(
  resource: string,
  accessToken: string,
  options: RequestOptions = {},
): Promise<T> {
  const { url, secretKey } = config();
  const { returnRepresentation = false, headers, ...init } = options;

  const response = await fetch(`${url}/rest/v1/${resource}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(returnRepresentation ? { Prefer: "return=representation" } : {}),
      ...headers,
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Supabase user REST failed", response.status, detail.slice(0, 500));
    throw new PortalRestError(response.status, detail);
  }

  return parse<T>(response);
}

/** Storage, as the signed-in user. Same RLS reasoning as `userRest`. */
export async function storageUserRequest(
  path: string,
  accessToken: string,
  options: RequestInit = {},
) {
  const { url, secretKey } = config();
  return fetch(`${url}/storage/v1${path}`, {
    ...options,
    cache: "no-store",
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${accessToken}`,
      ...options.headers,
    },
  });
}

/** Encodes a value for a PostgREST filter, e.g. `id=eq.${eq(id)}`. */
export function eq(value: string) {
  return encodeURIComponent(value);
}
