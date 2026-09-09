import { NextRequest, NextResponse } from "next/server";

import { userRest } from "@/lib/supabase/rest";
import { getPortalSession } from "@/lib/supabase/session";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const session = await getPortalSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: { messageIds?: unknown };
  try {
    payload = (await request.json()) as { messageIds?: unknown };
  } catch {
    return NextResponse.json({ ok: true });
  }

  const rawIds = Array.isArray(payload.messageIds) ? payload.messageIds : [];
  const requested = Array.from(
    new Set(
      rawIds
        .filter((value): value is string => typeof value === "string")
        .filter((value) => UUID_RE.test(value)),
    ),
  ).slice(0, 250);

  if (requested.length === 0) return NextResponse.json({ ok: true });

  // message_reads itself is per-user, but first resolve the message ids through
  // the caller's RLS-filtered messages view so a guessed id from another project
  // never receives even a read-receipt write through this route.
  const inFilter = requested.map((id) => `"${id}"`).join(",");
  const visible = await userRest<{ id: string }[]>(
    `messages?id=in.(${encodeURIComponent(inFilter)})&select=id`,
    session.accessToken,
  ).catch(() => []);

  if (visible.length === 0) return NextResponse.json({ ok: true });

  const now = new Date().toISOString();
  const rows = visible.map((message) => ({
    message_id: message.id,
    user_id: session.profile.id,
    read_at: now,
  }));

  try {
    await userRest(
      "message_reads?on_conflict=message_id,user_id",
      session.accessToken,
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify(rows),
      },
    );
  } catch (error) {
    // Read receipts are intentionally non-critical. Log the failure for the
    // operator but do not make a client's messages screen feel broken because a
    // convenience write failed.
    console.error("Portal message read receipt failed", error);
  }

  return NextResponse.json({ ok: true });
}
