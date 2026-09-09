-- ============================================================================
-- 0004 — Row Level Security.
--
-- This file is the reason a client cannot read another client's project. Read
-- it before changing anything in it.
--
-- Three rules it follows, all carried over from the reference implementation:
--
--   1. Policy logic lives in SECURITY DEFINER helpers, not inline in policies.
--      Inline subqueries against users/clients/projects recurse through those
--      tables' own policies; the helpers break that cycle and keep one
--      definition of "can this person see this project".
--
--   2. The helpers live in a PRIVATE schema, not public. Anything in `public`
--      is reachable over PostgREST's RPC endpoint. `private.portal_is_admin()`
--      is not something an authenticated client should be able to call at will.
--
--   3. Grants are explicit, per table, per operation. `authenticated` gets
--      SELECT almost everywhere, INSERT on exactly the three things a client
--      legitimately creates (a message, a file, an approval decision), and
--      UPDATE/DELETE essentially nowhere. Admin writes go through server routes
--      holding the secret key.
--
-- The UI hiding a button is not authorization. Every one of these policies must
-- hold even if someone calls PostgREST directly with a valid client token.
-- ============================================================================

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------

create or replace function private.portal_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin'
  );
$$;

-- The single definition of client project access. Everything else calls this.
create or replace function private.portal_can_access_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.portal_is_admin()
    or exists (
      select 1 from public.project_members m
      where m.project_id = p_project_id
        and m.user_id = auth.uid()
    );
$$;

create or replace function private.portal_can_access_client(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.portal_is_admin()
    or exists (
      select 1
      from public.project_members m
      join public.projects p on p.id = m.project_id
      where p.client_id = p_client_id
        and m.user_id = auth.uid()
    );
$$;

revoke all on function private.portal_is_admin() from public, anon;
revoke all on function private.portal_can_access_project(uuid) from public, anon;
revoke all on function private.portal_can_access_client(uuid) from public, anon;
grant execute on function private.portal_is_admin() to authenticated, service_role;
grant execute on function private.portal_can_access_project(uuid) to authenticated, service_role;
grant execute on function private.portal_can_access_client(uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Enable RLS everywhere. A table added later without this line is wide open to
-- every authenticated user, so treat this list as part of the definition of
-- "adding a table".
-- ----------------------------------------------------------------------------

alter table public.users enable row level security;
alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_phases enable row level security;
alter table public.files enable row level security;
alter table public.file_requests enable row level security;
alter table public.messages enable row level security;
alter table public.message_reads enable row level security;
alter table public.approvals enable row level security;
alter table public.approval_events enable row level security;
alter table public.project_decisions enable row level security;
alter table public.project_activity enable row level security;
alter table public.handoff_items enable row level security;
alter table public.time_entries enable row level security;
alter table public.invoices enable row level security;
alter table public.care_plans enable row level security;
alter table public.portal_tour_state enable row level security;

-- ----------------------------------------------------------------------------
-- Identity
-- ----------------------------------------------------------------------------

drop policy if exists users_read on public.users;
create policy users_read on public.users
for select to authenticated
using (id = auth.uid() or private.portal_is_admin());

drop policy if exists users_admin_write on public.users;
create policy users_admin_write on public.users
for all to authenticated
using (private.portal_is_admin())
with check (private.portal_is_admin());

drop policy if exists clients_read on public.clients;
create policy clients_read on public.clients
for select to authenticated
using (private.portal_can_access_client(id));

drop policy if exists clients_admin_write on public.clients;
create policy clients_admin_write on public.clients
for all to authenticated
using (private.portal_is_admin())
with check (private.portal_is_admin());

-- ----------------------------------------------------------------------------
-- Projects and membership
-- ----------------------------------------------------------------------------

drop policy if exists projects_read on public.projects;
create policy projects_read on public.projects
for select to authenticated
using (private.portal_can_access_project(id));

drop policy if exists projects_admin_write on public.projects;
create policy projects_admin_write on public.projects
for all to authenticated
using (private.portal_is_admin())
with check (private.portal_is_admin());

-- A member may see who else is on their project, and nothing about any other.
drop policy if exists project_members_read on public.project_members;
create policy project_members_read on public.project_members
for select to authenticated
using (private.portal_can_access_project(project_id));

drop policy if exists project_members_admin_write on public.project_members;
create policy project_members_admin_write on public.project_members
for all to authenticated
using (private.portal_is_admin())
with check (private.portal_is_admin());

-- ----------------------------------------------------------------------------
-- Project-scoped reads. Identical shape throughout: read if you can access the
-- project, write only if you are admin, with the narrow client-write exceptions
-- spelled out separately below.
-- ----------------------------------------------------------------------------

drop policy if exists project_phases_read on public.project_phases;
create policy project_phases_read on public.project_phases
for select to authenticated
using (private.portal_can_access_project(project_id));

drop policy if exists project_phases_admin_write on public.project_phases;
create policy project_phases_admin_write on public.project_phases
for all to authenticated
using (private.portal_is_admin())
with check (private.portal_is_admin());

drop policy if exists file_requests_read on public.file_requests;
create policy file_requests_read on public.file_requests
for select to authenticated
using (private.portal_can_access_project(project_id));

drop policy if exists file_requests_admin_write on public.file_requests;
create policy file_requests_admin_write on public.file_requests
for all to authenticated
using (private.portal_is_admin())
with check (private.portal_is_admin());

drop policy if exists project_decisions_read on public.project_decisions;
create policy project_decisions_read on public.project_decisions
for select to authenticated
using (private.portal_can_access_project(project_id));

drop policy if exists project_decisions_admin_write on public.project_decisions;
create policy project_decisions_admin_write on public.project_decisions
for all to authenticated
using (private.portal_is_admin())
with check (private.portal_is_admin());

-- Activity is written by the server on state changes. `authenticated` gets no
-- insert grant at all, so a client cannot forge history.
drop policy if exists project_activity_read on public.project_activity;
create policy project_activity_read on public.project_activity
for select to authenticated
using (private.portal_can_access_project(project_id));

drop policy if exists handoff_items_read on public.handoff_items;
create policy handoff_items_read on public.handoff_items
for select to authenticated
using (private.portal_can_access_project(project_id));

drop policy if exists handoff_items_admin_write on public.handoff_items;
create policy handoff_items_admin_write on public.handoff_items
for all to authenticated
using (private.portal_is_admin())
with check (private.portal_is_admin());

drop policy if exists time_entries_read on public.time_entries;
create policy time_entries_read on public.time_entries
for select to authenticated
using (private.portal_can_access_project(project_id));

drop policy if exists time_entries_admin_write on public.time_entries;
create policy time_entries_admin_write on public.time_entries
for all to authenticated
using (private.portal_is_admin())
with check (private.portal_is_admin());

-- Invoices are read-only to clients. Amounts are set server-side from
-- projects.agreed_total and updated only by the Stripe webhook.
drop policy if exists invoices_read on public.invoices;
create policy invoices_read on public.invoices
for select to authenticated
using (private.portal_can_access_project(project_id));

drop policy if exists invoices_admin_write on public.invoices;
create policy invoices_admin_write on public.invoices
for all to authenticated
using (private.portal_is_admin())
with check (private.portal_is_admin());

drop policy if exists care_plans_read on public.care_plans;
create policy care_plans_read on public.care_plans
for select to authenticated
using (private.portal_can_access_project(project_id));

drop policy if exists care_plans_admin_write on public.care_plans;
create policy care_plans_admin_write on public.care_plans
for all to authenticated
using (private.portal_is_admin())
with check (private.portal_is_admin());

-- ----------------------------------------------------------------------------
-- Files — clients may upload to their own project and remove their own upload.
-- ----------------------------------------------------------------------------

drop policy if exists files_read on public.files;
create policy files_read on public.files
for select to authenticated
using (private.portal_can_access_project(project_id));

-- `uploaded_by = auth.uid()` stops a client attributing an upload to someone
-- else; the project check stops them writing into a project they cannot see.
drop policy if exists files_insert on public.files;
create policy files_insert on public.files
for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and private.portal_can_access_project(project_id)
);

drop policy if exists files_delete on public.files;
create policy files_delete on public.files
for delete to authenticated
using (
  private.portal_is_admin()
  or (uploaded_by = auth.uid() and private.portal_can_access_project(project_id))
);

drop policy if exists files_admin_update on public.files;
create policy files_admin_update on public.files
for update to authenticated
using (private.portal_is_admin())
with check (private.portal_is_admin());

-- ----------------------------------------------------------------------------
-- Messages
-- ----------------------------------------------------------------------------

drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages
for select to authenticated
using (private.portal_can_access_project(project_id));

-- A client can post as themselves only, and only 'message' kind: 'system'
-- entries are written by the server so they cannot be faked in the feed.
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
for insert to authenticated
with check (
  sender_id = auth.uid()
  and kind = 'message'
  and private.portal_can_access_project(project_id)
);

drop policy if exists message_reads_own on public.message_reads;
create policy message_reads_own on public.message_reads
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Approvals
--
-- A client may change an approval's status on their own project — that is the
-- whole point — but may not create or delete one, and may not alter the event
-- history. The `with check` deliberately restricts which statuses a client can
-- move an approval into.
-- ----------------------------------------------------------------------------

drop policy if exists approvals_read on public.approvals;
create policy approvals_read on public.approvals
for select to authenticated
using (private.portal_can_access_project(project_id));

drop policy if exists approvals_admin_write on public.approvals;
create policy approvals_admin_write on public.approvals
for all to authenticated
using (private.portal_is_admin())
with check (private.portal_is_admin());

drop policy if exists approvals_client_decide on public.approvals;
create policy approvals_client_decide on public.approvals
for update to authenticated
using (private.portal_can_access_project(project_id))
with check (
  private.portal_can_access_project(project_id)
  and status in ('approved', 'changes_requested')
);

-- Append-only: select and insert only, and the insert must be attributed to the
-- person making it. There is no update or delete policy here on purpose, and
-- no such grant below — an approval record the client cannot rely on is worse
-- than no record at all.
drop policy if exists approval_events_read on public.approval_events;
create policy approval_events_read on public.approval_events
for select to authenticated
using (private.portal_can_access_project(project_id));

drop policy if exists approval_events_insert on public.approval_events;
create policy approval_events_insert on public.approval_events
for insert to authenticated
with check (
  actor_id = auth.uid()
  and private.portal_can_access_project(project_id)
);

-- ----------------------------------------------------------------------------
-- Walkthrough state — strictly the signed-in user's own row.
-- ----------------------------------------------------------------------------

drop policy if exists portal_tour_state_own on public.portal_tour_state;
create policy portal_tour_state_own on public.portal_tour_state
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Grants.
--
-- RLS filters rows; grants decide which operations are possible at all. Both
-- matter: a policy cannot stop an operation the role was never granted, and a
-- grant cannot widen what a policy allows.
-- ----------------------------------------------------------------------------

revoke all on all tables in schema public from anon;

grant select on table public.users to authenticated;
grant select on table public.clients to authenticated;
grant select on table public.projects to authenticated;
grant select on table public.project_members to authenticated;
grant select on table public.project_phases to authenticated;
grant select on table public.file_requests to authenticated;
grant select on table public.project_decisions to authenticated;
grant select on table public.project_activity to authenticated;
grant select on table public.handoff_items to authenticated;
grant select on table public.time_entries to authenticated;
grant select on table public.invoices to authenticated;
grant select on table public.care_plans to authenticated;

grant select, insert, delete on table public.files to authenticated;
grant select, insert on table public.messages to authenticated;
grant select, insert, delete on table public.message_reads to authenticated;
grant select, update on table public.approvals to authenticated;
grant select, insert on table public.approval_events to authenticated;
grant select, insert, update on table public.portal_tour_state to authenticated;

-- Admin writes happen through trusted server routes using the secret key.
-- service_role bypasses RLS, but the grant is still made explicitly rather than
-- resting on a project-level default that a later `alter default privileges`
-- could revoke without touching any migration in this repo.
grant all on table public.users to service_role;
grant all on table public.clients to service_role;
grant all on table public.projects to service_role;
grant all on table public.project_members to service_role;
grant all on table public.project_phases to service_role;
grant all on table public.files to service_role;
grant all on table public.file_requests to service_role;
grant all on table public.messages to service_role;
grant all on table public.message_reads to service_role;
grant all on table public.approvals to service_role;
grant all on table public.approval_events to service_role;
grant all on table public.project_decisions to service_role;
grant all on table public.project_activity to service_role;
grant all on table public.handoff_items to service_role;
grant all on table public.time_entries to service_role;
grant all on table public.invoices to service_role;
grant all on table public.care_plans to service_role;
grant all on table public.portal_tour_state to service_role;

-- ----------------------------------------------------------------------------
-- Storage
--
-- The bucket is private. Clients never get a public URL; downloads go through
-- a short-lived signed URL minted server-side after the row has been read under
-- the caller's own token.
--
-- The policies parse the FIRST PATH SEGMENT of the object name as the project
-- id, which is why lib/portal/files.ts always writes
-- `<project_id>/<uuid>-<name>`. The UUID pattern match is what stops a crafted
-- name like `../other-project/x` or a non-uuid folder from being cast and
-- reaching the access check with something unexpected.
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('portal-files', 'portal-files', false, 20971520)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists portal_files_read on storage.objects;
create policy portal_files_read on storage.objects
for select to authenticated
using (
  bucket_id = 'portal-files'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and private.portal_can_access_project(((storage.foldername(name))[1])::uuid)
);

drop policy if exists portal_files_insert on storage.objects;
create policy portal_files_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'portal-files'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and private.portal_can_access_project(((storage.foldername(name))[1])::uuid)
);

drop policy if exists portal_files_delete on storage.objects;
create policy portal_files_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'portal-files'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and private.portal_can_access_project(((storage.foldername(name))[1])::uuid)
);
