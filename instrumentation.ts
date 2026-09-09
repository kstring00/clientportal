import { describeEnvironment } from "@/lib/config/env";
import { validateConfig } from "@/lib/config";
import { supabaseUrlWarning } from "@/lib/supabase/url";

/**
 * Runs once per server instance, before the first request is handled.
 *
 * Environment problems that only surface deep inside a request are expensive:
 * in the reference implementation a wrong SUPABASE_URL made every database write
 * fail while the Stripe webhook kept answering 200. Checking here means the
 * operator sees it in the boot log instead of inferring it from downstream
 * symptoms three days later.
 *
 * Nothing here throws. A portal that boots and complains loudly is more useful
 * than one that refuses to start, and the individual call sites still throw when
 * they genuinely cannot proceed.
 */
export function register() {
  // register() is invoked for each runtime; only the Node server reads these.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { errors, warnings, supabaseUrl } = describeEnvironment();

  const urlWarning = supabaseUrlWarning(supabaseUrl);
  if (urlWarning) console.warn(urlWarning);

  const configProblems = validateConfig();

  if (errors.length === 0 && warnings.length === 0 && configProblems.length === 0) {
    return;
  }

  const lines: string[] = ["", "  Client portal — startup check", ""];

  for (const error of errors) lines.push(`  ✗ ${error}`);
  for (const warning of warnings) {
    // The URL suffix already got its own banner above; do not say it twice.
    if (warning.startsWith("SUPABASE_URL ends in /rest/v1")) continue;
    lines.push(`  ! ${warning}`);
  }
  for (const problem of configProblems) {
    lines.push(`  ! portal.config.ts ${problem.path} ${problem.message}`);
  }

  lines.push("", "  See .env.example and docs/SETUP.md.", "");
  console.warn(lines.join("\n"));
}
