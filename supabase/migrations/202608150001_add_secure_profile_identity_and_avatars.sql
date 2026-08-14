begin;

do $$
begin
  if pg_catalog.to_regclass('public.profiles') is null
    or pg_catalog.to_regclass('storage.buckets') is null
    or pg_catalog.to_regclass('storage.objects') is null then
    raise exception 'Profile identity editing requires public.profiles and Supabase Storage.';
  end if;

  if not exists (
    select 1
    from information_schema.columns as column_row
    where column_row.table_schema = 'public'
      and column_row.table_name = 'profiles'
      and column_row.column_name in ('username', 'display_name', 'avatar_url')
    group by column_row.table_schema, column_row.table_name
    having pg_catalog.count(*) = 3
  ) then
    raise exception 'The existing profile identity columns are unavailable.';
  end if;
end;
$$;

create unique index if not exists profiles_username_canonical_uidx
on public.profiles (pg_catalog.lower(username))
where username is not null;

comment on column public.profiles.avatar_url is 'Avatar reference: new uploads use an immutable owner-scoped profile-avatars path; legacy absolute URLs remain supported by the client.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  true,
  5242880,
  array['image/jpeg'::text, 'image/png'::text, 'image/webp'::text]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists profile_avatars_insert_own on storage.objects;
create policy profile_avatars_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-avatars'::text
  and (storage.foldername(name))[1] = auth.uid()::text
  and name ~ ('^'::text || auth.uid()::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$'::text)
);

drop policy if exists profile_avatars_select_own on storage.objects;
create policy profile_avatars_select_own
on storage.objects
for select
to authenticated
using (
  bucket_id = 'profile-avatars'::text
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists profile_avatars_delete_own on storage.objects;
create policy profile_avatars_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-avatars'::text
  and (storage.foldername(name))[1] = auth.uid()::text
);

create or replace function public.is_username_available(candidate_username text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_username text := pg_catalog.lower(pg_catalog.btrim(candidate_username));
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if v_username is null
    or v_username !~ '^[a-z0-9_]{3,30}$'
    or v_username = any (array['admin'::text, 'administrator'::text, 'moderator'::text, 'nemissive'::text, 'support'::text, 'system'::text]) then
    return false;
  end if;

  return not exists (
    select 1
    from public.profiles as profile_row
    where pg_catalog.lower(profile_row.username) = v_username
      and profile_row.id <> v_user_id
  );
end;
$$;

create or replace function public.set_profile_identity(
  candidate_display_name text,
  candidate_username text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_display_name text;
  v_username text := pg_catalog.lower(pg_catalog.btrim(candidate_username));
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if candidate_display_name is null or candidate_display_name ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'Display name is invalid.';
  end if;

  v_display_name := pg_catalog.regexp_replace(pg_catalog.btrim(candidate_display_name), '[[:space:]]+'::text, ' '::text, 'g'::text);

  if pg_catalog.char_length(v_display_name) not between 1 and 50 then
    raise exception using errcode = '22023', message = 'Display name must contain 1 to 50 characters.';
  end if;

  if v_username is null or v_username !~ '^[a-z0-9_]{3,30}$' then
    raise exception using errcode = '22023', message = 'Username must use 3 to 30 lowercase letters, numbers, or underscores.';
  end if;

  if v_username = any (array['admin'::text, 'administrator'::text, 'moderator'::text, 'nemissive'::text, 'support'::text, 'system'::text]) then
    raise exception using errcode = '22023', message = 'That username is reserved.';
  end if;

  begin
    update public.profiles as profile_row
    set
      display_name = v_display_name,
      username = v_username
    where profile_row.id = v_user_id
    returning pg_catalog.jsonb_build_object(
      'id', profile_row.id,
      'display_name', profile_row.display_name,
      'username', profile_row.username,
      'avatar_url', profile_row.avatar_url
    ) into v_result;
  exception
    when unique_violation then
      raise exception using errcode = '23505', message = 'That username is already taken.';
  end;

  if v_result is null then
    raise exception using errcode = '42501', message = 'The authenticated profile is unavailable.';
  end if;

  return v_result;
end;
$$;

create or replace function public.set_profile_avatar(candidate_avatar_path text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_avatar_path text := nullif(pg_catalog.btrim(candidate_avatar_path), ''::text);
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if v_avatar_path is not null then
    if v_avatar_path !~ ('^'::text || v_user_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$'::text) then
      raise exception using errcode = '22023', message = 'The profile photo path is invalid.';
    end if;

    if not exists (
      select 1
      from storage.objects as avatar_object
      where avatar_object.bucket_id = 'profile-avatars'::text
        and avatar_object.name = v_avatar_path
        and avatar_object.owner_id = v_user_id::text
        and avatar_object.metadata ->> 'mimetype' in ('image/jpeg'::text, 'image/png'::text, 'image/webp'::text)
        and coalesce((avatar_object.metadata ->> 'size')::bigint, 0::bigint) between 1::bigint and 5242880::bigint
    ) then
      raise exception using errcode = '42501', message = 'The uploaded profile photo is unavailable.';
    end if;
  end if;

  update public.profiles as profile_row
  set avatar_url = v_avatar_path
  where profile_row.id = v_user_id
  returning pg_catalog.jsonb_build_object(
    'id', profile_row.id,
    'display_name', profile_row.display_name,
    'username', profile_row.username,
    'avatar_url', profile_row.avatar_url
  ) into v_result;

  if v_result is null then
    raise exception using errcode = '42501', message = 'The authenticated profile is unavailable.';
  end if;

  return v_result;
end;
$$;

revoke all on function public.is_username_available(text) from public, anon, authenticated;
grant execute on function public.is_username_available(text) to authenticated;

revoke all on function public.set_profile_identity(text, text) from public, anon, authenticated;
grant execute on function public.set_profile_identity(text, text) to authenticated;

revoke all on function public.set_profile_avatar(text) from public, anon, authenticated;
grant execute on function public.set_profile_avatar(text) to authenticated;

comment on function public.is_username_available(text) is 'Advisory owner-aware availability check; canonical unique index remains authoritative.';
comment on function public.set_profile_identity(text, text) is 'Atomically validates and updates auth.uid() display name and canonical username.';
comment on function public.set_profile_avatar(text) is 'Sets or removes auth.uid() avatar reference after verifying an owned profile-avatars object.';

notify pgrst, 'reload schema';

commit;

-- Verification after applying:
-- select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'profile-avatars';
-- select indexrelid::regclass, indisunique from pg_catalog.pg_index where indexrelid = 'public.profiles_username_canonical_uidx'::regclass;
-- select to_regprocedure('public.is_username_available(text)'), to_regprocedure('public.set_profile_identity(text,text)'), to_regprocedure('public.set_profile_avatar(text)');
-- select has_function_privilege('anon', 'public.set_profile_identity(text,text)', 'execute') as anon_can_set_identity,
--        has_function_privilege('authenticated', 'public.set_profile_identity(text,text)', 'execute') as authenticated_can_set_identity,
--        has_table_privilege('authenticated', 'public.profiles', 'update') as authenticated_can_broadly_update_profiles;
-- select policyname, roles, cmd from pg_catalog.pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'profile_avatars_%' order by policyname;
-- select publication_table.attnames from pg_catalog.pg_publication_tables as publication_table where publication_table.pubname = 'supabase_realtime' and publication_table.schemaname = 'public' and publication_table.tablename = 'profiles';
