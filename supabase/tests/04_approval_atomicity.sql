-- Approval current state and permanent history must change atomically.

\pset tuples_only on
\pset format unaligned

begin;
set local client_min_messages = notice;

insert into auth.users (id, instance_id, aud, role, email) values
  ('51111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'approval-a@example.test'),
  ('52222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'approval-b@example.test')
on conflict (id) do nothing;

insert into public.users (id, email, role, name) values
  ('51111111-1111-4111-8111-111111111111', 'approval-a@example.test', 'client', 'Approval A'),
  ('52222222-2222-4222-8222-222222222222', 'approval-b@example.test', 'client', 'Approval B');

insert into public.clients (id, business_name, contact_name) values
  ('5aaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'Approval Alpha', 'Approval A'),
  ('5bbbbbbb-2222-4222-8222-bbbbbbbbbbbb', 'Approval Beta', 'Approval B');

insert into public.projects (id, client_id, name, slug) values
  ('5aaaaaaa-0000-4000-8000-aaaaaaaaaaaa', '5aaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'Approval A project', 'approval-a-project'),
  ('5bbbbbbb-0000-4000-8000-bbbbbbbbbbbb', '5bbbbbbb-2222-4222-8222-bbbbbbbbbbbb', 'Approval B project', 'approval-b-project');

insert into public.project_members (project_id, user_id, member_role) values
  ('5aaaaaaa-0000-4000-8000-aaaaaaaaaaaa', '51111111-1111-4111-8111-111111111111', 'owner'),
  ('5bbbbbbb-0000-4000-8000-bbbbbbbbbbbb', '52222222-2222-4222-8222-222222222222', 'owner');

insert into public.approvals (id, project_id, title) values
  ('5aaaaaaa-9999-4999-8999-aaaaaaaaaaaa', '5aaaaaaa-0000-4000-8000-aaaaaaaaaaaa', 'A homepage'),
  ('5bbbbbbb-9999-4999-8999-bbbbbbbbbbbb', '5bbbbbbb-0000-4000-8000-bbbbbbbbbbbb', 'B homepage');

set local role authenticated;
set local request.jwt.claims = '{"sub":"51111111-1111-4111-8111-111111111111","role":"authenticated"}';

select public.portal_decide_approval(
  '5aaaaaaa-9999-4999-8999-aaaaaaaaaaaa',
  'approved',
  'Looks right.'
);

do $$
declare
  current_status text;
  decided_by_value uuid;
  history_count integer;
  history_comment text;
begin
  select status, decided_by
    into current_status, decided_by_value
    from public.approvals
   where id = '5aaaaaaa-9999-4999-8999-aaaaaaaaaaaa';

  select count(*), max(comment)
    into history_count, history_comment
    from public.approval_events
   where approval_id = '5aaaaaaa-9999-4999-8999-aaaaaaaaaaaa'
     and decision = 'approved';

  if current_status <> 'approved' then
    raise exception 'FAIL approval summary was not updated';
  end if;
  if decided_by_value <> '51111111-1111-4111-8111-111111111111' then
    raise exception 'FAIL approval actor was not the caller';
  end if;
  if history_count <> 1 or history_comment <> 'Looks right.' then
    raise exception 'FAIL permanent history was not written with the decision';
  end if;

  raise notice 'ok   approval summary and history committed together';
end;
$$;

-- The same approval cannot be decided twice, and a failed retry must not append
-- another history event.
do $$
begin
  begin
    perform public.portal_decide_approval(
      '5aaaaaaa-9999-4999-8999-aaaaaaaaaaaa',
      'changes_requested',
      'Second answer'
    );
  exception when check_violation then
    raise notice 'ok   second decision rejected';
    return;
  end;
  raise exception 'FAIL second approval decision was allowed';
end;
$$;

do $$
declare n integer;
begin
  select count(*) into n
  from public.approval_events
  where approval_id = '5aaaaaaa-9999-4999-8999-aaaaaaaaaaaa';
  if n <> 1 then
    raise exception 'FAIL rejected retry changed history count to %', n;
  end if;
  raise notice 'ok   rejected retry appended no history';
end;
$$;

-- An approval from another project is invisible to the RPC under RLS.
do $$
begin
  begin
    perform public.portal_decide_approval(
      '5bbbbbbb-9999-4999-8999-bbbbbbbbbbbb',
      'approved',
      null
    );
  exception when insufficient_privilege then
    raise notice 'ok   cross-project approval decision rejected';
    return;
  end;
  raise exception 'FAIL client A decided client B approval';
end;
$$;

reset role;
rollback;
