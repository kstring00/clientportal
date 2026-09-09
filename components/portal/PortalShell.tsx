/**
 * The frame every portal page renders inside.
 *
 * It writes the theme tokens from portal.config.ts into a scoped <style>, which
 * is what makes rebranding a config edit rather than a stylesheet rewrite. It is
 * a server component: nothing here needs to be interactive, so nothing here ships
 * JavaScript.
 */

import Link from "next/link";
import type { ReactNode } from "react";

import { brandDisplayName, portalConfig, themeCssVariables } from "@/lib/config";
import { attentionCounts } from "@/lib/portal/attention";
import { sectionsFor } from "@/lib/portal/navigation";
import type { PortalView } from "@/lib/portal/types";
import PortalNavigation from "./PortalNavigation";
import PortalTour from "./PortalTour";
import styles from "./shell.module.css";

function monogram(name: string) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
  return letters || "•";
}

export default function PortalShell({
  view,
  children,
}: {
  view: PortalView;
  children: ReactNode;
}) {
  const { brand } = portalConfig;
  const sections = sectionsFor();
  const counts = attentionCounts(view.attention);

  return (
    <div className={styles.shell}>
      {/* Scoped to the shell rather than :root so the tokens travel with the
          portal and cannot leak into anything else mounted on the page. */}
      <style>{`.${styles.shell} { ${themeCssVariables()} }`}</style>

      <a className="skip-link" href="#portal-main">
        Skip to main content
      </a>

      {view.isDemo && (
        <p className={styles.demoBanner} role="status">
          Demo portal — sample data, not a real project
        </p>
      )}

      <header className={styles.masthead}>
        <div className={styles.mastheadInner}>
          <div className={styles.brand}>
            {brand.logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- the logo is
              // a config-supplied path of unknown dimensions; next/image would
              // need width/height the deployment cannot know in advance.
              <img
                src={brand.logo}
                alt={brand.logoAlt ?? brand.name}
                className={styles.logo}
              />
            ) : (
              <span className={styles.monogram} aria-hidden="true">
                {monogram(brand.name)}
              </span>
            )}
            <span className={styles.brandText}>
              <span className={styles.brandName}>{brandDisplayName()}</span>
              {view.project.clientName && (
                <span className={styles.brandClient}>{view.project.clientName}</span>
              )}
            </span>
          </div>

          <div className={styles.mastheadActions}>
            {view.viewer.role === "admin" && (
              <Link href="/admin" className={styles.mastheadButton}>
                Admin
              </Link>
            )}
            <form action="/api/portal/auth/sign-out" method="post">
              <button type="submit" className={styles.mastheadButton}>
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <PortalNavigation sections={sections} counts={counts} />

      <main className={styles.main} id="portal-main">
        {children}
      </main>

      <footer className={styles.footer}>
        <p>
          Questions? Email{" "}
          <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>.
        </p>
      </footer>

      <PortalTour
        sections={sections.map((section) => ({
          key: section.key,
          label: section.label,
          href: section.href,
        }))}
        state={view.tour}
        isDemo={view.isDemo}
      />
    </div>
  );
}
