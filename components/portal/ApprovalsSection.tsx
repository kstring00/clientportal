"use client";

/**
 * Approvals.
 *
 * A real decision object, not a message that says "looks good". Two properties
 * this screen exists to guarantee:
 *
 *   * A decision is permanent and attributed. Once approved, the record shows
 *     who approved it and when, and stays visible forever. Approvals do not
 *     silently disappear once they are dealt with.
 *   * The history is complete. A changes-requested round followed by an approval
 *     shows both, with the comment attached to each, so nobody has to reconstruct
 *     what happened from memory.
 */

import { useState } from "react";

import { formatDate, formatDateTime, isoDate } from "@/lib/portal/format";
import type { PortalApproval, PortalView } from "@/lib/portal/types";
import { EmptyState, Panel, Status, primitives } from "./Primitives";
import styles from "./sections.module.css";

const DECISION_LABEL: Record<string, string> = {
  requested: "Requested",
  approved: "Approved",
  changes_requested: "Changes requested",
  reopened: "Reopened",
};

function ApprovalCard({
  approval,
  onDecide,
  busy,
  isDemo,
}: {
  approval: PortalApproval;
  onDecide: (id: string, decision: "approved" | "changes_requested", comment: string) => void;
  busy: boolean;
  isDemo: boolean;
}) {
  const [comment, setComment] = useState("");
  const waiting = approval.status === "waiting";

  const cardClass =
    approval.status === "approved"
      ? styles.approvalApproved
      : approval.status === "changes_requested"
        ? styles.approvalChanges
        : styles.approvalWaiting;

  return (
    <article
      className={`${styles.approval} ${cardClass}`}
      id={`approval-${approval.id}`}
      aria-labelledby={`approval-title-${approval.id}`}
    >
      <div className={styles.approvalHead}>
        <h2 className={styles.approvalTitle} id={`approval-title-${approval.id}`}>
          {approval.title}
        </h2>
        {approval.status === "waiting" && <Status tone="attention">Waiting on you</Status>}
        {approval.status === "approved" && <Status tone="positive">Approved</Status>}
        {approval.status === "changes_requested" && (
          <Status tone="critical">Changes requested</Status>
        )}
      </div>

      <p className="label" style={{ marginBottom: "0.75rem" }}>
        Requested{" "}
        <time dateTime={isoDate(approval.requestedAt)}>
          {formatDate(approval.requestedAt)}
        </time>
      </p>

      {approval.detail && <p className={styles.approvalDetail}>{approval.detail}</p>}

      {approval.previewUrl && (
        <p style={{ marginBottom: "1rem" }}>
          <a
            className={`${primitives.button} ${primitives.buttonSecondary} ${primitives.buttonSmall}`}
            href={approval.previewUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open the preview
            <span className="visually-hidden"> for {approval.title} (opens in a new tab)</span>
          </a>
        </p>
      )}

      {/* The permanent record. Rendered for any decided approval, forever. */}
      {approval.status !== "waiting" && approval.decidedAt && (
        <p className={styles.approvalDecided}>
          <strong>
            {approval.status === "approved" ? "Approved" : "Changes requested"}
          </strong>
          {approval.decidedByName ? ` by ${approval.decidedByName}` : ""} on{" "}
          <time dateTime={isoDate(approval.decidedAt)}>
            {formatDateTime(approval.decidedAt)}
          </time>
        </p>
      )}

      {waiting && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const submitter = (event.nativeEvent as SubmitEvent)
              .submitter as HTMLButtonElement | null;
            const decision =
              submitter?.value === "changes_requested" ? "changes_requested" : "approved";
            onDecide(approval.id, decision, comment);
          }}
        >
          <label
            className="label"
            htmlFor={`comment-${approval.id}`}
            style={{ display: "block", marginBottom: "0.375rem" }}
          >
            Comment (optional for approval, helpful for changes)
          </label>
          <textarea
            id={`comment-${approval.id}`}
            className={styles.textarea}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={3}
          />
          <div style={{ display: "flex", gap: "0.625rem", marginTop: "0.875rem", flexWrap: "wrap" }}>
            <button
              type="submit"
              name="decision"
              value="approved"
              className={primitives.button}
              disabled={busy || isDemo}
            >
              Approve
            </button>
            <button
              type="submit"
              name="decision"
              value="changes_requested"
              className={`${primitives.button} ${primitives.buttonSecondary}`}
              disabled={busy || isDemo}
            >
              Request changes
            </button>
          </div>
          {isDemo && (
            <p className="label" style={{ marginTop: "0.625rem" }}>
              Demo portal — decisions are switched off
            </p>
          )}
        </form>
      )}

      {approval.history.length > 0 && (
        <div className={styles.history}>
          <p className="label">History</p>
          <ul className={styles.historyList}>
            {approval.history.map((event) => (
              <li key={event.id} className={styles.historyItem}>
                <time className={styles.historyWhen} dateTime={isoDate(event.createdAt)}>
                  {formatDate(event.createdAt)}
                </time>
                <span>
                  <strong>{DECISION_LABEL[event.decision] ?? event.decision}</strong>
                  {" — "}
                  {event.actorName}
                  {event.comment && (
                    <span className={styles.historyComment}>{event.comment}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

export default function ApprovalsSection({ view }: { view: PortalView }) {
  const [approvals, setApprovals] = useState(view.approvals);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");

  const waiting = approvals.filter((approval) => approval.status === "waiting");
  const decided = approvals.filter((approval) => approval.status !== "waiting");

  async function decide(
    id: string,
    decision: "approved" | "changes_requested",
    comment: string,
  ) {
    setBusy(true);
    setError("");

    const response = await fetch("/api/portal/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvalId: id, decision, comment }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(payload?.error ?? "That decision could not be recorded.");
      setBusy(false);
      return;
    }

    const payload = (await response.json()) as { approval?: PortalApproval };
    if (payload.approval) {
      setApprovals((current) =>
        current.map((item) => (item.id === id ? (payload.approval as PortalApproval) : item)),
      );
    }

    setAnnouncement(
      decision === "approved" ? "Approved. Thank you." : "Changes requested. I'll take a look.",
    );
    setBusy(false);
  }

  return (
    <div className={styles.stack}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Approvals</h1>
        <p className={styles.pageLede}>
          Anything needing your sign-off, and a permanent record of everything
          already decided.
        </p>
      </header>

      <p aria-live="polite" className="visually-hidden">
        {announcement}
      </p>

      {error && (
        <p role="alert">
          <Status tone="critical">{error}</Status>
        </p>
      )}

      {approvals.length === 0 ? (
        <EmptyState
          title="Nothing needs your approval right now"
          body="When something is ready for you to sign off — a design, the copy, the finished site — it appears here with everything you need to decide."
        />
      ) : (
        <>
          <section aria-labelledby="waiting-heading" className={styles.stack}>
            <h2 id="waiting-heading" className="label">
              Waiting on you ({waiting.length})
            </h2>
            {waiting.length === 0 ? (
              <EmptyState
                title="Nothing waiting"
                body="Everything sent for approval has been dealt with. The record is below."
              />
            ) : (
              waiting.map((approval) => (
                <ApprovalCard
                  key={approval.id}
                  approval={approval}
                  onDecide={decide}
                  busy={busy}
                  isDemo={view.isDemo}
                />
              ))
            )}
          </section>

          {decided.length > 0 && (
            <section aria-labelledby="decided-heading" className={styles.stack}>
              <h2 id="decided-heading" className="label">
                Already decided ({decided.length})
              </h2>
              {decided.map((approval) => (
                <ApprovalCard
                  key={approval.id}
                  approval={approval}
                  onDecide={decide}
                  busy={busy}
                  isDemo={view.isDemo}
                />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
