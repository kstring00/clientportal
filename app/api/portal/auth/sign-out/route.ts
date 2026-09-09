import { NextResponse } from "next/server";

import { clearPortalCookies } from "@/lib/supabase/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Signs out. A plain form POST rather than fetch, so it works with JavaScript
 * disabled and cannot be left half-done by a failed script.
 */
export async function POST() {
  await clearPortalCookies();
  return NextResponse.redirect(
    new URL("/portal", process.env.APP_URL ?? "http://localhost:3000"),
    { status: 303 },
  );
}
