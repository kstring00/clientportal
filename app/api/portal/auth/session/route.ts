import { NextRequest, NextResponse } from "next/server";

import {
  clearPortalCookies,
  getPortalSession,
  setPortalCookies,
  validatePortalTokens,
} from "@/lib/supabase/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Where a signed-in person belongs, by role. */
function destinationFor(role: "admin" | "client") {
  return role === "admin" ? "/admin" : "/portal";
}

/** Reports the current session. Used by the sign-in screen to skip the form. */
export async function GET() {
  const session = await getPortalSession().catch(() => null);

  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    redirectTo: destinationFor(session.profile.role),
  });
}

/**
 * Exchanges magic-link tokens for httpOnly cookies.
 *
 * The tokens arrive from the URL fragment, so they have to be validated here
 * rather than trusted: `validatePortalTokens` asks Supabase who the access token
 * actually belongs to, and requires a portal profile to exist for them. A valid
 * Supabase token for somebody who was never invited resolves to no profile and
 * is refused.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    accessToken?: string;
    refreshToken?: string;
    expiresIn?: number;
  } | null;

  const accessToken = body?.accessToken?.trim() ?? "";
  const refreshToken = body?.refreshToken?.trim() ?? "";

  if (!accessToken || !refreshToken) {
    return NextResponse.json({ error: "Missing sign-in tokens." }, { status: 400 });
  }

  const validated = await validatePortalTokens(accessToken).catch(() => null);

  if (!validated) {
    await clearPortalCookies();
    return NextResponse.json(
      { error: "This sign-in link is no longer valid. Request a new one." },
      { status: 401 },
    );
  }

  const expiresIn =
    typeof body?.expiresIn === "number" && Number.isFinite(body.expiresIn)
      ? Math.max(60, Math.min(body.expiresIn, 60 * 60 * 24))
      : 3600;

  await setPortalCookies(accessToken, refreshToken, expiresIn);

  return NextResponse.json({
    authenticated: true,
    redirectTo: destinationFor(validated.profile.role),
  });
}
