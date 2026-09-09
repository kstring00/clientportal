import { redirect } from "next/navigation";

import { portalConfig } from "@/lib/config";
import { isDemoMode } from "@/lib/config/env";
import { getPortalSession } from "@/lib/supabase/session";
import { loadPortalView } from "@/lib/portal/loader";
import PortalShell from "@/components/portal/PortalShell";
import Overview from "@/components/portal/Overview";
import SignIn from "./SignIn";

export const dynamic = "force-dynamic";

function monogram(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("") || "•"
  );
}

export default async function PortalPage() {
  // Demo mode renders the sample portal without any session at all, so a
  // prospect can be shown it from a link.
  if (isDemoMode()) {
    const view = await loadPortalView({
      accessToken: "",
      user: { id: "demo" },
      profile: {
        id: "demo",
        email: "demo@example.com",
        role: "client",
        name: "Demo",
        created_at: new Date().toISOString(),
      },
    });
    if (view) {
      return (
        <PortalShell view={view}>
          <Overview view={view} />
        </PortalShell>
      );
    }
  }

  let session = null;
  try {
    session = await getPortalSession();
  } catch {
    // A stale cookie or an unconfigured environment lands on the sign-in screen
    // rather than an error page; the startup banner already says what is wrong.
  }

  if (!session) {
    return (
      <SignIn
        brandName={portalConfig.brand.name}
        monogram={monogram(portalConfig.brand.name)}
        supportEmail={portalConfig.brand.supportEmail}
      />
    );
  }

  if (session.profile.role === "admin") redirect("/admin");

  const view = await loadPortalView(session);
  if (!view) {
    return (
      <main style={{ padding: "3rem 1.5rem", maxWidth: "34rem", margin: "0 auto" }}>
        <h1 style={{ fontFamily: "var(--font-serif)" }}>No project yet</h1>
        <p style={{ color: "var(--ink-muted)" }}>
          Your account is set up, but no project has been assigned to it. Email{" "}
          <a href={`mailto:${portalConfig.brand.supportEmail}`}>
            {portalConfig.brand.supportEmail}
          </a>{" "}
          and we&rsquo;ll sort it out.
        </p>
      </main>
    );
  }

  return (
    <PortalShell view={view}>
      <Overview view={view} />
    </PortalShell>
  );
}
