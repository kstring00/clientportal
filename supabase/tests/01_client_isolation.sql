-- ============================================================================
-- Cross-client isolation: Client A must not be able to read ANY row belonging
-- to Client B.
--
-- This is the test that matters most. Everything else in the portal is a
-- feature; this is the promise.
--
-- Run against a database with 0001–0004 applied:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/01_client_isolation.sql
--
-- It runs inside a transaction and rolls back, so it leaves no rows behind. It
-- is safe against a development database; do not point it at production anyway.
--
-- Note on method: the checks below run as the `authenticated` role with
-- request.jwt.claims set, which is exactly how PostgREST executes a client
-- request. Testing as the table owner would bypass RLS entirely and pass while
-- proving nothing — the owner is not subject to its own policies.
-- ============================================================================

\pset tuples_only on
\pset format unaligned

begin;

-- NOTICE is how each check reports itself; do not raise this to warning.
set local client_min_messages = notice;

-- ---------------------------------------------------------------------------
-- Fixtures. Two unrelated clients, one project each, one member each.
-- ---------------------------------------------------------------------------

create temporary table t_ids (
  label text primary key,
  id uuid not null
) on commit drop;

insert into t_ids (label, id) values
  ('user_a',    '11111111-1111-4111-8111-111111111111'),
  ('user_b',    '22222222-2222-4222-8222-222222222222'),
  ('user_admin','33333333-3333-4333-8333-333333333333'),
  ('client_a',  'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'),
  ('client_b',  'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'),
  ('project_a', 'aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa'),
  ('project_b', 'bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb');

create or replace function pg_temp.id(p_label text) returns uuid
language sql stable as $$ select id from t_ids where label = p_label $$;

-- auth.users rows are required by the FK on public.users.
insert into auth.users (id, instance_id, aud, role, email)
values
  (pg_temp.id('user_a'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test'),
  (pg_temp.id('user_b'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test'),
  (pg_temp.id('user_admin'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@example.test')
on conflict (id) do nothing;

insert into public.users (id, email, role, name) values
  (pg_temp.id('user_a'), 'a@example.test', 'client', 'Client A'),
  (pg_temp.id('user_b'), 'b@example.test', 'client', 'Client B'),
  (pg_temp.id('user_admin'), 'admin@example.test', 'admin', 'Admin');

insert into public.clients (id, business_name, contact_name) values
  (pg_temp.id('client_a'), 'Alpha Co', 'Client A'),
  (pg_temp.id('client_b'), 'Beta Co', 'Client B');

insert into public.projects (id, client_id, name, slug, phase, agreed_total) values
  (pg_temp.id('project_a'), pg_temp.id('client_a'), 'Alpha Site', 'alpha-site', 'build', 4000),
  (pg_temp.id('project_b'), pg_temp.id('client_b'), 'Beta Site', 'beta-site', 'design', 6000);

insert into public.project_members (project_id, user_id, member_role) values
  (pg_temp.id('project_a'), pg_temp.id('user_a'), 'owner'),
  (pg_temp.id('project_b'), pg_temp.id('user_b'), 'owner');

-- One row of every project-scoped kind, on BOTH projects.
insert into public.messages (project_id, sender_id, body) values
  (pg_temp.id('project_a'), pg_temp.id('user_a'), 'Alpha message'),
  (pg_temp.id('project_b'), pg_temp.id('user_b'), 'Beta message');

insert into public.files (project_id, uploaded_by, filename, storage_path, size, category) values
  (pg_temp.id('project_a'), pg_temp.id('user_a'), 'alpha.pdf', pg_temp.id('project_a') || '/alpha.pdf', 10, 'content'),
  (pg_temp.id('project_b'), pg_temp.id('user_b'), 'beta.pdf', pg_temp.id('project_b') || '/beta.pdf', 10, 'content');

insert into public.invoices (project_id, kind, amount, status) values
  (pg_temp.id('project_a'), 'deposit', 2000, 'open'),
  (pg_temp.id('project_b'), 'deposit', 3000, 'open');

insert into public.approvals (id, project_id, title) values
  ('aaaaaaaa-9999-4999-8999-aaaaaaaaaaaa', pg_temp.id('project_a'), 'Alpha homepage'),
  ('bbbbbbbb-9999-4999-8999-bbbbbbbbbbbb', pg_temp.id('project_b'), 'Beta homepage');

insert into public.approval_events (approval_id, project_id, actor_id, decision) values
  ('aaaaaaaa-9999-4999-8999-aaaaaaaaaaaa', pg_temp.id('project_a'), pg_temp.id('user_a'), 'requested'),
  ('bbbbbbbb-9999-4999-8999-bbbbbbbbbbbb', pg_temp.id('project_b'), pg_temp.id('user_b'), 'requested');

insert into public.project_decisions (project_id, topic, decision) values
  (pg_temp.id('project_a'), 'Alpha photography', 'Use existing'),
  (pg_temp.id('project_b'), 'Beta photography', 'Commission new');

insert into public.project_activity (project_id, kind, summary) values
  (pg_temp.id('project_a'), 'project_created', 'Alpha created'),
  (pg_temp.id('project_b'), 'project_created', 'Beta created');

insert into public.handoff_items (project_id, item_key, label) values
  (pg_temp.id('project_a'), 'domain', 'Domain'),
  (pg_temp.id('project_b'), 'domain', 'Domain');

insert into public.care_plans (project_id, status) values
  (pg_temp.id('project_a'), 'inactive'),
  (pg_temp.id('project_b'), 'inactive');

insert into public.project_phases (project_id, phase_key, status) values
  (pg_temp.id('project_a'), 'build', 'current'),
  (pg_temp.id('project_b'), 'design', 'current');

insert into public.file_requests (project_id, label) values
  (pg_temp.id('project_a'), 'Alpha logo'),
  (pg_temp.id('project_b'), 'Beta logo');

insert into public.time_entries (project_id, description, hours) values
  (pg_temp.id('project_a'), 'Alpha work', 2),
  (pg_temp.id('project_b'), 'Beta work', 3);

-- ---------------------------------------------------------------------------
-- Assertion helpers
-- ---------------------------------------------------------------------------

create or replace function pg_temp.expect_count(
  p_label text, p_sql text, p_expected bigint
) returns void language plpgsql as $$
declare actual bigint;
begin
  execute p_sql into actual;
  if actual is distinct from p_expected then
    raise exception 'FAIL % — expected %, got %', p_label, p_expected, actual;
  end if;
  raise notice 'ok   %', p_label;
end;
$$;

-- Denial has TWO legitimate shapes, and conflating them hides real bugs.
--
-- When the role has no grant for the operation at all (a client has no UPDATE
-- on invoices), PostgreSQL raises insufficient_privilege. `expect_denied` is
-- for that case.
--
-- When the role DOES hold the grant and RLS filters the row instead (a client
-- has UPDATE on approvals, because approving is the whole point), the statement
-- succeeds and touches ZERO rows. That is the correct and safe outcome, but it
-- is not an error, so asserting for one would fail against a perfectly secure
-- database. `expect_no_rows` is for that case.
create or replace function pg_temp.expect_denied(
  p_label text, p_sql text
) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when insufficient_privilege or check_violation then
    raise notice 'ok   % (rejected: %)', p_label, sqlerrm;
    return;
  end;
  raise exception 'FAIL % — the write was ALLOWED and should not have been', p_label;
end;
$$;

create or replace function pg_temp.expect_no_rows(
  p_label text, p_sql text
) returns void language plpgsql as $$
declare affected bigint;
begin
  execute p_sql;
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'FAIL % — touched % row(s), expected 0', p_label, affected;
  end if;
  raise notice 'ok   % (RLS matched no rows)', p_label;
end;
$$;

-- ---------------------------------------------------------------------------
-- Act as Client A.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select pg_temp.expect_count('A sees exactly one project',
  'select count(*) from public.projects', 1);
select pg_temp.expect_count('A sees only its own project row',
  'select count(*) from public.projects where slug = ''beta-site''', 0);
select pg_temp.expect_count('A cannot see B''s client record',
  'select count(*) from public.clients where business_name = ''Beta Co''', 0);
select pg_temp.expect_count('A sees its own client record',
  'select count(*) from public.clients', 1);
select pg_temp.expect_count('A cannot see B''s messages',
  'select count(*) from public.messages where body = ''Beta message''', 0);
select pg_temp.expect_count('A sees only its own messages',
  'select count(*) from public.messages', 1);
select pg_temp.expect_count('A cannot see B''s files',
  'select count(*) from public.files where filename = ''beta.pdf''', 0);
select pg_temp.expect_count('A cannot see B''s invoices',
  'select count(*) from public.invoices where amount = 3000', 0);
select pg_temp.expect_count('A cannot see B''s approvals',
  'select count(*) from public.approvals where title = ''Beta homepage''', 0);
select pg_temp.expect_count('A cannot see B''s approval history',
  'select count(*) from public.approval_events where project_id = ''bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb''', 0);
select pg_temp.expect_count('A cannot see B''s decisions',
  'select count(*) from public.project_decisions where topic = ''Beta photography''', 0);
select pg_temp.expect_count('A cannot see B''s activity',
  'select count(*) from public.project_activity where summary = ''Beta created''', 0);
select pg_temp.expect_count('A cannot see B''s handoff items',
  'select count(*) from public.handoff_items where project_id = ''bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb''', 0);
select pg_temp.expect_count('A cannot see B''s care plan',
  'select count(*) from public.care_plans where project_id = ''bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb''', 0);
select pg_temp.expect_count('A cannot see B''s phases',
  'select count(*) from public.project_phases where project_id = ''bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb''', 0);
select pg_temp.expect_count('A cannot see B''s file requests',
  'select count(*) from public.file_requests where label = ''Beta logo''', 0);
select pg_temp.expect_count('A cannot see B''s time entries',
  'select count(*) from public.time_entries where description = ''Beta work''', 0);
select pg_temp.expect_count('A cannot see B''s membership rows',
  'select count(*) from public.project_members where user_id = ''22222222-2222-4222-8222-222222222222''', 0);
select pg_temp.expect_count('A cannot enumerate other portal users',
  'select count(*) from public.users where email = ''b@example.test''', 0);
-- Stripe event traffic is revoked outright rather than filtered to zero rows:
-- RLS is enabled with no policy AND the grant is removed, so the attempt is
-- refused at the permission level. That is the stronger of the two outcomes.
select pg_temp.expect_denied('A cannot read Stripe event traffic',
  'select count(*) from public.stripe_events');

-- Writes into B's project must fail, not silently no-op.
select pg_temp.expect_denied('A cannot post a message into B''s project',
  'insert into public.messages (project_id, sender_id, body)
     values (''bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb'', ''11111111-1111-4111-8111-111111111111'', ''intrusion'')');

select pg_temp.expect_denied('A cannot attribute a message to B',
  'insert into public.messages (project_id, sender_id, body)
     values (''aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa'', ''22222222-2222-4222-8222-222222222222'', ''forged'')');

select pg_temp.expect_denied('A cannot forge a system message',
  'insert into public.messages (project_id, sender_id, body, kind)
     values (''aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa'', ''11111111-1111-4111-8111-111111111111'', ''fake system'', ''system'')');

select pg_temp.expect_denied('A cannot register a file against B''s project',
  'insert into public.files (project_id, uploaded_by, filename, storage_path, size)
     values (''bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb'', ''11111111-1111-4111-8111-111111111111'', ''x.pdf'', ''bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb/x.pdf'', 1)');

select pg_temp.expect_denied('A cannot forge approval history',
  'insert into public.approval_events (approval_id, project_id, actor_id, decision)
     values (''bbbbbbbb-9999-4999-8999-bbbbbbbbbbbb'', ''bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb'', ''11111111-1111-4111-8111-111111111111'', ''approved'')');

select pg_temp.expect_denied('A cannot rewrite its own approval history',
  'update public.approval_events set decision = ''approved''
     where project_id = ''aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa''');

select pg_temp.expect_denied('A cannot raise its own invoice',
  'insert into public.invoices (project_id, kind, amount)
     values (''aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa'', ''other'', 1)');

select pg_temp.expect_denied('A cannot discount its own invoice',
  'update public.invoices set amount = 0
     where project_id = ''aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa''');

select pg_temp.expect_denied('A cannot mark its own invoice paid',
  'update public.invoices set status = ''paid''
     where project_id = ''aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa''');

select pg_temp.expect_denied('A cannot promote itself to admin',
  'update public.users set role = ''admin'' where id = ''11111111-1111-4111-8111-111111111111''');

select pg_temp.expect_denied('A cannot add itself to B''s project',
  'insert into public.project_members (project_id, user_id)
     values (''bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb'', ''11111111-1111-4111-8111-111111111111'')');

select pg_temp.expect_denied('A cannot move its own project phase',
  'update public.projects set phase = ''launch''
     where id = ''aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa''');

select pg_temp.expect_denied('A cannot write project activity',
  'insert into public.project_activity (project_id, kind, summary)
     values (''aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa'', ''invoice_paid'', ''fabricated'')');

select pg_temp.expect_denied('A cannot mark its own handoff item transferred',
  'update public.handoff_items set status = ''transferred''
     where project_id = ''aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa''');

-- The one thing a client SHOULD be able to change: their own approval decision.
select pg_temp.expect_count('A can approve its own approval',
  'with u as (
     update public.approvals set status = ''approved''
     where id = ''aaaaaaaa-9999-4999-8999-aaaaaaaaaaaa'' returning 1
   ) select count(*) from u', 1);

-- A holds UPDATE on approvals, so this is filtered by RLS rather than refused
-- by a missing grant: the statement runs and changes nothing. Verified from the
-- admin's side further down, where B's approval is still 'waiting'.
select pg_temp.expect_no_rows('A cannot approve B''s approval',
  'update public.approvals set status = ''approved''
     where id = ''bbbbbbbb-9999-4999-8999-bbbbbbbbbbbb''');

select pg_temp.expect_no_rows('A cannot read-modify B''s approval by project',
  'update public.approvals set status = ''approved''
     where project_id = ''bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb''');

-- A blanket update with no WHERE must still only reach A's own rows.
select pg_temp.expect_count('a WHERE-less update reaches only A''s own rows',
  'with u as (update public.approvals set status = ''changes_requested'' returning 1)
   select count(*) from u', 1);

select pg_temp.expect_count('A can record its own decision event',
  'with i as (
     insert into public.approval_events (approval_id, project_id, actor_id, decision, comment)
     values (''aaaaaaaa-9999-4999-8999-aaaaaaaaaaaa'', ''aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa'',
             ''11111111-1111-4111-8111-111111111111'', ''approved'', ''Looks good.'') returning 1
   ) select count(*) from i', 1);

-- ---------------------------------------------------------------------------
-- Act as Client B — the mirror image, so a policy that accidentally hardcodes
-- one project cannot pass.
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select pg_temp.expect_count('B sees exactly one project',
  'select count(*) from public.projects', 1);
select pg_temp.expect_count('B cannot see A''s project',
  'select count(*) from public.projects where slug = ''alpha-site''', 0);
select pg_temp.expect_count('B cannot see A''s messages',
  'select count(*) from public.messages where body = ''Alpha message''', 0);
select pg_temp.expect_count('B cannot see A''s files',
  'select count(*) from public.files where filename = ''alpha.pdf''', 0);
select pg_temp.expect_count('B cannot see A''s approval decision',
  'select count(*) from public.approval_events where project_id = ''aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa''', 0);

-- ---------------------------------------------------------------------------
-- Admin sees everything.
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';

select pg_temp.expect_count('admin sees both projects',
  'select count(*) from public.projects', 2);
select pg_temp.expect_count('admin sees both clients',
  'select count(*) from public.clients', 2);
select pg_temp.expect_count('admin sees both message sets',
  'select count(*) from public.messages', 2);
select pg_temp.expect_count('admin sees both invoice sets',
  'select count(*) from public.invoices', 2);

-- The point of the no-rows checks above: B's approval is still exactly as it
-- was, despite A having issued three updates aimed at it.
select pg_temp.expect_count('B''s approval was never modified by A',
  'select count(*) from public.approvals
    where id = ''bbbbbbbb-9999-4999-8999-bbbbbbbbbbbb'' and status = ''waiting''', 1);

select pg_temp.expect_count('B''s approval history was never appended to by A',
  'select count(*) from public.approval_events
    where project_id = ''bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb''', 1);

-- ---------------------------------------------------------------------------
-- Anonymous sees nothing at all.
-- ---------------------------------------------------------------------------

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select pg_temp.expect_denied('anon cannot read projects',
  'select count(*) from public.projects');
select pg_temp.expect_denied('anon cannot read messages',
  'select count(*) from public.messages');
select pg_temp.expect_denied('anon cannot read invoices',
  'select count(*) from public.invoices');
select pg_temp.expect_denied('anon cannot read files',
  'select count(*) from public.files');

reset role;

select 'ALL ISOLATION CHECKS PASSED' as result;

rollback;
