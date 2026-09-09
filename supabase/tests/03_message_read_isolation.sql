-- Message read receipts belong only to visible project messages.
-- Runs inside a transaction and leaves no fixtures behind.

\pset tuples_only on
\pset format unaligned

begin;
set local client_min_messages = notice;

insert into auth.users (id, instance_id, aud, role, email) values
  ('41111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reads-a@example.test'),
  ('42222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reads-b@example.test')
on conflict (id) do nothing;

insert into public.users (id, email, role, name) values
  ('41111111-1111-4111-8111-111111111111', 'reads-a@example.test', 'client', 'Read Client A'),
  ('42222222-2222-4222-8222-222222222222', 'reads-b@example.test', 'client', 'Read Client B');

insert into public.clients (id, business_name, contact_name) values
  ('4aaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'Read Alpha', 'Read Client A'),
  ('4bbbbbbb-2222-4222-8222-bbbbbbbbbbbb', 'Read Beta', 'Read Client B');

insert into public.projects (id, client_id, name, slug) values
  ('4aaaaaaa-0000-4000-8000-aaaaaaaaaaaa', '4aaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'Read A project', 'read-a-project'),
  ('4bbbbbbb-0000-4000-8000-bbbbbbbbbbbb', '4bbbbbbb-2222-4222-8222-bbbbbbbbbbbb', 'Read B project', 'read-b-project');

insert into public.project_members (project_id, user_id, member_role) values
  ('4aaaaaaa-0000-4000-8000-aaaaaaaaaaaa', '41111111-1111-4111-8111-111111111111', 'owner'),
  ('4bbbbbbb-0000-4000-8000-bbbbbbbbbbbb', '42222222-2222-4222-8222-222222222222', 'owner');

insert into public.messages (id, project_id, sender_id, body) values
  ('4aaaaaaa-9999-4999-8999-aaaaaaaaaaaa', '4aaaaaaa-0000-4000-8000-aaaaaaaaaaaa', '41111111-1111-4111-8111-111111111111', 'Visible to A'),
  ('4bbbbbbb-9999-4999-8999-bbbbbbbbbbbb', '4bbbbbbb-0000-4000-8000-bbbbbbbbbbbb', '42222222-2222-4222-8222-222222222222', 'Visible to B');

set local role authenticated;
set local request.jwt.claims = '{"sub":"41111111-1111-4111-8111-111111111111","role":"authenticated"}';

-- Own-project receipt succeeds.
insert into public.message_reads (message_id, user_id)
values ('4aaaaaaa-9999-4999-8999-aaaaaaaaaaaa', '41111111-1111-4111-8111-111111111111');

do $$
declare n integer;
begin
  select count(*) into n
  from public.message_reads
  where message_id = '4aaaaaaa-9999-4999-8999-aaaaaaaaaaaa'
    and user_id = '41111111-1111-4111-8111-111111111111';
  if n <> 1 then
    raise exception 'FAIL A could not create its own read receipt';
  end if;
  raise notice 'ok   A can mark its own project message read';
end;
$$;

-- Guessed message UUID from B must not be writable by A.
do $$
begin
  begin
    insert into public.message_reads (message_id, user_id)
    values ('4bbbbbbb-9999-4999-8999-bbbbbbbbbbbb', '41111111-1111-4111-8111-111111111111');
  exception when insufficient_privilege or check_violation then
    raise notice 'ok   A cannot write a read receipt for B message';
    return;
  end;
  raise exception 'FAIL A wrote a read receipt attached to B project';
end;
$$;

reset role;
rollback;
