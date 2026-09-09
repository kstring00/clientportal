-- ============================================================================
-- 0006 — Approval decision + permanent history are one atomic database action.
--
-- The client is promised that an approval cannot silently change without a
-- timestamped history event. Two independent HTTP writes cannot make that
-- promise: the status update could succeed and the history insert could fail.
-- This security-invoker RPC keeps RLS in force while making both writes one
-- PostgreSQL transaction.
-- ============================================================================

create or replace function public.portal_decide_approval(
  p_approval_id uuid,
  p_decision text,
  p_comment text default null
)
returns void
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  v_project_id uuid;
  v_affected integer;
begin
  if p_decision not in ('approved', 'changes_requested') then
    raise exception 'Invalid approval decision.' using errcode = 'check_violation';
  end if;

  if p_comment is not null and char_length(p_comment) > 4000 then
    raise exception 'Approval comment is too long.' using errcode = 'check_violation';
  end if;

  -- The SELECT itself is RLS-filtered. A caller cannot resolve an approval from
  -- a project they are not a member of.
  select project_id
    into v_project_id
    from public.approvals
   where id = p_approval_id;

  if v_project_id is null then
    raise exception 'Approval not found.' using errcode = 'insufficient_privilege';
  end if;

  update public.approvals
     set status = p_decision,
         decided_at = now(),
         decided_by = auth.uid()
   where id = p_approval_id
     and status = 'waiting';

  get diagnostics v_affected = row_count;
  if v_affected <> 1 then
    raise exception 'Approval has already been decided.' using errcode = 'check_violation';
  end if;

  insert into public.approval_events (
    approval_id,
    project_id,
    actor_id,
    decision,
    comment
  ) values (
    p_approval_id,
    v_project_id,
    auth.uid(),
    p_decision,
    nullif(btrim(p_comment), '')
  );
end;
$$;

revoke all on function public.portal_decide_approval(uuid, text, text) from public;
grant execute on function public.portal_decide_approval(uuid, text, text) to authenticated;

comment on function public.portal_decide_approval(uuid, text, text) is
  'Atomically updates an accessible waiting approval and appends its permanent decision event under the caller''s RLS-scoped session.';
