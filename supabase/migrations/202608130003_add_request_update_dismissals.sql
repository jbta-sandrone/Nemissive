begin;

create table if not exists public.request_update_dismissals (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null references public.conversation_requests(id) on delete cascade,
  dismissed_at timestamptz not null default pg_catalog.now(),
  constraint request_update_dismissals_pkey primary key (user_id, request_id)
);

create index if not exists request_update_dismissals_request_id_idx
on public.request_update_dismissals (request_id);

alter table public.request_update_dismissals enable row level security;

revoke all on table public.request_update_dismissals from public;
revoke all on table public.request_update_dismissals from anon;
revoke all on table public.request_update_dismissals from authenticated;

drop policy if exists request_update_dismissals_owner_select
on public.request_update_dismissals;

create policy request_update_dismissals_owner_select
on public.request_update_dismissals
for select
to authenticated
using (request_update_dismissals.user_id = auth.uid());

grant select on table public.request_update_dismissals to authenticated;

create or replace function public.list_request_updates()
returns table (
  id uuid,
  recipient_id uuid,
  status text,
  conversation_id uuid,
  created_at timestamptz,
  updated_at timestamptz
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
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  return query
  select
    request_row.id,
    request_row.recipient_id,
    request_row.status,
    request_row.conversation_id,
    request_row.created_at,
    request_row.updated_at
  from public.conversation_requests as request_row
  where request_row.sender_id = v_user_id
    and request_row.status in ('accepted', 'declined')
    and not exists (
      select 1
      from public.request_update_dismissals as dismissal
      where dismissal.user_id = v_user_id
        and dismissal.request_id = request_row.id
    )
  order by request_row.updated_at desc, request_row.id desc
  limit 50;
end;
$$;

create or replace function public.dismiss_request_update(target_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_dismissible boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select exists (
    select 1
    from public.conversation_requests as request_row
    where request_row.id = target_request_id
      and request_row.sender_id = v_user_id
      and request_row.status in ('accepted', 'declined')
  )
  into v_is_dismissible;

  if not v_is_dismissible then
    raise exception 'Request update not found.' using errcode = 'P0002';
  end if;

  insert into public.request_update_dismissals as dismissal (
    user_id,
    request_id,
    dismissed_at
  )
  values (
    v_user_id,
    target_request_id,
    pg_catalog.now()
  )
  on conflict on constraint request_update_dismissals_pkey do nothing;

  return true;
end;
$$;

revoke all on function public.list_request_updates() from public;
revoke all on function public.list_request_updates() from anon;
revoke all on function public.list_request_updates() from authenticated;
grant execute on function public.list_request_updates() to authenticated;

revoke all on function public.dismiss_request_update(uuid) from public;
revoke all on function public.dismiss_request_update(uuid) from anon;
revoke all on function public.dismiss_request_update(uuid) from authenticated;
grant execute on function public.dismiss_request_update(uuid) to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_publication as publication_row
    where publication_row.pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_catalog.pg_publication_tables as publication_table
    where publication_table.pubname = 'supabase_realtime'
      and publication_table.schemaname = 'public'
      and publication_table.tablename = 'request_update_dismissals'
  ) then
    execute 'alter publication supabase_realtime add table public.request_update_dismissals';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
