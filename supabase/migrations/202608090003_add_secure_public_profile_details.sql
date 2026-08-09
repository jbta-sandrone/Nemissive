begin;

do $$
begin
  if pg_catalog.to_regclass('public.profiles') is null
    or pg_catalog.to_regclass('public.conversations') is null
    or pg_catalog.to_regclass('public.conversation_participants') is null then
    raise exception 'Profile-details prerequisites are missing. Apply the core conversation migrations first.';
  end if;
end;
$$;

create or replace function private.are_valid_profile_interests(candidate_interests text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    candidate_interests is not null
    and coalesce(pg_catalog.array_ndims(candidate_interests), 1::integer) = 1
    and pg_catalog.cardinality(candidate_interests) between 0 and 5
    and not exists (
      select 1
      from pg_catalog.unnest(candidate_interests) as interest_value(value)
      where interest_value.value is null
        or not (
          interest_value.value = any (
            array[
              'gaming'::text,
              'coding_tech'::text,
              'music'::text,
              'movies_tv'::text,
              'anime'::text,
              'reading'::text,
              'travel'::text,
              'photography'::text,
              'fitness'::text,
              'sports'::text,
              'motorcycles'::text,
              'cars'::text,
              'art_design'::text,
              'cooking'::text,
              'coffee'::text,
              'fashion'::text,
              'pets'::text,
              'nature'::text,
              'business'::text,
              'content_creation'::text,
              'esports'::text,
              'podcasts'::text,
              'dancing'::text,
              'volunteering'::text
            ]::text[]
          )
        )
    )
    and (
      select pg_catalog.count(*)
      from pg_catalog.unnest(candidate_interests) as interest_value(value)
    ) = (
      select pg_catalog.count(distinct interest_value.value)
      from pg_catalog.unnest(candidate_interests) as interest_value(value)
    );
$$;

revoke all on function private.are_valid_profile_interests(text[]) from public, anon, authenticated;

create table public.profile_details (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  bio text null,
  location_text text null,
  birth_date date null,
  birthday_visibility text not null default 'hidden'::text,
  show_age boolean not null default false,
  interests text[] not null default '{}'::text[],
  updated_at timestamptz not null default pg_catalog.now(),
  constraint profile_details_bio_check check (
    bio is null
    or (
      bio = pg_catalog.btrim(bio)
      and pg_catalog.char_length(bio) between 1 and 150
      and bio !~ '[[:cntrl:]]'
    )
  ),
  constraint profile_details_location_check check (
    location_text is null
    or (
      location_text = pg_catalog.btrim(location_text)
      and pg_catalog.char_length(location_text) between 1 and 80
      and location_text !~ '[[:cntrl:]]'
    )
  ),
  constraint profile_details_birth_date_check check (
    birth_date is null or birth_date >= date '1900-01-01'
  ),
  constraint profile_details_birthday_visibility_check check (
    birthday_visibility in ('hidden'::text, 'month_day'::text, 'full'::text)
  ),
  constraint profile_details_birthday_dependencies_check check (
    birth_date is not null
    or (birthday_visibility = 'hidden'::text and show_age = false)
  ),
  constraint profile_details_interests_check check (
    private.are_valid_profile_interests(interests)
  )
);

comment on table public.profile_details is 'Private-at-rest optional profile details exposed only through narrow authenticated projections.';
comment on column public.profile_details.birth_date is 'Raw optional birthday; never granted through direct client table access.';
comment on column public.profile_details.interests is 'Ordered canonical product interest keys; at most five values from the supported allowlist.';

create or replace function private.validate_profile_details_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.birth_date is not null and new.birth_date > current_date then
    raise exception using errcode = '22023', message = 'Birthday cannot be in the future.';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_profile_details_write() from public, anon, authenticated;

create trigger profile_details_validate_write
before insert or update on public.profile_details
for each row execute function private.validate_profile_details_write();

alter table public.profile_details enable row level security;
revoke all on table public.profile_details from public, anon, authenticated;

create or replace function public.get_my_profile_details()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  select pg_catalog.jsonb_build_object(
    'bio', detail_row.bio,
    'location_text', detail_row.location_text,
    'birth_date', detail_row.birth_date,
    'birthday_visibility', coalesce(detail_row.birthday_visibility, 'hidden'::text),
    'show_age', coalesce(detail_row.show_age, false),
    'interests', coalesce(detail_row.interests, '{}'::text[])
  )
  into v_result
  from public.profiles as profile_row
  left join public.profile_details as detail_row on detail_row.profile_id = profile_row.id
  where profile_row.id = v_user_id;

  if v_result is null then
    raise exception using errcode = '42501', message = 'The authenticated profile is unavailable.';
  end if;

  return v_result;
end;
$$;

create or replace function public.set_profile_details(
  candidate_bio text,
  candidate_location text,
  candidate_birth_date date,
  candidate_birthday_visibility text,
  candidate_show_age boolean,
  candidate_interests text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_bio text := nullif(pg_catalog.btrim(coalesce(candidate_bio, ''::text)), ''::text);
  v_location text := nullif(pg_catalog.btrim(coalesce(candidate_location, ''::text)), ''::text);
  v_visibility text := pg_catalog.lower(pg_catalog.btrim(coalesce(candidate_birthday_visibility, ''::text)));
  v_interests text[];
  v_updated_at timestamptz;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if not exists (select 1 from public.profiles as profile_row where profile_row.id = v_user_id) then
    raise exception using errcode = '42501', message = 'The authenticated profile is unavailable.';
  end if;

  if candidate_show_age is null then
    raise exception using errcode = '22004', message = 'Age visibility is required.';
  end if;

  if v_visibility not in ('hidden'::text, 'month_day'::text, 'full'::text) then
    raise exception using errcode = '22023', message = 'Birthday visibility is invalid.';
  end if;

  if v_bio is not null and (pg_catalog.char_length(v_bio) > 150 or v_bio ~ '[[:cntrl:]]') then
    raise exception using errcode = '22023', message = 'Bio must be plain text containing no more than 150 characters.';
  end if;

  if v_location is not null and (pg_catalog.char_length(v_location) > 80 or v_location ~ '[[:cntrl:]]') then
    raise exception using errcode = '22023', message = 'Location must be plain text containing no more than 80 characters.';
  end if;

  if candidate_birth_date is not null
    and (candidate_birth_date < date '1900-01-01' or candidate_birth_date > current_date) then
    raise exception using errcode = '22023', message = 'Birthday must be between January 1, 1900 and today.';
  end if;

  if candidate_birth_date is null and (v_visibility <> 'hidden'::text or candidate_show_age) then
    raise exception using errcode = '22023', message = 'Add a birthday before changing birthday or age visibility.';
  end if;

  v_interests := coalesce(candidate_interests, '{}'::text[]);

  if not private.are_valid_profile_interests(v_interests) then
    raise exception using errcode = '22023', message = 'Choose up to five unique supported interest keys.';
  end if;

  insert into public.profile_details as profile_detail (
    profile_id,
    bio,
    location_text,
    birth_date,
    birthday_visibility,
    show_age,
    interests
  )
  values (
    v_user_id,
    v_bio,
    v_location,
    candidate_birth_date,
    v_visibility,
    candidate_show_age,
    v_interests
  )
  on conflict on constraint profile_details_pkey do update
  set
    bio = excluded.bio,
    location_text = excluded.location_text,
    birth_date = excluded.birth_date,
    birthday_visibility = excluded.birthday_visibility,
    show_age = excluded.show_age,
    interests = excluded.interests,
    updated_at = pg_catalog.now()
  returning profile_detail.updated_at into v_updated_at;

  return pg_catalog.jsonb_build_object(
    'bio', v_bio,
    'location_text', v_location,
    'birth_date', candidate_birth_date,
    'birthday_visibility', v_visibility,
    'show_age', candidate_show_age,
    'interests', v_interests,
    'updated_at', v_updated_at
  );
end;
$$;

create or replace function public.get_conversation_profile(
  target_conversation_id uuid,
  target_profile_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_viewer_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if target_conversation_id is null or target_profile_id is null then
    raise exception using errcode = '22004', message = 'A conversation and profile are required.';
  end if;

  if not exists (
    select 1
    from public.conversations as conversation_row
    join public.conversation_participants as viewer_participant
      on viewer_participant.conversation_id = conversation_row.id
      and viewer_participant.user_id = v_viewer_id
    join public.conversation_participants as target_participant
      on target_participant.conversation_id = conversation_row.id
      and target_participant.user_id = target_profile_id
    where conversation_row.id = target_conversation_id
      and conversation_row.conversation_type = 'direct'::text
  ) then
    raise exception using errcode = '42501', message = 'The accepted conversation profile is unavailable.';
  end if;

  select pg_catalog.jsonb_build_object(
    'id', profile_row.id,
    'username', profile_row.username,
    'display_name', profile_row.display_name,
    'avatar_url', profile_row.avatar_url,
    'last_seen_at', profile_row.last_seen_at,
    'bio', detail_row.bio,
    'location_text', detail_row.location_text,
    'interests', coalesce(detail_row.interests, '{}'::text[]),
    'birthday_display', case
      when detail_row.birth_date is null or detail_row.birthday_visibility = 'hidden'::text then null::text
      when detail_row.birthday_visibility = 'month_day'::text then '--'::text || pg_catalog.to_char(detail_row.birth_date, 'MM-DD'::text)
      else pg_catalog.to_char(detail_row.birth_date, 'YYYY-MM-DD'::text)
    end,
    'age', case
      when detail_row.birth_date is not null and detail_row.show_age then
        pg_catalog.date_part('year'::text, pg_catalog.age(current_date::timestamp, detail_row.birth_date::timestamp))::integer
      else null::integer
    end,
    'joined_month', pg_catalog.to_char(account_row.created_at, 'YYYY-MM'::text)
  )
  into v_result
  from public.profiles as profile_row
  join auth.users as account_row on account_row.id = profile_row.id
  left join public.profile_details as detail_row on detail_row.profile_id = profile_row.id
  where profile_row.id = target_profile_id;

  if v_result is null then
    raise exception using errcode = '42501', message = 'The accepted conversation profile is unavailable.';
  end if;

  return v_result;
end;
$$;

revoke all on function public.get_my_profile_details() from public, anon, authenticated;
grant execute on function public.get_my_profile_details() to authenticated;

revoke all on function public.set_profile_details(text, text, date, text, boolean, text[]) from public, anon, authenticated;
grant execute on function public.set_profile_details(text, text, date, text, boolean, text[]) to authenticated;

revoke all on function public.get_conversation_profile(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_conversation_profile(uuid, uuid) to authenticated;

comment on function public.get_my_profile_details() is 'Returns the authenticated user''s raw editable optional profile details.';
comment on function public.set_profile_details(text, text, date, text, boolean, text[]) is 'Atomically validates and updates only auth.uid() optional profile details.';
comment on function public.get_conversation_profile(uuid, uuid) is 'Returns an accepted-conversation-safe profile projection without hidden raw birthday data.';

notify pgrst, 'reload schema';

commit;

-- Non-destructive verification (run separately after applying this migration):
-- select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = 'profile_details' order by ordinal_position;
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.profile_details'::regclass order by conname;
-- select to_regprocedure('public.get_my_profile_details()') as get_my_profile_details,
--        to_regprocedure('public.set_profile_details(text,text,date,text,boolean,text[])') as set_profile_details,
--        to_regprocedure('public.get_conversation_profile(uuid,uuid)') as get_conversation_profile;
-- select routine_name, grantee, privilege_type from information_schema.routine_privileges where routine_schema = 'public' and routine_name in ('get_my_profile_details', 'set_profile_details', 'get_conversation_profile') order by routine_name, grantee;
-- select grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = 'profile_details' order by grantee, privilege_type;
