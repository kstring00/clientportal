# Architecture

## Product boundary

This repository is the reusable **client portal product**. It deliberately does not include a marketing site, portfolio, case studies or public pricing pages.

One deployment serves one studio and many client projects.

```text
studio deployment
├── admin/operator account
├── client A
│   └── project A
├── client B
│   ├── project B1
│   └── project B2
└── client C
    └── project C
```

Access is not inferred from the client record. `project_members` is the authorization edge, so one project can safely have an owner plus collaborators.

## Layers

### 1. Deployment configuration

`portal.config.ts`

Controls studio-level behavior:

- brand
- theme tokens
- enabled features
- phase vocabulary
- file categories
- default handoff checklist
- walkthrough/help copy

`lib/config/` validates and exposes the configuration.

Project facts do **not** belong here.

### 2. Database

`supabase/migrations/`

- `0001_portal_foundation.sql` — users, clients, projects, membership
- `0002_portal_modules.sql` — phases, files, messages, approvals, decisions, activity, handoff, time log, walkthrough state
- `0003_billing_and_handoff_gate.sql` — invoices, care plans, Stripe event claims, final-payment/ownership trigger
- `0004_portal_rls.sql` — private authorization helpers, RLS, grants and Storage policies

The migrations are a clean baseline for a fresh Supabase project rather than a historical migration dump.

### 3. Authentication/session

`lib/supabase/session.ts`

Supabase Auth provides magic-link identity. Access and refresh tokens are exchanged into httpOnly cookies; normal page code never reads a browser-stored Supabase token.

`getPortalSession()` is the client/session gate.

`getAdminSession()` adds the operator-role requirement.

### 4. Data access

`lib/supabase/rest.ts`

Two intentionally different paths:

- `userRest` sends the signed-in user's token; RLS applies
- `adminRest` sends the server secret key; RLS is bypassassed and therefore requires prior admin/webhook authorization

Default to `userRest` whenever the action is being performed by a client on their own behalf.

### 5. Client view model

`lib/portal/loader.ts`

Builds one `PortalView` used by the client pages. Components do not fetch their initial data independently.

Important properties:

- client loading uses `userRest`, never `adminRest`
- disabled modules are not queried
- demo mode swaps the data source at the loader boundary
- one attention list feeds both Overview and navigation badges

### 6. Client UI

`components/portal/`

The shell owns shared branding/navigation/walkthrough. Section components render the view model and call narrowly scoped mutation routes for actions such as upload, message, approval and tour persistence.

The portal is deliberately not a chat/PM suite. Its core questions are:

1. What is happening?
2. What do I need to do?
3. What happens next?

### 7. Admin/operator UI

`app/admin/` + `components/admin/`

This is a small operations surface, not a CRM. It lets the studio provision a project and perform the actions that drive the client portal:

- update project state
- request files/approvals
- record decisions
- issue invoices
- manage care plan
- manage handoff

Admin writes go through `app/api/admin/*` routes that first require `getAdminSession()`.

### 8. Stripe

`lib/stripe/`

The application talks directly to Stripe's form-encoded REST API.

`invoicing.ts` is the trusted billing boundary. It reads `projects.agreed_total` from the database and computes the 50/50 split; callers do not pass an amount.

The webhook is intentionally thin. Signature verification and state-change logic are separated into testable modules.

### 9. Handoff protection

The application UI may explain whether handoff is available, but PostgreSQL is the authority.

`projects_payment_before_transfer` rejects:

- an ownership transfer with no final payment clearance
- an ownership-transfer timestamp earlier than final payment clearance
- clearing/reversing final-payment state after ownership transfer where the trigger's invariant would be broken

Do not move this protection to frontend code only.

## Key data relationships

```text
auth.users
    │ 1:1
public.users
    │
    └── project_members ── projects ── clients
                              │
                              ├── files / file_requests
                              ├── messages / message_reads
                              ├── approvals / approval_events
                              ├── project_decisions
                              ├── project_activity
                              ├── handoff_items
                              ├── time_entries
                              ├── invoices
                              └── care_plans
```

`portal_tour_state` belongs to the user rather than a project because a person learns the interface once.

## Demo mode

`lib/demo/dataset.ts` produces the same `PortalView` shape as the real loader.

Components therefore do not contain demo-specific data branches. Mutating client components explicitly disable actions while demo mode is active.

## Feature flags

`portal.config.ts` can disable modules such as files/messages/care plan/time log.

A disabled module should disappear from:

- navigation
- walkthrough steps
- client queries
- client UI

Its database table remains so re-enabling the feature does not require a migration.

## Adding a reusable module

A new module normally requires all of these:

1. schema migration/table(s)
2. RLS + explicit grants
3. client view-model types
4. loader query gated by the feature flag
5. client component/page/navigation entry
6. mutation API routes if needed
7. admin/operator controls if needed
8. tests for cross-project isolation
9. walkthrough/help update if the client needs to understand it
10. docs/config update

Skipping the RLS/grant step is not an acceptable shortcut.