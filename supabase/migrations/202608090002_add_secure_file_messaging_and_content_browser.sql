begin;

do $$
begin
  if pg_catalog.to_regclass('public.messages') is null
    or pg_catalog.to_regclass('public.message_attachments') is null
    or pg_catalog.to_regclass('public.conversation_participants') is null
    or pg_catalog.to_regclass('storage.objects') is null
    or pg_catalog.to_regprocedure('private.can_send_conversation_message(uuid)') is null
    or pg_catalog.to_regprocedure('private.can_read_conversation_message(uuid,timestamptz)') is null
    or pg_catalog.to_regprocedure('private.can_read_message_media(text)') is null then
    raise exception 'File-message prerequisites are missing. Apply secure image/voice and participant Delete Chat migrations first.';
  end if;
end;
$$;

alter table public.messages drop constraint if exists messages_type_check;
alter table public.messages
  add constraint messages_type_check check (message_type in ('text', 'image', 'voice', 'file'));

alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages
  add constraint messages_body_check check (
    (
      is_deleted = false
      and deleted_at is null
      and body = pg_catalog.btrim(body)
      and (
        (message_type = 'text'::text and pg_catalog.char_length(body) between 1 and 4000)
        or (message_type in ('image'::text, 'file'::text) and pg_catalog.char_length(body) between 0 and 2000)
        or (message_type = 'voice'::text and body = ''::text)
      )
    )
    or (is_deleted = true and deleted_at is not null and body = ''::text)
  );

alter table public.message_attachments drop constraint if exists message_attachments_kind_metadata_check;
alter table public.message_attachments
  add constraint message_attachments_kind_metadata_check check (
    (
      attachment_kind = 'image'::text
      and mime_type in ('image/png', 'image/jpeg', 'image/webp', 'image/gif')
      and size_bytes between 1 and 10485760
      and width between 1 and 20000
      and height between 1 and 20000
      and duration_ms is null
    )
    or (
      attachment_kind = 'voice'::text
      and pg_catalog.split_part(pg_catalog.lower(mime_type), ';', 1) in ('audio/webm', 'audio/ogg', 'audio/mp4')
      and size_bytes between 1 and 15728640
      and width is null
      and height is null
      and duration_ms between 500 and 300000
      and position = 0
    )
    or (
      attachment_kind = 'file'::text
      and mime_type in (
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
        'text/csv',
        'application/zip'
      )
      and size_bytes between 1 and 26214400
      and width is null
      and height is null
      and duration_ms is null
    )
  );

comment on column public.messages.message_type is 'Message rendering discriminator: text, image, voice, or file.';
comment on column public.message_attachments.attachment_kind is 'Validated attachment discriminator: image, voice, or file.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-media',
  'message-media',
  false,
  26214400,
  array[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'audio/webm', 'audio/ogg', 'audio/mp4',
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv', 'application/zip'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists message_media_participant_insert on storage.objects;
create policy message_media_participant_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'message-media'
  and pg_catalog.array_length(pg_catalog.string_to_array(name, '/'), 1) = 4
  and pg_catalog.split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and pg_catalog.split_part(name, '/', 2) = auth.uid()::text
  and pg_catalog.split_part(name, '/', 3) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and pg_catalog.split_part(pg_catalog.split_part(name, '/', 4), '.', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and pg_catalog.lower(pg_catalog.split_part(name, '.', -1)) in (
    'png', 'jpg', 'jpeg', 'webp', 'gif', 'webm', 'ogg', 'm4a', 'mp4',
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'zip'
  )
  and private.can_send_conversation_message(pg_catalog.split_part(name, '/', 1)::uuid)
);

create or replace function public.create_file_message(
  target_message_id uuid,
  target_conversation_id uuid,
  caption_text text,
  target_reply_to_message_id uuid,
  attachment_records jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_caption text := pg_catalog.btrim(coalesce(caption_text, ''::text));
  v_message public.messages%rowtype;
  v_record jsonb;
  v_storage_path text;
  v_original_name text;
  v_mime_type text;
  v_size_bytes bigint;
  v_position smallint;
  v_path_extension text;
  v_name_extension text;
  v_seen_positions smallint[] := '{}'::smallint[];
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if target_message_id is null or target_conversation_id is null then
    raise exception using errcode = '22023', message = 'A message and conversation are required.';
  end if;
  if pg_catalog.char_length(v_caption) > 2000 then
    raise exception using errcode = '22023', message = 'A file caption must contain no more than 2,000 characters.';
  end if;
  if not private.can_send_conversation_message(target_conversation_id) then
    raise exception using errcode = '42501', message = 'The accepted conversation is unavailable.';
  end if;
  if target_reply_to_message_id is not null and not exists (
    select 1
    from public.messages as reply_target
    where reply_target.id = target_reply_to_message_id
      and reply_target.conversation_id = target_conversation_id
      and reply_target.is_deleted = false
      and reply_target.source_request_id is null
      and private.can_read_conversation_message(reply_target.conversation_id, reply_target.created_at)
  ) then
    raise exception using errcode = '23514', message = 'The reply target is unavailable in this conversation.';
  end if;
  if attachment_records is null
    or pg_catalog.jsonb_typeof(attachment_records) <> 'array'::text
    or pg_catalog.jsonb_array_length(attachment_records) not between 1 and 10 then
    raise exception using errcode = '22023', message = 'Between one and ten file attachments are required.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_message_id::text, 0));

  select message_row.*
  into v_message
  from public.messages as message_row
  where message_row.id = target_message_id;

  if v_message.id is not null then
    if v_message.sender_id <> v_user_id
      or v_message.conversation_id <> target_conversation_id
      or v_message.message_type <> 'file'::text
      or v_message.is_deleted
      or not private.can_read_conversation_message(v_message.conversation_id, v_message.created_at) then
      raise exception using errcode = '23505', message = 'The message identifier is already in use.';
    end if;
    return pg_catalog.jsonb_build_object(
      'message', pg_catalog.to_jsonb(v_message),
      'attachments', (
        select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(attachment_row) order by attachment_row.position), '[]'::jsonb)
        from public.message_attachments as attachment_row
        where attachment_row.message_id = v_message.id and attachment_row.attachment_kind = 'file'::text
      )
    );
  end if;

  for v_record in select array_item.value from pg_catalog.jsonb_array_elements(attachment_records) as array_item(value)
  loop
    if pg_catalog.jsonb_typeof(v_record) <> 'object'::text then
      raise exception using errcode = '22023', message = 'File attachment metadata is invalid.';
    end if;
    v_storage_path := v_record->>'storage_path';
    v_original_name := pg_catalog.btrim(v_record->>'original_name');
    v_mime_type := pg_catalog.lower(pg_catalog.btrim(v_record->>'mime_type'));
    v_size_bytes := (v_record->>'size_bytes')::bigint;
    v_position := (v_record->>'position')::smallint;
    v_path_extension := pg_catalog.lower(pg_catalog.split_part(v_storage_path, '.', -1));
    v_name_extension := pg_catalog.lower(pg_catalog.split_part(v_original_name, '.', -1));

    if v_record->>'attachment_kind' <> 'file'::text
      or pg_catalog.array_length(pg_catalog.string_to_array(v_storage_path, '/'), 1) <> 4
      or pg_catalog.split_part(v_storage_path, '/', 1) <> target_conversation_id::text
      or pg_catalog.split_part(v_storage_path, '/', 2) <> v_user_id::text
      or pg_catalog.split_part(v_storage_path, '/', 3) <> target_message_id::text
      or pg_catalog.split_part(pg_catalog.split_part(v_storage_path, '/', 4), '.', 1) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'A file attachment path is invalid.';
    end if;
    if v_original_name is null
      or pg_catalog.char_length(v_original_name) not between 1 and 255
      or v_original_name ~ '[[:cntrl:]]'
      or v_original_name ~ '[/\\]' then
      raise exception using errcode = '22023', message = 'A file attachment name is invalid.';
    end if;
    if v_size_bytes not between 1 and 26214400
      or v_position not between 0 and 9
      or v_position = any(v_seen_positions) then
      raise exception using errcode = '22023', message = 'File attachment size or position is invalid.';
    end if;
    if not (
      (v_path_extension = 'pdf' and v_name_extension = 'pdf' and v_mime_type = 'application/pdf')
      or (v_path_extension = 'doc' and v_name_extension = 'doc' and v_mime_type = 'application/msword')
      or (v_path_extension = 'docx' and v_name_extension = 'docx' and v_mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      or (v_path_extension = 'xls' and v_name_extension = 'xls' and v_mime_type = 'application/vnd.ms-excel')
      or (v_path_extension = 'xlsx' and v_name_extension = 'xlsx' and v_mime_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      or (v_path_extension = 'ppt' and v_name_extension = 'ppt' and v_mime_type = 'application/vnd.ms-powerpoint')
      or (v_path_extension = 'pptx' and v_name_extension = 'pptx' and v_mime_type = 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
      or (v_path_extension = 'txt' and v_name_extension = 'txt' and v_mime_type = 'text/plain')
      or (v_path_extension = 'csv' and v_name_extension = 'csv' and v_mime_type = 'text/csv')
      or (v_path_extension = 'zip' and v_name_extension = 'zip' and v_mime_type = 'application/zip')
    ) then
      raise exception using errcode = '22023', message = 'A file extension and MIME type do not match the allowlist.';
    end if;
    if not exists (
      select 1
      from storage.objects as stored_object
      where stored_object.bucket_id = 'message-media'
        and stored_object.name = v_storage_path
        and stored_object.owner_id = v_user_id::text
    ) then
      raise exception using errcode = '22023', message = 'An uploaded file is unavailable.';
    end if;
    v_seen_positions := pg_catalog.array_append(v_seen_positions, v_position);
  end loop;

  if pg_catalog.array_length(v_seen_positions, 1) <> pg_catalog.jsonb_array_length(attachment_records)
    or (select pg_catalog.min(position_value) from pg_catalog.unnest(v_seen_positions) as position_value) <> 0
    or (select pg_catalog.max(position_value) from pg_catalog.unnest(v_seen_positions) as position_value) <> pg_catalog.jsonb_array_length(attachment_records) - 1 then
    raise exception using errcode = '22023', message = 'File attachment positions must be consecutive from zero.';
  end if;

  insert into public.messages (id, conversation_id, sender_id, body, message_type, reply_to_message_id)
  values (target_message_id, target_conversation_id, v_user_id, v_caption, 'file'::text, target_reply_to_message_id)
  returning * into v_message;

  insert into public.message_attachments (message_id, storage_path, original_name, mime_type, size_bytes, width, height, position, attachment_kind, duration_ms)
  select
    v_message.id,
    file_record.value->>'storage_path',
    pg_catalog.btrim(file_record.value->>'original_name'),
    pg_catalog.lower(pg_catalog.btrim(file_record.value->>'mime_type')),
    (file_record.value->>'size_bytes')::bigint,
    null::integer,
    null::integer,
    (file_record.value->>'position')::smallint,
    'file'::text,
    null::integer
  from pg_catalog.jsonb_array_elements(attachment_records) as file_record(value)
  order by (file_record.value->>'position')::smallint;

  return pg_catalog.jsonb_build_object(
    'message', pg_catalog.to_jsonb(v_message),
    'attachments', (
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(attachment_row) order by attachment_row.position)
      from public.message_attachments as attachment_row
      where attachment_row.message_id = v_message.id and attachment_row.attachment_kind = 'file'::text
    )
  );
end;
$$;

create or replace function public.edit_message(target_message_id uuid, new_body text)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_body text := pg_catalog.btrim(coalesce(new_body, ''::text));
  v_message public.messages%rowtype;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  if target_message_id is null then raise exception using errcode = '22023', message = 'A message ID is required.'; end if;

  select message_row.* into v_message
  from public.messages as message_row
  where message_row.id = target_message_id and message_row.sender_id = v_user_id
  for update;

  if v_message.id is null
    or v_message.is_deleted
    or v_message.source_request_id is not null
    or v_message.message_type not in ('text'::text, 'image'::text, 'file'::text)
    or not private.can_read_conversation_message(v_message.conversation_id, v_message.created_at) then
    raise exception using errcode = '42501', message = 'The message is unavailable for editing.';
  end if;
  if (v_message.message_type = 'text'::text and pg_catalog.char_length(v_body) = 0)
    or pg_catalog.char_length(v_body) > 2000 then
    raise exception using errcode = '22023', message = 'A message must contain no more than 2,000 characters.';
  end if;
  if v_body = v_message.body then return v_message; end if;

  update public.messages as message_row
  set body = v_body, edited_at = pg_catalog.now()
  where message_row.id = v_message.id and message_row.is_deleted = false
  returning message_row.* into v_message;
  return v_message;
end;
$$;

create or replace function public.set_message_pinned(target_message_id uuid, pinned boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_message public.messages%rowtype;
  v_pin_count integer;
  v_inserted_message_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  if target_message_id is null or pinned is null then raise exception using errcode = '22023', message = 'A message ID and pin state are required.'; end if;

  select message_row.* into v_message from public.messages as message_row where message_row.id = target_message_id for update;
  if v_message.id is null or v_message.is_deleted or v_message.source_request_id is not null
    or v_message.message_type not in ('text'::text, 'image'::text, 'voice'::text, 'file'::text)
    or not private.can_read_conversation_message(v_message.conversation_id, v_message.created_at) then
    raise exception using errcode = '42501', message = 'The message is unavailable for pinning.';
  end if;
  if not private.can_send_conversation_message(v_message.conversation_id) then
    raise exception using errcode = '42501', message = 'The accepted conversation is unavailable.';
  end if;
  perform 1 from public.conversations as conversation_row where conversation_row.id = v_message.conversation_id for update;
  if not pinned then
    delete from public.pinned_messages as pin_row where pin_row.message_id = v_message.id and pin_row.conversation_id = v_message.conversation_id;
    return false;
  end if;
  if exists (select 1 from public.pinned_messages as pin_row where pin_row.message_id = v_message.id and pin_row.conversation_id = v_message.conversation_id) then return true; end if;
  select pg_catalog.count(*)::integer into v_pin_count from public.pinned_messages as pin_row where pin_row.conversation_id = v_message.conversation_id;
  if v_pin_count >= 50 then raise exception using errcode = '54000', message = 'This conversation already has 50 pinned messages.'; end if;
  insert into public.pinned_messages as inserted_pin (message_id, conversation_id, pinned_by)
  values (v_message.id, v_message.conversation_id, v_user_id)
  on conflict on constraint pinned_messages_pkey do nothing
  returning inserted_pin.message_id into v_inserted_message_id;
  if v_inserted_message_id is not null then
    insert into public.conversation_events (conversation_id, actor_id, event_type, target_message_id)
    values (v_message.conversation_id, v_user_id, 'message_pinned'::text, v_message.id);
  end if;
  return true;
end;
$$;

drop function if exists public.list_pinned_messages(uuid, integer);
create function public.list_pinned_messages(target_conversation_id uuid, page_size integer default 50)
returns table (
  message_id uuid, conversation_id uuid, sender_id uuid, body text, created_at timestamptz,
  message_type text, pinned_by uuid, pinned_at timestamptz, attachment_count integer, voice_duration_ms integer,
  first_attachment_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_page_size integer := coalesce(page_size, 50::integer);
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  if target_conversation_id is null or v_page_size not between 1 and 50 then raise exception using errcode = '22023', message = 'A valid conversation and page size are required.'; end if;
  if not private.can_send_conversation_message(target_conversation_id) then raise exception using errcode = '42501', message = 'The accepted conversation is unavailable.'; end if;
  return query
  select pin_row.message_id, pin_row.conversation_id, message_row.sender_id, message_row.body, message_row.created_at,
    message_row.message_type, pin_row.pinned_by, pin_row.pinned_at, attachment_totals.attachment_count, attachment_totals.voice_duration_ms,
    attachment_totals.first_attachment_name
  from public.pinned_messages as pin_row
  join public.messages as message_row on message_row.id = pin_row.message_id and message_row.conversation_id = pin_row.conversation_id
  cross join lateral (
    select pg_catalog.count(*)::integer as attachment_count,
      pg_catalog.max(attachment_row.duration_ms) filter (where attachment_row.attachment_kind = 'voice'::text) as voice_duration_ms
      , (pg_catalog.array_agg(attachment_row.original_name order by attachment_row.position))[1] as first_attachment_name
    from public.message_attachments as attachment_row where attachment_row.message_id = message_row.id
  ) as attachment_totals
  where pin_row.conversation_id = target_conversation_id
    and message_row.is_deleted = false
    and message_row.source_request_id is null
    and message_row.message_type in ('text'::text, 'image'::text, 'voice'::text, 'file'::text)
    and private.can_read_conversation_message(message_row.conversation_id, message_row.created_at)
  order by pin_row.pinned_at desc, pin_row.message_id desc
  limit v_page_size;
end;
$$;

create or replace function public.list_conversation_content(
  target_conversation_id uuid,
  content_kind text,
  page_size integer default 30,
  cursor_created_at timestamptz default null,
  cursor_content_id uuid default null
)
returns table (
  content_id uuid,
  message_id uuid,
  sender_id uuid,
  message_body text,
  message_created_at timestamptz,
  message_type text,
  attachment_kind text,
  storage_path text,
  original_name text,
  mime_type text,
  size_bytes bigint,
  width integer,
  height integer,
  attachment_position smallint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_kind text := pg_catalog.lower(pg_catalog.btrim(coalesce(content_kind, ''::text)));
  v_page_size integer := coalesce(page_size, 30::integer);
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication required.'; end if;
  if target_conversation_id is null or v_kind not in ('media'::text, 'files'::text, 'links'::text) then raise exception using errcode = '22023', message = 'A valid conversation content kind is required.'; end if;
  if v_page_size not between 1 and 50 then raise exception using errcode = '22023', message = 'Page size must be between 1 and 50.'; end if;
  if (cursor_created_at is null) <> (cursor_content_id is null) then raise exception using errcode = '22023', message = 'Both cursor values must be provided together.'; end if;
  if not private.can_send_conversation_message(target_conversation_id) then raise exception using errcode = '42501', message = 'The accepted conversation is unavailable.'; end if;

  if v_kind in ('media'::text, 'files'::text) then
    return query
    select attachment_row.id, message_row.id, message_row.sender_id, message_row.body, message_row.created_at,
      message_row.message_type, attachment_row.attachment_kind, attachment_row.storage_path, attachment_row.original_name,
      attachment_row.mime_type, attachment_row.size_bytes, attachment_row.width, attachment_row.height,
      attachment_row.position as attachment_position
    from public.messages as message_row
    join public.message_attachments as attachment_row on attachment_row.message_id = message_row.id
    where message_row.conversation_id = target_conversation_id
      and message_row.is_deleted = false
      and message_row.source_request_id is null
      and attachment_row.attachment_kind = case when v_kind = 'media'::text then 'image'::text else 'file'::text end
      and private.can_read_conversation_message(message_row.conversation_id, message_row.created_at)
      and (cursor_created_at is null or (message_row.created_at, attachment_row.id) < (cursor_created_at, cursor_content_id))
    order by message_row.created_at desc, attachment_row.id desc
    limit v_page_size;
  else
    return query
    select message_row.id, message_row.id, message_row.sender_id, message_row.body, message_row.created_at,
      message_row.message_type, null::text, null::text, null::text, null::text, null::bigint,
      null::integer, null::integer, null::smallint as attachment_position
    from public.messages as message_row
    where message_row.conversation_id = target_conversation_id
      and message_row.is_deleted = false
      and message_row.source_request_id is null
      and (pg_catalog.strpos(pg_catalog.lower(message_row.body), 'http://'::text) > 0 or pg_catalog.strpos(pg_catalog.lower(message_row.body), 'https://'::text) > 0)
      and private.can_read_conversation_message(message_row.conversation_id, message_row.created_at)
      and (cursor_created_at is null or (message_row.created_at, message_row.id) < (cursor_created_at, cursor_content_id))
    order by message_row.created_at desc, message_row.id desc
    limit v_page_size;
  end if;
end;
$$;

revoke all on function public.create_file_message(uuid, uuid, text, uuid, jsonb) from public;
revoke all on function public.create_file_message(uuid, uuid, text, uuid, jsonb) from anon;
grant execute on function public.create_file_message(uuid, uuid, text, uuid, jsonb) to authenticated;

revoke all on function public.edit_message(uuid, text) from public;
revoke all on function public.edit_message(uuid, text) from anon;
grant execute on function public.edit_message(uuid, text) to authenticated;

revoke all on function public.set_message_pinned(uuid, boolean) from public;
revoke all on function public.set_message_pinned(uuid, boolean) from anon;
grant execute on function public.set_message_pinned(uuid, boolean) to authenticated;

revoke all on function public.list_pinned_messages(uuid, integer) from public;
revoke all on function public.list_pinned_messages(uuid, integer) from anon;
grant execute on function public.list_pinned_messages(uuid, integer) to authenticated;

revoke all on function public.list_conversation_content(uuid, text, integer, timestamptz, uuid) from public;
revoke all on function public.list_conversation_content(uuid, text, integer, timestamptz, uuid) from anon;
grant execute on function public.list_conversation_content(uuid, text, integer, timestamptz, uuid) to authenticated;

comment on function public.create_file_message(uuid, uuid, text, uuid, jsonb) is 'Idempotently creates one authenticated file message with one to ten strictly allowlisted private attachments.';
comment on function public.list_conversation_content(uuid, text, integer, timestamptz, uuid) is 'Lists one bounded cursor page of cutoff-safe media, files, or link-bearing messages for an accepted conversation.';

notify pgrst, 'reload schema';

commit;

-- Non-destructive verification (run separately after applying this migration):
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid in ('public.messages'::regclass, 'public.message_attachments'::regclass) and conname in ('messages_type_check', 'messages_body_check', 'message_attachments_kind_metadata_check');
-- select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'message-media';
-- select to_regprocedure('public.create_file_message(uuid,uuid,text,uuid,jsonb)') as create_file_message,
--        to_regprocedure('public.list_conversation_content(uuid,text,integer,timestamp with time zone,uuid)') as list_conversation_content;
-- select routine_name, grantee, privilege_type from information_schema.routine_privileges where routine_schema = 'public' and routine_name in ('create_file_message', 'list_conversation_content') order by routine_name, grantee;
-- select grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = 'message_attachments' order by grantee, privilege_type;
