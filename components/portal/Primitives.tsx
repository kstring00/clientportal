/**
 * Small shared pieces. Deliberately dumb: they take props and render, so every
 * screen looks the same without any of them knowing where data came from.
 */

import type { ReactNode } from "react";
import styles from "./primitives.module.css";

export type StatusTone = "positive" | "attention" | "critical" | "neutral";

const toneClass: Record<StatusTone, string> = {
  positive: styles.statusPositive,
  attention: styles.statusAttention,
  critical: styles.statusCritical,
  neutral: styles.statusNeutral,
};

/**
 * A status mark.
 *
 * The label is always rendered as text, never replaced by the dot. Colour and
 * shape reinforce it; they never carry it alone.
 */
export function Status({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span className={`${styles.status} ${toneClass[tone]}`}>
      <span className={styles.statusDot} aria-hidden="true" />
      {children}
    </span>
  );
}

export function Panel({
  title,
  eyebrow,
  action,
  children,
  id,
}: {
  title?: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className={styles.panel} id={id}>
      {(title || eyebrow || action) && (
        <header className={styles.panelHeader}>
          <div>
            {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
            {title && <h2 className={styles.panelTitle}>{title}</h2>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/**
 * An empty state.
 *
 * Every list in the portal uses one. "No records found" reads as a fault; a
 * sentence explaining what will appear here reads as a portal that is simply
 * new, which is the truth on day one of every project.
 */
export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className={styles.empty}>
      <p className={styles.emptyTitle}>{title}</p>
      <p className={styles.emptyBody}>{body}</p>
    </div>
  );
}

export function DefRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.defRow}>
      <dt className={styles.defLabel}>{label}</dt>
      <dd className={styles.defValue}>{children}</dd>
    </div>
  );
}

export { styles as primitives };
