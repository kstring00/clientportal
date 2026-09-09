"use client";

/**
 * Help.
 *
 * Carries the replay control for the walkthrough. That control is a REQUIREMENT,
 * not a nicety: skipping the tour must never remove the ability to take it later,
 * so this button is always rendered regardless of tour state.
 */

import { useRef } from "react";

import { portalConfig } from "@/lib/config";
import type { PortalView } from "@/lib/portal/types";
import { REPLAY_EVENT } from "./PortalTour";
import { Panel, primitives } from "./Primitives";
import styles from "./sections.module.css";

export default function HelpSection({ view }: { view: PortalView }) {
  const { brand, content } = portalConfig;
  const replayRef = useRef<HTMLButtonElement>(null);

  function replay() {
    // Pass the button along so the dialog can return focus to it on close.
    window.dispatchEvent(
      new CustomEvent(REPLAY_EVENT, { detail: { opener: replayRef.current } }),
    );
  }

  return (
    <div className={styles.stack}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Help</h1>
        <p className={styles.pageLede}>
          How the portal works, how the project runs, and how to reach me.
        </p>
      </header>

      <Panel eyebrow="Walkthrough" title="Portal walkthrough">
        <p style={{ marginTop: 0 }}>
          A short guided tour of every part of this portal. You can take it as
          many times as you like — nothing is hidden after the first run.
        </p>
        <button
          type="button"
          className={primitives.button}
          onClick={replay}
          ref={replayRef}
        >
          Replay portal walkthrough
        </button>
        {view.tour.completedAt && (
          <p className="label" style={{ marginTop: "0.75rem" }}>
            You completed it previously
          </p>
        )}
      </Panel>

      <Panel eyebrow="How this runs" title="The project process">
        <ol className={styles.processList}>
          {content.processExplanation.map((paragraph) => (
            <li key={paragraph}>{paragraph}</li>
          ))}
        </ol>
      </Panel>

      <Panel eyebrow="Common questions" title="FAQ">
        <div>
          {content.faq.map((entry) => (
            <div key={entry.question} className={styles.faqItem}>
              <h3 className={styles.faqQuestion}>{entry.question}</h3>
              <p className={styles.faqAnswer}>{entry.answer}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel eyebrow="Get in touch" title="Contact">
        <p style={{ marginTop: 0 }}>
          Email{" "}
          <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>
          {brand.supportPhone && (
            <>
              {" "}
              or call <a href={`tel:${brand.supportPhone}`}>{brand.supportPhone}</a>
            </>
          )}
          . Anything project-specific is best sent through Messages, so it stays
          attached to the project.
        </p>

        {content.links.length > 0 && (
          <div style={{ marginTop: "1rem" }}>
            {content.links.map((link) => (
              <a
                key={link.href}
                className={styles.linkRow}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span>
                  <strong>{link.label}</strong>
                  {link.description && (
                    <span className={styles.handoffBlurb}>{link.description}</span>
                  )}
                </span>
                <span aria-hidden="true">↗</span>
              </a>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
