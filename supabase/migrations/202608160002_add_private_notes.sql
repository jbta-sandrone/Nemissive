begin;

create table public.notes (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default ''::text,
  content text not null default ''::text,
  is_pinned boolean not null default false,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint notes_title_length_check check (pg_catalog.char_length(title) <= 120),
  constraint notes_content_length_check check (pg_catalog.char_length(content) <= 20000)
);

create index notes_user_sort_idx
on public.notes (user_id, is_pinned desc, updated_at desc, id desc);

alter table public.notes enable row level security;
alter table public.notes replica identity full;

revoke all on table public.notes from public, anon, authenticated;

create policy notes_owner_select
on public.notes
for select
to authenticated
using (
  notes.user_id = auth.uid()
  and private.is_active_account(auth.uid())
);

grant select on table public.notes to authenticated;

create or replace function public.save_note(
  target_note_id uuid,
  candidate_title text,
  candidate_content text
)
returns public.notes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_note public.notes;
begin
  if v_user_id is null or not private.is_active_account(v_user_id) then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if candidate_title is null or candidate_content is null then
    raise exception using errcode = '22004', message = 'A title and content value are required.';
  end if;
  if pg_catalog.char_length(candidate_title) > 120 then
    raise exception using errcode = '22001', message = 'Note titles may not exceed 120 characters.';
  end if;
  if pg_catalog.char_length(candidate_content) > 20000 then
    raise exception using errcode = '22001', message = 'Note content may not exceed 20,000 characters.';
  end if;

  if target_note_id is null then
    if pg_catalog.length(pg_catalog.btrim(candidate_title)) = 0
      and pg_catalog.length(pg_catalog.btrim(candidate_content)) = 0
    then
      raise exception using errcode = '22023', message = 'An empty note is not saved.';
    end if;

    insert into public.notes as note_row (
      user_id,
      title,
      content
    )
    values (
      v_user_id,
      candidate_title,
      candidate_content
    )
    returning * into v_note;
  else
    update public.notes as note_row
    set title = candidate_title,
        content = candidate_content,
        updated_at = pg_catalog.clock_timestamp()
    where note_row.id = target_note_id
      and note_row.user_id = v_user_id
    returning * into v_note;

    if not found then
      raise exception using errcode = 'P0002', message = 'Note not found.';
    end if;
  end if;

  return v_note;
end;
$$;

create or replace function public.set_note_pinned(
  target_note_id uuid,
  pinned boolean
)
returns public.notes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_note public.notes;
begin
  if v_user_id is null or not private.is_active_account(v_user_id) then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if target_note_id is null or pinned is null then
    raise exception using errcode = '22004', message = 'A note ID and pin state are required.';
  end if;

  update public.notes as note_row
  set is_pinned = pinned,
      updated_at = case
        when note_row.is_pinned is distinct from pinned then pg_catalog.clock_timestamp()
        else note_row.updated_at
      end
  where note_row.id = target_note_id
    and note_row.user_id = v_user_id
  returning * into v_note;

  if not found then
    raise exception using errcode = 'P0002', message = 'Note not found.';
  end if;

  return v_note;
end;
$$;

create or replace function public.delete_note(target_note_id uuid)
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
  if target_note_id is null then
    raise exception using errcode = '22004', message = 'A note ID is required.';
  end if;

  delete from public.notes as note_row
  where note_row.id = target_note_id
    and note_row.user_id = v_user_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Note not found.';
  end if;

  return true;
end;
$$;

revoke all on function public.save_note(uuid, text, text) from public, anon, authenticated;
revoke all on function public.set_note_pinned(uuid, boolean) from public, anon, authenticated;
revoke all on function public.delete_note(uuid) from public, anon, authenticated;

grant execute on function public.save_note(uuid, text, text) to authenticated;
grant execute on function public.set_note_pinned(uuid, boolean) to authenticated;
grant execute on function public.delete_note(uuid) to authenticated;

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
      and publication_table.tablename = 'notes'
  ) then
    execute 'alter publication supabase_realtime add table public.notes';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;

-- Verification after applying (run as an administrative SQL role):
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'notes'
-- order by ordinal_position;
--
-- select policyname, roles, cmd, qual, with_check
-- from pg_catalog.pg_policies
-- where schemaname = 'public' and tablename = 'notes';
--
-- select has_table_privilege('anon', 'public.notes', 'select') as anon_can_select,
--        has_table_privilege('authenticated', 'public.notes', 'select') as authenticated_can_select,
--        has_table_privilege('authenticated', 'public.notes', 'insert,update,delete') as authenticated_can_write_directly,
--        has_function_privilege('authenticated', 'public.save_note(uuid,text,text)', 'execute') as authenticated_can_save,
--        has_function_privilege('authenticated', 'public.set_note_pinned(uuid,boolean)', 'execute') as authenticated_can_pin,
--        has_function_privilege('authenticated', 'public.delete_note(uuid)', 'execute') as authenticated_can_delete;
--
-- select publication_table.schemaname, publication_table.tablename
-- from pg_catalog.pg_publication_tables as publication_table
-- where publication_table.pubname = 'supabase_realtime'
--   and publication_table.schemaname = 'public'
--   and publication_table.tablename = 'notes';
