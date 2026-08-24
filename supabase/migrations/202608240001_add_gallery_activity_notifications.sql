begin;

do $$
begin
  if pg_catalog.to_regclass('public.gallery_items') is null
    or pg_catalog.to_regclass('public.gallery_hearts') is null
    or pg_catalog.to_regclass('public.gallery_comments') is null
    or pg_catalog.to_regclass('public.profiles') is null
    or pg_catalog.to_regclass('public.messages') is null
    or pg_catalog.to_regclass('public.message_attachments') is null
    or pg_catalog.to_regclass('storage.objects') is null
    or pg_catalog.to_regprocedure('private.is_active_account(uuid)') is null
    or pg_catalog.to_regprocedure('private.users_can_interact(uuid,uuid)') is null
    or pg_catalog.to_regprocedure('private.can_user_read_conversation_message(uuid,uuid,timestamp with time zone)') is null
  then
    raise exception 'Gallery activity requires the current Gallery and secure message-media architecture.';
  end if;
end;
$$;

create table public.gallery_notifications (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  gallery_item_id uuid not null references public.gallery_items(id) on delete cascade,
  comment_id uuid references public.gallery_comments(id) on delete cascade,
  notification_type text not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  read_at timestamptz,
  constraint gallery_notifications_type_check check (notification_type in ('heart'::text, 'comment'::text)),
  constraint gallery_notifications_shape_check check (
    (notification_type = 'heart'::text and comment_id is null)
    or (notification_type = 'comment'::text and comment_id is not null)
  ),
  constraint gallery_notifications_not_self_check check (recipient_user_id <> actor_user_id)
);

create index gallery_notifications_recipient_created_idx
on public.gallery_notifications (recipient_user_id, created_at desc, id desc);

create index gallery_notifications_recipient_unread_idx
on public.gallery_notifications (recipient_user_id, created_at desc, id desc)
where read_at is null;

create unique index gallery_notifications_heart_unique_idx
on public.gallery_notifications (gallery_item_id, actor_user_id)
where notification_type = 'heart'::text;

create unique index gallery_notifications_comment_unique_idx
on public.gallery_notifications (comment_id)
where notification_type = 'comment'::text;

alter table public.gallery_notifications enable row level security;
alter table public.gallery_notifications replica identity full;
revoke all on table public.gallery_notifications from public, anon, authenticated;
grant select on table public.gallery_notifications to authenticated;

create policy gallery_notifications_recipient_select
on public.gallery_notifications for select to authenticated
using (recipient_user_id = auth.uid());

create or replace function private.prune_gallery_notifications(target_recipient_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.gallery_notifications as notification_row
  where notification_row.recipient_user_id = target_recipient_user_id
    and notification_row.read_at is not null
    and (
      notification_row.created_at < pg_catalog.clock_timestamp() - interval '180 days'
      or notification_row.id in (
        select older_notification.id
        from public.gallery_notifications as older_notification
        where older_notification.recipient_user_id = target_recipient_user_id
          and older_notification.read_at is not null
        order by older_notification.created_at desc, older_notification.id desc
        offset 500
      )
    );
$$;

create or replace function private.handle_gallery_heart_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.gallery_items%rowtype;
begin
  if tg_op = 'DELETE'::text then
    delete from public.gallery_notifications as notification_row
    where notification_row.notification_type = 'heart'::text
      and notification_row.gallery_item_id = old.item_id
      and notification_row.actor_user_id = old.user_id;
    return old;
  end if;

  select item_row.* into v_item
  from public.gallery_items as item_row
  where item_row.id = new.item_id;

  if v_item.id is not null
    and v_item.visibility = 'public'::text
    and v_item.owner_id <> new.user_id
  then
    insert into public.gallery_notifications (
      recipient_user_id, actor_user_id, gallery_item_id, notification_type
    ) values (
      v_item.owner_id, new.user_id, new.item_id, 'heart'::text
    ) on conflict do nothing;
    perform private.prune_gallery_notifications(v_item.owner_id);
  end if;
  return new;
end;
$$;

create or replace function private.handle_gallery_comment_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.gallery_items%rowtype;
begin
  select item_row.* into v_item
  from public.gallery_items as item_row
  where item_row.id = new.item_id;

  if v_item.id is not null
    and v_item.visibility = 'public'::text
    and v_item.owner_id <> new.author_id
  then
    insert into public.gallery_notifications (
      recipient_user_id, actor_user_id, gallery_item_id, comment_id, notification_type
    ) values (
      v_item.owner_id, new.author_id, new.item_id, new.id, 'comment'::text
    ) on conflict do nothing;
    perform private.prune_gallery_notifications(v_item.owner_id);
  end if;
  return new;
end;
$$;

revoke all on function private.handle_gallery_heart_notification() from public, anon, authenticated;
revoke all on function private.handle_gallery_comment_notification() from public, anon, authenticated;
revoke all on function private.prune_gallery_notifications(uuid) from public, anon, authenticated;

create trigger gallery_hearts_notify_owner
after insert or delete on public.gallery_hearts
for each row execute function private.handle_gallery_heart_notification();

create trigger gallery_comments_notify_owner
after insert on public.gallery_comments
for each row execute function private.handle_gallery_comment_notification();

create or replace function public.get_gallery_notification_unread_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.count(*)::integer
  from public.gallery_notifications as notification_row
  where notification_row.recipient_user_id = auth.uid()
    and notification_row.read_at is null
    and private.is_active_account(auth.uid());
$$;

create or replace function public.list_gallery_notifications(
  page_size integer default 50,
  page_offset integer default 0
)
returns table (
  id uuid,
  notification_type text,
  gallery_item_id uuid,
  comment_id uuid,
  created_at timestamptz,
  read_at timestamptz,
  media_type text,
  preview_path text,
  comment_body text,
  actor_id uuid,
  actor_username text,
  actor_display_name text,
  actor_avatar_url text,
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
  if page_size is null or page_offset is null
    or page_size not between 1 and 50
    or page_offset not between 0 and 10000
  then
    raise exception using errcode = '22023', message = 'Unsupported Gallery notification page.';
  end if;

  return query
  select
    notification_row.id,
    notification_row.notification_type,
    notification_row.gallery_item_id,
    notification_row.comment_id,
    notification_row.created_at,
    notification_row.read_at,
    item_row.media_type,
    item_row.preview_path,
    comment_row.body,
    case when private.is_active_account(notification_row.actor_user_id)
      and private.users_can_interact(v_user_id, notification_row.actor_user_id)
      then notification_row.actor_user_id else null end,
    case when private.is_active_account(notification_row.actor_user_id)
      and private.users_can_interact(v_user_id, notification_row.actor_user_id)
      then profile_row.username else null end,
    case when private.is_active_account(notification_row.actor_user_id)
      and private.users_can_interact(v_user_id, notification_row.actor_user_id)
      then profile_row.display_name else null end,
    case when private.is_active_account(notification_row.actor_user_id)
      and private.users_can_interact(v_user_id, notification_row.actor_user_id)
      then profile_row.avatar_url else null end,
    private.is_active_account(notification_row.actor_user_id)
      and private.users_can_interact(v_user_id, notification_row.actor_user_id)
  from public.gallery_notifications as notification_row
  join public.gallery_items as item_row on item_row.id = notification_row.gallery_item_id
  left join public.gallery_comments as comment_row on comment_row.id = notification_row.comment_id
  left join public.profiles as profile_row on profile_row.id = notification_row.actor_user_id
  where notification_row.recipient_user_id = v_user_id
  order by notification_row.created_at desc, notification_row.id desc
  limit page_size offset page_offset;
end;
$$;

create or replace function public.mark_gallery_notifications_read(target_notification_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated integer;
begin
  if v_user_id is null or not private.is_active_account(v_user_id) then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if coalesce(pg_catalog.array_length(target_notification_ids, 1), 0) > 50 then
    raise exception using errcode = '22023', message = 'Too many Gallery notifications were selected.';
  end if;

  update public.gallery_notifications as notification_row
  set read_at = coalesce(notification_row.read_at, pg_catalog.clock_timestamp())
  where notification_row.recipient_user_id = v_user_id
    and notification_row.id = any(coalesce(target_notification_ids, '{}'::uuid[]))
    and notification_row.read_at is null;
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

create or replace function public.mark_all_gallery_notifications_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated integer;
begin
  if v_user_id is null or not private.is_active_account(v_user_id) then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  update public.gallery_notifications as notification_row
  set read_at = pg_catalog.clock_timestamp()
  where notification_row.recipient_user_id = v_user_id
    and notification_row.read_at is null;
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

create or replace function public.authorize_message_gallery_save(
  target_actor_id uuid,
  target_source_message_id uuid,
  target_attachment_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message public.messages%rowtype;
  v_attachment_count integer := coalesce(pg_catalog.array_length(target_attachment_ids, 1), 0);
  v_attachments jsonb;
begin
  if target_actor_id is null or target_source_message_id is null
    or not private.is_active_account(target_actor_id)
  then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if v_attachment_count not between 1 and 10
    or v_attachment_count <> coalesce((select pg_catalog.count(distinct selected_id) from pg_catalog.unnest(target_attachment_ids) as selected_id), 0)
  then
    raise exception using errcode = '22023', message = 'Choose one to ten unique Gallery-compatible images.';
  end if;

  select message_row.* into v_message
  from public.messages as message_row
  where message_row.id = target_source_message_id
  for share;

  if v_message.id is null
    or v_message.is_deleted
    or v_message.source_request_id is not null
    or v_message.message_type <> 'image'::text
    or not private.can_user_read_conversation_message(target_actor_id, v_message.conversation_id, v_message.created_at)
  then
    raise exception using errcode = '42501', message = 'The source image message is unavailable.';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(target_attachment_ids) as selected_id
    where not exists (
      select 1 from public.message_attachments as attachment_row
      where attachment_row.id = selected_id
        and attachment_row.message_id = target_source_message_id
        and attachment_row.attachment_kind = 'image'::text
        and attachment_row.mime_type in ('image/jpeg'::text, 'image/png'::text, 'image/webp'::text)
        and attachment_row.size_bytes between 1 and 10485760
        and attachment_row.width between 1 and 20000
        and attachment_row.height between 1 and 20000
    )
  ) then
    raise exception using errcode = '42501', message = 'A selected image is unavailable or Gallery-incompatible.';
  end if;

  select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(attachment_row) order by selected.ordinality)
  into v_attachments
  from pg_catalog.unnest(target_attachment_ids) with ordinality as selected(id, ordinality)
  join public.message_attachments as attachment_row on attachment_row.id = selected.id
  where attachment_row.message_id = target_source_message_id;

  return pg_catalog.jsonb_build_object('message_id', v_message.id, 'attachments', v_attachments);
end;
$$;

create or replace function public.finalize_message_gallery_save(
  target_actor_id uuid,
  target_source_message_id uuid,
  gallery_records jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message public.messages%rowtype;
  v_record jsonb;
  v_source public.message_attachments%rowtype;
  v_item_id uuid;
  v_expected_prefix text;
  v_expected_original_path text;
  v_original_path text;
  v_preview_path text;
  v_result jsonb := '[]'::jsonb;
begin
  if target_actor_id is null or target_source_message_id is null
    or not private.is_active_account(target_actor_id)
    or gallery_records is null
    or pg_catalog.jsonb_typeof(gallery_records) <> 'array'::text
    or pg_catalog.jsonb_array_length(gallery_records) not between 1 and 10
  then
    raise exception using errcode = '22023', message = 'A valid Gallery save is required.';
  end if;

  select message_row.* into v_message
  from public.messages as message_row
  where message_row.id = target_source_message_id
  for share;
  if v_message.id is null
    or v_message.is_deleted
    or v_message.source_request_id is not null
    or v_message.message_type <> 'image'::text
    or not private.can_user_read_conversation_message(target_actor_id, v_message.conversation_id, v_message.created_at)
  then
    raise exception using errcode = '42501', message = 'The source image message is unavailable.';
  end if;

  for v_record in select value from pg_catalog.jsonb_array_elements(gallery_records)
  loop
    if v_record ->> 'source_attachment_id' is null
      or v_record ->> 'item_id' is null
      or v_record ->> 'original_path' is null
      or v_record ->> 'preview_path' is null
    then
      raise exception using errcode = '22023', message = 'Incomplete Gallery save metadata.';
    end if;

    select attachment_row.* into v_source
    from public.message_attachments as attachment_row
    where attachment_row.id = (v_record ->> 'source_attachment_id')::uuid
      and attachment_row.message_id = target_source_message_id
      and attachment_row.attachment_kind = 'image'::text;
    if v_source.id is null
      or v_source.mime_type not in ('image/jpeg'::text, 'image/png'::text, 'image/webp'::text)
      or v_source.size_bytes not between 1 and 10485760
      or v_source.width not between 1 and 20000
      or v_source.height not between 1 and 20000
    then
      raise exception using errcode = '42501', message = 'A source image is unavailable or Gallery-incompatible.';
    end if;

    v_item_id := (v_record ->> 'item_id')::uuid;
    v_original_path := v_record ->> 'original_path';
    v_preview_path := v_record ->> 'preview_path';
    v_expected_prefix := target_actor_id::text || '/'::text || v_item_id::text || '/'::text;
    if v_source.mime_type = 'image/jpeg'::text then
      v_expected_original_path := v_expected_prefix || 'original.jpg'::text;
    elsif v_source.mime_type = 'image/png'::text then
      v_expected_original_path := v_expected_prefix || 'original.png'::text;
    else
      v_expected_original_path := v_expected_prefix || 'original.webp'::text;
    end if;
    if v_original_path <> v_expected_original_path
      or v_preview_path <> v_expected_prefix || 'preview.webp'::text
    then
      raise exception using errcode = '22023', message = 'Invalid Gallery destination path.';
    end if;

    if not exists (
      select 1 from storage.objects as object_row
      where object_row.bucket_id = 'gallery-media'::text
        and object_row.name = v_original_path
        and object_row.metadata ->> 'mimetype' = v_source.mime_type
        and coalesce((object_row.metadata ->> 'size')::bigint, 0::bigint) = v_source.size_bytes
    ) or not exists (
      select 1 from storage.objects as object_row
      where object_row.bucket_id = 'gallery-media'::text
        and object_row.name = v_preview_path
        and object_row.metadata ->> 'mimetype' = 'image/webp'::text
        and coalesce((object_row.metadata ->> 'size')::bigint, 0::bigint) between 1 and 2097152
    ) then
      raise exception using errcode = '55000', message = 'The independent Gallery media snapshot is incomplete.';
    end if;

    insert into public.gallery_items (
      id, owner_id, media_type, mime_type, file_size, width, height, duration_ms,
      visibility, description, original_path, preview_path
    ) values (
      v_item_id, target_actor_id, 'image'::text, v_source.mime_type, v_source.size_bytes,
      v_source.width, v_source.height, null, 'private'::text, ''::text,
      v_original_path, v_preview_path
    );
    v_result := v_result || pg_catalog.jsonb_build_array(v_item_id);
    v_source := null;
  end loop;
  return pg_catalog.jsonb_build_object('item_ids', v_result);
end;
$$;

revoke all on function public.get_gallery_notification_unread_count() from public, anon, authenticated;
revoke all on function public.list_gallery_notifications(integer, integer) from public, anon, authenticated;
revoke all on function public.mark_gallery_notifications_read(uuid[]) from public, anon, authenticated;
revoke all on function public.mark_all_gallery_notifications_read() from public, anon, authenticated;
revoke all on function public.authorize_message_gallery_save(uuid, uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.finalize_message_gallery_save(uuid, uuid, jsonb) from public, anon, authenticated;

grant execute on function public.get_gallery_notification_unread_count() to authenticated;
grant execute on function public.list_gallery_notifications(integer, integer) to authenticated;
grant execute on function public.mark_gallery_notifications_read(uuid[]) to authenticated;
grant execute on function public.mark_all_gallery_notifications_read() to authenticated;
grant execute on function public.authorize_message_gallery_save(uuid, uuid, uuid[]) to service_role;
grant execute on function public.finalize_message_gallery_save(uuid, uuid, jsonb) to service_role;

do $$
begin
  if exists (
    select 1 from pg_catalog.pg_publication as publication_row
    where publication_row.pubname = 'supabase_realtime'
  ) and not exists (
    select 1 from pg_catalog.pg_publication_tables as publication_table
    where publication_table.pubname = 'supabase_realtime'
      and publication_table.schemaname = 'public'
      and publication_table.tablename = 'gallery_notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.gallery_notifications';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;

-- Verification (run as an administrative SQL role after applying):
-- select tablename, rowsecurity from pg_catalog.pg_tables where schemaname = 'public' and tablename = 'gallery_notifications';
-- select policyname, roles, cmd from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'gallery_notifications';
-- select has_table_privilege('anon', 'public.gallery_notifications', 'select') as anon_can_read,
--        has_table_privilege('authenticated', 'public.gallery_notifications', 'insert,update,delete') as browser_can_write_directly;
-- select has_function_privilege('authenticated', 'public.list_gallery_notifications(integer,integer)', 'execute') as authenticated_can_list,
--        has_function_privilege('authenticated', 'public.authorize_message_gallery_save(uuid,uuid,uuid[])', 'execute') as browser_can_authorize_copy,
--        has_function_privilege('service_role', 'public.authorize_message_gallery_save(uuid,uuid,uuid[])', 'execute') as worker_can_authorize_copy;
-- select schemaname, tablename from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'gallery_notifications';
