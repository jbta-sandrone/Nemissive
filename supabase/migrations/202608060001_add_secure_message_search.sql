begin;

do $$
begin
  if pg_catalog.to_regclass('public.messages') is null
    or pg_catalog.to_regclass('public.conversations') is null
    or pg_catalog.to_regclass('public.conversation_participants') is null
    or pg_catalog.to_regclass('public.profiles') is null
    or pg_catalog.to_regclass('public.message_attachments') is null then
    raise exception 'Message search prerequisites are missing. Apply the conversation and messaging migrations first.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'messages'
      and column_name in ('message_type', 'is_deleted', 'edited_at', 'reply_to_message_id')
    group by table_schema, table_name
    having pg_catalog.count(*) = 4
  ) then
    raise exception 'Message search requires message_type, is_deleted, edited_at, and reply_to_message_id on public.messages.';
  end if;
end;
$$;

create index if not exists messages_search_text_idx
on public.messages
using gin (pg_catalog.to_tsvector('simple'::regconfig, body))
where is_deleted = false and body <> ''::text;

create index if not exists messages_conversation_created_id_idx
on public.messages (conversation_id, created_at, id);

create or replace function public.search_messages(
  search_text text,
  page_size integer default 30,
  cursor_created_at timestamptz default null,
  cursor_message_id uuid default null,
  sender_filter uuid default null,
  image_only boolean default false,
  date_from timestamptz default null,
  date_to timestamptz default null
)
returns table (
  message_id uuid,
  conversation_id uuid,
  sender_id uuid,
  sender_display_name text,
  sender_username text,
  sender_avatar_url text,
  other_user_id uuid,
  other_display_name text,
  other_username text,
  other_avatar_url text,
  message_type text,
  snippet text,
  created_at timestamptz,
  edited_at timestamptz,
  attachment_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_search_text text := pg_catalog.btrim(coalesce(search_text, ''::text));
  v_page_size integer := coalesce(page_size, 30::integer);
  v_image_only boolean := coalesce(image_only, false::boolean);
  v_tsquery tsquery;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if pg_catalog.char_length(v_search_text) > 200 then
    raise exception using errcode = '22023', message = 'Search text must be 200 characters or fewer.';
  end if;

  if pg_catalog.char_length(v_search_text) < 2 and not (v_image_only and v_search_text = ''::text) then
    raise exception using errcode = '22023', message = 'Enter at least two characters to search messages.';
  end if;

  if v_page_size < 1 or v_page_size > 50 then
    raise exception using errcode = '22023', message = 'Page size must be between 1 and 50.';
  end if;

  if (cursor_created_at is null) <> (cursor_message_id is null) then
    raise exception using errcode = '22023', message = 'Both cursor values must be provided together.';
  end if;

  if date_from is not null and date_to is not null and date_from >= date_to then
    raise exception using errcode = '22023', message = 'The date range is invalid.';
  end if;

  if v_search_text <> ''::text then
    v_tsquery := pg_catalog.websearch_to_tsquery('simple'::regconfig, v_search_text);
  end if;

  return query
  select
    message.id,
    message.conversation_id,
    message.sender_id,
    sender_profile.display_name,
    sender_profile.username,
    sender_profile.avatar_url,
    other_participant.user_id,
    other_profile.display_name,
    other_profile.username,
    other_profile.avatar_url,
    message.message_type,
    case
      when message.message_type = 'image'::text and message.body = ''::text then
        case when attachment_totals.attachment_count = 1 then 'Photo'::text else 'Photos'::text end
      else pg_catalog.left(pg_catalog.regexp_replace(pg_catalog.btrim(message.body), '[[:space:]]+'::text, ' '::text, 'g'::text), 160)
    end,
    message.created_at,
    message.edited_at,
    attachment_totals.attachment_count
  from public.messages as message
  join public.conversations as conversation
    on conversation.id = message.conversation_id
    and conversation.conversation_type = 'direct'::text
  join public.conversation_participants as caller_participant
    on caller_participant.conversation_id = message.conversation_id
    and caller_participant.user_id = v_user_id
  join public.conversation_participants as other_participant
    on other_participant.conversation_id = message.conversation_id
    and other_participant.user_id <> v_user_id
  join public.profiles as sender_profile on sender_profile.id = message.sender_id
  join public.profiles as other_profile on other_profile.id = other_participant.user_id
  cross join lateral (
    select pg_catalog.count(*)::bigint as attachment_count
    from public.message_attachments as attachment
    where attachment.message_id = message.id
  ) as attachment_totals
  where message.is_deleted = false
    and (sender_filter is null or message.sender_id = sender_filter)
    and (not v_image_only or message.message_type = 'image'::text)
    and (date_from is null or message.created_at >= date_from)
    and (date_to is null or message.created_at < date_to)
    and (
      (v_search_text = ''::text and v_image_only)
      or (
        v_search_text <> ''::text
        and (
          (v_tsquery::text <> ''::text and pg_catalog.to_tsvector('simple'::regconfig, message.body) @@ v_tsquery)
          or (v_tsquery::text = ''::text and pg_catalog.strpos(pg_catalog.lower(message.body), pg_catalog.lower(v_search_text)) > 0)
        )
      )
    )
    and (
      cursor_created_at is null
      or (message.created_at, message.id) < (cursor_created_at, cursor_message_id)
    )
  order by message.created_at desc, message.id desc
  limit v_page_size;
end;
$$;

create or replace function public.load_message_context(
  target_message_id uuid,
  before_count integer default 20,
  after_count integer default 20
)
returns table (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz,
  edited_at timestamptz,
  is_deleted boolean,
  deleted_at timestamptz,
  source_request_id uuid,
  message_type text,
  reply_to_message_id uuid,
  attachment_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_target public.messages%rowtype;
  v_before_count integer := coalesce(before_count, 20::integer);
  v_after_count integer := coalesce(after_count, 20::integer);
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if target_message_id is null then
    raise exception using errcode = '22023', message = 'A target message is required.';
  end if;

  if v_before_count < 0 or v_before_count > 50 or v_after_count < 0 or v_after_count > 50 then
    raise exception using errcode = '22023', message = 'Context counts must be between 0 and 50.';
  end if;

  select message.*
  into v_target
  from public.messages as message
  join public.conversations as conversation
    on conversation.id = message.conversation_id
    and conversation.conversation_type = 'direct'::text
  join public.conversation_participants as participant
    on participant.conversation_id = message.conversation_id
    and participant.user_id = v_user_id
  where message.id = target_message_id;

  if v_target.id is null then
    raise exception using errcode = '42501', message = 'The message is unavailable.';
  end if;

  return query
  with older_messages as (
    select message.*
    from public.messages as message
    where message.conversation_id = v_target.conversation_id
      and (message.created_at, message.id) < (v_target.created_at, v_target.id)
    order by message.created_at desc, message.id desc
    limit v_before_count
  ), newer_messages as (
    select message.*
    from public.messages as message
    where message.conversation_id = v_target.conversation_id
      and (message.created_at, message.id) > (v_target.created_at, v_target.id)
    order by message.created_at asc, message.id asc
    limit v_after_count
  ), context_messages as (
    select * from older_messages
    union all
    select * from public.messages as message where message.id = v_target.id
    union all
    select * from newer_messages
  )
  select
    message.id,
    message.conversation_id,
    message.sender_id,
    case when message.is_deleted then ''::text else message.body end,
    message.created_at,
    message.edited_at,
    message.is_deleted,
    message.deleted_at,
    message.source_request_id,
    message.message_type,
    message.reply_to_message_id,
    (
      select pg_catalog.count(*)::bigint
      from public.message_attachments as attachment
      where attachment.message_id = message.id
        and message.is_deleted = false
    )
  from context_messages as message
  order by message.created_at asc, message.id asc;
end;
$$;

revoke all on function public.search_messages(text, integer, timestamptz, uuid, uuid, boolean, timestamptz, timestamptz) from public;
revoke all on function public.search_messages(text, integer, timestamptz, uuid, uuid, boolean, timestamptz, timestamptz) from anon;
grant execute on function public.search_messages(text, integer, timestamptz, uuid, uuid, boolean, timestamptz, timestamptz) to authenticated;

revoke all on function public.load_message_context(uuid, integer, integer) from public;
revoke all on function public.load_message_context(uuid, integer, integer) from anon;
grant execute on function public.load_message_context(uuid, integer, integer) to authenticated;

comment on function public.search_messages(text, integer, timestamptz, uuid, uuid, boolean, timestamptz, timestamptz) is 'Returns a bounded cursor page of non-deleted messages from the authenticated user''s accepted direct conversations.';
comment on function public.load_message_context(uuid, integer, integer) is 'Returns a bounded, redacted message window around one accessible accepted-conversation message.';

notify pgrst, 'reload schema';

commit;
