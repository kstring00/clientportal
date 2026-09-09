"use client";

/**
 * Sign-in, and the landing point for a magic link.
 *
 * Supabase returns the tokens in the URL FRAGMENT (#access_token=...), which
 * never reaches the server. So this component reads them client-side, posts them
 * once to /api/portal/auth/session to be exchanged for httpOnly cookies, and
 * immediately clears the fragment from the address bar — a token sitting in
 * history or a shared screenshot is a live session.
 *
 * After that exchange the browser holds no token at all: authorization is the
 * cookie, and the cookie is not readable by script.
 */

import { FormEvent, useEffect, useState } from "react";

import styles from "./signin.module.css";

type SessionResponse = {
  authenticated?: boolean;
  redirectTo?: string;
  error?: string;
};

export default function SignIn({
  brandName,
  monogram,
  supportEmail,
}: {
  brandName: string;
  monogram: string;
  supportEmail: string;
}) {
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const expiresIn = Number(hash.get("expires_in") || "3600");

      if (accessToken && refreshToken) {
        const response = await fetch("/api/portal/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken, refreshToken, expiresIn }),
        });

        // Clear the tokens from the URL whatever the outcome.
        history.replaceState(null, "", window.location.pathname);

        const payload = (await response.json().catch(() => null)) as
          | SessionResponse
          | null;

        if (!response.ok) {
          if (!cancelled) {
            setError(
              payload?.error ||
                "This sign-in link could not be used. It may have expired.",
            );
            setChecking(false);
          }
          return;
        }

        if (payload?.redirectTo) {
          window.location.replace(payload.redirectTo);
          return;
        }
      }

      // Already signed in? Go straight through.
      const existing = await fetch("/api/portal/auth/session", { cache: "no-store" });
      if (existing.ok) {
        const payload = (await existing.json()) as SessionResponse;
        if (payload.redirectTo) {
          window.location.replace(payload.redirectTo);
          return;
        }
      }

      if (!cancelled) setChecking(false);
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setStatus("sending");

    const response = await fetch("/api/portal/auth/request-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(payload?.error || "Could not send the link. Try again in a moment.");
      setStatus("idle");
      return;
    }

    setStatus("sent");
  }

  if (checking) {
    return (
      <div className={styles.page}>
        <p className="label" role="status">
          Checking your session…
        </p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <span className={styles.monogram} aria-hidden="true">
          {monogram}
        </span>
        <h1 className={styles.title}>{brandName}</h1>
        <p className={styles.body}>
          Enter the email address your project portal is registered to and
          we&rsquo;ll send you a sign-in link.
        </p>

        {status === "sent" ? (
          <div className={styles.sent} role="status">
            <p style={{ margin: 0 }}>
              Check your email. The link signs you straight in and expires
              shortly, so open it on this device if you can.
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate>
            <label className={styles.label} htmlFor="portal-email">
              Email address
            </label>
            <input
              id="portal-email"
              className={styles.input}
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-describedby={error ? "portal-signin-error" : undefined}
            />
            <button
              type="submit"
              className={styles.submit}
              disabled={status === "sending" || !email.trim()}
            >
              {status === "sending" ? "Sending…" : "Send sign-in link"}
            </button>
          </form>
        )}

        {error && (
          <p className={styles.error} id="portal-signin-error" role="alert">
            {error}
          </p>
        )}

        <p className={styles.note}>
          Trouble signing in? Email{" "}
          <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.
        </p>
      </div>
    </div>
  );
}
