import { NextRequest, NextResponse } from "next/server";

import { appUrl } from "@/lib/config/env";
import {
  adminRest,
  eq,
} from "@/lib/supabase/rest";
import {
  bootstrapAdminIfNeeded,
  sendPortalMagicLink,
} from "@/lib/supabase/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Requests a sign-in link.
 *
 * The response is deliberately IDENTICAL whether or not the address has a portal
 * account. Saying "no account with that email" turns this endpoint into a way to
 * test which of your clients I work with, which is not mine to disclose.
 *
 * Only the configured PORTAL_ADMIN_EMAIL can bring an account into existence
 * here, and only once; everybody else must already have been invited, because
 * `sendPortalMagicLink` passes `create_user: false`.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email?.trim().toLowerCase() ?? "";

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  try {
    // Bootstraps the operator's own admin account on first use. A no-op for
    // anyone else, and a no-op once the account exists.
    await bootstrapAdminIfNeeded(email);

    const profiles = await adminRest<{ id: string }[]>(
      `users?email=eq.${eq(email)}&select=id&limit=1`,
    );

    if (profiles[0]) {
      await sendPortalMagicLink(email, `${appUrl()}/portal`);
    }
  } catch (error) {
    console.error("Sign-in link request failed", error);
    // Still a generic answer: an internal failure must not become an oracle
    // either. The operator sees the real reason in the server log.
  }

  return NextResponse.json({
    sent: true,
    message: "If that address has a portal account, a sign-in link is on its way.",
  });
}
