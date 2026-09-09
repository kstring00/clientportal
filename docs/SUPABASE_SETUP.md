# Supabase Setup

The repository contains a complete baseline for a **fresh Supabase project**. It does not depend on the Supabase instance used by `stringhamwebdesign`.

## Create the project

Create a new Supabase project and keep its production credentials outside the repository.

For the application environment you need:

- `SUPABASE_URL` — the bare project origin, e.g. `https://abc.supabase.co`
- `SUPABASE_SECRET_KEY` — secret/service-role credential used only by server code

Do not set `SUPABASE_URL` to a URL ending in `/rest/v1`. The application normalizes that mistake defensively and warns at boot, but the environment should still be corrected.

## Apply migrations

Run these in order against the fresh database:

```text
supabase/migrations/0001_portal_foundation.sql
supabase/migrations/0002_portal_modules.sql
supabase/migrations/0003_billing_and_handoff_gate.sql
supabase/migrations/0004_portal_rls.sql
```

### What they create

`0001`
- portal profile mirror of `auth.users`
- clients
- projects
- project membership

`0002`
- project phases
- files + requested files
- messages + per-user read state
- approvals + append-only approval history
- decision log
- activity feed
- handoff checklist state
- optional time log
- per-user walkthrough state

`0003`
- invoices
- care plans
- Stripe event idempotency store
- final-payment/ownership-transfer fields
- the `projects_payment_before_transfer` database trigger

`0004`
- private authorization helpers
- RLS policies
- explicit grants
- private `portal-files` Storage bucket
- Storage RLS policies

## Auth configuration

The portal uses Supabase magic-link authentication.

Add the portal origins/redirect paths to the Auth URL configuration for local and production environments.

Normal sign-in requests set `create_user: false`. A client account should therefore be created by the server-side invitation/provisioning flow, not by typing an arbitrary email into the public sign-in screen.

## Storage

Migration `0004` creates/updates a private bucket named:

```text
portal-files
```

The path contract is load-bearing:

```text
<project_uuid>/<random_uuid>-<filename>
```

Storage policies use the first path segment as the project id and call the same private project-access helper used by table RLS.

Do not change this path scheme without changing and testing the Storage policies at the same time.

## Run the SQL security tests

The repository includes:

- `supabase/tests/00_local_shim.sql`
- `supabase/tests/01_client_isolation.sql`
- `supabase/tests/02_handoff_gate.sql`

The shim lets the suites run on a plain local PostgreSQL 16 instance by providing minimal stand-ins for Supabase-specific auth/storage objects.

Example local invocation:

```bash
PGHOST=/tmp PGPORT=5433 PGUSER=postgres bash scripts/run-sql-tests.sh
```

Against an actual Supabase PostgreSQL connection:

```bash
SKIP_SHIM=1 DATABASE_URL="$SUPABASE_DB_URL" bash scripts/run-sql-tests.sh
```

Use the direct database connection string only for trusted local/operator testing; do not expose it to browser code.

## What the tests are supposed to prove

### Client isolation

Client A cannot read/write Client B project data across the project-scoped tables. The suite also checks high-value privilege boundaries such as:

- role self-promotion
- invoice tampering
- fake system messages
- rewriting approval history

### Handoff gate

The database must reject:

- ownership transfer before final payment clearance
- a transfer timestamp earlier than the payment-clearance timestamp
- changes that would leave an already-transferred project with no valid final-payment clearance

A valid paid-then-transfer sequence must succeed.

## RLS update behavior note

An RLS-filtered `UPDATE` does not always throw an error. With the operation grant present, PostgreSQL/PostgREST may accept the statement and simply affect **zero rows**.

Tests must distinguish:

- grant-level denial → privilege error
- RLS-filtered denial → zero affected rows

Do not weaken a policy just because a test incorrectly expected an exception.

## Production verification

After migrations are applied, verify with two real test users/projects:

1. invite Client A to Project A
2. invite Client B to Project B
3. authenticate separately as each
4. confirm each can read/write only the permitted project resources
5. attempt direct cross-project API requests, not only navigation through the UI
6. confirm Storage upload/download isolation too

A rendered UI is not evidence that RLS is correct.