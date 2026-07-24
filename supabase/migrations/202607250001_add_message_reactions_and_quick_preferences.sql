begin;

create or replace function private.is_valid_emoji(candidate text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    candidate is not null
    and candidate = pg_catalog.btrim(candidate)
    and pg_catalog.char_length(candidate) between 1 and 16
    and pg_catalog.octet_length(candidate) <= 64
    and candidate !~ '[[:cntrl:]]'
    and (
      candidate ~ '^[0-9#*]️?⃣$'
      or (
        candidate !~ '[[:alnum:][:space:]]'
        and candidate ~ '[©®™☀-⛿✀-➿⬀-⯿🀀-🫿]'
      )
    );
$$;

create or replace function private.are_valid_quick_reactions(candidate text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    candidate is not null
    and pg_catalog.cardinality(candidate) between 4 and 8
    and pg_catalog.cardinality(candidate) = (
      select pg_catalog.count(distinct item)
      from pg_catalog.unnest(candidate) as item
    )
    and not exists (
      select 1
      from pg_catalog.unnest(candidate) as item
      where not private.is_valid_emoji(item)
    );
$$;

revoke all on function private.is_valid_emoji(text) from public;
revoke all on function private.is_valid_emoji(text) from anon;
grant execute on function private.is_valid_emoji(text) to authenticated;
revoke all on function private.are_valid_quick_reactions(text[]) from public;
revoke all on function private.are_valid_quick_reactions(text[]) from anon;

create table public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  constraint message_reactions_emoji_check check (private.is_valid_emoji(emoji)),
  constraint message_reactions_unique_user_emoji unique (message_id, user_id, emoji)
);

create index message_reactions_message_id_idx on public.message_reactions(message_id);

alter table public.message_reactions enable row level security;
alter table public.message_reactions replica identity full;

create policy message_reactions_participants_select
on public.message_reactions
for select
to authenticated
using (
  exists (
    select 1
    from public.messages as message
    where message.id = message_reactions.message_id
      and private.is_conversation_participant(message.conversation_id)
  )
);

create policy message_reactions_participants_insert
on public.message_reactions
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.messages as message
    where message.id = message_reactions.message_id
      and private.is_conversation_participant(message.conversation_id)
  )
);

create policy message_reactions_owner_delete
on public.message_reactions
for delete
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.messages as message
    where message.id = message_reactions.message_id
      and private.is_conversation_participant(message.conversation_id)
  )
);

revoke all on table public.message_reactions from public, anon, authenticated;
grant select on table public.message_reactions to authenticated;
grant insert (message_id, user_id, emoji) on table public.message_reactions to authenticated;
grant delete on table public.message_reactions to authenticated;

alter table public.profiles
add column if not exists quick_reactions text[];

alter table public.profiles
add constraint profiles_quick_reactions_check
check (quick_reactions is null or private.are_valid_quick_reactions(quick_reactions));

create or replace function public.set_quick_reactions(candidate_reactions text[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_saved_reactions text[];
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if not private.are_valid_quick_reactions(candidate_reactions) then
    raise exception using errcode = '22023', message = 'Quick reactions must contain 4 to 8 unique emoji values.';
  end if;

  update public.profiles as profile
  set quick_reactions = candidate_reactions
  where profile.id = v_user_id
  returning profile.quick_reactions into v_saved_reactions;

  if v_saved_reactions is null then
    raise exception using errcode = '42501', message = 'The authenticated profile is unavailable.';
  end if;

  return v_saved_reactions;
end;
$$;

revoke all on function public.set_quick_reactions(text[]) from public;
revoke all on function public.set_quick_reactions(text[]) from anon;
grant execute on function public.set_quick_reactions(text[]) to authenticated;

comment on table public.message_reactions is 'Participant-scoped Unicode emoji reactions on confirmed messages.';
comment on column public.profiles.quick_reactions is 'Ordered user-selected quick reaction emojis; null uses the application defaults.';
comment on function public.set_quick_reactions(text[]) is 'Validates and replaces only auth.uid() quick reaction preferences.';

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_reactions'
  ) then
    execute 'alter publication supabase_realtime add table public.message_reactions';
  end if;
end;
$$;

commit;
