begin;

do $$
begin
  if pg_catalog.to_regclass('public.message_attachments') is null then
    raise exception 'public.message_attachments is missing. Apply 202607270001_add_secure_image_messaging.sql before this RPC repair.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'messages'
      and column_name = 'message_type'
  ) then
    raise exception 'public.messages.message_type is missing. Apply 202607270001_add_secure_image_messaging.sql before this RPC repair.';
  end if;

  if pg_catalog.to_regprocedure('private.is_conversation_participant(uuid)') is null then
    raise exception 'private.is_conversation_participant(uuid) is missing. Apply the conversation schema migrations before this RPC repair.';
  end if;

  if pg_catalog.to_regclass('storage.objects') is null then
    raise exception 'storage.objects is missing. Verify that Supabase Storage is enabled before this RPC repair.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'storage'
      and table_name = 'objects'
      and column_name = 'owner_id'
  ) then
    raise exception 'storage.objects.owner_id is missing. Review the Storage ownership column before applying this RPC repair.';
  end if;
end;
$$;

create or replace function public.create_image_message(
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
  v_caption text := pg_catalog.btrim(pg_catalog.coalesce(caption_text, ''));
  v_message public.messages%rowtype;
  v_attachment jsonb;
  v_storage_path text;
  v_original_name text;
  v_mime_type text;
  v_size_bytes bigint;
  v_width integer;
  v_height integer;
  v_position smallint;
  v_attachment_count integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if target_message_id is null or target_conversation_id is null then
    raise exception using errcode = '22023', message = 'A message and conversation are required.';
  end if;

  if pg_catalog.char_length(v_caption) > 2000 then
    raise exception using errcode = '22023', message = 'An image caption must be 2,000 characters or fewer.';
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

  if attachment_records is null or pg_catalog.jsonb_typeof(attachment_records) <> 'array' then
    raise exception using errcode = '22023', message = 'Image attachment metadata is required.';
  end if;

  v_attachment_count := pg_catalog.jsonb_array_length(attachment_records);
  if v_attachment_count < 1 or v_attachment_count > 10 then
    raise exception using errcode = '22023', message = 'An image message must contain between one and ten images.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_message_id::text, 0));

  select message.*
  into v_message
  from public.messages as message
  where message.id = target_message_id;

  if v_message.id is not null then
    if v_message.sender_id <> v_user_id
      or v_message.conversation_id <> target_conversation_id
      or v_message.message_type <> 'image'
      or v_message.is_deleted then
      raise exception using errcode = '23505', message = 'The message identifier is already in use.';
    end if;

    return pg_catalog.jsonb_build_object(
      'message', pg_catalog.to_jsonb(v_message),
      'attachments', (
        select pg_catalog.coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(attachment) order by attachment.position), '[]'::jsonb)
        from public.message_attachments as attachment
        where attachment.message_id = v_message.id
      )
    );
  end if;

  if (
    select pg_catalog.count(distinct item->>'storage_path')
    from pg_catalog.jsonb_array_elements(attachment_records) as item
  ) <> v_attachment_count then
    raise exception using errcode = '22023', message = 'Duplicate image attachment paths are not allowed.';
  end if;

  if (
    select pg_catalog.count(distinct item->>'position')
    from pg_catalog.jsonb_array_elements(attachment_records) as item
  ) <> v_attachment_count then
    raise exception using errcode = '22023', message = 'Duplicate image attachment positions are not allowed.';
  end if;

  for v_attachment in select value from pg_catalog.jsonb_array_elements(attachment_records)
  loop
    v_storage_path := v_attachment->>'storage_path';
    v_original_name := pg_catalog.btrim(v_attachment->>'original_name');
    v_mime_type := pg_catalog.lower(v_attachment->>'mime_type');
    v_size_bytes := (v_attachment->>'size_bytes')::bigint;
    v_width := (v_attachment->>'width')::integer;
    v_height := (v_attachment->>'height')::integer;
    v_position := (v_attachment->>'position')::smallint;

    if pg_catalog.array_length(pg_catalog.string_to_array(v_storage_path, '/'), 1) <> 4
      or pg_catalog.split_part(v_storage_path, '/', 1) <> target_conversation_id::text
      or pg_catalog.split_part(v_storage_path, '/', 2) <> v_user_id::text
      or pg_catalog.split_part(v_storage_path, '/', 3) <> target_message_id::text then
      raise exception using errcode = '22023', message = 'An image attachment path is invalid.';
    end if;

    if v_original_name is null
      or pg_catalog.char_length(v_original_name) not between 1 and 255
      or v_original_name ~ '[[:cntrl:]]' then
      raise exception using errcode = '22023', message = 'An image filename is invalid.';
    end if;

    if v_mime_type not in ('image/png', 'image/jpeg', 'image/webp', 'image/gif')
      or v_size_bytes not between 1 and 10485760
      or v_width not between 1 and 20000
      or v_height not between 1 and 20000
      or v_position not between 0 and 9 then
      raise exception using errcode = '22023', message = 'Image attachment metadata is invalid.';
    end if;

    if pg_catalog.split_part(pg_catalog.split_part(v_storage_path, '/', 4), '.', 1) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or not (
        (v_mime_type = 'image/png' and pg_catalog.lower(pg_catalog.split_part(v_storage_path, '.', -1)) = 'png')
        or (v_mime_type = 'image/jpeg' and pg_catalog.lower(pg_catalog.split_part(v_storage_path, '.', -1)) in ('jpg', 'jpeg'))
        or (v_mime_type = 'image/webp' and pg_catalog.lower(pg_catalog.split_part(v_storage_path, '.', -1)) = 'webp')
        or (v_mime_type = 'image/gif' and pg_catalog.lower(pg_catalog.split_part(v_storage_path, '.', -1)) = 'gif')
      ) then
      raise exception using errcode = '22023', message = 'An image attachment filename is invalid.';
    end if;

    if not exists (
      select 1
      from storage.objects as object
      where object.bucket_id = 'message-media'
        and object.name = v_storage_path
        and object.owner_id = v_user_id::text
    ) then
      raise exception using errcode = '22023', message = 'An uploaded image is unavailable.';
    end if;
  end loop;

  insert into public.messages (id, conversation_id, sender_id, body, message_type, reply_to_message_id)
  values (target_message_id, target_conversation_id, v_user_id, v_caption, 'image', target_reply_to_message_id)
  returning * into v_message;

  insert into public.message_attachments (message_id, storage_path, original_name, mime_type, size_bytes, width, height, position)
  select
    v_message.id,
    item->>'storage_path',
    pg_catalog.btrim(item->>'original_name'),
    pg_catalog.lower(item->>'mime_type'),
    (item->>'size_bytes')::bigint,
    (item->>'width')::integer,
    (item->>'height')::integer,
    (item->>'position')::smallint
  from pg_catalog.jsonb_array_elements(attachment_records) as item
  order by (item->>'position')::smallint;

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

revoke all on function public.create_image_message(uuid, uuid, text, uuid, jsonb) from public;
revoke all on function public.create_image_message(uuid, uuid, text, uuid, jsonb) from anon;
grant execute on function public.create_image_message(uuid, uuid, text, uuid, jsonb) to authenticated;

comment on function public.create_image_message(uuid, uuid, text, uuid, jsonb) is 'Atomically creates one image message and its validated attachment rows after private Storage upload.';

notify pgrst, 'reload schema';

commit;
