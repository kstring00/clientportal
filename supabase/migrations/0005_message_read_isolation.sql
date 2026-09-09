-- ============================================================================
-- 0005 — Tighten message read receipts to the messages a user can actually see.
--
-- `message_reads` is per-user state, but `user_id = auth.uid()` alone is not a
-- complete project boundary: somebody who somehow guessed another project's
-- message UUID could otherwise create a meaningless read-receipt row for that
-- UUID. It reveals no message content, but the portal's stronger promise is that
-- Client A cannot write rows connected to Client B's project at all.
-- ============================================================================

drop policy if exists message_reads_own on public.message_reads;

create policy message_reads_own on public.message_reads
for all to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.messages message
    where message.id = message_id
      and private.portal_can_access_project(message.project_id)
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.messages message
    where message.id = message_id
      and private.portal_can_access_project(message.project_id)
  )
);
