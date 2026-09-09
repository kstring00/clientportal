import "server-only";
import { notFound, redirect } from "next/navigation";

import { isDemoMode } from "@/lib/config/env";
import { getPortalSession, type PortalSession } from "@/lib/supabase/session";
import { isSectionEnabled } from "./navigation";
import { loadPortalView } from "./loader";
import type { PortalView } from "./types";

const DEMO_SESSION: PortalSession = {
  accessToken: "",
  user: { id: "demo" },
  profile: {
    id: "demo",
    email: "demo@example.com",
    role: "client",
    name: "Demo",
    created_at: new Date().toISOString(),
  },
};

/**
 * The guard every portal section page runs.
 *
 * Three things happen here, in this order, and the order matters:
 *
 *   1. A disabled module 404s. Hiding the nav link is presentation; this is what
 *      makes the URL actually unreachable.
 *   2. No session redirects to sign-in. Never render anything first.
 *   3. The view is loaded under the caller's own token, so RLS decides what is
 *      in it.
 */
export async function requirePortalView(sectionKey: string): Promise<PortalView> {
  if (!isSectionEnabled(sectionKey)) notFound();

  if (isDemoMode()) {
    const demo = await loadPortalView(DEMO_SESSION);
    if (demo) return demo;
  }

  let session: PortalSession | null = null;
  try {
    session = await getPortalSession();
  } catch {
    session = null;
  }

  if (!session) redirect("/portal");
  if (session.profile.role === "admin") redirect("/admin");

  const view = await loadPortalView(session);
  if (!view) redirect("/portal");

  return view;
}
