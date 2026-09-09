/**
 * Portal sessions.
 *
 * Authentication is Supabase Auth magic links. The browser never holds a
 * Supabase session: the tokens are exchanged for httpOnly cookies at
 * /api/portal/auth/session, so no script on the page can read them, and every
 * subsequent request is authorized server-side.
 *
 * `getPortalSession()` is the single gate. Every route and every page that is
 * not the sign-in screen calls it, and treats null as "not signed in" — there
 * is no second way to establish who is calling.
 */

import "server-only";
import { cookies } from "next/headers";

import { normalizeSupabaseUrl } from "./url";
import { adminRest, eq, userRest } from "./rest";

const ACCESS_COOKIE = "portal_access";
const REFRESH_COOKIE = "portal_refresh";

export type PortalRole = "admin" | "client";

export type PortalProfile = {
  id: string;
  email: string;
  role: PortalRole;
  name: string;
  created_at: string;
};

export type PortalAuthUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

export type PortalSession = {
  accessToken: string;
  user: PortalAuthUser;
  profile: PortalProfile;
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

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    // Secure in production only: a Secure cookie is not set over plain HTTP, so
    // leaving this on unconditionally makes local development silently fail to
    // sign in. Test the sign-in flow with `npm run dev`, not `npm run start`.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

async function authFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { url, secretKey } = config();
  const response = await fetch(`${url}/auth/v1${path}`, {
    ...options,
    cache: "no-store",
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Supabase auth admin request failed", response.status, detail.slice(0, 500));
    throw new Error(`Auth request failed with status ${response.status}.`);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Resolves an access token to its auth user, or null when it is invalid. */
async function fetchAuthUser(accessToken: string) {
  const { url, secretKey } = config();
  const response = await fetch(`${url}/auth/v1/user`, {
    cache: "no-store",
    headers: { apikey: secretKey, Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) return null;
  return (await response.json()) as PortalAuthUser;
}

async function refreshSession(refreshToken: string) {
  const { url, secretKey } = config();
  const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    cache: "no-store",
    headers: { apikey: secretKey, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!response.ok) return null;
  return (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
    user: PortalAuthUser;
  };
}

export async function setPortalCookies(
  accessToken: string,
  refreshToken: string,
  accessMaxAge = 3600,
) {
  const store = await cookies();
  store.set(ACCESS_COOKIE, accessToken, cookieOptions(accessMaxAge));
  store.set(REFRESH_COOKIE, refreshToken, cookieOptions(60 * 60 * 24 * 30));
}

export async function clearPortalCookies() {
  const store = await cookies();
  store.set(ACCESS_COOKIE, "", cookieOptions(0));
  store.set(REFRESH_COOKIE, "", cookieOptions(0));
}

/**
 * The current session, or null.
 *
 * An expired access token is refreshed transparently from the refresh cookie,
 * which is why a client who last visited a week ago is not bounced to the
 * sign-in screen.
 *
 * The profile is read with the USER's token, not the secret key. That is
 * deliberate: it means a session can only ever resolve to a profile the RLS
 * policies would show that user anyway, so a bug here cannot manufacture an
 * identity.
 */
export async function getPortalSession(): Promise<PortalSession | null> {
  const store = await cookies();
  let accessToken = store.get(ACCESS_COOKIE)?.value ?? "";
  const refreshToken = store.get(REFRESH_COOKIE)?.value ?? "";

  let user = accessToken ? await fetchAuthUser(accessToken) : null;

  if (!user && refreshToken) {
    const refreshed = await refreshSession(refreshToken);
    if (refreshed) {
      accessToken = refreshed.access_token;
      user = refreshed.user;
      await setPortalCookies(
        refreshed.access_token,
        refreshed.refresh_token,
        refreshed.expires_in ?? 3600,
      );
    }
  }

  if (!user || !accessToken) return null;

  const profiles = await userRest<PortalProfile[]>(
    `users?id=eq.${eq(user.id)}&select=id,email,role,name,created_at&limit=1`,
    accessToken,
  ).catch(() => []);

  const profile = profiles[0];
  if (!profile) return null;

  return { accessToken, user, profile };
}

/** The session, or null when the caller is not an admin. */
export async function getAdminSession(): Promise<PortalSession | null> {
  const session = await getPortalSession();
  if (!session || session.profile.role !== "admin") return null;
  return session;
}

/**
 * Validates tokens straight from a sign-in redirect, before any cookie exists.
 * The profile lookup uses the secret key here because there is not yet a
 * session to read it under.
 */
export async function validatePortalTokens(accessToken: string) {
  const user = await fetchAuthUser(accessToken);
  if (!user) return null;

  const profiles = await adminRest<PortalProfile[]>(
    `users?id=eq.${eq(user.id)}&select=id,email,role,name,created_at&limit=1`,
  );

  return profiles[0] ? { user, profile: profiles[0] } : null;
}

async function findAuthUserByEmail(email: string) {
  // GoTrue's admin list endpoint supports a filter, which avoids paging the
  // whole directory once a deployment has more than a handful of people on it.
  const response = await authFetch<{ users?: PortalAuthUser[] }>(
    `/admin/users?filter=${encodeURIComponent(email)}&per_page=200`,
  );
  const normalized = email.trim().toLowerCase();
  return (
    response.users?.find((user) => user.email?.toLowerCase() === normalized) ??
    null
  );
}

async function createAuthUser(email: string, name: string) {
  return authFetch<PortalAuthUser>("/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email,
      email_confirm: true,
      user_metadata: { name },
    }),
  });
}

/**
 * Ensures both an auth user and a portal profile exist for an email.
 *
 * Idempotent: calling it for somebody who already has a portal account returns
 * their existing profile rather than creating a second one or changing their
 * role. Re-inviting a client is therefore harmless.
 */
export async function ensurePortalUser(
  email: string,
  name: string,
  role: PortalRole,
): Promise<PortalProfile> {
  const normalized = email.trim().toLowerCase();

  const existing = await adminRest<PortalProfile[]>(
    `users?email=eq.${eq(normalized)}&select=id,email,role,name,created_at&limit=1`,
  );
  if (existing[0]) return existing[0];

  const authUser =
    (await findAuthUserByEmail(normalized)) ??
    (await createAuthUser(normalized, name));

  const inserted = await adminRest<PortalProfile[]>("users", {
    method: "POST",
    returnRepresentation: true,
    body: JSON.stringify({ id: authUser.id, email: normalized, role, name }),
  });

  return inserted[0];
}

/**
 * Promotes the configured operator to admin on their first sign-in.
 *
 * There is deliberately NO hardcoded fallback address. The reference
 * implementation carried its author's personal email as a default, which in a
 * reusable template would mean every deployment silently trusts somebody else's
 * inbox. If PORTAL_ADMIN_EMAIL is unset, nobody is bootstrapped and the
 * environment check at startup says so.
 */
export async function bootstrapAdminIfNeeded(email: string, name?: string) {
  const configured = process.env.PORTAL_ADMIN_EMAIL?.trim().toLowerCase();
  if (!configured) return null;
  if (email.trim().toLowerCase() !== configured) return null;

  return ensurePortalUser(configured, name?.trim() || "Administrator", "admin");
}

/**
 * Sends a magic link.
 *
 * `create_user: false` is load-bearing. Without it, anyone who can reach the
 * sign-in form could mint themselves an auth account by typing an address. With
 * it, a link is only ever sent to somebody already invited — and since a fresh
 * auth account has no portal profile and no project membership, even an account
 * created some other way would sign in to nothing.
 */
export async function sendPortalMagicLink(email: string, redirectTo: string) {
  const { url, secretKey } = config();
  const endpoint = `${url}/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    cache: "no-store",
    headers: { apikey: secretKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      create_user: false,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Portal magic link failed", response.status, detail.slice(0, 500));
    throw new Error("Could not send the sign-in link.");
  }
}
