begin;

do $$
begin
  if pg_catalog.to_regclass('public.conversations') is null
    or pg_catalog.to_regclass('public.conversation_participants') is null
    or pg_catalog.to_regclass('public.premium_product_ownerships') is null
    or pg_catalog.to_regprocedure('private.is_active_account(uuid)') is null
    or pg_catalog.to_regprocedure('private.effective_elite_expires_at(uuid)') is null then
    raise exception 'Conversation account-status presentation dependencies are missing.';
  end if;
end;
$$;

-- Returns only presentation-safe identity state for the caller's direct
-- conversation peers. Billing, ownership, and expiry details remain private.
create or replace function public.list_my_conversation_account_statuses()
returns table (
  conversation_id uuid,
  user_id uuid,
  account_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    conversation_row.id,
    peer_participant.user_id,
    case
      when private.effective_elite_expires_at(peer_participant.user_id) is not null then 'elite'::text
      when exists (
        select 1
        from public.premium_product_ownerships as ownership_row
        where ownership_row.user_id = peer_participant.user_id
      ) then 'gold'::text
      else 'normal'::text
    end
  from public.conversation_participants as caller_participant
  join public.conversations as conversation_row
    on conversation_row.id = caller_participant.conversation_id
  join public.conversation_participants as peer_participant
    on peer_participant.conversation_id = conversation_row.id
   and peer_participant.user_id <> caller_participant.user_id
  where caller_participant.user_id = auth.uid()
    and private.is_active_account(caller_participant.user_id)
    and private.is_active_account(peer_participant.user_id)
    and conversation_row.conversation_type = 'direct'::text
    and conversation_row.connection_status in ('accepted'::text, 'disconnected'::text);
$$;

revoke all on function public.list_my_conversation_account_statuses() from public, anon, authenticated;
grant execute on function public.list_my_conversation_account_statuses() to authenticated;

comment on function public.list_my_conversation_account_statuses() is
  'Returns normal, gold, or elite presentation status for active direct-conversation peers of the authenticated active account without exposing entitlement details.';

commit;
