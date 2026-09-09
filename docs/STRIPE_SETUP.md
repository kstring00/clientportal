# Stripe Setup

The portal uses **Stripe Invoicing**, not Checkout, for project work.

A custom web project has an agreed scope and total. The server raises a 50% deposit invoice and a 50% final invoice from that trusted project total.

## Environment

Start in test mode:

```text
STRIPE_MODE=test
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

`STRIPE_MODE` and the secret-key prefix must match. A live key in test mode and a test key in live mode both fail loudly. Publishable (`pk_`) and restricted (`rk_`) keys are not accepted as the server secret.

For the optional care plan:

```text
STRIPE_CARE_PRICE_ID=price_...
```

Care plan billing is intentionally separate from the project build balance.

## Project invoice rule

Before issuing either invoice, set the project's `agreed_total` through the admin/operator screen.

The route accepts:

```text
projectId
kind = deposit | final
```

It does **not** accept an amount.

`lib/stripe/invoicing.ts` reads `projects.agreed_total` server-side and splits it. If the total contains an odd cent, the extra cent goes on the deposit so the final invoice is never larger because of rounding.

## Stripe customer/invoice flow

For a deposit/final invoice the server:

1. loads the project and billing contact from Supabase
2. finds or creates a Stripe customer
3. creates a draft invoice
4. attaches the derived line item
5. finalizes the invoice
6. sends the invoice
7. stores the Stripe invoice/customer ids, hosted URL, amount and due date locally

Stable Stripe idempotency keys are used for creation/finalize/send operations, and the database also allows only one deposit and one final row per project.

## Webhook

Point the Stripe webhook endpoint to:

```text
https://YOUR_PORTAL_DOMAIN/api/stripe/webhook
```

Relevant event types:

- `invoice.paid`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `invoice.marked_uncollectible`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

The endpoint verifies the raw request body, HMAC and timestamp before doing anything.

## Event idempotency and outages

`stripe_events.event_id` is the claim key.

- successful first claim → process event
- duplicate primary key / PostgREST 409 → return success as a duplicate
- any other claim failure → return non-2xx so Stripe retries

Do not simplify this into a boolean `claimed` result. A duplicate and an unreachable datastore have opposite retry requirements.

If a handler throws after claiming the event, the code releases the claim before returning a failure. Otherwise the retry would be swallowed as a duplicate.

## Payment effects

### Deposit paid

- local invoice → `paid`
- `paid_at` set
- project `started_at` set
- activity may record that work is underway
- **does not** set final-payment clearance

### Final paid

- local invoice → `paid`
- `paid_at` set
- project `final_payment_cleared_at` set
- ownership transfer becomes eligible

The webhook does not itself transfer ownership.

### Failed payment

Invoice becomes `past_due`. It does not open the handoff gate.

### Care plan

Subscription status maps to the care-plan record. Cancel-at-period-end becomes `cancelling` until Stripe confirms deletion/end of service.

Care-plan status must never be consulted to decide whether the website build is paid.

## Local webhook harness

The harness verifies webhook branching without using a real Stripe/Supabase environment.

Terminal 1 — start the PostgREST-shaped stub:

```bash
npm run webhook:stub
```

Terminal 2 — start Next in development with the webhook pointed at the stub. Example environment:

```bash
SUPABASE_URL=http://127.0.0.1:4000 \
SUPABASE_SECRET_KEY=sb_secret_local_stub \
STRIPE_WEBHOOK_SECRET=whsec_testsecret \
PORTAL_DEMO_MODE=true \
npm run dev
```

Terminal 3:

```bash
npm run test:webhook
```

The harness covers signature failures, final/deposit state changes, duplicate delivery, care-plan mapping, ignored events, datastore outage and retry-after-recovery.

**A green harness is not a real integration test.** It replaces the datastore boundary and therefore cannot prove the real Supabase permissions, URL, credentials or schema work.

## Real test-mode lifecycle

Before switching to live mode, perform this exact sequence against a real Supabase project and Stripe test account:

1. create a test client/project with a known agreed total
2. issue the deposit through `/admin`
3. pay the hosted test invoice
4. verify the webhook event is recorded
5. verify the invoice is paid and `started_at` is set
6. verify `final_payment_cleared_at` is still null
7. attempt ownership transfer and confirm the database rejects it
8. issue and pay the final invoice
9. verify `final_payment_cleared_at` is set
10. record ownership transfer and confirm it succeeds
11. redeliver a Stripe event and confirm no duplicate state change occurs
12. inspect database rows, not just HTTP 200 responses

If care plans are enabled, also start a test subscription and cancel it at period end, confirming the build balance/handoff state does not change.

## Going live

Only after the real test-mode lifecycle passes:

1. set `STRIPE_MODE=live`
2. replace the Stripe secret with the matching `sk_live_...` key
3. create/configure the live webhook endpoint and use its live signing secret
4. configure a live care-plan price if that module is enabled
5. run a low-risk production verification before relying on it for a client

Never paste a live key into a test-mode deployment “just to see if it works”; the mode guard is intended to stop exactly that.