begin;

alter table public.messages
add column message_type text not null default 'text';

alter table public.messages
add constraint messages_type_check check (message_type in ('text', 'image'));

alter table public.messages
drop constraint if exists messages_body_check;

alter table public.messages
add constraint messages_body_check check (
  (
    is_deleted = false
    and deleted_at is null
    and body = pg_catalog.btrim(body)
    and (
      (message_type = 'text' and pg_catalog.char_length(body) between 1 and 4000)
      or
      (message_type = 'image' and pg_catalog.char_length(body) between 0 and 2000)
    )
  )
  or
  (
    is_deleted = true
    and deleted_at is not null
    and body = ''
  )
);

comment on column public.messages.message_type is 'Message rendering discriminator. Image messages have one to ten normalized attachment rows and an optional body caption.';

create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  width integer not null,
  height integer not null,
  position smallint not null,
  created_at timestamptz not null default now(),
  constraint message_attachments_original_name_check check (
    pg_catalog.char_length(pg_catalog.btrim(original_name)) between 1 and 255
    and original_name !~ '[[:cntrl:]]'
  ),
  constraint message_attachments_mime_type_check check (mime_type in ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
  constraint message_attachments_size_check check (size_bytes between 1 and 10485760),
  constraint message_attachments_dimensions_check check (width between 1 and 20000 and height between 1 and 20000),
  constraint message_attachments_position_check check (position between 0 and 9),
  unique (message_id, position)
);

create index message_attachments_message_id_idx on public.message_attachments(message_id);

alter table public.message_attachments enable row level security;

create policy message_attachments_participants_select
on public.message_attachments
for select
to authenticated
using (
  exists (
    select 1
    from public.messages as message
    where message.id = message_attachments.message_id
      and message.is_deleted = false
      and private.is_conversation_participant(message.conversation_id)
  )
);

revoke all on table public.message_attachments from public, anon, authenticated;
grant select on table public.message_attachments to authenticated;

create or replace function private.can_read_message_media(target_storage_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.message_attachments as attachment
    join public.messages as message on message.id = attachment.message_id
    join public.conversation_participants as participant on participant.conversation_id = message.conversation_id
    where attachment.storage_path = target_storage_path
      and message.is_deleted = false
      and participant.user_id = auth.uid()
  );
$$;

create or replace function private.is_unattached_message_media(target_storage_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.message_attachments as attachment
    where attachment.storage_path = target_storage_path
  );
$$;

revoke all on function private.can_read_message_media(text) from public;
revoke all on function private.can_read_message_media(text) from anon;
revoke all on function private.is_unattached_message_media(text) from public;
revoke all on function private.is_unattached_message_media(text) from anon;
grant execute on function private.can_read_message_media(text) to authenticated;
grant execute on function private.is_unattached_message_media(text) to authenticated;

drop policy if exists messages_participants_insert on public.messages;
create policy messages_participants_insert
on public.messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and source_request_id is null
  and message_type = 'text'
  and private.is_conversation_participant(conversation_id)
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-media',
  'message-media',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
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
  and pg_catalog.lower(pg_catalog.split_part(name, '.', -1)) in ('png', 'jpg', 'jpeg', 'webp', 'gif')
  and private.is_conversation_participant(pg_catalog.split_part(name, '/', 1)::uuid)
);

drop policy if exists message_media_participant_select on storage.objects;
create policy message_media_participant_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'message-media'
  and (
    private.can_read_message_media(name)
    or (
      pg_catalog.array_length(pg_catalog.string_to_array(name, '/'), 1) = 4
      and pg_catalog.split_part(name, '/', 2) = auth.uid()::text
      and pg_catalog.split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and private.is_conversation_participant(pg_catalog.split_part(name, '/', 1)::uuid)
      and private.is_unattached_message_media(name)
    )
  )
);

drop policy if exists message_media_owner_delete on storage.objects;
create policy message_media_owner_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'message-media'
  and pg_catalog.array_length(pg_catalog.string_to_array(name, '/'), 1) = 4
  and pg_catalog.split_part(name, '/', 2) = auth.uid()::text
  and pg_catalog.split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and private.is_conversation_participant(pg_catalog.split_part(name, '/', 1)::uuid)
  and private.is_unattached_message_media(name)
);

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

create or replace function public.edit_message(target_message_id uuid, new_body text)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_body text := pg_catalog.btrim(pg_catalog.coalesce(new_body, ''));
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

  if v_message.id is null or v_message.is_deleted or v_message.source_request_id is not null then
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

revoke all on function public.create_image_message(uuid, uuid, text, uuid, jsonb) from public;
revoke all on function public.create_image_message(uuid, uuid, text, uuid, jsonb) from anon;
grant execute on function public.create_image_message(uuid, uuid, text, uuid, jsonb) to authenticated;

revoke all on function public.edit_message(uuid, text) from public;
revoke all on function public.edit_message(uuid, text) from anon;
grant execute on function public.edit_message(uuid, text) to authenticated;

comment on table public.message_attachments is 'Ordered private Storage-backed image attachments for a message.';
comment on function public.create_image_message(uuid, uuid, text, uuid, jsonb) is 'Atomically creates one image message and its validated attachment rows after private Storage upload.';

commit;
