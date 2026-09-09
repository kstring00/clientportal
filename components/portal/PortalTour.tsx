"use client";

/**
 * The guided walkthrough.
 *
 * Accessibility is the hard part here, and it is not optional — a tour that only
 * works with a mouse teaches nothing to the person who most needs it.
 *
 *   * `role="dialog"` + `aria-modal`, labelled by its own heading.
 *   * Focus moves into the dialog on open and returns to whatever opened it on
 *     close. Tab is trapped inside while it is open, so you cannot tab into the
 *     page behind and get lost.
 *   * Escape closes it — and closing counts as "skip", never as "complete", so
 *     an accidental Escape does not mark the tour as read.
 *   * Left/Right arrows move between steps.
 *   * Each step change is announced through a polite live region; without that,
 *     a screen reader user hears nothing when the content swaps under them.
 *   * Reduced motion removes the entrance animation.
 *
 * State is persisted per user through /api/portal/tour. A failed write is
 * swallowed: not recording that somebody skipped a tour is a much smaller
 * problem than blocking them behind an error they cannot act on.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  shouldAutoOpen,
  TOUR_VERSION,
  tourSteps,
  tourWelcome,
} from "@/lib/portal/tour";
import type { PortalTourState } from "@/lib/portal/types";
import styles from "./tour.module.css";

/** Dispatched by the Help page's replay button. */
export const REPLAY_EVENT = "portal:replay-tour";

type Section = { key: string; label: string; href: string };

type Screen = "welcome" | "step" | "finish";

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

export default function PortalTour({
  sections,
  state,
  isDemo,
}: {
  sections: Section[];
  state: PortalTourState;
  isDemo: boolean;
}) {
  const steps = tourSteps(sections.map((section) => section.key));

  const [open, setOpen] = useState(false);
  const [screen, setScreen] = useState<Screen>("welcome");
  const [index, setIndex] = useState(0);

  const cardRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  const persist = useCallback(
    (action: "complete" | "dismiss" | "replay", step?: number) => {
      // Demo mode has no database and no user row to write to.
      if (isDemo) return;
      void fetch("/api/portal/tour", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, step, version: TOUR_VERSION }),
      }).catch(() => {
        // Losing tour bookkeeping must never surface as an error to the client.
      });
    },
    [isDemo],
  );

  // First-visit auto-open, and the replay hook from Help.
  useEffect(() => {
    if (shouldAutoOpen(state)) {
      openerRef.current = null;
      setOpen(true);
      setScreen("welcome");
      setIndex(0);
    }

    const onReplay = (event: Event) => {
      // Remember what triggered the replay so focus can go back to it.
      openerRef.current = (event as CustomEvent).detail?.opener ?? null;
      setOpen(true);
      setScreen("welcome");
      setIndex(0);
      persist("replay");
    };

    window.addEventListener(REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(REPLAY_EVENT, onReplay);
  }, [state, persist]);

  const close = useCallback(
    (completed: boolean) => {
      setOpen(false);
      persist(completed ? "complete" : "dismiss", index);
      // Return focus to whatever opened the dialog; on a first-visit auto-open
      // there is nothing sensible to return to, so focus the main region.
      const target =
        openerRef.current ??
        document.getElementById("portal-main") ??
        document.body;
      window.requestAnimationFrame(() => {
        if (target instanceof HTMLElement) {
          if (!target.hasAttribute("tabindex") && target.id === "portal-main") {
            target.setAttribute("tabindex", "-1");
          }
          target.focus();
        }
      });
    },
    [index, persist],
  );

  // Focus management and the key handlers, active only while open.
  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement;
    if (previouslyFocused instanceof HTMLElement && !openerRef.current) {
      openerRef.current = previouslyFocused;
    }

    // Move focus into the dialog so the next Tab stays inside it.
    window.requestAnimationFrame(() => {
      const first = cardRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? cardRef.current)?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(false);
        return;
      }

      if (event.key === "Tab") {
        const focusable = Array.from(
          cardRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
        ).filter((element) => element.offsetParent !== null);

        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;

        if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }

      if (screen !== "step") return;

      if (event.key === "ArrowRight") {
        event.preventDefault();
        setIndex((current) =>
          current + 1 >= steps.length ? current : current + 1,
        );
        if (index + 1 >= steps.length) setScreen("finish");
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (index === 0) setScreen("welcome");
        else setIndex((current) => current - 1);
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, screen, index, steps.length, close]);

  // The page behind must not scroll under the dialog on a phone.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open || steps.length === 0) return null;

  const welcome = tourWelcome();
  const step = steps[Math.min(index, steps.length - 1)];
  const total = steps.length;

  const next = () => {
    if (index + 1 >= total) setScreen("finish");
    else setIndex(index + 1);
  };

  const back = () => {
    if (index === 0) setScreen("welcome");
    else setIndex(index - 1);
  };

  const projectHref =
    sections.find((section) => section.key === "project")?.href ?? "/portal";

  return (
    <div
      className={styles.backdrop}
      onClick={(event) => {
        // Clicking the backdrop is a skip, like Escape.
        if (event.target === event.currentTarget) close(false);
      }}
    >
      <div
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={cardRef}
        tabIndex={-1}
      >
        {/* Announces each step to a screen reader as the content swaps. */}
        <p className="visually-hidden" aria-live="polite">
          {screen === "step"
            ? `Step ${index + 1} of ${total}. ${step.title}`
            : screen === "finish"
              ? "Walkthrough finished."
              : "Walkthrough introduction."}
        </p>

        {screen === "step" && (
          <div className={styles.progress}>
            <div className={styles.pips} aria-hidden="true">
              {steps.map((item, position) => (
                <span
                  key={item.eyebrow}
                  className={`${styles.pip} ${position <= index ? styles.pipDone : ""}`}
                />
              ))}
            </div>
            <span className={styles.counter}>
              {String(index + 1).padStart(2, "0")}/{String(total).padStart(2, "0")}
            </span>
          </div>
        )}

        {screen === "welcome" && (
          <>
            <p className={styles.eyebrow}>Welcome</p>
            <h2 className={styles.title} id={titleId}>
              {welcome.title}
            </h2>
            <p className={styles.body}>{welcome.body}</p>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.quiet}
                onClick={() => close(false)}
              >
                Skip for now
              </button>
              <span className={styles.spacer} />
              <button
                type="button"
                className={styles.primary}
                onClick={() => setScreen("step")}
              >
                Start walkthrough
              </button>
            </div>
          </>
        )}

        {screen === "step" && (
          <>
            <p className={styles.eyebrow}>{step.eyebrow}</p>
            <h2 className={styles.title} id={titleId}>
              {step.title}
            </h2>
            <p className={styles.body}>{step.body}</p>
            <div className={styles.actions}>
              <button type="button" className={styles.quiet} onClick={() => close(false)}>
                Skip
              </button>
              <span className={styles.spacer} />
              <button type="button" className={styles.secondary} onClick={back}>
                Back
              </button>
              <button type="button" className={styles.primary} onClick={next}>
                {index + 1 >= total ? "Finish" : "Next"}
              </button>
            </div>
          </>
        )}

        {screen === "finish" && (
          <>
            <p className={styles.eyebrow}>Done</p>
            <h2 className={styles.title} id={titleId}>
              You&rsquo;re ready.
            </h2>
            <p className={styles.body}>
              You can replay this walkthrough any time from Help.
            </p>
            <div className={styles.actions}>
              <span className={styles.spacer} />
              <button
                type="button"
                className={styles.secondary}
                onClick={() => close(true)}
              >
                Close
              </button>
              <a
                className={styles.primary}
                href={projectHref}
                onClick={() => close(true)}
              >
                Go to project
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
