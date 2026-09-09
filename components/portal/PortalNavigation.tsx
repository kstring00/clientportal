"use client";

/**
 * Portal navigation, desktop and mobile.
 *
 * The mobile bar is not the desktop nav shrunk. Below 48rem the four sections a
 * client opens most sit in a fixed bottom bar under the thumb, and the rest move
 * into a "More" sheet — reachable, but not competing for space. Labels stay
 * visible: an icon-only bar saves room by making people guess.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { NavSection } from "@/lib/portal/navigation";
import styles from "./shell.module.css";

/** A typographic mark per section — no icon set to ship or keep consistent. */
const MARKS: Record<string, string> = {
  overview: "○",
  project: "◐",
  files: "▤",
  approvals: "✓",
  messages: "◇",
  invoices: "$",
  handoff: "→",
  help: "?",
};

/** How many sections fit comfortably in a phone bar before "More" is needed. */
const MOBILE_PRIMARY = 4;

function isActive(pathname: string, href: string) {
  if (href === "/portal") return pathname === "/portal";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function PortalNavigation({
  sections,
  counts,
}: {
  sections: NavSection[];
  counts: Record<string, number>;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const primary = sections.slice(0, MOBILE_PRIMARY);
  const overflow = sections.slice(MOBILE_PRIMARY);

  // Close the sheet on Escape and on navigation, and return focus where it came
  // from — a sheet that traps focus or leaves it stranded is worse than no sheet.
  useEffect(() => {
    if (!moreOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setMoreOpen(false);
        moreButtonRef.current?.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    sheetRef.current?.querySelector<HTMLElement>("a, button")?.focus();

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [moreOpen]);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  const badgeFor = (section: NavSection) =>
    section.attentionKey ? (counts[section.attentionKey] ?? 0) : 0;

  const overflowCount = overflow.reduce((total, s) => total + badgeFor(s), 0);

  return (
    <>
      <nav className={styles.nav} aria-label="Portal sections">
        <div className={styles.navInner}>
          {sections.map((section) => {
            const active = isActive(pathname, section.href);
            const count = badgeFor(section);
            return (
              <Link
                key={section.key}
                href={section.href}
                className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
                aria-current={active ? "page" : undefined}
                data-tour={`nav-${section.key}`}
              >
                {section.label}
                {count > 0 && (
                  <span className={styles.badge}>
                    {count}
                    <span className="visually-hidden">
                      {" "}
                      item{count === 1 ? "" : "s"} needing attention
                    </span>
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      <nav className={styles.mobileNav} aria-label="Portal sections">
        <div className={styles.mobileNavInner}>
          {primary.map((section) => {
            const active = isActive(pathname, section.href);
            const count = badgeFor(section);
            return (
              <Link
                key={section.key}
                href={section.href}
                className={`${styles.mobileLink} ${active ? styles.mobileLinkActive : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <span className={styles.mobileMark} aria-hidden="true">
                  {MARKS[section.key] ?? "•"}
                </span>
                {section.label}
                {count > 0 && (
                  <span className={styles.mobileBadge}>
                    {count}
                    <span className="visually-hidden">
                      {" "}
                      item{count === 1 ? "" : "s"} needing attention
                    </span>
                  </span>
                )}
              </Link>
            );
          })}

          {overflow.length > 0 && (
            <button
              type="button"
              ref={moreButtonRef}
              className={styles.mobileLink}
              onClick={() => setMoreOpen(true)}
              aria-expanded={moreOpen}
              aria-haspopup="dialog"
            >
              <span className={styles.mobileMark} aria-hidden="true">
                ⋯
              </span>
              More
              {overflowCount > 0 && (
                <span className={styles.mobileBadge}>
                  {overflowCount}
                  <span className="visually-hidden"> items needing attention</span>
                </span>
              )}
            </button>
          )}
        </div>
      </nav>

      {moreOpen && (
        <div
          className={styles.moreSheet}
          role="dialog"
          aria-modal="true"
          aria-label="More sections"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setMoreOpen(false);
              moreButtonRef.current?.focus();
            }
          }}
        >
          <div className={styles.morePanel} ref={sheetRef}>
            <p className={styles.moreTitle}>More</p>
            {overflow.map((section) => {
              const count = badgeFor(section);
              return (
                <Link key={section.key} href={section.href} className={styles.moreLink}>
                  <span>{section.label}</span>
                  {count > 0 && <span className={styles.badge}>{count}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
