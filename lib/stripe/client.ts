/**
 * Minimal Stripe REST client.
 *
 * No SDK dependency: the rest of this codebase talks to Supabase with plain
 * fetch, and Stripe's API is form-encoded REST. Keeping it the same shape means
 * one less package to keep patched.
 *
 * MODE SAFETY — read this before changing it.
 *
 * The reference implementation hard-refused anything that was not `sk_test_`,
 * which is correct for a sandbox but would stop a real deployment ever taking a
 * payment. This template instead declares its mode explicitly and asserts the
 * key MATCHES it:
 *
 *   STRIPE_MODE=test  requires sk_test_    (the default when unset)
 *   STRIPE_MODE=live  requires sk_live_
 *
 * Both directions fail loudly. A live key pasted into a test deployment throws
 * instead of quietly charging somebody; a test key left in a production
 * deployment throws instead of quietly not charging them. Restricted (`rk_`)
 * and publishable (`pk_`) keys fail either way.
 *
 * Defaulting to `test` is deliberate: a deployment that forgets to configure
 * anything cannot take real money by accident.
 */

import { stripeMode, type StripeMode } from "@/lib/config/env";

const STRIPE_API = "https://api.stripe.com/v1";
const STRIPE_VERSION = "2024-06-20";

export class StripeNotConfiguredError extends Error {
  constructor() {
    super("Stripe is not configured. Set STRIPE_SECRET_KEY.");
    this.name = "StripeNotConfiguredError";
  }
}

export class StripeModeMismatchError extends Error {
  constructor(mode: StripeMode, expectedPrefix: string) {
    super(
      `STRIPE_MODE is "${mode}" but STRIPE_SECRET_KEY does not start with ${expectedPrefix}. ` +
        "Refusing to call Stripe with a key that does not match the declared mode.",
    );
    this.name = "StripeModeMismatchError";
  }
}

export function expectedKeyPrefix(mode: StripeMode = stripeMode()) {
  return mode === "live" ? "sk_live_" : "sk_test_";
}

/**
 * Returns the secret key, or throws. Never log or echo the return value.
 */
export function requireStripeKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new StripeNotConfiguredError();

  const mode = stripeMode();
  const prefix = expectedKeyPrefix(mode);
  if (!key.startsWith(prefix)) throw new StripeModeMismatchError(mode, prefix);

  return key;
}

/** True when Stripe can actually be called. Used to hide inert UI, never to authorize. */
export function isStripeConfigured() {
  const key = process.env.STRIPE_SECRET_KEY;
  return Boolean(key && key.startsWith(expectedKeyPrefix()));
}

/**
 * Flattens a nested object into Stripe's bracket form encoding.
 * `{ metadata: { ref: "BUILD-0247" } }` becomes `metadata[ref]=BUILD-0247`.
 */
export function toFormBody(
  input: Record<string, unknown>,
  prefix = "",
): URLSearchParams {
  const params = new URLSearchParams();

  const walk = (value: unknown, key: string) => {
    if (value === undefined || value === null) return;

    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${key}[${index}]`));
      return;
    }

    if (typeof value === "object") {
      for (const [childKey, childValue] of Object.entries(
        value as Record<string, unknown>,
      )) {
        walk(childValue, key ? `${key}[${childKey}]` : childKey);
      }
      return;
    }

    params.append(key, String(value));
  };

  walk(input, prefix);
  return params;
}

type StripeRequestOptions = {
  method?: "GET" | "POST" | "DELETE";
  body?: Record<string, unknown>;
  /**
   * Stripe deduplicates POSTs carrying the same idempotency key for 24 hours.
   * Pass a stable key derived from what is being created, so a retry cannot
   * raise a second invoice against the same project.
   */
  idempotencyKey?: string;
};

export async function stripeRequest<T>(
  path: string,
  options: StripeRequestOptions = {},
): Promise<T> {
  const key = requireStripeKey();
  const { method = "POST", body, idempotencyKey } = options;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Stripe-Version": STRIPE_VERSION,
  };

  let url = `${STRIPE_API}${path}`;
  let payload: string | undefined;

  if (body && method === "GET") {
    url += `?${toFormBody(body).toString()}`;
  } else if (body) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    payload = toFormBody(body).toString();
  }

  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  const response = await fetch(url, {
    method,
    headers,
    body: payload,
    cache: "no-store",
  });

  const text = await response.text();

  if (!response.ok) {
    // Stripe error bodies carry no secrets, but the request never should have
    // included one either. Log the message only, never the request.
    let message = `Stripe request failed with status ${response.status}.`;
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } };
      if (parsed.error?.message) message = parsed.error.message;
    } catch {
      // Non-JSON error body; keep the status message.
    }
    console.error("Stripe request failed", path, response.status, message);
    throw new Error(message);
  }

  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export type StripeInvoice = {
  id: string;
  status: string;
  hosted_invoice_url: string | null;
  amount_due: number;
  customer: string;
  metadata?: Record<string, string>;
};

export type StripeSubscription = {
  id: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end?: number;
  customer?: string;
  metadata?: Record<string, string>;
};
