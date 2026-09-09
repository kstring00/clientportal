"use client";

/**
 * Files.
 *
 * Requested files come first on purpose. A bare list of everything ever uploaded
 * is a filing cabinet; "here are the three things still needed from you, and
 * here is everything else" is a project.
 *
 * Downloads never link at storage directly: the browser asks the server, which
 * re-checks access under the caller's own token and mints a 60-second signed
 * URL. A file URL that leaks is therefore useless within the minute.
 */

import { useRef, useState } from "react";

import { formatDate, formatFileSize, isoDate } from "@/lib/portal/format";
import type { PortalFile, PortalView } from "@/lib/portal/types";
import { EmptyState, Panel, Status, primitives } from "./Primitives";
import styles from "./sections.module.css";

const STATUS_TONE = {
  waiting: "attention",
  received: "neutral",
  accepted: "positive",
  not_needed: "neutral",
} as const;

const STATUS_LABEL = {
  waiting: "Waiting",
  received: "Received",
  accepted: "Received",
  not_needed: "Not needed",
} as const;

export default function FilesSection({
  view,
  categories,
}: {
  view: PortalView;
  categories: { key: string; label: string }[];
}) {
  const [files, setFiles] = useState<PortalFile[]>(view.files);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  async function download(fileId: string) {
    setError("");
    const response = await fetch(`/api/portal/files?fileId=${encodeURIComponent(fileId)}`);
    if (!response.ok) {
      setError("That file could not be opened. Try again, or let me know.");
      return;
    }
    const payload = (await response.json()) as { url?: string };
    if (payload.url) window.open(payload.url, "_blank", "noopener,noreferrer");
  }

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (view.isDemo) {
      setError("This is a demo portal — uploads are switched off.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    const form = new FormData(event.currentTarget);
    form.set("projectId", view.project.id);

    const response = await fetch("/api/portal/files", { method: "POST", body: form });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(payload?.error ?? "That upload did not go through.");
      setBusy(false);
      return;
    }

    const payload = (await response.json()) as { file?: PortalFile };
    if (payload.file) setFiles((current) => [payload.file as PortalFile, ...current]);

    setMessage("Uploaded. Thank you.");
    setBusy(false);
    formRef.current?.reset();
  }

  const requests = view.fileRequests;

  return (
    <div className={styles.stack}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Files</h1>
        <p className={styles.pageLede}>
          Everything connected to the project, and anything still needed from you.
        </p>
      </header>

      {requests.length > 0 && (
        <Panel eyebrow="From you" title="Requested files" id="requested-files">
          <ul className={styles.requests}>
            {requests.map((request) => (
              <li
                key={request.id}
                className={styles.request}
                id={`request-${request.id}`}
              >
                <div>
                  <span className={styles.requestLabel}>{request.label}</span>
                  {request.detail && (
                    <p className={styles.requestDetail}>{request.detail}</p>
                  )}
                </div>
                <Status tone={STATUS_TONE[request.status]}>
                  {STATUS_LABEL[request.status]}
                </Status>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel eyebrow="Add" title="Upload a file">
        <form onSubmit={upload} ref={formRef}>
          <div style={{ display: "grid", gap: "0.875rem" }}>
            <div>
              <label className="label" htmlFor="file-input" style={{ display: "block", marginBottom: "0.375rem" }}>
                File (20 MB maximum)
              </label>
              <input
                id="file-input"
                name="file"
                type="file"
                required
                style={{ minHeight: "var(--tap)" }}
              />
            </div>
            <div>
              <label className="label" htmlFor="file-category" style={{ display: "block", marginBottom: "0.375rem" }}>
                Category
              </label>
              <select
                id="file-category"
                name="category"
                defaultValue="content"
                style={{
                  minHeight: "var(--tap)",
                  padding: "0.5rem 0.625rem",
                  border: "1px solid var(--line-strong)",
                  borderRadius: "var(--radius)",
                  background: "var(--surface)",
                  width: "100%",
                  maxWidth: "18rem",
                }}
              >
                {categories.map((category) => (
                  <option key={category.key} value={category.key}>
                    {category.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <button
                type="submit"
                className={primitives.button}
                disabled={busy}
              >
                {busy ? "Uploading…" : "Upload"}
              </button>
            </div>
          </div>

          {/* Announced to a screen reader as soon as it changes, rather than
              silently appearing below the button. */}
          <p aria-live="polite" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
            {message && <Status tone="positive">{message}</Status>}
            {error && <Status tone="critical">{error}</Status>}
          </p>
        </form>
      </Panel>

      <Panel eyebrow="All" title="Project files">
        {files.length === 0 ? (
          <EmptyState
            title="No files yet"
            body="When project files are added — by you or by me — they'll stay here, grouped by what they are."
          />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Category</th>
                  <th scope="col">Added</th>
                  <th scope="col">Size</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr key={file.id}>
                    <td data-label="Name">
                      <span>
                        <span className={styles.fileName}>{file.filename}</span>
                        {file.version && (
                          <span className={styles.fileMeta}>Version {file.version}</span>
                        )}
                        <span className={styles.fileMeta}>
                          Added by {file.uploadedByName}
                        </span>
                      </span>
                    </td>
                    <td data-label="Category">{file.categoryLabel}</td>
                    <td data-label="Added" className={styles.numeric}>
                      <time dateTime={isoDate(file.createdAt)}>
                        {formatDate(file.createdAt)}
                      </time>
                    </td>
                    <td data-label="Size" className={styles.numeric}>
                      {formatFileSize(file.size)}
                    </td>
                    <td data-label="">
                      <button
                        type="button"
                        className={`${primitives.button} ${primitives.buttonSecondary} ${primitives.buttonSmall}`}
                        onClick={() => download(file.id)}
                      >
                        Open
                        <span className="visually-hidden"> {file.filename}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
