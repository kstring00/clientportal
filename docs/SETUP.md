# Setup

Use this guide for the **first deployment of the portal product**. After the studio deployment exists, adding another client normally does not require another code deployment; use `NEW_CLIENT.md`.

## 1. Requirements

- Node.js 22+
- npm
- a Supabase project
- a Stripe account if project invoicing is enabled
- a deployment target such as Vercel
- a domain/subdomain for the portal, e.g. `portal.example.com`

## 2. Install

```bash
npm ci
cp .env.example .env.local
```

Do not commit `.env.local` or any secret values.

## 3. Configure the studio

Edit `portal.config.ts`.

This file is for **deployment-level** choices:

- studio name/logo/support email
- colors
- enabled modules
- project phase vocabulary
- file categories
- default handoff checklist
- walkthrough/help copy

Do not put a client's current phase, amount, next action or project-specific copy in this file. Those are database records.

Run:

```bash
npm test
```

The config tests catch duplicate keys and accessibility contrast regressions.

## 4. Provision Supabase

Follow `SUPABASE_SETUP.md`.

Apply the migrations in order:

1. `0001_portal_foundation.sql`
2. `0002_portal_modules.sql`
3. `0003_billing_and_handoff_gate.sql`
4. `0004_portal_rls.sql`
5. `0005_message_read_isolation.sql`

The result is a complete blank portal database, including the private `portal-files` Storage bucket and RLS policies.

## 5. Environment variables

Use `.env.example` as the canonical list.

At minimum for a real portal:

- `APP_URL`
- `SUPABASE_URL` — the bare project URL, not a `/rest/v1` URL
- `SUPABASE_SECRET_KEY`
- `PORTAL_ADMIN_EMAIL`

For Stripe:

- `STRIPE_MODE=test` while validating
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_CARE_PRICE_ID` only when care plans are enabled

The server performs a startup check and warns about unsafe or incomplete configuration. `STRIPE_MODE` defaults to `test` so an unconfigured deployment cannot accidentally take live money.

## 6. Configure Supabase Auth

Set the portal's production origin in Supabase Auth redirect settings. Magic-link redirects return to the portal's `/portal` flow.

The application deliberately uses `create_user: false` when requesting normal sign-in links. A person must be provisioned/invited before the public sign-in form can send them a link.

## 7. Bootstrap the operator account

Set `PORTAL_ADMIN_EMAIL` to the studio operator's email **before the first admin sign-in**.

The portal has no hardcoded admin email. The configured address is promoted through the server-side bootstrap path; other addresses are never auto-promoted.

## 8. Configure Stripe

Follow `STRIPE_SETUP.md` and stay in test mode until the full lifecycle has passed.

Do not switch to live mode merely because the UI loads.

## 9. Verify locally

```bash
npm run typecheck
npm test
npm run build
```

If you want to exercise the webhook branch logic without a real Supabase database, use the local webhook harness described in `STRIPE_SETUP.md`.

For the real security boundary, also run the SQL suites in `supabase/tests/` as described in `SUPABASE_SETUP.md`.

## 10. Deploy

Add the same environment variables to the deployment environment and deploy.

Before inviting a real client, verify:

- admin magic-link sign-in
- `/admin` is restricted to admin
- a test client can sign in
- a test client cannot access another test project's rows
- upload and signed download work
- approval decision persists and keeps history
- walkthrough appears, can be skipped, and can be replayed
- Stripe test deposit updates the invoice/project
- Stripe test final payment sets `final_payment_cleared_at`
- ownership transfer is rejected before final payment and accepted after it

## 11. Create the first client

Go to `/admin` and use **New client portal**, or follow `NEW_CLIENT.md`.

## Production-readiness rule

A successful TypeScript build is not evidence that Supabase or Stripe is wired correctly. The reference implementation once had every stub test green while real database writes were failing. Always perform at least one real test-mode invoice lifecycle against the deployed environment before taking live payments.