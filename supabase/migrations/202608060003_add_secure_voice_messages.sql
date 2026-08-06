begin;

do $$
begin
  if pg_catalog.to_regclass('public.messages') is null
    or pg_catalog.to_regclass('public.message_attachments') is null
    or pg_catalog.to_regclass('public.conversation_participants') is null
    or pg_catalog.to_regclass('storage.objects') is null
    or pg_catalog.to_regclass('storage.buckets') is null then
    raise exception 'Voice-message prerequisites are missing. Apply the conversation, image-message, and Storage migrations first.';
  end if;

  if pg_catalog.to_regprocedure('private.is_conversation_participant(uuid)') is null
    or pg_catalog.to_regprocedure('private.can_read_message_media(text)') is null
    or pg_catalog.to_regprocedure('private.is_unattached_message_media(text)') is null then
    raise exception 'Voice-message security helpers are missing. Apply the secure image-message migration first.';
  end if;
end;
$$;

alter table public.message_attachments
  add column if not exists attachment_kind text not null default 'image',
  add column if not exists duration_ms integer null;

alter table public.message_attachments
  alter column width drop not null,
  alter column height drop not null;

alter table public.messages drop constraint if exists messages_type_check;
alter table public.messages
  add constraint messages_type_check check (message_type in ('text', 'image', 'voice'));

alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages
  add constraint messages_body_check check (
    (
      is_deleted = false
      and deleted_at is null
      and body = pg_catalog.btrim(body)
      and (
        (message_type = 'text' and pg_catalog.char_length(body) between 1 and 4000)
        or (message_type = 'image' and pg_catalog.char_length(body) between 0 and 2000)
        or (message_type = 'voice' and body = '')
      )
    )
    or (
      is_deleted = true
      and deleted_at is not null
      and body = ''
    )
  );

alter table public.message_attachments drop constraint if exists message_attachments_mime_type_check;
alter table public.message_attachments drop constraint if exists message_attachments_size_check;
alter table public.message_attachments drop constraint if exists message_attachments_dimensions_check;
alter table public.message_attachments drop constraint if exists message_attachments_kind_metadata_check;
alter table public.message_attachments drop constraint if exists message_attachments_duration_check;

alter table public.message_attachments
  add constraint message_attachments_kind_metadata_check check (
    (
      attachment_kind = 'image'
      and mime_type in ('image/png', 'image/jpeg', 'image/webp', 'image/gif')
      and size_bytes between 1 and 10485760
      and width between 1 and 20000
      and height between 1 and 20000
      and duration_ms is null
    )
    or
    (
      attachment_kind = 'voice'
      and pg_catalog.split_part(pg_catalog.lower(mime_type), ';', 1) in ('audio/webm', 'audio/ogg', 'audio/mp4')
      and size_bytes between 1 and 15728640
      and width is null
      and height is null
      and duration_ms between 500 and 300000
      and position = 0
    )
  );

comment on column public.messages.message_type is 'Message rendering discriminator: text, image with normalized attachments, or voice with one normalized audio attachment.';
comment on table public.message_attachments is 'Ordered private Storage-backed image and voice attachments for messages.';
comment on column public.message_attachments.attachment_kind is 'Validated attachment discriminator. Current values are image and voice.';
comment on column public.message_attachments.duration_ms is 'Encoded voice duration in milliseconds; null for image attachments.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-media',
  'message-media',
  false,
  15728640,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'audio/webm', 'audio/ogg', 'audio/mp4']
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
  and pg_catalog.lower(pg_catalog.split_part(name, '.', -1)) in ('png', 'jpg', 'jpeg', 'webp', 'gif', 'webm', 'ogg', 'm4a', 'mp4')
  and private.is_conversation_participant(pg_catalog.split_part(name, '/', 1)::uuid)
);

create or replace function public.create_voice_message(
  target_message_id uuid,
  target_conversation_id uuid,
  target_reply_to_message_id uuid,
  attachment_record jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_message public.messages%rowtype;
  v_storage_path text;
  v_original_name text;
  v_mime_type text;
  v_base_mime_type text;
  v_size_bytes bigint;
  v_duration_ms integer;
  v_position smallint;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if target_message_id is null or target_conversation_id is null then
    raise exception using errcode = '22023', message = 'A message and conversation are required.';
  end if;

  if not private.is_conversation_participant(target_conversation_id) then
    raise exception using errcode = '42501', message = 'The conversation is unavailable.';
  end if;

  if target_reply_to_message_id is not null and not exists (
    select 1
    from public.messages as reply_target
    where reply_target.id = target_reply_to_message_id
      and reply_target.conversation_id = target_conversation_id
      and reply_target.is_deleted = false
  ) then
    raise exception using errcode = '23514', message = 'The reply target is unavailable in this conversation.';
  end if;

  if attachment_record is null or pg_catalog.jsonb_typeof(attachment_record) <> 'object' then
    raise exception using errcode = '22023', message = 'Voice attachment metadata is required.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_message_id::text, 0));

  select message.*
  into v_message
  from public.messages as message
  where message.id = target_message_id;

  if v_message.id is not null then
    if v_message.sender_id <> v_user_id
      or v_message.conversation_id <> target_conversation_id
      or v_message.message_type <> 'voice'
      or v_message.is_deleted then
      raise exception using errcode = '23505', message = 'The message identifier is already in use.';
    end if;

    return pg_catalog.jsonb_build_object(
      'message', pg_catalog.to_jsonb(v_message),
      'attachments', (
        select coalesce(
          pg_catalog.jsonb_agg(pg_catalog.to_jsonb(attachment) order by attachment.position),
          '[]'::jsonb
        )
        from public.message_attachments as attachment
        where attachment.message_id = v_message.id
          and attachment.attachment_kind = 'voice'
      )
    );
  end if;

  v_storage_path := attachment_record->>'storage_path';
  v_original_name := pg_catalog.btrim(attachment_record->>'original_name');
  v_mime_type := pg_catalog.lower(attachment_record->>'mime_type');
  v_base_mime_type := pg_catalog.split_part(v_mime_type, ';', 1);
  v_size_bytes := (attachment_record->>'size_bytes')::bigint;
  v_duration_ms := (attachment_record->>'duration_ms')::integer;
  v_position := (attachment_record->>'position')::smallint;

  if pg_catalog.array_length(pg_catalog.string_to_array(v_storage_path, '/'), 1) <> 4
    or pg_catalog.split_part(v_storage_path, '/', 1) <> target_conversation_id::text
    or pg_catalog.split_part(v_storage_path, '/', 2) <> v_user_id::text
    or pg_catalog.split_part(v_storage_path, '/', 3) <> target_message_id::text then
    raise exception using errcode = '22023', message = 'The voice attachment path is invalid.';
  end if;

  if v_original_name is null
    or pg_catalog.char_length(v_original_name) not between 1 and 255
    or v_original_name ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'The voice filename is invalid.';
  end if;

  if v_base_mime_type not in ('audio/webm', 'audio/ogg', 'audio/mp4')
    or v_size_bytes not between 1 and 15728640
    or v_duration_ms not between 500 and 300000
    or v_position <> 0 then
    raise exception using errcode = '22023', message = 'Voice attachment metadata is invalid.';
  end if;

  if pg_catalog.split_part(pg_catalog.split_part(v_storage_path, '/', 4), '.', 1) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or not (
      (v_base_mime_type = 'audio/webm' and pg_catalog.lower(pg_catalog.split_part(v_storage_path, '.', -1)) = 'webm')
      or (v_base_mime_type = 'audio/ogg' and pg_catalog.lower(pg_catalog.split_part(v_storage_path, '.', -1)) = 'ogg')
      or (v_base_mime_type = 'audio/mp4' and pg_catalog.lower(pg_catalog.split_part(v_storage_path, '.', -1)) in ('m4a', 'mp4'))
    ) then
    raise exception using errcode = '22023', message = 'The voice attachment filename is invalid.';
  end if;

  if not exists (
    select 1
    from storage.objects as object
    where object.bucket_id = 'message-media'
      and object.name = v_storage_path
      and object.owner_id = v_user_id::text
  ) then
    raise exception using errcode = '22023', message = 'The uploaded voice recording is unavailable.';
  end if;

  insert into public.messages (id, conversation_id, sender_id, body, message_type, reply_to_message_id)
  values (target_message_id, target_conversation_id, v_user_id, ''::text, 'voice'::text, target_reply_to_message_id)
  returning * into v_message;

  insert into public.message_attachments (message_id, storage_path, original_name, mime_type, size_bytes, width, height, position, attachment_kind, duration_ms)
  values (v_message.id, v_storage_path, v_original_name, v_mime_type, v_size_bytes, null, null, 0, 'voice', v_duration_ms);

  return pg_catalog.jsonb_build_object(
    'message', pg_catalog.to_jsonb(v_message),
    'attachments', (
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(attachment) order by attachment.position)
      from public.message_attachments as attachment
      where attachment.message_id = v_message.id
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
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if target_message_id is null then
    raise exception using errcode = '22023', message = 'A message ID is required.';
  end if;

  select message.*
  into v_message
  from public.messages as message
  where message.id = target_message_id
    and message.sender_id = v_user_id
  for update;

  if v_message.id is null or v_message.is_deleted or v_message.source_request_id is not null or v_message.message_type = 'voice' then
    raise exception using errcode = '42501', message = 'The message is unavailable for editing.';
  end if;

  if not private.is_conversation_participant(v_message.conversation_id) then
    raise exception using errcode = '42501', message = 'The conversation is unavailable.';
  end if;

  if (v_message.message_type = 'text' and pg_catalog.char_length(v_body) = 0)
    or pg_catalog.char_length(v_body) > 2000 then
    raise exception using errcode = '22023', message = 'A message must contain no more than 2,000 characters.';
  end if;

  if v_body = v_message.body then
    return v_message;
  end if;

  update public.messages as message
  set body = v_body,
      edited_at = pg_catalog.now()
  where message.id = v_message.id
    and message.is_deleted = false
  returning message.* into v_message;

  if v_message.id is null then
    raise exception using errcode = '55000', message = 'Deleted messages cannot be edited.';
  end if;

  return v_message;
end;
$$;

revoke all on function public.create_voice_message(uuid, uuid, uuid, jsonb) from public;
revoke all on function public.create_voice_message(uuid, uuid, uuid, jsonb) from anon;
grant execute on function public.create_voice_message(uuid, uuid, uuid, jsonb) to authenticated;

revoke all on function public.edit_message(uuid, text) from public;
revoke all on function public.edit_message(uuid, text) from anon;
grant execute on function public.edit_message(uuid, text) to authenticated;

comment on function public.create_voice_message(uuid, uuid, uuid, jsonb) is 'Idempotently creates one auth.uid()-owned voice message and its validated private audio attachment.';

notify pgrst, 'reload schema';

commit;

-- Non-destructive verification (run separately in the Supabase SQL Editor):
-- select column_name, data_type, is_nullable
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'message_attachments'
--   and column_name in ('attachment_kind', 'duration_ms', 'width', 'height')
-- order by column_name;
--
-- select pg_catalog.to_regprocedure('public.create_voice_message(uuid,uuid,uuid,jsonb)') as create_voice_message_rpc,
--        has_function_privilege('anon', 'public.create_voice_message(uuid,uuid,uuid,jsonb)', 'execute') as anon_can_execute,
--        has_function_privilege('authenticated', 'public.create_voice_message(uuid,uuid,uuid,jsonb)', 'execute') as authenticated_can_execute;
--
-- select id, public, file_size_limit, allowed_mime_types
-- from storage.buckets
-- where id = 'message-media';
--
-- select policyname, cmd, roles
-- from pg_policies
-- where schemaname = 'storage'
--   and tablename = 'objects'
--   and policyname = 'message_media_participant_insert';
