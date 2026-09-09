"use client";

/**
 * Messages.
 *
 * Intentionally not Slack. One flat feed per project, no threads, no channels,
 * no presence, no typing indicators. The goal is that project conversation stops
 * living in an email account — not that anyone spends time in here.
 *
 * System notes share the timeline but are visually distinct, and are written by
 * the server: the RLS policy refuses a client-authored 'system' message, so the
 * feed cannot be salted with fake automation.
 */

import { useEffect, useRef, useState } from "react";

import { formatDateTime, isoDate } from "@/lib/portal/format";
import type { PortalMessage, PortalView } from "@/lib/portal/types";
import { EmptyState, Panel, Status, primitives } from "./Primitives";
import styles from "./sections.module.css";

export default function MessagesSection({ view }: { view: PortalView }) {
  const [messages, setMessages] = useState<PortalMessage[]>(view.messages);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const markedRef = useRef(false);

  // Mark what is on screen as read, once. Read state is per user, so this only
  // ever affects the person looking at it.
  useEffect(() => {
    if (markedRef.current || view.isDemo) return;
    const unread = messages.filter((message) => !message.read && !message.isMine);
    if (unread.length === 0) return;

    markedRef.current = true;
    void fetch("/api/portal/messages/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageIds: unread.map((message) => message.id) }),
    }).catch(() => {
      // Read receipts are a convenience; never surface a failure for one.
    });
  }, [messages, view.isDemo]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text) return;

    if (view.isDemo) {
      setError("This is a demo portal — messages are switched off.");
      return;
    }

    setBusy(true);
    setError("");

    const response = await fetch("/api/portal/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: view.project.id, body: text }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(payload?.error ?? "That message did not send.");
      setBusy(false);
      return;
    }

    const payload = (await response.json()) as { message?: PortalMessage };
    if (payload.message) {
      setMessages((current) => [...current, payload.message as PortalMessage]);
    }
    setBody("");
    setBusy(false);
  }

  return (
    <div className={styles.stack}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Messages</h1>
        <p className={styles.pageLede}>
          Project updates and questions, kept with the project instead of in an
          email thread.
        </p>
      </header>

      <Panel>
        {messages.length === 0 ? (
          <EmptyState
            title="No project messages yet"
            body="Updates from me and anything you send will appear here, oldest first."
          />
        ) : (
          <ol className={styles.messages} aria-label="Project messages">
            {messages.map((message) => (
              <li
                key={message.id}
                className={`${styles.message} ${
                  message.kind === "system"
                    ? styles.messageSystem
                    : message.isMine
                      ? styles.messageMine
                      : ""
                }`}
              >
                <p className={styles.messageMeta}>
                  <span>
                    {message.kind === "system"
                      ? "System"
                      : (message.senderName ?? "Someone")}
                  </span>
                  <time dateTime={isoDate(message.createdAt)}>
                    {formatDateTime(message.createdAt)}
                  </time>
                </p>
                <p className={styles.messageBody}>{message.body}</p>
              </li>
            ))}
          </ol>
        )}

        <form onSubmit={send} className={styles.composer}>
          <label className="label" htmlFor="message-body" style={{ display: "block", marginBottom: "0.375rem" }}>
            Write a message
          </label>
          <textarea
            id="message-body"
            className={styles.textarea}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={10000}
            rows={4}
          />
          <div style={{ marginTop: "0.75rem" }}>
            <button
              type="submit"
              className={primitives.button}
              disabled={busy || !body.trim()}
            >
              {busy ? "Sending…" : "Send"}
            </button>
          </div>
          <p aria-live="polite" style={{ marginTop: "0.625rem", marginBottom: 0 }}>
            {error && <Status tone="critical">{error}</Status>}
          </p>
        </form>
      </Panel>
    </div>
  );
}
