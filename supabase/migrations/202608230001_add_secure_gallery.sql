begin;

do $$
begin
  if pg_catalog.to_regclass('public.profiles') is null
    or pg_catalog.to_regclass('public.conversations') is null
    or pg_catalog.to_regclass('public.conversation_participants') is null
    or pg_catalog.to_regclass('storage.buckets') is null
    or pg_catalog.to_regclass('storage.objects') is null
  then
    raise exception 'Gallery requires the current Nemissive profile, conversation, and Storage architecture.';
  end if;
end;
$$;

create table public.gallery_items (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  media_type text not null,
  mime_type text not null,
  file_size bigint not null,
  width integer not null,
  height integer not null,
  duration_ms integer,
  visibility text not null default 'private'::text,
  description text not null default ''::text,
  original_path text not null unique,
  preview_path text not null unique,
  added_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint gallery_items_media_type_check check (media_type in ('image'::text, 'video'::text)),
  constraint gallery_items_visibility_check check (visibility in ('private'::text, 'public'::text)),
  constraint gallery_items_description_check check (pg_catalog.char_length(description) <= 500),
  constraint gallery_items_dimensions_check check (width between 1 and 20000 and height between 1 and 20000),
  constraint gallery_items_media_metadata_check check (
    (media_type = 'image'::text and mime_type in ('image/jpeg'::text, 'image/png'::text, 'image/webp'::text) and file_size between 1 and 10485760 and duration_ms is null)
    or
    (media_type = 'video'::text and mime_type in ('video/mp4'::text, 'video/webm'::text) and file_size between 1 and 52428800 and duration_ms between 1 and 300000)
  )
);

create index gallery_items_owner_added_idx on public.gallery_items (owner_id, added_at desc, id desc);
create index gallery_items_public_owner_added_idx on public.gallery_items (owner_id, added_at desc, id desc) where visibility = 'public'::text;

create table public.gallery_hearts (
  item_id uuid not null references public.gallery_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (item_id, user_id)
);

create index gallery_hearts_user_idx on public.gallery_hearts (user_id, created_at desc);

create table public.gallery_comments (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  item_id uuid not null references public.gallery_items(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint gallery_comments_body_check check (body = pg_catalog.btrim(body) and pg_catalog.char_length(body) between 1 and 500)
);

create index gallery_comments_item_created_idx on public.gallery_comments (item_id, created_at, id);
create index gallery_comments_author_idx on public.gallery_comments (author_id, created_at desc);

create trigger gallery_items_set_updated_at
before update on public.gallery_items
for each row execute function private.set_updated_at();

create trigger gallery_comments_set_updated_at
before update on public.gallery_comments
for each row execute function private.set_updated_at();

create or replace function private.can_view_gallery_owner(viewer_id uuid, target_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select viewer_id is not null
    and viewer_id = auth.uid()
    and target_owner_id is not null
    and private.is_active_account(viewer_id)
    and private.is_active_account(target_owner_id)
    and (
      viewer_id = target_owner_id
      or (
        private.users_can_interact(viewer_id, target_owner_id)
        and exists (
          select 1
          from public.conversations as conversation_row
          join public.conversation_participants as viewer_participant
            on viewer_participant.conversation_id = conversation_row.id
           and viewer_participant.user_id = viewer_id
          join public.conversation_participants as owner_participant
            on owner_participant.conversation_id = conversation_row.id
           and owner_participant.user_id = target_owner_id
          where conversation_row.conversation_type = 'direct'::text
            and conversation_row.connection_status = 'accepted'::text
        )
      )
    );
$$;

create or replace function private.can_view_gallery_item(viewer_id uuid, target_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.gallery_items as item_row
    where item_row.id = target_item_id
      and private.can_view_gallery_owner(viewer_id, item_row.owner_id)
      and (item_row.owner_id = viewer_id or item_row.visibility = 'public'::text)
  );
$$;

create or replace function private.can_read_gallery_storage_object(viewer_id uuid, candidate_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_item_id uuid;
begin
  if viewer_id is null
    or candidate_path is null
    or pg_catalog.array_length(pg_catalog.string_to_array(candidate_path, '/'::text), 1) <> 3
    or pg_catalog.split_part(candidate_path, '/'::text, 2) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    return false;
  end if;

  v_item_id := pg_catalog.split_part(candidate_path, '/'::text, 2)::uuid;
  return private.can_view_gallery_item(viewer_id, v_item_id)
    and exists (
      select 1
      from public.gallery_items as item_row
      where item_row.id = v_item_id
        and candidate_path in (item_row.original_path, item_row.preview_path)
    );
end;
$$;

revoke all on function private.can_view_gallery_owner(uuid, uuid) from public, anon, authenticated;
revoke all on function private.can_view_gallery_item(uuid, uuid) from public, anon, authenticated;
revoke all on function private.can_read_gallery_storage_object(uuid, text) from public, anon, authenticated;
grant execute on function private.can_view_gallery_owner(uuid, uuid) to authenticated;
grant execute on function private.can_view_gallery_item(uuid, uuid) to authenticated;
grant execute on function private.can_read_gallery_storage_object(uuid, text) to authenticated;

alter table public.gallery_items enable row level security;
alter table public.gallery_hearts enable row level security;
alter table public.gallery_comments enable row level security;
alter table public.gallery_items replica identity full;
alter table public.gallery_hearts replica identity full;
alter table public.gallery_comments replica identity full;

revoke all on table public.gallery_items from public, anon, authenticated;
revoke all on table public.gallery_hearts from public, anon, authenticated;
revoke all on table public.gallery_comments from public, anon, authenticated;

create policy gallery_items_authorized_select
on public.gallery_items for select to authenticated
using (private.can_view_gallery_item(auth.uid(), gallery_items.id));

create policy gallery_hearts_authorized_select
on public.gallery_hearts for select to authenticated
using (private.can_view_gallery_item(auth.uid(), gallery_hearts.item_id));

create policy gallery_comments_authorized_select
on public.gallery_comments for select to authenticated
using (private.can_view_gallery_item(auth.uid(), gallery_comments.item_id));

grant select on table public.gallery_items to authenticated;
grant select on table public.gallery_hearts to authenticated;
grant select on table public.gallery_comments to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gallery-media'::text,
  'gallery-media'::text,
  false,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists gallery_media_insert_own on storage.objects;
create policy gallery_media_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'gallery-media'::text
  and owner_id = auth.uid()::text
  and private.is_active_account(auth.uid())
  and pg_catalog.array_length(pg_catalog.string_to_array(name, '/'::text), 1) = 3
  and pg_catalog.split_part(name, '/'::text, 1) = auth.uid()::text
  and pg_catalog.split_part(name, '/'::text, 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and (
    pg_catalog.split_part(name, '/'::text, 3) = 'preview.webp'::text
    or pg_catalog.split_part(name, '/'::text, 3) in ('original.jpg'::text, 'original.jpeg'::text, 'original.png'::text, 'original.webp'::text, 'original.mp4'::text, 'original.webm'::text)
  )
);

drop policy if exists gallery_media_select_authorized on storage.objects;
create policy gallery_media_select_authorized
on storage.objects for select to authenticated
using (
  bucket_id = 'gallery-media'::text
  and private.can_read_gallery_storage_object(auth.uid(), name)
);

drop policy if exists gallery_media_delete_own on storage.objects;
create policy gallery_media_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'gallery-media'::text
  and owner_id = auth.uid()::text
  and pg_catalog.split_part(name, '/'::text, 1) = auth.uid()::text
  and private.is_active_account(auth.uid())
);

create or replace function public.create_gallery_item(
  target_item_id uuid,
  candidate_media_type text,
  candidate_mime_type text,
  candidate_file_size bigint,
  candidate_width integer,
  candidate_height integer,
  candidate_duration_ms integer,
  candidate_visibility text,
  candidate_description text,
  candidate_original_path text,
  candidate_preview_path text
)
returns public.gallery_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.gallery_items;
  v_expected_prefix text;
  v_expected_original_path text;
begin
  if v_user_id is null or not private.is_active_account(v_user_id) then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if target_item_id is null
    or candidate_media_type is null
    or candidate_mime_type is null
    or candidate_file_size is null
    or candidate_width is null
    or candidate_height is null
    or candidate_visibility is null
    or candidate_description is null
    or candidate_original_path is null
    or candidate_preview_path is null
  then
    raise exception using errcode = '22004', message = 'Complete Gallery metadata is required.';
  end if;
  if candidate_visibility not in ('private'::text, 'public'::text)
    or pg_catalog.char_length(candidate_description) > 500
  then
    raise exception using errcode = '22023', message = 'Unsupported Gallery visibility or description.';
  end if;

  v_expected_prefix := v_user_id::text || '/'::text || target_item_id::text || '/'::text;
  if candidate_mime_type = 'image/jpeg'::text then
    v_expected_original_path := v_expected_prefix || 'original.jpg'::text;
  elsif candidate_mime_type = 'image/png'::text then
    v_expected_original_path := v_expected_prefix || 'original.png'::text;
  elsif candidate_mime_type = 'image/webp'::text then
    v_expected_original_path := v_expected_prefix || 'original.webp'::text;
  elsif candidate_mime_type = 'video/mp4'::text then
    v_expected_original_path := v_expected_prefix || 'original.mp4'::text;
  elsif candidate_mime_type = 'video/webm'::text then
    v_expected_original_path := v_expected_prefix || 'original.webm'::text;
  else
    v_expected_original_path := v_expected_prefix || 'unsupported'::text;
  end if;

  if candidate_original_path <> v_expected_original_path
    or candidate_preview_path <> v_expected_prefix || 'preview.webp'::text
  then
    raise exception using errcode = '22023', message = 'Invalid Gallery Storage path.';
  end if;

  if not (
    (candidate_media_type = 'image'::text
      and candidate_mime_type in ('image/jpeg'::text, 'image/png'::text, 'image/webp'::text)
      and candidate_file_size between 1 and 10485760
      and candidate_duration_ms is null)
    or
    (candidate_media_type = 'video'::text
      and candidate_mime_type in ('video/mp4'::text, 'video/webm'::text)
      and candidate_file_size between 1 and 52428800
      and candidate_duration_ms between 1 and 300000)
  ) or candidate_width not between 1 and 20000 or candidate_height not between 1 and 20000
  then
    raise exception using errcode = '22023', message = 'Unsupported Gallery media metadata.';
  end if;

  if not exists (
    select 1
    from storage.objects as object_row
    where object_row.bucket_id = 'gallery-media'::text
      and object_row.name = candidate_original_path
      and object_row.owner_id = v_user_id::text
      and object_row.metadata ->> 'mimetype' = candidate_mime_type
      and coalesce((object_row.metadata ->> 'size')::bigint, 0::bigint) = candidate_file_size
  ) then
    raise exception using errcode = '55000', message = 'The Gallery original upload is unavailable or does not match its metadata.';
  end if;

  if not exists (
    select 1
    from storage.objects as object_row
    where object_row.bucket_id = 'gallery-media'::text
      and object_row.name = candidate_preview_path
      and object_row.owner_id = v_user_id::text
      and object_row.metadata ->> 'mimetype' = 'image/webp'::text
      and coalesce((object_row.metadata ->> 'size')::bigint, 0::bigint) between 1 and 2097152
  ) then
    raise exception using errcode = '55000', message = 'The Gallery preview upload is unavailable or invalid.';
  end if;

  insert into public.gallery_items (
    id, owner_id, media_type, mime_type, file_size, width, height, duration_ms,
    visibility, description, original_path, preview_path
  ) values (
    target_item_id, v_user_id, candidate_media_type, candidate_mime_type, candidate_file_size,
    candidate_width, candidate_height, candidate_duration_ms, candidate_visibility,
    candidate_description, candidate_original_path, candidate_preview_path
  ) returning * into v_item;

  return v_item;
end;
$$;

create or replace function public.update_gallery_item(
  target_item_id uuid,
  candidate_visibility text,
  candidate_description text
)
returns public.gallery_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.gallery_items;
begin
  if v_user_id is null or not private.is_active_account(v_user_id) then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if target_item_id is null or candidate_visibility not in ('private'::text, 'public'::text) or candidate_description is null or pg_catalog.char_length(candidate_description) > 500 then
    raise exception using errcode = '22023', message = 'Unsupported Gallery update.';
  end if;

  update public.gallery_items as item_row
  set visibility = candidate_visibility,
      description = candidate_description
  where item_row.id = target_item_id
    and item_row.owner_id = v_user_id
  returning * into v_item;

  if not found then raise exception using errcode = 'P0002', message = 'Gallery item not found.'; end if;
  return v_item;
end;
$$;

create or replace function public.delete_gallery_item(target_item_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.gallery_items;
begin
  if v_user_id is null or not private.is_active_account(v_user_id) then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  select * into v_item
  from public.gallery_items as item_row
  where item_row.id = target_item_id and item_row.owner_id = v_user_id;
  if v_item.id is null then raise exception using errcode = 'P0002', message = 'Gallery item not found.'; end if;
  if exists (
    select 1 from storage.objects as object_row
    where object_row.bucket_id = 'gallery-media'::text
      and object_row.name in (v_item.original_path, v_item.preview_path)
  ) then
    raise exception using errcode = '55000', message = 'Remove Gallery Storage objects before deleting the item.';
  end if;
  delete from public.gallery_items as item_row where item_row.id = target_item_id and item_row.owner_id = v_user_id;
  return true;
end;
$$;

create or replace function public.list_my_gallery(
  target_visibility text default null,
  target_media_type text default null,
  target_added_from timestamptz default null,
  target_added_before timestamptz default null,
  sort_direction text default 'newest'::text,
  page_size integer default 30,
  page_offset integer default 0
)
returns table (
  id uuid, owner_id uuid, media_type text, mime_type text, file_size bigint,
  width integer, height integer, duration_ms integer, visibility text, description text,
  original_path text, preview_path text, added_at timestamptz, updated_at timestamptz,
  heart_count bigint, comment_count bigint, viewer_has_hearted boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not private.is_active_account(v_user_id) then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  if target_visibility is not null and target_visibility not in ('private'::text, 'public'::text) then raise exception using errcode = '22023', message = 'Unsupported visibility filter.'; end if;
  if target_media_type is not null and target_media_type not in ('image'::text, 'video'::text) then raise exception using errcode = '22023', message = 'Unsupported media filter.'; end if;
  if sort_direction is null or sort_direction not in ('newest'::text, 'oldest'::text) then raise exception using errcode = '22023', message = 'Unsupported sort direction.'; end if;
  if page_size is null or page_offset is null or page_size not between 1 and 50 or page_offset not between 0 and 10000 then raise exception using errcode = '22023', message = 'Unsupported Gallery page.'; end if;

  return query
  select item_row.id, item_row.owner_id, item_row.media_type, item_row.mime_type, item_row.file_size,
    item_row.width, item_row.height, item_row.duration_ms, item_row.visibility, item_row.description,
    item_row.original_path, item_row.preview_path, item_row.added_at, item_row.updated_at,
    (select pg_catalog.count(*) from public.gallery_hearts as heart_row where heart_row.item_id = item_row.id),
    (select pg_catalog.count(*) from public.gallery_comments as comment_row where comment_row.item_id = item_row.id),
    exists (select 1 from public.gallery_hearts as heart_row where heart_row.item_id = item_row.id and heart_row.user_id = v_user_id)
  from public.gallery_items as item_row
  where item_row.owner_id = v_user_id
    and (target_visibility is null or item_row.visibility = target_visibility)
    and (target_media_type is null or item_row.media_type = target_media_type)
    and (target_added_from is null or item_row.added_at >= target_added_from)
    and (target_added_before is null or item_row.added_at < target_added_before)
  order by
    case when sort_direction = 'newest'::text then item_row.added_at end desc,
    case when sort_direction = 'oldest'::text then item_row.added_at end asc,
    item_row.id desc
  limit page_size offset page_offset;
end;
$$;

create or replace function public.list_public_gallery(
  target_owner_id uuid,
  page_size integer default 30,
  page_offset integer default 0
)
returns table (
  id uuid, owner_id uuid, media_type text, mime_type text, file_size bigint,
  width integer, height integer, duration_ms integer, visibility text, description text,
  original_path text, preview_path text, added_at timestamptz, updated_at timestamptz,
  heart_count bigint, comment_count bigint, viewer_has_hearted boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if not private.can_view_gallery_owner(v_user_id, target_owner_id) then raise exception using errcode = '42501', message = 'This Gallery is unavailable.'; end if;
  if page_size is null or page_offset is null or page_size not between 1 and 50 or page_offset not between 0 and 10000 then raise exception using errcode = '22023', message = 'Unsupported Gallery page.'; end if;

  return query
  select item_row.id, item_row.owner_id, item_row.media_type, item_row.mime_type, item_row.file_size,
    item_row.width, item_row.height, item_row.duration_ms, item_row.visibility, item_row.description,
    item_row.original_path, item_row.preview_path, item_row.added_at, item_row.updated_at,
    (select pg_catalog.count(*) from public.gallery_hearts as heart_row where heart_row.item_id = item_row.id),
    (select pg_catalog.count(*) from public.gallery_comments as comment_row where comment_row.item_id = item_row.id),
    exists (select 1 from public.gallery_hearts as heart_row where heart_row.item_id = item_row.id and heart_row.user_id = v_user_id)
  from public.gallery_items as item_row
  where item_row.owner_id = target_owner_id
    and item_row.visibility = 'public'::text
  order by item_row.added_at desc, item_row.id desc
  limit page_size offset page_offset;
end;
$$;

create or replace function public.get_gallery_item(target_item_id uuid)
returns table (
  id uuid, owner_id uuid, media_type text, mime_type text, file_size bigint,
  width integer, height integer, duration_ms integer, visibility text, description text,
  original_path text, preview_path text, added_at timestamptz, updated_at timestamptz,
  heart_count bigint, comment_count bigint, viewer_has_hearted boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_user_id uuid := auth.uid();
begin
  if not private.can_view_gallery_item(v_user_id, target_item_id) then raise exception using errcode = '42501', message = 'This Gallery item is unavailable.'; end if;
  return query
  select item_row.id, item_row.owner_id, item_row.media_type, item_row.mime_type, item_row.file_size,
    item_row.width, item_row.height, item_row.duration_ms, item_row.visibility, item_row.description,
    item_row.original_path, item_row.preview_path, item_row.added_at, item_row.updated_at,
    (select pg_catalog.count(*) from public.gallery_hearts as heart_row where heart_row.item_id = item_row.id),
    (select pg_catalog.count(*) from public.gallery_comments as comment_row where comment_row.item_id = item_row.id),
    exists (select 1 from public.gallery_hearts as heart_row where heart_row.item_id = item_row.id and heart_row.user_id = v_user_id)
  from public.gallery_items as item_row where item_row.id = target_item_id;
end;
$$;

create or replace function public.toggle_gallery_heart(target_item_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := auth.uid(); v_hearted boolean;
begin
  if not private.can_view_gallery_item(v_user_id, target_item_id) then raise exception using errcode = '42501', message = 'This Gallery item is unavailable.'; end if;
  delete from public.gallery_hearts as heart_row where heart_row.item_id = target_item_id and heart_row.user_id = v_user_id;
  if found then return false; end if;
  insert into public.gallery_hearts (item_id, user_id) values (target_item_id, v_user_id) on conflict do nothing;
  v_hearted := true;
  return v_hearted;
end;
$$;

create or replace function public.list_gallery_comments(target_item_id uuid, page_size integer default 40, page_offset integer default 0)
returns table (
  id uuid, item_id uuid, author_id uuid, body text, created_at timestamptz, updated_at timestamptz,
  author_username text, author_display_name text, author_avatar_url text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_user_id uuid := auth.uid();
begin
  if not private.can_view_gallery_item(v_user_id, target_item_id) then raise exception using errcode = '42501', message = 'This Gallery item is unavailable.'; end if;
  if page_size is null or page_offset is null or page_size not between 1 and 50 or page_offset not between 0 and 10000 then raise exception using errcode = '22023', message = 'Unsupported comment page.'; end if;
  return query
  select comment_row.id, comment_row.item_id, comment_row.author_id, comment_row.body, comment_row.created_at, comment_row.updated_at,
    profile_row.username, profile_row.display_name, profile_row.avatar_url
  from public.gallery_comments as comment_row
  join public.profiles as profile_row on profile_row.id = comment_row.author_id
  where comment_row.item_id = target_item_id
    and profile_row.account_status = 'active'::text
  order by comment_row.created_at asc, comment_row.id asc
  limit page_size offset page_offset;
end;
$$;

create or replace function public.add_gallery_comment(target_item_id uuid, candidate_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := auth.uid(); v_comment_id uuid;
begin
  if not private.can_view_gallery_item(v_user_id, target_item_id) then raise exception using errcode = '42501', message = 'This Gallery item is unavailable.'; end if;
  if candidate_body is null or pg_catalog.char_length(pg_catalog.btrim(candidate_body)) not between 1 and 500 then raise exception using errcode = '22023', message = 'Comments must contain 1 to 500 characters.'; end if;
  insert into public.gallery_comments (item_id, author_id, body)
  values (target_item_id, v_user_id, pg_catalog.btrim(candidate_body))
  returning gallery_comments.id into v_comment_id;
  return v_comment_id;
end;
$$;

create or replace function public.update_gallery_comment(target_comment_id uuid, candidate_body text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not private.is_active_account(v_user_id) then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  if candidate_body is null or pg_catalog.char_length(pg_catalog.btrim(candidate_body)) not between 1 and 500 then raise exception using errcode = '22023', message = 'Comments must contain 1 to 500 characters.'; end if;
  update public.gallery_comments as comment_row
  set body = pg_catalog.btrim(candidate_body)
  where comment_row.id = target_comment_id
    and comment_row.author_id = v_user_id
    and private.can_view_gallery_item(v_user_id, comment_row.item_id);
  if not found then raise exception using errcode = 'P0002', message = 'Comment not found.'; end if;
  return true;
end;
$$;

create or replace function public.delete_gallery_comment(target_comment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not private.is_active_account(v_user_id) then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  delete from public.gallery_comments as comment_row
  using public.gallery_items as item_row
  where comment_row.id = target_comment_id
    and item_row.id = comment_row.item_id
    and private.can_view_gallery_item(v_user_id, item_row.id)
    and (comment_row.author_id = v_user_id or item_row.owner_id = v_user_id);
  if not found then raise exception using errcode = 'P0002', message = 'Comment not found.'; end if;
  return true;
end;
$$;

revoke all on function public.create_gallery_item(uuid, text, text, bigint, integer, integer, integer, text, text, text, text) from public, anon, authenticated;
revoke all on function public.update_gallery_item(uuid, text, text) from public, anon, authenticated;
revoke all on function public.delete_gallery_item(uuid) from public, anon, authenticated;
revoke all on function public.list_my_gallery(text, text, timestamptz, timestamptz, text, integer, integer) from public, anon, authenticated;
revoke all on function public.list_public_gallery(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.get_gallery_item(uuid) from public, anon, authenticated;
revoke all on function public.toggle_gallery_heart(uuid) from public, anon, authenticated;
revoke all on function public.list_gallery_comments(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.add_gallery_comment(uuid, text) from public, anon, authenticated;
revoke all on function public.update_gallery_comment(uuid, text) from public, anon, authenticated;
revoke all on function public.delete_gallery_comment(uuid) from public, anon, authenticated;

grant execute on function public.create_gallery_item(uuid, text, text, bigint, integer, integer, integer, text, text, text, text) to authenticated;
grant execute on function public.update_gallery_item(uuid, text, text) to authenticated;
grant execute on function public.delete_gallery_item(uuid) to authenticated;
grant execute on function public.list_my_gallery(text, text, timestamptz, timestamptz, text, integer, integer) to authenticated;
grant execute on function public.list_public_gallery(uuid, integer, integer) to authenticated;
grant execute on function public.get_gallery_item(uuid) to authenticated;
grant execute on function public.toggle_gallery_heart(uuid) to authenticated;
grant execute on function public.list_gallery_comments(uuid, integer, integer) to authenticated;
grant execute on function public.add_gallery_comment(uuid, text) to authenticated;
grant execute on function public.update_gallery_comment(uuid, text) to authenticated;
grant execute on function public.delete_gallery_comment(uuid) to authenticated;

create or replace function public.get_account_deletion_storage_manifest(target_account_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_retained jsonb;
  v_removable jsonb;
begin
  select profile_row.account_status into v_status
  from public.profiles as profile_row where profile_row.id = target_account_id;
  if v_status not in ('deleting'::text, 'deleted'::text) then
    raise exception using errcode = '55000', message = 'Account deletion has not started.';
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'attachment_id', attachment_row.id,
    'bucket_id', object_row.bucket_id,
    'source_path', object_row.name,
    'destination_path', 'retained/'::text || target_account_id::text || '/'::text || attachment_row.id::text || '/'::text || pg_catalog.regexp_replace(object_row.name, '^.*/'::text, ''::text)
  ) order by object_row.bucket_id, object_row.name), '[]'::jsonb)
  into v_retained
  from storage.objects as object_row
  join public.message_attachments as attachment_row
    on attachment_row.storage_path = object_row.name and object_row.bucket_id = 'message-media'::text
  join public.messages as message_row on message_row.id = attachment_row.message_id
  where message_row.sender_id = target_account_id
    and object_row.owner_id = target_account_id::text;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'bucket_id', object_row.bucket_id, 'path', object_row.name
  ) order by object_row.bucket_id, object_row.name), '[]'::jsonb)
  into v_removable
  from storage.objects as object_row
  where (
      object_row.owner_id = target_account_id::text
      or (
        object_row.bucket_id = 'scheduled-message-media'::text
        and pg_catalog.split_part(object_row.name, '/'::text, 1) = target_account_id::text
      )
      or (
        object_row.bucket_id = 'gallery-media'::text
        and pg_catalog.split_part(object_row.name, '/'::text, 1) = target_account_id::text
      )
      or (
        object_row.bucket_id = 'message-media'::text
        and pg_catalog.split_part(object_row.name, '/'::text, 2) = target_account_id::text
        and not exists (
          select 1 from public.message_attachments as pending_attachment
          where pending_attachment.storage_path = object_row.name
        )
      )
    )
    and not (
      object_row.bucket_id = 'message-media'::text
      and exists (select 1 from public.message_attachments as attachment_row where attachment_row.storage_path = object_row.name)
    );

  return pg_catalog.jsonb_build_object('account_status', v_status, 'retained_attachments', v_retained, 'removable_objects', v_removable);
end;
$$;

revoke all on function public.get_account_deletion_storage_manifest(uuid) from public, anon, authenticated;
grant execute on function public.get_account_deletion_storage_manifest(uuid) to service_role;

do $$
begin
  if exists (
    select 1 from pg_catalog.pg_publication as publication_row where publication_row.pubname = 'supabase_realtime'
  ) then
    if not exists (
      select 1 from pg_catalog.pg_publication_tables as publication_table
      where publication_table.pubname = 'supabase_realtime' and publication_table.schemaname = 'public' and publication_table.tablename = 'gallery_items'
    ) then execute 'alter publication supabase_realtime add table public.gallery_items'; end if;
    if not exists (
      select 1 from pg_catalog.pg_publication_tables as publication_table
      where publication_table.pubname = 'supabase_realtime' and publication_table.schemaname = 'public' and publication_table.tablename = 'gallery_hearts'
    ) then execute 'alter publication supabase_realtime add table public.gallery_hearts'; end if;
    if not exists (
      select 1 from pg_catalog.pg_publication_tables as publication_table
      where publication_table.pubname = 'supabase_realtime' and publication_table.schemaname = 'public' and publication_table.tablename = 'gallery_comments'
    ) then execute 'alter publication supabase_realtime add table public.gallery_comments'; end if;
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;

-- Verification (run as an administrative SQL role after applying):
-- select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'gallery-media';
-- select tablename, policyname, roles, cmd from pg_catalog.pg_policies where schemaname in ('public', 'storage') and (tablename like 'gallery_%' or policyname like 'gallery_%') order by tablename, policyname;
-- select has_table_privilege('anon', 'public.gallery_items', 'select') as anon_can_read,
--        has_table_privilege('authenticated', 'public.gallery_items', 'insert,update,delete') as browser_can_write_directly,
--        has_function_privilege('authenticated', 'public.create_gallery_item(uuid,text,text,bigint,integer,integer,integer,text,text,text,text)', 'execute') as authenticated_can_create;
-- select schemaname, tablename from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime' and tablename in ('gallery_items','gallery_hearts','gallery_comments');
