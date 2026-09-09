-- ============================================================================
-- 0003 — Invoices, care plans, Stripe event idempotency, and the rule that
--        ownership cannot transfer before the final payment clears.
--
-- The payment gate is enforced by a TRIGGER, not by application code. A bug in
-- a route handler, a hand-written PostgREST call, or an admin clicking the wrong
-- button must not be able to transfer ownership of a project that has not been
-- paid for. Application code may check first for a friendly message; the
-- database is the authority.
--
-- Do not weaken this trigger. If you think you need to, you almost certainly
-- want `not_applicable` on the handoff item instead.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Invoices
-- ----------------------------------------------------------------------------

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,

  -- Which half of the project this is. `care` is a subscription invoice and is
  -- deliberately never counted toward the project balance.
  kind text not null default 'other'
    check (kind in ('deposit', 'final', 'care', 'other')),

  -- Derived server-side from projects.agreed_total. Never from a request body.
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'usd',

  status text not null default 'draft'
    check (status in ('draft', 'open', 'paid', 'void', 'past_due')),

  stripe_invoice_id text unique,
  stripe_customer_id text,
  -- Stripe's hosted invoice page. This is what the client actually opens; the
  -- portal never collects card details itself.
  stripe_hosted_url text,

  issued_at timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- One deposit and one final per project, ever. Care and ad-hoc invoices are
-- unconstrained because a project can carry several over its life.
create unique index if not exists invoices_one_per_project_kind
  on public.invoices (project_id, kind)
  where kind in ('deposit', 'final');

create index if not exists invoices_project_idx on public.invoices (project_id, created_at desc);

comment on column public.invoices.amount is
  'Server-derived from projects.agreed_total. A browser-supplied amount must never reach this column.';

-- ----------------------------------------------------------------------------
-- Care plans
--
-- Separate from the project balance on purpose: a client can cancel care
-- without touching what is owed on the build, and an unpaid care plan must
-- never block handoff of a build that has been paid for.
-- ----------------------------------------------------------------------------

create table if not exists public.care_plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  status text not null default 'inactive'
    check (status in ('inactive', 'active', 'cancelling', 'past_due', 'cancelled')),
  stripe_subscription_id text unique,
  stripe_customer_id text,
  started_at timestamptz,
  cancel_at_period_end boolean not null default false,
  current_period_end timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.care_plans is
  'Recurring maintenance, billed separately. Care status must never affect whether the build itself counts as paid.';

drop trigger if exists care_plans_set_updated_at on public.care_plans;
create trigger care_plans_set_updated_at
  before update on public.care_plans
  for each row execute function public.portal_set_updated_at();

-- ----------------------------------------------------------------------------
-- The payment gate
-- ----------------------------------------------------------------------------

alter table public.projects
  add column if not exists final_payment_cleared_at timestamptz;

alter table public.projects
  add column if not exists ownership_transferred_at timestamptz;

comment on column public.projects.final_payment_cleared_at is
  'Set by the Stripe webhook when the final invoice is paid. Gates ownership transfer.';

comment on column public.projects.ownership_transferred_at is
  'When accounts (domain, hosting, repo, analytics) moved to the client. Cannot be set before final_payment_cleared_at.';

create or replace function public.enforce_payment_before_transfer()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Nothing to check until a transfer is actually being recorded.
  if new.ownership_transferred_at is null then
    return new;
  end if;

  if new.final_payment_cleared_at is null then
    raise exception
      'Ownership cannot transfer before the final payment clears (project %).',
      new.id
      using errcode = 'check_violation';
  end if;

  -- Without this second clause the rule is trivially bypassed by backdating the
  -- transfer to a moment before the payment landed.
  if new.ownership_transferred_at < new.final_payment_cleared_at then
    raise exception
      'Ownership transfer cannot predate the final payment (project %).',
      new.id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists projects_payment_before_transfer on public.projects;

create trigger projects_payment_before_transfer
  before insert or update on public.projects
  for each row
  execute function public.enforce_payment_before_transfer();

-- ----------------------------------------------------------------------------
-- Webhook idempotency
--
-- Stripe retries on any non-2xx and can deliver the same event more than once
-- even after a success. The webhook claims an event id here BEFORE any state
-- change; a duplicate hits the primary key, the insert is rejected, and the
-- handler answers 200 without applying the change twice.
--
-- The claim must distinguish a duplicate from an unreachable database. Treating
-- both as "already handled" answers 200, which tells Stripe the event is settled
-- and stops redelivery — so an outage silently DROPS payments instead of
-- deferring them. See lib/stripe/events.ts.
-- ----------------------------------------------------------------------------

create table if not exists public.stripe_events (
  event_id text primary key,
  type text not null,
  received_at timestamptz not null default now(),
  handled_at timestamptz,
  status text not null default 'received'
    check (status in ('received', 'handled', 'ignored', 'failed')),
  detail text
);

create index if not exists stripe_events_received_at_idx
  on public.stripe_events (received_at desc);

-- Nothing outside the service role has any business reading Stripe event
-- traffic. RLS on with no policies denies every anon and authenticated request;
-- the secret key used by the webhook bypasses it.
alter table public.stripe_events enable row level security;

revoke all on table public.stripe_events from anon, authenticated;
grant all on table public.stripe_events to service_role;
