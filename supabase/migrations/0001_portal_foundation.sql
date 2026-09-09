-- ============================================================================
-- 0001 — Foundation: identities, clients, projects, membership.
--
-- Run order matters. Apply 0001 → 0002 → 0003 → 0004 against a fresh Supabase
-- project. See docs/SUPABASE_SETUP.md.
--
-- Authentication itself stays in Supabase Auth. public.users mirrors auth.users
-- by id only, and carries the portal's own notion of role. Nothing here stores
-- a password, a token, or any account credential — see 0002 for why the handoff
-- tables deliberately hold no secrets either.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Identity
-- ----------------------------------------------------------------------------

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null check (role in ('admin', 'client')),
  name text not null,
  created_at timestamptz not null default now()
);

comment on table public.users is
  'Portal profile mirroring auth.users by id. Role is the portal''s own; it is never read from a JWT claim the client could influence.';

-- ----------------------------------------------------------------------------
-- Clients and projects
-- ----------------------------------------------------------------------------

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  contact_name text not null,
  contact_email text,
  phone text,
  notes text,
  invited_at timestamptz,
  invite_last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  slug text not null unique,

  -- Lifecycle, distinct from the phase below. A project can be `active` while
  -- sitting in any phase; `archived` hides it without deleting anything.
  status text not null default 'active'
    check (status in ('active', 'paused', 'complete', 'archived')),

  -- The current phase key. Matches a `key` in portal.config.ts `phases`, which
  -- is why it is free text and not an enum: the phase vocabulary is a per
  -- deployment configuration decision, and an enum would need a migration to
  -- change it. Unknown keys degrade gracefully in the UI.
  phase text,

  -- Plain-language answers to the three questions the portal exists to answer.
  -- Written by the admin, read straight onto the overview.
  summary text,
  scope_summary text,
  current_focus text,
  next_action text,
  next_action_due date,
  next_milestone text,
  next_milestone_at date,

  -- The agreed total. Invoice amounts are derived from THIS column server-side
  -- and never from anything the browser sends. See lib/stripe/invoicing.ts.
  agreed_total numeric(12,2) check (agreed_total is null or agreed_total >= 0),

  started_at timestamptz,
  launched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.projects.agreed_total is
  'The full agreed price. The deposit and final invoice amounts are computed from this column on the server. Never accept an amount from a request body.';

comment on column public.projects.phase is
  'A phase key from portal.config.ts. Deliberately not an enum: the phase vocabulary is per-deployment configuration.';

-- ----------------------------------------------------------------------------
-- Membership
--
-- A project's access list. The reference implementation tied access to
-- clients.user_id, which allows exactly one login per client; that breaks the
-- first time a client asks to add their marketing manager. Membership is its own
-- table so a project can have several people on it, and so revoking one person
-- does not disturb the client record.
-- ----------------------------------------------------------------------------

create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  -- `owner` is the primary contact; `collaborator` is anyone else invited.
  member_role text not null default 'collaborator'
    check (member_role in ('owner', 'collaborator')),
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

comment on table public.project_members is
  'The authorization edge. Every RLS policy in 0004 resolves client access through this table.';

create index if not exists clients_business_idx on public.clients (business_name);
create index if not exists projects_client_idx on public.projects (client_id);
create index if not exists projects_status_idx on public.projects (status);
create index if not exists project_members_user_idx on public.project_members (user_id);
create index if not exists project_members_project_idx on public.project_members (project_id);

-- ----------------------------------------------------------------------------
-- updated_at
-- ----------------------------------------------------------------------------

create or replace function public.portal_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.portal_set_updated_at();

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.portal_set_updated_at();
