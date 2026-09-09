/**
 * Environment configuration, checked in one place.
 *
 * The rule here comes from a real incident in the reference implementation: a
 * SUPABASE_URL that carried a `/rest/v1` suffix made every database write fail
 * with PGRST125 while the Stripe webhook kept answering 200, so payments were
 * being dropped and nothing looked wrong. The cost was most of a working day.
 *
 * Two lessons are encoded below. First, the suffix is corrected in memory but
 * never silently — `describeEnvironment` reports it and `instrumentation.ts`
 * prints it at boot, so the env value still gets fixed at source. Second, a
 * misconfiguration should be visible where the operator is looking (the boot
 * log), not inferred from a downstream symptom.
 */

import { normalizeSupabaseUrl, type SupabaseUrl } from "@/lib/supabase/url";

export type StripeMode = "test" | "live";

export type EnvReport = {
  /** Blocks the portal from working at all. */
  errors: string[];
  /** Works, but something is wrong or a module is inert. */
  warnings: string[];
  supabaseUrl: SupabaseUrl | null;
};

/**
 * The declared Stripe mode. Defaults to `test`, so a deployment that forgets to
 * set it cannot accidentally take a real payment.
 */
export function stripeMode(): StripeMode {
  return process.env.STRIPE_MODE === "live" ? "live" : "test";
}

/** True when the portal is serving demo data instead of the database. */
export function isDemoMode() {
  return process.env.PORTAL_DEMO_MODE === "true";
}

/** The portal's own origin, used to build magic-link redirects. */
export function appUrl() {
  const raw = process.env.APP_URL?.trim();
  if (raw) return raw.replace(/\/+$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/**
 * Inspects the environment without throwing, so the caller decides whether a
 * problem is fatal. Secrets are never included in the returned strings — only
 * whether they are present and whether their prefix is the expected one.
 */
export function describeEnvironment(): EnvReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  const supabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL);
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();

  if (!supabaseUrl) {
    errors.push(
      "SUPABASE_URL is not set. Nothing that touches the database will work.",
    );
  } else if (supabaseUrl.corrected) {
    warnings.push(
      `SUPABASE_URL ends in /rest/v1 and was corrected in memory to ${supabaseUrl.url}. ` +
        "Fix the environment value — this correction is a safety net, not a substitute.",
    );
  }

  if (!secretKey) {
    errors.push(
      "SUPABASE_SECRET_KEY is not set. Sign-in, invites and the Stripe webhook will all fail.",
    );
  } else if (!/^(sb_secret_|eyJ)/.test(secretKey)) {
    warnings.push(
      "SUPABASE_SECRET_KEY does not look like a secret key (expected sb_secret_… or a service-role JWT). " +
        "A publishable/anon key here fails every privileged call.",
    );
  }

  if (!process.env.PORTAL_ADMIN_EMAIL?.trim()) {
    warnings.push(
      "PORTAL_ADMIN_EMAIL is not set, so no account will be bootstrapped as admin " +
        "on first sign-in. Set it before signing in for the first time.",
    );
  }

  const mode = stripeMode();
  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();

  if (!stripeKey) {
    warnings.push(
      "STRIPE_SECRET_KEY is not set. Invoicing and care plans are inert; the rest of the portal works.",
    );
  } else {
    const expected = mode === "live" ? "sk_live_" : "sk_test_";
    if (!stripeKey.startsWith(expected)) {
      errors.push(
        `STRIPE_MODE is "${mode}" but STRIPE_SECRET_KEY does not start with ${expected}. ` +
          "Refusing to guess which one is right.",
      );
    }
  }

  if (stripeKey && !process.env.STRIPE_WEBHOOK_SECRET?.trim()) {
    warnings.push(
      "STRIPE_WEBHOOK_SECRET is not set. The webhook will answer 503 and no invoice " +
        "will ever be marked paid, so handoff can never unlock.",
    );
  }

  return { errors, warnings, supabaseUrl };
}
