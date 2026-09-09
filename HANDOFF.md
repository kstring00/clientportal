# Handoff — client portal template

Written for a new assistant (or a returning human) picking this up cold. Read
this whole file before touching code. It is the current state of the work, what
is deliberate, what is unfinished, and what will bite you.

**Repo:** `kstring00/clientportal` · **Branch:** `claude/blissful-brahmagupta-8taw3t`
**Stack:** Next.js 16 (App Router), React 19, TypeScript, CSS Modules, Supabase,
Stripe. No UI library, no CSS framework, no Stripe SDK, no test framework beyond
`node:test`.

---

## 0. What this repo is

A **reusable client portal template** for a web-design business. One deployment
serves one studio and many of its clients. Setting up a new client should be:
create the client and project rows, invite them, done — not a code change.

It was **extracted and generalised from `kstring00/stringhamwebdesign`**, which
contains a working portal foundation (Supabase magic-link auth, RLS, Stripe
Invoicing, the payment-before-transfer trigger). That repo remains the
**reference implementation**: when something here looks odd, check how it is done
there before "fixing" it — several oddities are scar tissue from real incidents,
documented in that repo's own `HANDOFF.md`.

**This repo is a portal product.** No marketing site, no portfolio, no case
studies. Do not port any of that across.

---

## 1. Current state — what is DONE

All of the following is written, committed, and (where noted) verified.

### Configuration layer — done
- `portal.config.ts` — the single file edited per deployment. Brand, theme
  tokens, feature flags, phase vocabulary, file categories, handoff checklist,
  welcome/FAQ/process copy, custom links.
- `lib/config/types.ts` — its shape, heavily commented with the config-vs-data
  rule.
- `lib/config/index.ts` — accessors, `isFeatureEnabled`, `themeCssVariables`,
  and `validateConfig` (duplicate keys, missing alt text, contrast failures).
- `lib/config/contrast.ts` — WCAG maths used by the validator.
- `lib/config/env.ts` — environment inspection, `stripeMode()`, `isDemoMode()`,
  `appUrl()`.
- `instrumentation.ts` — prints every environment and config problem at boot.

**Verified:** all 15 required theme contrast pairs pass AA (checked numerically).

### Database — done and verified against real PostgreSQL 16
Four ordered migrations in `supabase/migrations/`:

| File | Contains |
|---|---|
| `0001_portal_foundation.sql` | `users`, `clients`, `projects`, `project_members`, `updated_at` trigger |
| `0002_portal_modules.sql` | phases, files, file_requests, messages, message_reads, approvals, approval_events, decisions, activity, handoff_items, time_entries, portal_tour_state |
| `0003_billing_and_handoff_gate.sql` | invoices, care_plans, **the payment gate trigger**, stripe_events |
| `0004_portal_rls.sql` | `private.*` helpers, every policy, every grant, storage bucket + policies |

**Two security test suites, 54 assertions, all passing:**
- `supabase/tests/01_client_isolation.sql`
- `supabase/tests/02_handoff_gate.sql`
- `supabase/tests/00_local_shim.sql` — a stand-in for the Supabase-provided bits
  (`auth.users`, `auth.uid()`, `storage.*`, the three roles) so the tests run on
  plain PostgreSQL with no cloud project.

Run them:

```bash
# start a scratch postgres however you like, then:
PGHOST=/tmp PGPORT=5433 PGUSER=postgres bash scripts/run-sql-tests.sh

# or against a real Supabase project (skips the shim):
SKIP_SHIM=1 DATABASE_URL="$SUPABASE_DB_URL" bash scripts/run-sql-tests.sh
```

### Auth / REST — done
- `lib/supabase/url.ts` — the `/rest/v1` suffix normaliser (ported near-verbatim;
  see landmines).
- `lib/supabase/rest.ts` — `PortalRestError` (carries HTTP status), `adminRest`
  (bypasses RLS, privileged), `userRest` (RLS applies), `storageUserRequest`.
- `lib/supabase/session.ts` — magic link, httpOnly cookie session, refresh path,
  `getPortalSession`, `getAdminSession`, `ensurePortalUser`,
  `bootstrapAdminIfNeeded`.

### Stripe — done
- `lib/stripe/client.ts` — mode-matched key guard, form encoding, `stripeRequest`.
- `lib/stripe/money.ts` — `splitTotal` (odd cents to the deposit), `formatMoney`.
- `lib/stripe/signature.ts` — HMAC verification, extracted so it is testable.
- `lib/stripe/invoicing.ts` — deposit/final issue, care plan start/cancel. Amounts
  come from `projects.agreed_total`, read server-side.
- `lib/stripe/events.ts` — claim/close/release + the state-change handlers.
- `app/api/stripe/webhook/route.ts` — the thin route.

### Portal data layer — done
- `lib/portal/types.ts` — the `PortalView` view model everything renders from.
- `lib/portal/loader.ts` — assembles it, all via `userRest`, skipping disabled
  modules entirely.
- `lib/portal/attention.ts` — the one list that drives both the overview panel
  and the nav badges.
- `lib/portal/navigation.ts`, `lib/portal/page.ts` (route guard),
  `lib/portal/format.ts`, `lib/portal/tour.ts`.
- `lib/demo/dataset.ts` — Cedar Path Behavioral. The only place demo content
  exists.

### Client UI — done
`components/portal/`: `PortalShell`, `PortalNavigation` (desktop + mobile bottom
bar + More sheet), `PortalTour`, `Primitives`, `Overview`, `ProjectSection`,
`FilesSection`, `ApprovalsSection`, `MessagesSection`, `InvoicesSection`,
`HandoffSection`, `HelpSection`.

Routes: `app/portal/{,project,files,approvals,messages,invoices,handoff,help}/page.tsx`,
plus `app/portal/SignIn.tsx`.

### API routes — PARTIALLY done
Done: `app/api/portal/auth/{request-link,session,sign-out}/route.ts`,
`app/api/stripe/webhook/route.ts`.

---

## 2. What is NOT done — pick up here

In priority order. Nothing below has been started unless stated.

### 2a. Remaining client API routes — REQUIRED, the UI calls these
The components are written and already `fetch()` these endpoints. Until they
exist the portal renders but its interactions 404.

| Route | Method | Called by | Must do |
|---|---|---|---|
| `app/api/portal/files/route.ts` | POST | `FilesSection.upload` | Session; verify project access via `userRest` **before** uploading; store at `<project_id>/<uuid>-<safe name>`; insert row; strip `storage_path` from the response; delete the object if the metadata insert fails. **Port from `stringhamwebdesign` `app/api/portal/files/route.ts` — it does all of this already.** |
| `app/api/portal/files/route.ts` | GET | `FilesSection.download` | Session; read the row under the user's token; mint a **60-second** signed URL; return `{url, filename}`. Same source file. |
| `app/api/portal/messages/route.ts` | POST | `MessagesSection.send` | Session; insert via `userRest` with `sender_id = session.profile.id`, `kind: 'message'`. RLS enforces both — do not re-implement in JS. Return the shaped `PortalMessage`. |
| `app/api/portal/messages/read/route.ts` | POST | `MessagesSection` effect | Session; upsert `message_reads` rows for the given ids, `user_id = session.profile.id`. |
| `app/api/portal/approvals/route.ts` | POST | `ApprovalsSection.decide` | Session; **two writes**: update `approvals` status/`decided_at`/`decided_by`, and insert an `approval_events` row with `actor_id = auth.uid()`. Both via `userRest`. Return the reshaped `PortalApproval` including refreshed history. |
| `app/api/portal/tour/route.ts` | POST | `PortalTour.persist` | Session; upsert `portal_tour_state` for `user_id = session.profile.id`. Body is `{action: 'complete'\|'dismiss'\|'replay', step?, version}`. `complete` sets `completed_at`; `dismiss` sets `dismissed_at`; `replay` clears both and increments `replay_count`. **Must never 500 into the UI** — the component swallows failures, keep it that way. |

### 2b. Admin API routes — REQUIRED to operate a portal
None written. All must call `getAdminSession()` and 403 on null. Suggested paths
under `app/api/admin/`: `clients`, `projects`, `invite`, `approvals`,
`decisions`, `file-requests`, `handoff`, `invoices`, `care-plan`.

- `invite` — port from `stringhamwebdesign` `app/api/portal/admin/invite/route.ts`,
  but **drop its hardcoded `PORTAL_URL`** and use `appUrl()`. Must create the
  client, project, `project_members` row, seed `handoff_items` from
  `portalConfig.handoffChecklist`, then `ensurePortalUser` + `sendPortalMagicLink`.
- `invoices` — thin wrapper over `issueProjectInvoice(projectId, kind)`. **Must
  not accept an amount.**
- `care-plan` — POST `startCarePlan`, DELETE `cancelCarePlan`.
- `handoff` — updates `handoff_items`; when marking ownership transferred on the
  project, let the database trigger reject it and surface the error message
  rather than pre-checking only in JS.

### 2c. Admin UI — REQUIRED
None written. Deliberately minimal: a project list and one per-project operate
screen covering phase/next action/focus, approvals, decisions, file requests,
handoff items, invoice issue buttons, care plan toggle. Do **not** rebuild a
business-management platform — the client experience is the deliverable.

### 2d. TypeScript tests — NOT written
`package.json` already has `"test": "node --test --experimental-strip-types tests/*.test.ts"`.
The `tests/` directory exists but is **empty**. Write:
- `money.test.ts` — `splitTotal` sums exactly, deposit-heavy by at most 1c.
- `stripe.test.ts` — mode guard both directions, `rk_`/`pk_` refused, form encoding.
- `signature.test.ts` — valid, tampered payload, wrong secret, stale timestamp,
  future timestamp, multiple v1 signatures.
- `config.test.ts` — `validateConfig()` returns no problems for the shipped
  config; contrast pairs pass.
- `tour.test.ts` — `shouldAutoOpen` true on first visit, false after dismiss,
  false after complete, true after a version bump; `tourSteps` drops disabled
  sections.
- `attention.test.ts` — draft invoices excluded, own messages excluded, `now`
  sorts before `soon`, `resolveNextAction` prefers the explicit sentence.

### 2e. Webhook harness — NOT written
Port `scripts/stripe-webhook-check.js` and `scripts/stripe-webhook-stub.js` from
`stringhamwebdesign`. **Keep the `__down` outage mode** — five of its checks
prove that an unreachable datastore returns 500 (so Stripe retries) rather than
200. `package.json` already references `scripts/webhook-check.mjs`.

### 2f. Documentation — NOT written
`docs/` exists but is **empty**. Required: `SETUP.md`, `NEW_CLIENT.md`,
`ARCHITECTURE.md`, `SECURITY.md`, `STRIPE_SETUP.md`, `SUPABASE_SETUP.md`,
`CUSTOMIZING.md`. A `README.md` for the repo root is also missing.

`NEW_CLIENT.md` should be a flat 10-step checklist (clone → Supabase project →
env → migrations → branding → deploy → create client → create project → invite →
verify).

### 2g. Verification — NOT run
`npm run typecheck` and `npm run build` have **never been run**. Dependencies are
installed (`npm install` completed). Expect real errors; at least one is known:

- `lib/portal/loader.ts`, the `carePlan` object — the `status` cast is written as
  `PortalView["carePlan"] extends null ? never : "inactive"`, which is wrong and
  will not compile cleanly. Replace with a plain
  `as PortalCarePlan["status"]` and import the type.

---

## 3. Deliberate decisions — do not "fix" these

1. **`STRIPE_MODE` replaced the test-only key guard.** The reference throws on
   anything that is not `sk_test_`. That is right for a sandbox and wrong for a
   template that must reach production. Here the mode is declared and the key
   prefix must match it, failing loudly in **both** directions. Defaulting to
   `test` means a deployment that configures nothing cannot take real money.

2. **Access resolves through `project_members`, not `clients.user_id`.** The
   reference allows exactly one login per client. Membership is its own table so
   a client can add their marketing manager without a schema change.

3. **`approval_events` is append-only.** No update or delete policy, no such
   grant. An approval record the client cannot rely on is worse than none.

4. **The handoff gate lives in the database.** `HandoffSection.tsx` shows a
   friendly message; the trigger is what enforces it. Never move the check into
   the UI only.

5. **Demo mode swaps the data source at the loader boundary.** Components never
   branch on it. This is why `lib/demo/dataset.ts` is the only file with demo
   content.

6. **The tour is a centred dialog, not anchored tooltips.** Tooltips break when
   the target is off-screen, in a scroll container, or moved to a bottom bar on a
   phone — all of which happen here.

7. **`create_user: false` on the magic link.** Without it anyone who can reach
   the sign-in form could mint an auth account by typing an address.

8. **The sign-in response is identical for known and unknown addresses.** Saying
   "no account with that email" turns the endpoint into a client-list oracle.

9. **Phase keys are free text, not an enum.** The phase vocabulary is a
   per-deployment config decision; an enum would need a migration to rename one.

10. **Migrations are a clean 4-file baseline**, not the reference's 8-file
    history. This repo has no production database, so consolidation was safe —
    and was explicitly authorised.

---

## 4. Landmines

- **`SUPABASE_URL` must be the bare project URL.** A `/rest/v1` suffix builds
  `/rest/v1/rest/v1/...` and PostgREST rejects **every** request with PGRST125.
  In the reference this cost most of a working day and was invisible: the webhook
  answered 200 throughout. `lib/supabase/url.ts` corrects it in memory and
  `instrumentation.ts` shouts at boot — fix the env value anyway.

- **A green stub harness means the branching is right, not that the integration
  works.** In the reference, 22/22 checks passed while every database write was
  failing. When a stub is the only evidence, the untested surface is exactly the
  boundary the stub replaces.

- **Never collapse "duplicate" and "datastore unavailable" in `claimEvent`.**
  A 200 tells Stripe the event is settled and stops redelivery, so an outage
  reported as a duplicate **drops payments silently**. Only PostgREST 409 is a
  duplicate.

- **Cookies are `Secure` in production**, so the sign-in flow will not complete
  over plain HTTP. Test with `npm run dev`, not `npm run start`.

- **RLS `UPDATE` denial has two shapes.** No grant → `insufficient_privilege`
  error. Grant present but RLS filters the row → statement succeeds, **zero rows
  affected**. Both are correct; the isolation test has separate helpers for them
  and conflating the two produces a test that fails against a secure database.
  This is documented in the test file and was found by running it.

- **`next dev` on Next 16 regenerates `AGENTS.md`/`CLAUDE.md`.** If they appear
  as uncommitted changes, that is why.

---

## 5. Commands

```bash
npm install
npm run dev          # use this to test sign-in (cookie is Secure in prod)
npm run typecheck    # never yet run — expect errors
npm run build        # never yet run
npm run test         # tests/ is empty; write them
bash scripts/run-sql-tests.sh   # 54 assertions, currently all passing
```

Local PostgreSQL for the SQL tests (this environment has 16 available):

```bash
export PATH=/usr/lib/postgresql/16/bin:$PATH
useradd -m pguser 2>/dev/null
su pguser -c "PATH=/usr/lib/postgresql/16/bin:\$PATH initdb -D /home/pguser/pgdata -U postgres --auth=trust"
su pguser -c "PATH=/usr/lib/postgresql/16/bin:\$PATH pg_ctl -D /home/pguser/pgdata -o '-p 5433 -k /tmp' -l /home/pguser/pgdata/log start"
PGHOST=/tmp PGPORT=5433 PGUSER=postgres bash scripts/run-sql-tests.sh
```

---

## 6. The definition of done

A real client receives their sign-in link, enters the portal for the first time,
understands it through the walkthrough, sees their project clearly, completes
their required actions, and can replay the walkthrough later without being
taught the interface.

Getting there from here means finishing §2a–2g, in that order.
