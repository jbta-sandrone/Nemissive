begin;

do $$
begin
  if pg_catalog.to_regclass('public.user_blocks') is null
    or pg_catalog.to_regclass('public.profiles') is null
    or pg_catalog.to_regprocedure('public.set_user_blocked(uuid,boolean)') is null then
    raise exception 'Blocked-account listing requires the secure user blocking schema.';
  end if;
end;
$$;

create or replace function public.list_blocked_accounts()
returns table (
  blocked_profile_id uuid,
  display_name text,
  username text,
  avatar_url text,
  blocked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  return query
  select
    blocked_profile.id,
    blocked_profile.display_name,
    blocked_profile.username,
    blocked_profile.avatar_url,
    block_row.created_at
  from public.user_blocks as block_row
  join public.profiles as blocked_profile
    on blocked_profile.id = block_row.blocked_id
  where block_row.blocker_id = v_user_id
  order by block_row.created_at desc, blocked_profile.id;
end;
$$;

revoke all on function public.list_blocked_accounts() from public, anon;
grant execute on function public.list_blocked_accounts() to authenticated;

comment on function public.list_blocked_accounts() is
  'Lists only profiles directly blocked by auth.uid(), without revealing reverse or mutual block state.';

notify pgrst, 'reload schema';

commit;

-- Non-destructive verification (run after applying):
-- select pg_catalog.to_regprocedure('public.list_blocked_accounts()') as blocked_accounts_rpc;
-- select has_function_privilege('anon', 'public.list_blocked_accounts()', 'execute') as anon_can_list,
--        has_function_privilege('authenticated', 'public.list_blocked_accounts()', 'execute') as authenticated_can_list;
-- select * from public.list_blocked_accounts();
