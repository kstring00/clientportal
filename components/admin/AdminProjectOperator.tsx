"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { AdminProjectDetail } from "@/lib/admin/types";
import styles from "./admin.module.css";

type Phase = { key: string; label: string };
type Category = { key: string; label: string };

type Json = Record<string, unknown>;

function text(row: Json, key: string) {
  return typeof row[key] === "string" ? (row[key] as string) : "";
}

function displayMoney(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(number);
}

export default function AdminProjectOperator({
  project,
  phases,
  categories,
  carePlanEnabled,
}: {
  project: AdminProjectDetail;
  phases: Phase[];
  categories: Category[];
  carePlanEnabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function call(
    key: string,
    url: string,
    options: RequestInit,
    success: string,
  ) {
    setBusy(key);
    setNotice("");
    setError("");
    try {
      const response = await fetch(url, options);
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        setError(payload?.error ?? "That action did not complete.");
        return false;
      }
      setNotice(success);
      router.refresh();
      return true;
    } catch {
      setError("The request could not reach the server.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function saveProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const rawTotal = String(form.get("agreedTotal") ?? "").trim();
    const agreedTotal = rawTotal ? Number(rawTotal) : null;

    await call(
      "project",
      "/api/admin/projects",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          status: String(form.get("status") ?? "active"),
          phase: String(form.get("phase") ?? "") || null,
          summary: String(form.get("summary") ?? ""),
          scopeSummary: String(form.get("scopeSummary") ?? ""),
          currentFocus: String(form.get("currentFocus") ?? ""),
          nextAction: String(form.get("nextAction") ?? ""),
          nextActionDue: String(form.get("nextActionDue") ?? ""),
          nextMilestone: String(form.get("nextMilestone") ?? ""),
          nextMilestoneAt: String(form.get("nextMilestoneAt") ?? ""),
          agreedTotal: Number.isFinite(agreedTotal) ? agreedTotal : null,
        }),
      },
      "Project updated.",
    );
  }

  async function resendInvite() {
    if (!project.contactEmail) {
      setError("This client has no contact email to invite.");
      return;
    }
    await call(
      "invite",
      "/api/admin/invite",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          email: project.contactEmail,
          name: project.contactName || project.clientName,
        }),
      },
      `Invite sent to ${project.contactEmail}.`,
    );
  }

  async function createApproval(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ok = await call(
      "approval",
      "/api/admin/approvals",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          title: String(form.get("title") ?? ""),
          detail: String(form.get("detail") ?? ""),
          previewUrl: String(form.get("previewUrl") ?? ""),
        }),
      },
      "Approval requested.",
    );
    if (ok) event.currentTarget.reset();
  }

  async function recordDecision(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ok = await call(
      "decision",
      "/api/admin/decisions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          topic: String(form.get("topic") ?? ""),
          decision: String(form.get("decision") ?? ""),
          detail: String(form.get("detail") ?? ""),
        }),
      },
      "Decision recorded.",
    );
    if (ok) event.currentTarget.reset();
  }

  async function requestFile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ok = await call(
      "file-request",
      "/api/admin/file-requests",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          label: String(form.get("label") ?? ""),
          detail: String(form.get("detail") ?? ""),
          category: String(form.get("category") ?? "other"),
        }),
      },
      "File requested.",
    );
    if (ok) event.currentTarget.reset();
  }

  async function issueInvoice(kind: "deposit" | "final") {
    await call(
      `invoice-${kind}`,
      "/api/admin/invoices",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, kind }),
      },
      `${kind === "deposit" ? "Deposit" : "Final"} invoice issued.`,
    );
  }

  async function startCare() {
    await call(
      "care-start",
      "/api/admin/care-plan",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      },
      "Care plan started.",
    );
  }

  async function cancelCare() {
    await call(
      "care-cancel",
      "/api/admin/care-plan",
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      },
      "Care plan will cancel at period end.",
    );
  }

  async function updateHandoff(event: React.FormEvent<HTMLFormElement>, itemId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await call(
      `handoff-${itemId}`,
      "/api/admin/handoff",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          itemId,
          status: String(form.get("status") ?? "not_ready"),
          note: String(form.get("note") ?? ""),
        }),
      },
      "Handoff item updated.",
    );
  }

  async function transferOwnership() {
    await call(
      "ownership",
      "/api/admin/handoff",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, transferOwnership: true }),
      },
      "Ownership transfer recorded.",
    );
  }

  return (
    <div className={styles.stack}>
      <div aria-live="polite">
        {notice && <p className={styles.notice}>{notice}</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>

      <section className={styles.panel} aria-labelledby="project-control-heading">
        <div className={styles.panelHead}>
          <div>
            <p className={styles.eyebrow}>Project state</p>
            <h2 id="project-control-heading">What the client sees first</h2>
          </div>
          <button className={styles.buttonQuiet} type="button" onClick={resendInvite} disabled={busy === "invite"}>
            {busy === "invite" ? "Sending…" : "Resend invite"}
          </button>
        </div>

        <form className={styles.formGrid} onSubmit={saveProject} style={{ marginTop: "1rem" }}>
          <div className={styles.field}>
            <label htmlFor="project-status">Status</label>
            <select id="project-status" name="status" defaultValue={project.status}>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="complete">Complete</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="project-phase">Phase</label>
            <select id="project-phase" name="phase" defaultValue={project.phase ?? ""}>
              <option value="">No phase</option>
              {phases.map((phase) => (
                <option key={phase.key} value={phase.key}>{phase.label}</option>
              ))}
            </select>
          </div>
          <div className={`${styles.field} ${styles.full}`}>
            <label htmlFor="project-summary">Project summary</label>
            <textarea id="project-summary" name="summary" defaultValue={project.summary ?? ""} />
          </div>
          <div className={`${styles.field} ${styles.full}`}>
            <label htmlFor="scope-summary">Scope summary</label>
            <textarea id="scope-summary" name="scopeSummary" defaultValue={project.scopeSummary ?? ""} />
          </div>
          <div className={styles.field}>
            <label htmlFor="current-focus">Currently working on</label>
            <input id="current-focus" name="currentFocus" defaultValue={project.currentFocus ?? ""} />
          </div>
          <div className={styles.field}>
            <label htmlFor="next-action">Client's next action</label>
            <input id="next-action" name="nextAction" defaultValue={project.nextAction ?? ""} />
          </div>
          <div className={styles.field}>
            <label htmlFor="next-action-due">Action due</label>
            <input id="next-action-due" name="nextActionDue" type="date" defaultValue={project.nextActionDue ?? ""} />
          </div>
          <div className={styles.field}>
            <label htmlFor="next-milestone">Next milestone</label>
            <input id="next-milestone" name="nextMilestone" defaultValue={project.nextMilestone ?? ""} />
          </div>
          <div className={styles.field}>
            <label htmlFor="next-milestone-at">Milestone date</label>
            <input id="next-milestone-at" name="nextMilestoneAt" type="date" defaultValue={project.nextMilestoneAt ?? ""} />
          </div>
          <div className={styles.field}>
            <label htmlFor="agreed-total">Agreed total</label>
            <input id="agreed-total" name="agreedTotal" type="number" min="0" step="0.01" defaultValue={project.agreedTotal ?? ""} />
          </div>
          <div className={`${styles.actions} ${styles.full}`}>
            <button className={styles.button} type="submit" disabled={busy === "project"}>
              {busy === "project" ? "Saving…" : "Save project"}
            </button>
          </div>
        </form>
      </section>

      <div className={styles.operatorGrid}>
        <div className={styles.stack}>
          <section className={styles.panel}>
            <p className={styles.eyebrow}>Client action</p>
            <h2>Request approval</h2>
            <form className={styles.formGrid} onSubmit={createApproval} style={{ marginTop: "1rem" }}>
              <div className={styles.field}>
                <label htmlFor="approval-title">Title</label>
                <input id="approval-title" name="title" required placeholder="Homepage design" />
              </div>
              <div className={styles.field}>
                <label htmlFor="approval-preview">Preview URL</label>
                <input id="approval-preview" name="previewUrl" type="url" placeholder="https://…" />
              </div>
              <div className={`${styles.field} ${styles.full}`}>
                <label htmlFor="approval-detail">What they are deciding</label>
                <textarea id="approval-detail" name="detail" />
              </div>
              <div className={`${styles.actions} ${styles.full}`}>
                <button className={styles.button} type="submit" disabled={busy === "approval"}>Request approval</button>
              </div>
            </form>
            {project.approvals.length > 0 && (
              <ul className={styles.list} style={{ marginTop: "1rem" }}>
                {project.approvals.slice(0, 5).map((approval) => (
                  <li className={styles.listItem} key={text(approval, "id")}>
                    <div className={styles.row}>
                      <strong>{text(approval, "title")}</strong>
                      <span className={styles.status}>{text(approval, "status")}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.panel}>
            <p className={styles.eyebrow}>Memory</p>
            <h2>Record a decision</h2>
            <form className={styles.formGrid} onSubmit={recordDecision} style={{ marginTop: "1rem" }}>
              <div className={styles.field}>
                <label htmlFor="decision-topic">Topic</label>
                <input id="decision-topic" name="topic" required placeholder="Homepage direction" />
              </div>
              <div className={styles.field}>
                <label htmlFor="decision-value">Decision</label>
                <input id="decision-value" name="decision" required placeholder="Use direction B" />
              </div>
              <div className={`${styles.field} ${styles.full}`}>
                <label htmlFor="decision-detail">Detail</label>
                <textarea id="decision-detail" name="detail" />
              </div>
              <div className={`${styles.actions} ${styles.full}`}>
                <button className={styles.button} type="submit" disabled={busy === "decision"}>Record decision</button>
              </div>
            </form>
          </section>

          <section className={styles.panel}>
            <p className={styles.eyebrow}>Assets</p>
            <h2>Request a file</h2>
            <form className={styles.formGrid} onSubmit={requestFile} style={{ marginTop: "1rem" }}>
              <div className={styles.field}>
                <label htmlFor="file-label">What you need</label>
                <input id="file-label" name="label" required placeholder="Logo SVG" />
              </div>
              <div className={styles.field}>
                <label htmlFor="file-category">Category</label>
                <select id="file-category" name="category" defaultValue={categories[0]?.key ?? "other"}>
                  {categories.map((category) => (
                    <option key={category.key} value={category.key}>{category.label}</option>
                  ))}
                </select>
              </div>
              <div className={`${styles.field} ${styles.full}`}>
                <label htmlFor="file-detail">Instructions</label>
                <textarea id="file-detail" name="detail" />
              </div>
              <div className={`${styles.actions} ${styles.full}`}>
                <button className={styles.button} type="submit" disabled={busy === "file-request"}>Request file</button>
              </div>
            </form>
          </section>
        </div>

        <div className={styles.stack}>
          <section className={styles.panel}>
            <p className={styles.eyebrow}>Billing</p>
            <h2>Project invoices</h2>
            <p className={styles.muted}>
              Amounts come from the agreed total above. This screen cannot type an invoice amount.
            </p>
            <div className={styles.actions}>
              <button className={styles.button} type="button" onClick={() => issueInvoice("deposit")} disabled={busy.startsWith("invoice-")}>Issue deposit</button>
              <button className={styles.buttonQuiet} type="button" onClick={() => issueInvoice("final")} disabled={busy.startsWith("invoice-")}>Issue final</button>
            </div>
            <ul className={styles.list} style={{ marginTop: "1rem" }}>
              {project.invoices.length === 0 ? (
                <li className={styles.muted}>No invoices yet.</li>
              ) : project.invoices.map((invoice) => (
                <li className={styles.listItem} key={text(invoice, "id")}>
                  <div className={styles.row}>
                    <span>{text(invoice, "kind") || "invoice"}</span>
                    <strong>{displayMoney(invoice.amount)}</strong>
                  </div>
                  <span className={styles.meta}>{text(invoice, "status")}</span>
                </li>
              ))}
            </ul>
          </section>

          {carePlanEnabled && (
            <section className={styles.panel}>
              <p className={styles.eyebrow}>Aftercare</p>
              <h2>Care plan</h2>
              <p className={styles.muted}>
                {project.carePlan ? `Status: ${text(project.carePlan, "status")}` : "No care plan on this project."}
              </p>
              <div className={styles.actions}>
                {!project.carePlan || text(project.carePlan, "status") === "cancelled" ? (
                  <button className={styles.button} type="button" onClick={startCare} disabled={busy === "care-start"}>Start care plan</button>
                ) : (
                  <button className={styles.buttonQuiet} type="button" onClick={cancelCare} disabled={busy === "care-cancel"}>Cancel at period end</button>
                )}
              </div>
            </section>
          )}

          <section className={styles.panel}>
            <p className={styles.eyebrow}>Final mile</p>
            <h2>Handoff</h2>
            <p className={styles.muted}>
              Final payment: {project.finalPaymentClearedAt ? "cleared" : "not cleared"}. Ownership: {project.ownershipTransferredAt ? "recorded" : "not transferred"}.
            </p>
            <div className={styles.stack}>
              {project.handoff.map((item) => (
                <form className={styles.listItem} key={text(item, "id")} onSubmit={(event) => updateHandoff(event, text(item, "id"))}>
                  <strong>{text(item, "label")}</strong>
                  <div className={styles.formGrid} style={{ marginTop: "0.55rem" }}>
                    <div className={styles.field}>
                      <label htmlFor={`handoff-status-${text(item, "id")}`}>Status</label>
                      <select id={`handoff-status-${text(item, "id")}`} name="status" defaultValue={text(item, "status") || "not_ready"}>
                        <option value="not_ready">Not ready</option>
                        <option value="ready">Ready</option>
                        <option value="transferred">Transferred</option>
                        <option value="not_applicable">Not applicable</option>
                      </select>
                    </div>
                    <div className={styles.field}>
                      <label htmlFor={`handoff-note-${text(item, "id")}`}>Non-secret note</label>
                      <input id={`handoff-note-${text(item, "id")}`} name="note" defaultValue={text(item, "note")} />
                    </div>
                  </div>
                  <button className={styles.buttonQuiet} style={{ marginTop: "0.55rem" }} type="submit" disabled={busy === `handoff-${text(item, "id")}`}>Save item</button>
                </form>
              ))}
            </div>
            <div className={styles.actions} style={{ marginTop: "1rem" }}>
              <button className={styles.button} type="button" onClick={transferOwnership} disabled={busy === "ownership" || Boolean(project.ownershipTransferredAt)}>
                {project.ownershipTransferredAt ? "Ownership transferred" : "Record ownership transfer"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
