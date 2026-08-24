begin;

do $$
begin
  if pg_catalog.to_regclass('public.gallery_hearts') is null
    or pg_catalog.to_regclass('public.gallery_notifications') is null
    or pg_catalog.to_regclass('public.profiles') is null
    or pg_catalog.to_regprocedure('private.is_active_account(uuid)') is null
    or pg_catalog.to_regprocedure('private.users_can_interact(uuid,uuid)') is null
    or pg_catalog.to_regprocedure('private.can_view_gallery_item(uuid,uuid)') is null
  then
    raise exception 'Gallery reaction refinement requires the current Gallery and Gallery notification architecture.';
  end if;
end;
$$;

create or replace function public.list_gallery_heart_users(
  target_gallery_item_id uuid,
  page_size integer default 30,
  page_offset integer default 0
)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  is_current_user boolean,
  actor_available boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not private.is_active_account(v_user_id) then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if target_gallery_item_id is null
    or not private.can_view_gallery_item(v_user_id, target_gallery_item_id)
  then
    raise exception using errcode = '42501', message = 'This Gallery item is unavailable.';
  end if;
  if page_size is null or page_offset is null
    or page_size not between 1 and 50
    or page_offset not between 0 and 10000
  then
    raise exception using errcode = '22023', message = 'Unsupported Gallery reaction page.';
  end if;

  return query
  select
    case when heart_row.user_id = v_user_id or (
      private.is_active_account(heart_row.user_id)
      and private.users_can_interact(v_user_id, heart_row.user_id)
    ) then heart_row.user_id else null end,
    case when heart_row.user_id = v_user_id or (
      private.is_active_account(heart_row.user_id)
      and private.users_can_interact(v_user_id, heart_row.user_id)
    ) then profile_row.username else null end,
    case when heart_row.user_id = v_user_id or (
      private.is_active_account(heart_row.user_id)
      and private.users_can_interact(v_user_id, heart_row.user_id)
    ) then profile_row.display_name else null end,
    case when heart_row.user_id = v_user_id or (
      private.is_active_account(heart_row.user_id)
      and private.users_can_interact(v_user_id, heart_row.user_id)
    ) then profile_row.avatar_url else null end,
    heart_row.user_id = v_user_id,
    heart_row.user_id = v_user_id or (
      private.is_active_account(heart_row.user_id)
      and private.users_can_interact(v_user_id, heart_row.user_id)
    )
  from public.gallery_hearts as heart_row
  left join public.profiles as profile_row on profile_row.id = heart_row.user_id
  where heart_row.item_id = target_gallery_item_id
  order by heart_row.created_at desc, heart_row.user_id desc
  limit page_size offset page_offset;
end;
$$;

create or replace function public.remove_gallery_notification(target_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not private.is_active_account(v_user_id) then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if target_notification_id is null then
    raise exception using errcode = '22023', message = 'A Gallery notification is required.';
  end if;

  delete from public.gallery_notifications as notification_row
  where notification_row.id = target_notification_id
    and notification_row.recipient_user_id = v_user_id;
  return found;
end;
$$;

create or replace function public.clear_gallery_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_deleted integer;
begin
  if v_user_id is null or not private.is_active_account(v_user_id) then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  delete from public.gallery_notifications as notification_row
  where notification_row.recipient_user_id = v_user_id;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.list_gallery_heart_users(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.remove_gallery_notification(uuid) from public, anon, authenticated;
revoke all on function public.clear_gallery_notifications() from public, anon, authenticated;

grant execute on function public.list_gallery_heart_users(uuid, integer, integer) to authenticated;
grant execute on function public.remove_gallery_notification(uuid) to authenticated;
grant execute on function public.clear_gallery_notifications() to authenticated;

notify pgrst, 'reload schema';

commit;

-- Verification (run as an administrative SQL role after applying):
-- select has_function_privilege('anon', 'public.list_gallery_heart_users(uuid,integer,integer)', 'execute') as anon_can_list_reactors,
--        has_function_privilege('authenticated', 'public.list_gallery_heart_users(uuid,integer,integer)', 'execute') as authenticated_can_list_reactors;
-- select has_function_privilege('authenticated', 'public.remove_gallery_notification(uuid)', 'execute') as authenticated_can_remove_own,
--        has_function_privilege('authenticated', 'public.clear_gallery_notifications()', 'execute') as authenticated_can_clear_own;
-- select has_table_privilege('authenticated', 'public.gallery_notifications', 'delete') as browser_can_delete_directly;
