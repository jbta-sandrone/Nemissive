begin;

create or replace function public.dismiss_all_request_updates()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_dismissed_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  insert into public.request_update_dismissals as dismissal (
    user_id,
    request_id,
    dismissed_at
  )
  select
    v_user_id,
    request_row.id,
    pg_catalog.now()
  from public.conversation_requests as request_row
  where request_row.sender_id = v_user_id
    and request_row.status in ('accepted', 'declined')
  on conflict on constraint request_update_dismissals_pkey do nothing;

  get diagnostics v_dismissed_count = row_count;
  return v_dismissed_count;
end;
$$;

revoke all on function public.dismiss_all_request_updates() from public;
revoke all on function public.dismiss_all_request_updates() from anon;
revoke all on function public.dismiss_all_request_updates() from authenticated;
grant execute on function public.dismiss_all_request_updates() to authenticated;

notify pgrst, 'reload schema';

commit;
