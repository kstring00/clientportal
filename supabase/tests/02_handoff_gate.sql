-- ============================================================================
-- The database handoff lock.
--
-- Three facts this file exists to prove:
--
--   1. Recording an ownership transfer with NO final payment  -> rejected.
--   2. Final payment cleared, then transfer                   -> allowed.
--   3. A transfer timestamp that PREDATES the payment         -> rejected.
--
-- (3) is the one that is easy to forget. Without it the rule is bypassed by
-- backdating the transfer to a moment before the money arrived, which is
-- precisely what someone trying to get around it would do.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/02_handoff_gate.sql
--
-- Runs in a transaction and rolls back. The checks run as the table OWNER on
-- purpose: a trigger, unlike a policy, binds the owner too, and proving it holds
-- for the most privileged caller proves it holds for everyone.
-- ============================================================================

\pset tuples_only on
\pset format unaligned

begin;

-- NOTICE is how each check reports itself; do not raise this to warning.
set local client_min_messages = notice;

create or replace function pg_temp.expect_rejected(
  p_label text, p_sql text
) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when check_violation then
    raise notice 'ok   % (rejected: %)', p_label, sqlerrm;
    return;
  end;
  raise exception 'FAIL % — the transfer was ALLOWED and must not have been', p_label;
end;
$$;

create or replace function pg_temp.expect_allowed(
  p_label text, p_sql text
) returns void language plpgsql as $$
begin
  execute p_sql;
  raise notice 'ok   %', p_label;
exception when others then
  raise exception 'FAIL % — expected success, got: %', p_label, sqlerrm;
end;
$$;

insert into public.clients (id, business_name, contact_name)
values ('cccccccc-0000-4000-8000-cccccccccccc', 'Gate Co', 'Gate Contact');

insert into public.projects (id, client_id, name, slug, agreed_total)
values ('dddddddd-0000-4000-8000-dddddddddddd', 'cccccccc-0000-4000-8000-cccccccccccc',
        'Gate Project', 'gate-project', 5000);

-- ---------------------------------------------------------------------------
-- 1. Transfer before final payment — must fail.
-- ---------------------------------------------------------------------------

select pg_temp.expect_rejected(
  'transfer with no final payment is refused',
  'update public.projects
     set ownership_transferred_at = now()
   where id = ''dddddddd-0000-4000-8000-dddddddddddd''');

-- The same rule on INSERT, not just UPDATE: creating a project already marked
-- transferred must be refused too, or the gate is skippable at creation time.
select pg_temp.expect_rejected(
  'inserting an already-transferred project is refused',
  'insert into public.projects (client_id, name, slug, ownership_transferred_at)
     values (''cccccccc-0000-4000-8000-cccccccccccc'', ''Sneaky'', ''sneaky'', now())');

-- ---------------------------------------------------------------------------
-- 3. Backdated transfer — must fail. Checked BEFORE the success case so the
--    row is still in a known state.
-- ---------------------------------------------------------------------------

update public.projects
  set final_payment_cleared_at = timestamptz '2026-03-01 12:00:00+00'
  where id = 'dddddddd-0000-4000-8000-dddddddddddd';

select pg_temp.expect_rejected(
  'transfer predating the final payment is refused',
  'update public.projects
     set ownership_transferred_at = timestamptz ''2026-02-28 12:00:00+00''
   where id = ''dddddddd-0000-4000-8000-dddddddddddd''');

select pg_temp.expect_rejected(
  'transfer one second before the payment is refused',
  'update public.projects
     set ownership_transferred_at = timestamptz ''2026-03-01 11:59:59+00''
   where id = ''dddddddd-0000-4000-8000-dddddddddddd''');

-- Clearing the payment column while a transfer stands must also be refused,
-- otherwise the gate can be reopened after the fact.
update public.projects
  set ownership_transferred_at = timestamptz '2026-03-02 12:00:00+00'
  where id = 'dddddddd-0000-4000-8000-dddddddddddd';

select pg_temp.expect_rejected(
  'un-clearing the final payment after transfer is refused',
  'update public.projects
     set final_payment_cleared_at = null
   where id = ''dddddddd-0000-4000-8000-dddddddddddd''');

-- ---------------------------------------------------------------------------
-- 2. Paid, then transferred — must succeed.
-- ---------------------------------------------------------------------------

update public.projects
  set ownership_transferred_at = null
  where id = 'dddddddd-0000-4000-8000-dddddddddddd';

select pg_temp.expect_allowed(
  'transfer at the same instant as the payment is allowed',
  'update public.projects
     set ownership_transferred_at = final_payment_cleared_at
   where id = ''dddddddd-0000-4000-8000-dddddddddddd''');

select pg_temp.expect_allowed(
  'transfer after the payment is allowed',
  'update public.projects
     set ownership_transferred_at = timestamptz ''2026-03-05 09:00:00+00''
   where id = ''dddddddd-0000-4000-8000-dddddddddddd''');

do $$
declare transferred timestamptz;
begin
  select ownership_transferred_at into transferred
  from public.projects where id = 'dddddddd-0000-4000-8000-dddddddddddd';

  if transferred is null then
    raise exception 'FAIL the allowed transfer did not persist';
  end if;
  raise notice 'ok   the allowed transfer persisted (%)', transferred;
end;
$$;

select 'ALL HANDOFF GATE CHECKS PASSED' as result;

rollback;
