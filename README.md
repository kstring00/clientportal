# Client Portal Template

A reusable premium client portal for web-design projects. One deployment can serve many clients and projects while keeping each client's data isolated through Supabase Row Level Security.

The template was extracted and generalized from the proven portal/payment architecture in `kstring00/stringhamwebdesign`. It is intentionally a **portal product**, not a marketing site.

## What it includes

### Client experience

- Overview with current phase, current focus, next action, milestones and attention items
- Project scope, phase timeline and decision history
- Private project files with requested-file tracking
- Structured approvals with permanent timestamped history
- Simple project messages and per-user read state
- Stripe invoice visibility and hosted payment links
- Optional care-plan status
- Handoff checklist and database-enforced payment-before-transfer rule
- First-login walkthrough that can always be replayed from Help
- Responsive, keyboard-accessible UI with reduced-motion support

### Operator experience

- Create a client + project and send the portal invite
- Update phase, status, focus, next action and milestones
- Request files and approvals
- Record project decisions
- Issue deposit/final invoices without accepting browser-supplied amounts
- Start/cancel care plans when enabled
- Manage handoff items and record ownership transfer

### Infrastructure

- Next.js 16, React 19, TypeScript, CSS Modules
- Supabase Auth magic links with httpOnly session cookies
- Fresh-project Supabase migrations and project-scoped RLS
- Private Supabase Storage bucket with signed downloads
- Stripe Invoicing with 50/50 project billing
- Idempotent Stripe webhook handling
- Database trigger preventing ownership transfer before final payment clears
- Demo dataset for sales/demo use without touching real data

## Start here

1. Read [`docs/SETUP.md`](docs/SETUP.md) for the first deployment.
2. Read [`docs/NEW_CLIENT.md`](docs/NEW_CLIENT.md) for every new client after that.
3. Edit [`portal.config.ts`](portal.config.ts) for studio-level branding, features, phases and copy.
4. Keep client/project facts in the database — do not hardcode them into components.

Additional documentation:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/SECURITY.md`](docs/SECURITY.md)
- [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md)
- [`docs/STRIPE_SETUP.md`](docs/STRIPE_SETUP.md)
- [`docs/CUSTOMIZING.md`](docs/CUSTOMIZING.md)

## Development

```bash
npm ci
npm run dev
```

Core verification:

```bash
npm run typecheck
npm test
npm run build
```

SQL security/handoff tests live in `supabase/tests/`. See `docs/SUPABASE_SETUP.md`.

The Stripe webhook harness is intentionally separate from the unit tests because it starts a PostgREST-shaped stub and a Next.js server. See `docs/STRIPE_SETUP.md`.

## Non-negotiable rules

- Client reads/writes use the caller's Supabase token so RLS applies.
- Server-only admin routes must call `getAdminSession()` before privileged writes.
- Invoice amounts come from `projects.agreed_total`, never request-body amounts.
- The final-payment handoff gate lives in PostgreSQL; frontend checks are only explanatory.
- Do not treat a Stripe-event-store outage as a duplicate delivery.
- Do not store passwords, API keys or recovery codes in handoff notes.
- Do not use public Storage URLs for project files.

See [`HANDOFF.md`](HANDOFF.md) before making architectural changes.