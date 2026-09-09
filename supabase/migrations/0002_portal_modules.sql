-- ============================================================================
-- 0002 — The modules: files, messages, approvals, decisions, activity,
--        handoff, phases, time, and per-user walkthrough state.
--
-- Every table here is project-scoped and gets its RLS policy in 0004. A module
-- switched off in portal.config.ts simply stops being queried; its tables stay,
-- so switching it back on needs no migration.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Phase state
--
-- Phase DEFINITIONS (key, label, blurb, order) live in portal.config.ts. Only
-- per-project state lives here, so changing what you call phase 03 is a config
-- edit and not a data migration.
-- ----------------------------------------------------------------------------

create table if not exists public.project_phases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  phase_key text not null,
  status text not null default 'upcoming'
    check (status in ('upcoming', 'current', 'complete')),
  -- Optional per-project note: what is actually happening in this phase.
  note text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, phase_key)
);

-- ----------------------------------------------------------------------------
-- Files
-- ----------------------------------------------------------------------------

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  uploaded_by uuid not null references public.users(id) on delete restrict,
  filename text not null,

  -- Storage object key. ALWAYS `<project_id>/<uuid>-<safe name>`: the storage
  -- policies in 0004 read the first path segment as the project id, so a file
  -- stored under any other shape is unreachable by design.
  storage_path text not null unique,

  size bigint not null default 0 check (size >= 0),
  content_type text,

  -- A category key from portal.config.ts `fileCategories`. Free text for the
  -- same reason `projects.phase` is.
  category text not null default 'other',

  -- Optional version marker shown next to the name, e.g. "v2".
  version text,

  -- Set when this upload satisfies a requested file.
  request_id uuid,

  created_at timestamptz not null default now()
);

comment on column public.files.storage_path is
  'Must be <project_id>/<uuid>-<name>. Storage RLS parses the first segment as the project id; any other shape is unreadable.';

-- Requested files: "Logo SVG — RECEIVED / Staff photos — WAITING". Far more
-- useful to a client than an empty file list.
create table if not exists public.file_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  label text not null,
  detail text,
  category text not null default 'other',
  status text not null default 'waiting'
    check (status in ('waiting', 'received', 'accepted', 'not_needed')),
  position integer not null default 0,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.files
  drop constraint if exists files_request_fk;
alter table public.files
  add constraint files_request_fk
  foreign key (request_id) references public.file_requests(id) on delete set null;

-- ----------------------------------------------------------------------------
-- Messages
--
-- Deliberately a flat project feed, not threads. This is not a chat product:
-- the goal is that project communication stops living in an email account.
-- `kind` lets a system note render differently in the same timeline.
-- ----------------------------------------------------------------------------

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  -- Null sender means the system wrote it (an approval request, an invoice).
  sender_id uuid references public.users(id) on delete set null,
  kind text not null default 'message'
    check (kind in ('message', 'system')),
  body text not null check (char_length(body) between 1 and 10000),
  file_id uuid references public.files(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Read state per user per message. A `read_at` column on messages cannot
-- express "the client read it but the admin has not".
create table if not exists public.message_reads (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

-- ----------------------------------------------------------------------------
-- Approvals
--
-- A real approval object, not a message saying "looks good". The decision
-- history is a separate append-only table so an approval can never silently
-- change: the current status is a summary of events, and the events are the
-- record.
-- ----------------------------------------------------------------------------

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  -- What they are looking at and what you need from them.
  detail text,
  -- Either an external preview link or an attached file. Both may be set.
  preview_url text,
  file_id uuid references public.files(id) on delete set null,
  status text not null default 'waiting'
    check (status in ('waiting', 'approved', 'changes_requested')),
  requested_at timestamptz not null default now(),
  -- Denormalised from the latest decision event, for cheap list rendering.
  decided_at timestamptz,
  decided_by uuid references public.users(id) on delete set null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Append-only. There is no update or delete grant on this table for anyone
-- except the service role; see 0004.
create table if not exists public.approval_events (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid not null references public.approvals(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  actor_id uuid not null references public.users(id) on delete restrict,
  decision text not null
    check (decision in ('requested', 'approved', 'changes_requested', 'reopened')),
  comment text check (comment is null or char_length(comment) <= 4000),
  created_at timestamptz not null default now()
);

comment on table public.approval_events is
  'Append-only approval history. Who decided what, when, and what they said. Never updated or deleted — the client is entitled to a permanent record.';

-- ----------------------------------------------------------------------------
-- Decisions
--
-- "Did we decide that already?" — the question this table exists to end.
-- ----------------------------------------------------------------------------

create table if not exists public.project_decisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  topic text not null,
  decision text not null,
  detail text,
  decided_on date not null default current_date,
  -- Set when the decision came out of a formal approval.
  approval_id uuid references public.approvals(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Activity
--
-- The overview's recent-activity feed. Written by the server on state changes,
-- never by the client directly (no insert grant to `authenticated` in 0004).
-- ----------------------------------------------------------------------------

create table if not exists public.project_activity (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  kind text not null
    check (kind in (
      'phase_changed', 'file_added', 'file_requested', 'approval_requested',
      'approval_decided', 'message_posted', 'invoice_issued', 'invoice_paid',
      'decision_recorded', 'handoff_updated', 'project_created'
    )),
  summary text not null,
  created_at timestamptz not null default now()
);

create index if not exists project_activity_project_created_idx
  on public.project_activity (project_id, created_at desc);

-- ----------------------------------------------------------------------------
-- Handoff
--
-- Checklist DEFINITIONS live in portal.config.ts; a copy of the rows is created
-- per project so status is data.
--
-- There is deliberately NO credential column here. Account transfer happens
-- through each provider's own ownership-transfer flow — registrar transfer,
-- hosting account invite, repository transfer. A portal field holding a
-- plaintext password would be a liability with no upside, and `note` is
-- documented as non-secret for that reason.
-- ----------------------------------------------------------------------------

create table if not exists public.handoff_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  item_key text not null,
  label text not null,
  status text not null default 'not_ready'
    check (status in ('not_ready', 'ready', 'transferred', 'not_applicable')),
  -- Non-secret operational note only: "invite sent to their Google account".
  -- Never a password, key, or recovery code.
  note text,
  position integer not null default 0,
  transferred_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, item_key)
);

comment on column public.handoff_items.note is
  'Non-secret operational note only. Never store passwords, API keys or recovery codes here — use the provider''s own account-transfer flow.';

-- ----------------------------------------------------------------------------
-- Time log (optional module)
-- ----------------------------------------------------------------------------

create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  entry_date date not null default current_date,
  phase_key text,
  description text not null,
  hours numeric(5,2) not null check (hours > 0 and hours <= 24),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Walkthrough state — per user, not per project.
--
-- A person learns the interface once. `tour_version` lets a materially changed
-- walkthrough be offered again without resetting anyone by hand.
--
-- Dismissing is recorded separately from completing, and neither removes the
-- ability to replay: Help always offers it. That is a product requirement, so
-- the schema keeps both timestamps rather than a single boolean.
-- ----------------------------------------------------------------------------

create table if not exists public.portal_tour_state (
  user_id uuid primary key references public.users(id) on delete cascade,
  tour_version integer not null default 1,
  completed_at timestamptz,
  dismissed_at timestamptz,
  last_step integer not null default 0,
  replay_count integer not null default 0,
  updated_at timestamptz not null default now()
);

comment on table public.portal_tour_state is
  'Per-user walkthrough state. Skipping sets dismissed_at; it never prevents replay from Help.';

create index if not exists project_phases_project_idx on public.project_phases (project_id);
create index if not exists files_project_created_idx on public.files (project_id, created_at desc);
create index if not exists files_request_idx on public.files (request_id);
create index if not exists file_requests_project_idx on public.file_requests (project_id, position, created_at);
create index if not exists messages_project_created_idx on public.messages (project_id, created_at);
create index if not exists message_reads_user_idx on public.message_reads (user_id);
create index if not exists approvals_project_idx on public.approvals (project_id, position, created_at desc);
create index if not exists approvals_status_idx on public.approvals (project_id, status);
create index if not exists approval_events_approval_idx on public.approval_events (approval_id, created_at);
create index if not exists project_decisions_project_idx on public.project_decisions (project_id, decided_on desc);
create index if not exists handoff_items_project_idx on public.handoff_items (project_id, position);
create index if not exists time_entries_project_date_idx on public.time_entries (project_id, entry_date desc);

drop trigger if exists project_phases_set_updated_at on public.project_phases;
create trigger project_phases_set_updated_at
  before update on public.project_phases
  for each row execute function public.portal_set_updated_at();

drop trigger if exists file_requests_set_updated_at on public.file_requests;
create trigger file_requests_set_updated_at
  before update on public.file_requests
  for each row execute function public.portal_set_updated_at();

drop trigger if exists approvals_set_updated_at on public.approvals;
create trigger approvals_set_updated_at
  before update on public.approvals
  for each row execute function public.portal_set_updated_at();

drop trigger if exists handoff_items_set_updated_at on public.handoff_items;
create trigger handoff_items_set_updated_at
  before update on public.handoff_items
  for each row execute function public.portal_set_updated_at();

drop trigger if exists portal_tour_state_set_updated_at on public.portal_tour_state;
create trigger portal_tour_state_set_updated_at
  before update on public.portal_tour_state
  for each row execute function public.portal_set_updated_at();
