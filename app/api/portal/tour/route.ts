import { NextRequest, NextResponse } from "next/server";

import { userRest } from "@/lib/supabase/rest";
import { getPortalSession } from "@/lib/supabase/session";

const MAX_STEP = 100;

type TourRow = {
  user_id: string;
  tour_version: number;
  completed_at: string | null;
  dismissed_at: string | null;
  last_step: number;
  replay_count: number;
};

export async function POST(request: NextRequest) {
  const session = await getPortalSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: {
    action?: unknown;
    step?: unknown;
    version?: unknown;
  };

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    // Tour persistence is intentionally non-critical. A malformed persistence
    // request should not break the walkthrough or strand a client behind it.
    return NextResponse.json({ saved: false });
  }

  const action =
    payload.action === "complete" ||
    payload.action === "dismiss" ||
    payload.action === "replay"
      ? payload.action
      : null;
  const version = Number(payload.version);
  const parsedStep = Number(payload.step);
  const step = Number.isInteger(parsedStep)
    ? Math.max(0, Math.min(MAX_STEP, parsedStep))
    : 0;

  if (!action || !Number.isInteger(version) || version < 1) {
    return NextResponse.json({ saved: false });
  }

  try {
    const existing = await userRest<TourRow[]>(
      `portal_tour_state?user_id=eq.${encodeURIComponent(session.profile.id)}&select=*&limit=1`,
      session.accessToken,
    ).catch(() => []);

    const current = existing[0];
    const now = new Date().toISOString();

    const values: Record<string, unknown> = {
      user_id: session.profile.id,
      tour_version: version,
      last_step: step,
    };

    if (action === "complete") {
      values.completed_at = now;
      values.dismissed_at = null;
    } else if (action === "dismiss") {
      values.dismissed_at = now;
      values.completed_at = null;
    } else {
      values.completed_at = null;
      values.dismissed_at = null;
      values.replay_count = (current?.replay_count ?? 0) + 1;
      values.last_step = 0;
    }

    if (current) {
      await userRest(
        `portal_tour_state?user_id=eq.${encodeURIComponent(session.profile.id)}`,
        session.accessToken,
        {
          method: "PATCH",
          body: JSON.stringify(values),
        },
      );
    } else {
      await userRest("portal_tour_state", session.accessToken, {
        method: "POST",
        body: JSON.stringify({
          completed_at: null,
          dismissed_at: null,
          replay_count: 0,
          ...values,
        }),
      });
    }

    return NextResponse.json({ saved: true });
  } catch (error) {
    // This endpoint deliberately degrades to a successful no-op. Losing tour
    // bookkeeping is acceptable; making the portal unusable because a guidance
    // preference could not be stored is not.
    console.error("Portal tour state persistence failed", error);
    return NextResponse.json({ saved: false });
  }
}
