# Security

This portal contains project files, billing status, approvals and client communication. Security is a product requirement, not an implementation detail.

## Trust boundaries

### Browser

Treat all browser input as untrusted.

The browser may provide identifiers, text and requested actions. It does **not** decide:

- who the current user is
- whether that user can access a project
- the amount of an invoice
- whether ownership transfer is allowed
- whether a Stripe webhook is genuine

### Client-authenticated server requests

Client actions must resolve a valid `getPortalSession()` and use the user's Supabase access token where practical.

`userRest` intentionally allows RLS to be the final authorization layer.

### Admin server requests

`adminRest` bypasses RLS because it uses the Supabase secret/service key. Any route that uses it on behalf of the operator must first call `getAdminSession()` and reject a null/non-admin result.

Never expose `adminRest`, the Supabase secret key or an equivalent privileged token to client components.

### Stripe webhook

The webhook has no user session. Its authority comes from successful raw-body Stripe signature verification.

## RLS model

The central authorization relationship is:

```text
public.users -> project_members -> projects
```

The private helper `private.portal_can_access_project(project_id)` is the single project-access definition used by project-scoped policies.

The helpers live in the `private` schema so they are not exposed as normal public PostgREST RPCs.

### Explicit grants matter too

RLS filters rows; PostgreSQL grants decide whether an operation is available at all.

Clients normally get read access plus only the narrow writes the product requires:

- upload/delete their own file
- send a normal message as themselves
- write their own message-read state
- decide an approval and append their own approval event
- write their own walkthrough state

Admin operational writes use trusted server routes.

## Cross-client isolation

A client must not be able to read or alter another project's:

- project record
- members
- files/file requests
- messages
- approvals/history
- decisions
- activity
- invoices
- care plans
- handoff items
- time entries

The SQL tests in `supabase/tests/01_client_isolation.sql` exercise this boundary against PostgreSQL.

When adding a table, adding the table without also adding RLS, policy tests and explicit grants is incomplete work.

## Files

The `portal-files` Storage bucket is private.

Object names must follow:

```text
<project_uuid>/<random_uuid>-<safe_filename>
```

Storage RLS extracts the first path segment and checks project membership.

Downloads are not permanent/public links. The application first reads the file metadata under the caller's user token and then mints a short-lived signed URL.

Do not store project assets in a public bucket for convenience.

## Messages

Clients may only insert:

- `sender_id = auth.uid()`
- `kind = 'message'`
- a project they can access

System messages are server-authored. A client must never be able to impersonate automation or the studio by writing `kind='system'`.

## Approvals

`approvals` is the current-state summary.

`approval_events` is the permanent history and is intentionally append-only to clients. Do not add client update/delete access to approval events.

A changes-requested round followed by approval should preserve both events.

## Billing

The browser never supplies an invoice amount.

`issueProjectInvoice(projectId, kind)` loads the trusted `projects.agreed_total` and performs the split server-side.

If a route starts accepting an `amount` field for project deposit/final invoices, stop and redesign it.

## Payment-before-transfer gate

The hard ownership-transfer invariant lives in PostgreSQL through `projects_payment_before_transfer`.

An application-level check is useful for a friendly message but is not security. Code gets refactored; the trigger remains the backstop even for hand-written SQL/PostgREST mistakes.

Do not weaken or remove the trigger merely to make an admin UI action succeed.

## Stripe webhook safety

Required behavior:

1. read the raw request body
2. verify Stripe HMAC + timestamp tolerance
3. claim `event_id` before any state change
4. treat a primary-key duplicate as settled/idempotent
5. treat an unavailable event store as a failure so Stripe retries
6. if processing fails after claim, release the claim before returning non-2xx

The dangerous bug to avoid is collapsing **duplicate** and **datastore unavailable** into the same `200` response. That can silently drop payment events during an outage.

## Secrets

Never commit or render:

- `SUPABASE_SECRET_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- auth access/refresh tokens
- client passwords/recovery codes
- provider API keys

Handoff notes are for operational status only, e.g. “domain transfer invite sent.” Use the provider's own ownership-transfer mechanism rather than sharing credentials through the portal.

## Authentication details that are deliberate

- Magic-link sign-in uses `create_user: false` for normal public requests.
- Access/refresh tokens are stored in httpOnly cookies.
- Cookies are Secure in production and therefore local sign-in should be tested with `npm run dev`, not a plain-HTTP production server.
- Known and unknown sign-in addresses receive the same public response to avoid turning the endpoint into a client-directory oracle.
- There is no hardcoded admin email; `PORTAL_ADMIN_EMAIL` is deployment configuration.

## Security review checklist

Before production:

- SQL isolation suite passes
- handoff-gate suite passes
- client A/B manual isolation test passes
- no service key in client bundles/network responses
- private file download expires
- approval history cannot be edited by client
- invoice route accepts no amount
- webhook outage returns non-2xx
- ownership transfer fails before final payment
- secrets scan contains no real credentials