"use client";

import { useState } from "react";

import styles from "./admin.module.css";

export default function AdminInviteForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const rawTotal = String(form.get("agreedTotal") ?? "").trim();
    const agreedTotal = rawTotal ? Number(rawTotal) : null;

    const response = await fetch("/api/admin/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(form.get("name") ?? ""),
        email: String(form.get("email") ?? ""),
        businessName: String(form.get("businessName") ?? ""),
        phone: String(form.get("phone") ?? ""),
        projectName: String(form.get("projectName") ?? ""),
        scopeSummary: String(form.get("scopeSummary") ?? ""),
        agreedTotal: Number.isFinite(agreedTotal) ? agreedTotal : null,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { error?: string; projectId?: string }
      | null;

    if (!response.ok || !payload?.projectId) {
      setError(payload?.error ?? "Could not create and invite that client.");
      setBusy(false);
      return;
    }

    window.location.assign(`/admin/${payload.projectId}`);
  }

  return (
    <section className={styles.panel} aria-labelledby="new-client-heading">
      <div className={styles.panelHead}>
        <div>
          <p className={styles.eyebrow}>Provision</p>
          <h2 id="new-client-heading">New client portal</h2>
        </div>
      </div>

      <form onSubmit={submit} className={styles.formGrid} style={{ marginTop: "1rem" }}>
        <div className={styles.field}>
          <label htmlFor="client-name">Contact name</label>
          <input id="client-name" name="name" required autoComplete="name" />
        </div>
        <div className={styles.field}>
          <label htmlFor="client-email">Email</label>
          <input id="client-email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className={styles.field}>
          <label htmlFor="business-name">Business</label>
          <input id="business-name" name="businessName" required autoComplete="organization" />
        </div>
        <div className={styles.field}>
          <label htmlFor="client-phone">Phone</label>
          <input id="client-phone" name="phone" autoComplete="tel" />
        </div>
        <div className={styles.field}>
          <label htmlFor="project-name">Project name</label>
          <input id="project-name" name="projectName" required placeholder="Website redesign" />
        </div>
        <div className={styles.field}>
          <label htmlFor="agreed-total">Agreed total</label>
          <input id="agreed-total" name="agreedTotal" type="number" min="0" step="0.01" inputMode="decimal" />
        </div>
        <div className={`${styles.field} ${styles.full}`}>
          <label htmlFor="scope-summary">Scope summary</label>
          <textarea id="scope-summary" name="scopeSummary" placeholder="What is being built, in plain language." />
        </div>
        <div className={`${styles.actions} ${styles.full}`}>
          <button className={styles.button} type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create portal + send invite"}
          </button>
        </div>
        {error && (
          <p className={`${styles.error} ${styles.full}`} role="alert">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
