begin;

do $$
begin
  if pg_catalog.to_regclass('public.messages') is null
    or pg_catalog.to_regclass('public.message_attachments') is null
    or pg_catalog.to_regclass('public.notes') is null
    or pg_catalog.to_regclass('public.note_attachments') is null
    or pg_catalog.to_regclass('public.scheduled_messages') is null
    or pg_catalog.to_regclass('storage.objects') is null
    or pg_catalog.to_regprocedure('private.can_sender_send_conversation_message(uuid,uuid)') is null
  then
    raise exception 'Multimedia delivery requires the current messaging, Notes V2, Storage, and scheduled-message migrations.';
  end if;
end;
$$;

create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

alter table public.scheduled_messages
  add column has_attachments boolean not null default false,
  add column text_message_id uuid null,
  add column delivered_message_ids uuid[] not null default '{}'::uuid[];

alter table public.scheduled_messages
  add constraint scheduled_messages_id_sender_unique unique (id, sender_id);

alter table public.scheduled_messages drop constraint scheduled_messages_content_check;
alter table public.scheduled_messages
  add constraint scheduled_messages_content_check check (
    content_snapshot = pg_catalog.btrim(content_snapshot)
    and pg_catalog.char_length(content_snapshot) between 0 and 2000
    and (pg_catalog.char_length(content_snapshot) > 0 or has_attachments)
  );

alter table public.scheduled_messages
  add constraint scheduled_messages_text_message_id_check check (
    (pg_catalog.char_length(content_snapshot) = 0 and text_message_id is null)
    or (pg_catalog.char_length(content_snapshot) > 0 and (not has_attachments or text_message_id is not null))
  );

comment on column public.scheduled_messages.has_attachments is
  'True only when a server-owned scheduled-media snapshot exists. Recipients cannot read the snapshot before delivery.';
comment on column public.scheduled_messages.delivered_message_ids is
  'Deterministic ordinary message IDs created for a possibly multi-message multimedia delivery sequence.';

create table public.scheduled_message_attachments (
  id uuid primary key,
  scheduled_message_id uuid not null,
  sender_id uuid not null,
  source_note_attachment_id uuid not null,
  attachment_type text not null,
  storage_path text not null unique,
  destination_storage_path text not null unique,
  mime_type text not null,
  file_name text not null,
  file_size bigint not null,
  width integer,
  height integer,
  duration_ms integer,
  ordinal smallint not null,
  delivery_message_id uuid not null,
  message_ordinal smallint not null,
  delivery_position smallint not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint scheduled_message_attachments_schedule_owner_fk
    foreign key (scheduled_message_id, sender_id)
    references public.scheduled_messages(id, sender_id)
    on delete cascade,
  -- Deliberately no FK to note_attachments: this row is an immutable snapshot
  -- and must survive deletion of the private source Note/attachment metadata.
  constraint scheduled_message_attachments_type_check
    check (attachment_type in ('image'::text, 'voice'::text, 'file'::text)),
  constraint scheduled_message_attachments_name_check
    check (pg_catalog.char_length(file_name) between 1 and 255 and file_name !~ '[[:cntrl:]/\\]'),
  constraint scheduled_message_attachments_ordinal_check
    check (ordinal between 0 and 29 and message_ordinal between 0 and 12 and delivery_position between 0 and 9),
  constraint scheduled_message_attachments_metadata_check check (
    (
      attachment_type = 'image'::text
      and mime_type in ('image/png'::text, 'image/jpeg'::text, 'image/webp'::text)
      and file_size between 1 and 10485760
      and width between 1 and 20000
      and height between 1 and 20000
      and duration_ms is null
    )
    or (
      attachment_type = 'voice'::text
      and mime_type in ('audio/webm'::text, 'audio/ogg'::text, 'audio/mp4'::text)
      and file_size between 1 and 15728640
      and width is null
      and height is null
      and duration_ms between 500 and 300000
      and delivery_position = 0
    )
    or (
      attachment_type = 'file'::text
      and mime_type in (
        'application/pdf'::text, 'application/msword'::text,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'::text,
        'application/vnd.ms-excel'::text,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'::text,
        'application/vnd.ms-powerpoint'::text,
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'::text,
        'text/plain'::text, 'text/csv'::text, 'application/zip'::text
      )
      and file_size between 1 and 26214400
      and width is null
      and height is null
      and duration_ms is null
    )
  ),
  unique (scheduled_message_id, ordinal),
  unique (scheduled_message_id, delivery_message_id, delivery_position)
);

create index scheduled_message_attachments_schedule_idx
on public.scheduled_message_attachments (scheduled_message_id, message_ordinal, delivery_position);

alter table public.scheduled_message_attachments enable row level security;
revoke all on table public.scheduled_message_attachments from public, anon, authenticated;
create policy scheduled_message_attachments_owner_select
on public.scheduled_message_attachments
for select
to authenticated
using (
  scheduled_message_attachments.sender_id = auth.uid()
  and private.is_active_account(auth.uid())
);
grant select (
  id, scheduled_message_id, attachment_type, mime_type, file_name,
  file_size, duration_ms, ordinal, created_at
) on public.scheduled_message_attachments to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'scheduled-message-media',
  'scheduled-message-media',
  false,
  26214400,
  array[
    'image/png', 'image/jpeg', 'image/webp',
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

comment on table public.scheduled_message_attachments is
  'Sender-private immutable media snapshots for scheduled delivery. The bucket has no browser Storage policies.';

create or replace function private.can_user_read_conversation_message(
  target_user_id uuid,
  target_conversation_id uuid,
  target_created_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_account(target_user_id)
    and exists (
      select 1
      from public.conversation_participants as participant_row
      join public.conversations as conversation_row
        on conversation_row.id = participant_row.conversation_id
      where participant_row.conversation_id = target_conversation_id
        and participant_row.user_id = target_user_id
        and conversation_row.conversation_type = 'direct'::text
        and (
          participant_row.history_cleared_at is null
          or target_created_at > participant_row.history_cleared_at
        )
    );
$$;

revoke all on function private.can_user_read_conversation_message(uuid, uuid, timestamptz)
from public, anon, authenticated, service_role;

create or replace function private.note_references_attachment(
  target_note_id uuid,
  target_user_id uuid,
  target_attachment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with recursive document_nodes(node) as (
    select note_row.document
    from public.notes as note_row
    where note_row.id = target_note_id
      and note_row.user_id = target_user_id
    union all
    select child.value
    from document_nodes as parent
    cross join lateral pg_catalog.jsonb_array_elements(
      case when pg_catalog.jsonb_typeof(parent.node -> 'content') = 'array'
        then parent.node -> 'content'
        else '[]'::jsonb
      end
    ) as child(value)
  )
  select exists (
    select 1
    from document_nodes
    where node ->> 'type' = 'noteAttachment'::text
      and node -> 'attrs' ->> 'attachmentId' = target_attachment_id::text
  );
$$;

revoke all on function private.note_references_attachment(uuid, uuid, uuid)
from public, anon, authenticated, service_role;

create or replace function public.authorize_message_media_forward(
  target_actor_id uuid,
  target_source_message_id uuid,
  target_conversation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_message public.messages%rowtype;
  v_attachments jsonb;
begin
  if target_actor_id is null or target_source_message_id is null or target_conversation_id is null
    or not private.is_active_account(target_actor_id)
  then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  select message_row.*
  into v_message
  from public.messages as message_row
  where message_row.id = target_source_message_id
  for share;

  if v_message.id is null
    or v_message.is_deleted
    or v_message.source_request_id is not null
    or v_message.message_type not in ('text'::text, 'image'::text, 'voice'::text, 'file'::text)
    or not private.can_user_read_conversation_message(target_actor_id, v_message.conversation_id, v_message.created_at)
  then
    raise exception using errcode = '42501', message = 'The source message is unavailable for forwarding.';
  end if;

  if not private.can_sender_send_conversation_message(target_actor_id, target_conversation_id) then
    raise exception using errcode = '42501', message = 'Messaging is unavailable for the destination conversation.';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(attachment_row) order by attachment_row.position),
    '[]'::jsonb
  )
  into v_attachments
  from public.message_attachments as attachment_row
  where attachment_row.message_id = v_message.id;

  if v_message.message_type <> 'text'::text and pg_catalog.jsonb_array_length(v_attachments) = 0 then
    raise exception using errcode = '55000', message = 'The source attachment is unavailable.';
  end if;

  return pg_catalog.jsonb_build_object(
    'message', pg_catalog.to_jsonb(v_message),
    'attachments', v_attachments
  );
end;
$$;

create or replace function public.authorize_note_media_delivery(
  target_actor_id uuid,
  target_note_id uuid,
  target_conversation_id uuid,
  target_attachment_ids uuid[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_note public.notes%rowtype;
  v_attachments jsonb;
  v_attachment_count integer := coalesce(pg_catalog.array_length(target_attachment_ids, 1), 0);
begin
  if target_actor_id is null or target_note_id is null or target_conversation_id is null
    or not private.is_active_account(target_actor_id)
  then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if v_attachment_count > 30 then
    raise exception using errcode = '22023', message = 'Too many note attachments were selected.';
  end if;
  if v_attachment_count <> coalesce((select pg_catalog.count(distinct id_value) from pg_catalog.unnest(target_attachment_ids) as id_value), 0) then
    raise exception using errcode = '22023', message = 'Duplicate note attachments are not allowed.';
  end if;

  select note_row.*
  into v_note
  from public.notes as note_row
  where note_row.id = target_note_id
    and note_row.user_id = target_actor_id
  for share;
  if v_note.id is null then
    raise exception using errcode = 'P0002', message = 'The source Note is unavailable.';
  end if;
  if not private.can_sender_send_conversation_message(target_actor_id, target_conversation_id) then
    raise exception using errcode = '42501', message = 'Messaging is unavailable for the destination conversation.';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(coalesce(target_attachment_ids, '{}'::uuid[])) as selected_id
    where not private.note_references_attachment(target_note_id, target_actor_id, selected_id)
      or not exists (
        select 1
        from public.note_attachments as attachment_row
        where attachment_row.id = selected_id
          and attachment_row.note_id = target_note_id
          and attachment_row.user_id = target_actor_id
      )
  ) then
    raise exception using errcode = '42501', message = 'A selected Note attachment is unavailable.';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(attachment_row) order by selected.ordinality),
    '[]'::jsonb
  )
  into v_attachments
  from pg_catalog.unnest(coalesce(target_attachment_ids, '{}'::uuid[])) with ordinality as selected(id, ordinality)
  join public.note_attachments as attachment_row
    on attachment_row.id = selected.id
   and attachment_row.note_id = target_note_id
   and attachment_row.user_id = target_actor_id;

  return pg_catalog.jsonb_build_object(
    'note_id', v_note.id,
    'attachments', v_attachments
  );
end;
$$;

revoke all on function public.authorize_message_media_forward(uuid, uuid, uuid)
from public, anon, authenticated;
revoke all on function public.authorize_note_media_delivery(uuid, uuid, uuid, uuid[])
from public, anon, authenticated;
grant execute on function public.authorize_message_media_forward(uuid, uuid, uuid) to service_role;
grant execute on function public.authorize_note_media_delivery(uuid, uuid, uuid, uuid[]) to service_role;

create or replace function private.insert_multimedia_delivery_records(
  target_actor_id uuid,
  target_conversation_id uuid,
  forwarded boolean,
  delivery_records jsonb
)
returns uuid[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_record jsonb;
  v_attachment jsonb;
  v_message_id uuid;
  v_message_type text;
  v_body text;
  v_ordinal integer;
  v_message_ids uuid[] := '{}'::uuid[];
  v_attachment_count integer;
begin
  if not private.can_sender_send_conversation_message(target_actor_id, target_conversation_id)
    or delivery_records is null
    or pg_catalog.jsonb_typeof(delivery_records) <> 'array'::text
    or pg_catalog.jsonb_array_length(delivery_records) not between 1 and 13
  then
    raise exception using errcode = '42501', message = 'This delivery is unavailable.';
  end if;

  if (select pg_catalog.count(distinct item.value ->> 'message_id') from pg_catalog.jsonb_array_elements(delivery_records) as item(value)) <> pg_catalog.jsonb_array_length(delivery_records)
    or (select pg_catalog.count(distinct item.value ->> 'ordinal') from pg_catalog.jsonb_array_elements(delivery_records) as item(value)) <> pg_catalog.jsonb_array_length(delivery_records)
  then
    raise exception using errcode = '22023', message = 'Delivery message identifiers and positions must be unique.';
  end if;

  for v_record in
    select item.value
    from pg_catalog.jsonb_array_elements(delivery_records) as item(value)
    order by (item.value ->> 'ordinal')::integer
  loop
    v_message_id := (v_record ->> 'message_id')::uuid;
    v_message_type := v_record ->> 'message_type';
    v_body := pg_catalog.btrim(coalesce(v_record ->> 'body', ''::text));
    v_ordinal := (v_record ->> 'ordinal')::integer;
    v_attachment_count := case when pg_catalog.jsonb_typeof(v_record -> 'attachments') = 'array' then pg_catalog.jsonb_array_length(v_record -> 'attachments') else 0 end;

    if v_message_type not in ('text'::text, 'image'::text, 'voice'::text, 'file'::text)
      or v_ordinal not between 0 and 12
      or (v_message_type = 'text'::text and (pg_catalog.char_length(v_body) not between 1 and 2000 or v_attachment_count <> 0))
      or (v_message_type in ('image'::text, 'file'::text) and (pg_catalog.char_length(v_body) > 2000 or v_attachment_count not between 1 and 10))
      or (v_message_type = 'voice'::text and (v_body <> ''::text or v_attachment_count <> 1))
    then
      raise exception using errcode = '22023', message = 'Delivery content is invalid.';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_message_id::text, 0));
    if exists (select 1 from public.messages as existing where existing.id = v_message_id) then
      if not exists (
        select 1
        from public.messages as existing
        where existing.id = v_message_id
          and existing.sender_id = target_actor_id
          and existing.conversation_id = target_conversation_id
          and existing.message_type = v_message_type
          and existing.body = v_body
          and existing.is_forwarded = forwarded
          and not existing.is_deleted
      ) then
        raise exception using errcode = '23505', message = 'A delivery message identifier is already in use.';
      end if;
      v_message_ids := pg_catalog.array_append(v_message_ids, v_message_id);
      continue;
    end if;

    for v_attachment in select item.value from pg_catalog.jsonb_array_elements(coalesce(v_record -> 'attachments', '[]'::jsonb)) as item(value)
    loop
      if v_attachment ->> 'attachment_kind' <> v_message_type
        or pg_catalog.char_length(v_attachment ->> 'original_name') not between 1 and 255
        or v_attachment ->> 'original_name' ~ '[[:cntrl:]/\\]'
        or pg_catalog.split_part(v_attachment ->> 'storage_path', '/', 1) <> target_conversation_id::text
        or pg_catalog.split_part(v_attachment ->> 'storage_path', '/', 2) <> target_actor_id::text
        or pg_catalog.split_part(v_attachment ->> 'storage_path', '/', 3) <> v_message_id::text
        or not exists (
          select 1
          from storage.objects as object_row
          where object_row.bucket_id = 'message-media'::text
            and object_row.name = v_attachment ->> 'storage_path'
            and coalesce((object_row.metadata ->> 'size')::bigint, 0) = (v_attachment ->> 'size_bytes')::bigint
            and pg_catalog.split_part(pg_catalog.lower(coalesce(object_row.metadata ->> 'mimetype', ''::text)), ';', 1)
              = pg_catalog.split_part(pg_catalog.lower(v_attachment ->> 'mime_type'), ';', 1)
        )
      then
        raise exception using errcode = '55000', message = 'A prepared destination attachment is unavailable.';
      end if;
    end loop;

    insert into public.messages (
      id, conversation_id, sender_id, body, message_type, is_forwarded, created_at
    ) values (
      v_message_id, target_conversation_id, target_actor_id, v_body, v_message_type,
      forwarded, pg_catalog.clock_timestamp() + (v_ordinal * interval '1 microsecond')
    );

    insert into public.message_attachments (
      id, message_id, storage_path, original_name, mime_type, size_bytes,
      width, height, position, attachment_kind, duration_ms
    )
    select
      (item.value ->> 'id')::uuid,
      v_message_id,
      item.value ->> 'storage_path',
      item.value ->> 'original_name',
      item.value ->> 'mime_type',
      (item.value ->> 'size_bytes')::bigint,
      nullif(item.value ->> 'width', '')::integer,
      nullif(item.value ->> 'height', '')::integer,
      (item.value ->> 'position')::smallint,
      item.value ->> 'attachment_kind',
      nullif(item.value ->> 'duration_ms', '')::integer
    from pg_catalog.jsonb_array_elements(coalesce(v_record -> 'attachments', '[]'::jsonb)) as item(value)
    order by (item.value ->> 'position')::smallint;

    v_message_ids := pg_catalog.array_append(v_message_ids, v_message_id);
  end loop;

  return v_message_ids;
end;
$$;

revoke all on function private.insert_multimedia_delivery_records(uuid, uuid, boolean, jsonb)
from public, anon, authenticated, service_role;

create or replace function public.finalize_multimedia_delivery(
  target_actor_id uuid,
  target_conversation_id uuid,
  source_kind text,
  source_id uuid,
  source_attachment_ids uuid[],
  delivery_records jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_authorized jsonb;
  v_message_ids uuid[];
begin
  if source_kind = 'forward'::text then
    v_authorized := public.authorize_message_media_forward(target_actor_id, source_id, target_conversation_id);
  elsif source_kind = 'note'::text then
    v_authorized := public.authorize_note_media_delivery(target_actor_id, source_id, target_conversation_id, source_attachment_ids);
  else
    raise exception using errcode = '22023', message = 'Unsupported delivery source.';
  end if;

  v_message_ids := private.insert_multimedia_delivery_records(
    target_actor_id,
    target_conversation_id,
    source_kind = 'forward'::text,
    delivery_records
  );
  return pg_catalog.jsonb_build_object('message_ids', v_message_ids, 'authorized', v_authorized is not null);
end;
$$;

revoke all on function public.finalize_multimedia_delivery(uuid, uuid, text, uuid, uuid[], jsonb)
from public, anon, authenticated;
grant execute on function public.finalize_multimedia_delivery(uuid, uuid, text, uuid, uuid[], jsonb)
to service_role;

create or replace function public.create_multimedia_schedule(
  target_actor_id uuid,
  target_scheduled_message_id uuid,
  target_note_id uuid,
  target_conversation_id uuid,
  content_snapshot text,
  scheduled_for timestamptz,
  target_text_message_id uuid,
  attachment_records jsonb
)
returns public.scheduled_messages
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_schedule public.scheduled_messages%rowtype;
  v_record jsonb;
  v_attachment_ids uuid[];
  v_count integer;
begin
  if target_scheduled_message_id is null or attachment_records is null
    or pg_catalog.jsonb_typeof(attachment_records) <> 'array'::text
    or pg_catalog.jsonb_array_length(attachment_records) not between 1 and 30
  then
    raise exception using errcode = '22023', message = 'Scheduled attachment snapshots are required.';
  end if;
  if content_snapshot is null or content_snapshot <> pg_catalog.btrim(content_snapshot)
    or pg_catalog.char_length(content_snapshot) > 2000
    or (content_snapshot <> ''::text and target_text_message_id is null)
    or (content_snapshot = ''::text and target_text_message_id is not null)
  then
    raise exception using errcode = '22023', message = 'Scheduled message text is invalid.';
  end if;
  perform private.assert_valid_scheduled_message(
    case when content_snapshot = ''::text then 'media'::text else content_snapshot end,
    scheduled_for
  );

  select pg_catalog.array_agg((item.value ->> 'source_note_attachment_id')::uuid order by (item.value ->> 'ordinal')::integer)
  into v_attachment_ids
  from pg_catalog.jsonb_array_elements(attachment_records) as item(value);
  perform public.authorize_note_media_delivery(target_actor_id, target_note_id, target_conversation_id, v_attachment_ids);

  if (select pg_catalog.count(distinct item.value ->> 'source_note_attachment_id') from pg_catalog.jsonb_array_elements(attachment_records) as item(value)) <> pg_catalog.jsonb_array_length(attachment_records)
    or (select pg_catalog.count(*) from pg_catalog.jsonb_array_elements(attachment_records) as item(value) where item.value ->> 'attachment_type' = 'image') > 10
    or (select pg_catalog.count(*) from pg_catalog.jsonb_array_elements(attachment_records) as item(value) where item.value ->> 'attachment_type' = 'file') > 10
    or (select pg_catalog.count(*) from pg_catalog.jsonb_array_elements(attachment_records) as item(value) where item.value ->> 'attachment_type' = 'voice') > 10
  then
    raise exception using errcode = '22023', message = 'Scheduled attachment limits were exceeded.';
  end if;

  insert into public.scheduled_messages (
    id, sender_id, conversation_id, content_snapshot, scheduled_for, next_attempt_at,
    has_attachments, text_message_id
  ) values (
    target_scheduled_message_id, target_actor_id, target_conversation_id, content_snapshot,
    scheduled_for, scheduled_for, true, target_text_message_id
  ) returning * into v_schedule;

  for v_record in select item.value from pg_catalog.jsonb_array_elements(attachment_records) as item(value)
  loop
    if pg_catalog.split_part(v_record ->> 'storage_path', '/', 1) <> target_actor_id::text
      or pg_catalog.split_part(v_record ->> 'storage_path', '/', 2) <> target_scheduled_message_id::text
      or pg_catalog.split_part(v_record ->> 'destination_storage_path', '/', 1) <> target_conversation_id::text
      or pg_catalog.split_part(v_record ->> 'destination_storage_path', '/', 2) <> target_actor_id::text
      or pg_catalog.split_part(v_record ->> 'destination_storage_path', '/', 3) <> v_record ->> 'delivery_message_id'
      or not exists (
        select 1
        from public.note_attachments as source_attachment
        where source_attachment.id = (v_record ->> 'source_note_attachment_id')::uuid
          and source_attachment.note_id = target_note_id
          and source_attachment.user_id = target_actor_id
          and source_attachment.attachment_type = v_record ->> 'attachment_type'
          and source_attachment.mime_type = v_record ->> 'mime_type'
          and source_attachment.file_name = v_record ->> 'file_name'
          and source_attachment.file_size::bigint = (v_record ->> 'file_size')::bigint
          and source_attachment.duration_ms is not distinct from nullif(v_record ->> 'duration_ms', '')::integer
      )
      or not exists (
        select 1
        from storage.objects as object_row
        where object_row.bucket_id = 'scheduled-message-media'::text
          and object_row.name = v_record ->> 'storage_path'
          and coalesce((object_row.metadata ->> 'size')::bigint, 0) = (v_record ->> 'file_size')::bigint
          and pg_catalog.split_part(pg_catalog.lower(coalesce(object_row.metadata ->> 'mimetype', ''::text)), ';', 1)
            = v_record ->> 'mime_type'
      )
    then
      raise exception using errcode = '55000', message = 'A scheduled attachment snapshot is unavailable.';
    end if;

    insert into public.scheduled_message_attachments (
      id, scheduled_message_id, sender_id, source_note_attachment_id, attachment_type,
      storage_path, destination_storage_path, mime_type, file_name, file_size,
      width, height, duration_ms, ordinal, delivery_message_id, message_ordinal, delivery_position
    ) values (
      (v_record ->> 'id')::uuid, target_scheduled_message_id, target_actor_id,
      (v_record ->> 'source_note_attachment_id')::uuid, v_record ->> 'attachment_type',
      v_record ->> 'storage_path', v_record ->> 'destination_storage_path',
      v_record ->> 'mime_type', v_record ->> 'file_name', (v_record ->> 'file_size')::bigint,
      nullif(v_record ->> 'width', '')::integer, nullif(v_record ->> 'height', '')::integer,
      nullif(v_record ->> 'duration_ms', '')::integer, (v_record ->> 'ordinal')::smallint,
      (v_record ->> 'delivery_message_id')::uuid, (v_record ->> 'message_ordinal')::smallint,
      (v_record ->> 'delivery_position')::smallint
    );
  end loop;

  select pg_catalog.count(*) into v_count
  from public.scheduled_message_attachments as attachment_row
  where attachment_row.scheduled_message_id = target_scheduled_message_id;
  if v_count <> pg_catalog.jsonb_array_length(attachment_records) then
    raise exception using errcode = '55000', message = 'Scheduled attachment metadata is incomplete.';
  end if;
  return v_schedule;
end;
$$;

revoke all on function public.create_multimedia_schedule(uuid, uuid, uuid, uuid, text, timestamptz, uuid, jsonb)
from public, anon, authenticated;
grant execute on function public.create_multimedia_schedule(uuid, uuid, uuid, uuid, text, timestamptz, uuid, jsonb)
to service_role;

create or replace function public.claim_scheduled_multimedia_messages(
  batch_size integer default 25,
  target_scheduled_message_id uuid default null,
  allow_early_delivery boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(batch_size, 25), 1), 50);
  v_result jsonb;
begin
  with candidates as (
    select schedule_row.id
    from public.scheduled_messages as schedule_row
    where schedule_row.has_attachments
      and (target_scheduled_message_id is null or schedule_row.id = target_scheduled_message_id)
      and (
        (schedule_row.status = 'scheduled'::text and (allow_early_delivery or schedule_row.next_attempt_at <= pg_catalog.clock_timestamp()))
        or (schedule_row.status = 'processing'::text and schedule_row.processing_started_at < pg_catalog.clock_timestamp() - interval '10 minutes')
      )
    order by schedule_row.next_attempt_at, schedule_row.id
    for update skip locked
    limit v_limit
  ), claimed as (
    update public.scheduled_messages as schedule_row
    set status = 'processing'::text,
        attempt_count = least(schedule_row.attempt_count + 1, 3),
        processing_started_at = pg_catalog.clock_timestamp(),
        failure_code = null,
        failure_message = null,
        updated_at = pg_catalog.clock_timestamp()
    from candidates
    where schedule_row.id = candidates.id
    returning schedule_row.*
  )
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.to_jsonb(claimed) || pg_catalog.jsonb_build_object(
      'attachments', (
        select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(attachment_row) order by attachment_row.ordinal), '[]'::jsonb)
        from public.scheduled_message_attachments as attachment_row
        where attachment_row.scheduled_message_id = claimed.id
      )
    ) order by claimed.next_attempt_at, claimed.id
  ), '[]'::jsonb)
  into v_result
  from claimed;
  return v_result;
end;
$$;

create or replace function public.finalize_scheduled_multimedia_delivery(target_scheduled_message_id uuid)
returns public.scheduled_messages
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_schedule public.scheduled_messages%rowtype;
  v_records jsonb := '[]'::jsonb;
  v_group record;
  v_message_ids uuid[];
begin
  select schedule_row.* into v_schedule
  from public.scheduled_messages as schedule_row
  where schedule_row.id = target_scheduled_message_id
  for update;
  if v_schedule.id is null then raise exception using errcode = 'P0002', message = 'Scheduled message not found.'; end if;
  if v_schedule.status = 'sent'::text then return v_schedule; end if;
  if v_schedule.status <> 'processing'::text or not v_schedule.has_attachments then
    raise exception using errcode = '55000', message = 'This scheduled message is not ready for multimedia delivery.';
  end if;

  if not private.can_sender_send_conversation_message(v_schedule.sender_id, v_schedule.conversation_id) then
    update public.scheduled_messages as schedule_row
    set status = 'failed'::text, failed_at = pg_catalog.clock_timestamp(),
        failure_code = 'messaging_unavailable'::text,
        failure_message = 'Messaging is no longer available for this conversation.'::text,
        processing_started_at = null, updated_at = pg_catalog.clock_timestamp()
    where schedule_row.id = v_schedule.id returning * into v_schedule;
    return v_schedule;
  end if;

  if v_schedule.content_snapshot <> ''::text then
    v_records := v_records || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'message_id', v_schedule.text_message_id,
      'message_type', 'text'::text,
      'body', v_schedule.content_snapshot,
      'ordinal', 0,
      'attachments', '[]'::jsonb
    ));
  end if;

  for v_group in
    select attachment_row.delivery_message_id, attachment_row.attachment_type, attachment_row.message_ordinal
    from public.scheduled_message_attachments as attachment_row
    where attachment_row.scheduled_message_id = v_schedule.id
    group by attachment_row.delivery_message_id, attachment_row.attachment_type, attachment_row.message_ordinal
    order by attachment_row.message_ordinal, attachment_row.delivery_message_id
  loop
    v_records := v_records || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'message_id', v_group.delivery_message_id,
      'message_type', v_group.attachment_type,
      'body', ''::text,
      'ordinal', v_group.message_ordinal,
      'attachments', (
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'id', attachment_row.id,
          'storage_path', attachment_row.destination_storage_path,
          'original_name', attachment_row.file_name,
          'mime_type', attachment_row.mime_type,
          'size_bytes', attachment_row.file_size,
          'width', attachment_row.width,
          'height', attachment_row.height,
          'position', attachment_row.delivery_position,
          'attachment_kind', attachment_row.attachment_type,
          'duration_ms', attachment_row.duration_ms
        ) order by attachment_row.delivery_position)
        from public.scheduled_message_attachments as attachment_row
        where attachment_row.scheduled_message_id = v_schedule.id
          and attachment_row.delivery_message_id = v_group.delivery_message_id
      )
    ));
  end loop;

  v_message_ids := private.insert_multimedia_delivery_records(
    v_schedule.sender_id, v_schedule.conversation_id, false, v_records
  );
  update public.scheduled_messages as schedule_row
  set status = 'sent'::text,
      message_id = v_message_ids[1],
      delivered_message_ids = v_message_ids,
      sent_at = pg_catalog.clock_timestamp(),
      failed_at = null,
      failure_code = null,
      failure_message = null,
      processing_started_at = null,
      updated_at = pg_catalog.clock_timestamp()
  where schedule_row.id = v_schedule.id
  returning * into v_schedule;
  return v_schedule;
end;
$$;

create or replace function public.record_scheduled_multimedia_failure(
  target_scheduled_message_id uuid,
  permanent_failure boolean,
  safe_failure_message text
)
returns public.scheduled_messages
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_schedule public.scheduled_messages%rowtype;
begin
  select schedule_row.* into v_schedule
  from public.scheduled_messages as schedule_row
  where schedule_row.id = target_scheduled_message_id
  for update;
  if v_schedule.id is null then return null; end if;
  if v_schedule.status <> 'processing'::text then return v_schedule; end if;
  if permanent_failure or v_schedule.attempt_count >= 3 then
    update public.scheduled_messages as schedule_row
    set status = 'failed'::text, failed_at = pg_catalog.clock_timestamp(),
        failure_code = case when permanent_failure then 'messaging_unavailable'::text else 'delivery_failed'::text end,
        failure_message = case when permanent_failure then 'Messaging is no longer available for this conversation.'::text else 'Nemissive could not deliver this scheduled message after several attempts.'::text end,
        processing_started_at = null, updated_at = pg_catalog.clock_timestamp()
    where schedule_row.id = v_schedule.id returning * into v_schedule;
  else
    update public.scheduled_messages as schedule_row
    set status = 'scheduled'::text,
        next_attempt_at = pg_catalog.clock_timestamp() + case when schedule_row.attempt_count = 1 then interval '1 minute' else interval '5 minutes' end,
        failure_code = 'delivery_retry'::text,
        failure_message = coalesce(nullif(pg_catalog.btrim(safe_failure_message), ''::text), 'Delivery was delayed. Nemissive will retry automatically.'::text),
        processing_started_at = null, updated_at = pg_catalog.clock_timestamp()
    where schedule_row.id = v_schedule.id returning * into v_schedule;
  end if;
  return v_schedule;
end;
$$;

create or replace function public.purge_scheduled_message_attachments(target_scheduled_message_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  if not exists (
    select 1 from public.scheduled_messages as schedule_row
    where schedule_row.id = target_scheduled_message_id
      and schedule_row.status in ('sent'::text, 'failed'::text, 'cancelled'::text)
  ) then
    raise exception using errcode = '55000', message = 'Scheduled attachment metadata is still required.';
  end if;
  delete from public.scheduled_message_attachments as attachment_row
  where attachment_row.scheduled_message_id = target_scheduled_message_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.list_orphaned_scheduled_media(batch_size integer default 100)
returns text[]
language sql
volatile
security definer
set search_path = ''
as $$
  select coalesce(pg_catalog.array_agg(orphan.name order by orphan.name), '{}'::text[])
  from (
    select object_row.name
    from storage.objects as object_row
    where object_row.bucket_id = 'scheduled-message-media'::text
      and object_row.created_at < pg_catalog.clock_timestamp() - interval '1 hour'
      and not exists (
        select 1
        from public.scheduled_message_attachments as attachment_row
        where attachment_row.storage_path = object_row.name
      )
    order by object_row.created_at, object_row.name
    limit least(greatest(coalesce(batch_size, 100), 1), 500)
  ) as orphan;
$$;

revoke all on function public.claim_scheduled_multimedia_messages(integer, uuid, boolean) from public, anon, authenticated;
revoke all on function public.finalize_scheduled_multimedia_delivery(uuid) from public, anon, authenticated;
revoke all on function public.record_scheduled_multimedia_failure(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.purge_scheduled_message_attachments(uuid) from public, anon, authenticated;
revoke all on function public.list_orphaned_scheduled_media(integer) from public, anon, authenticated;
grant execute on function public.claim_scheduled_multimedia_messages(integer, uuid, boolean) to service_role;
grant execute on function public.finalize_scheduled_multimedia_delivery(uuid) to service_role;
grant execute on function public.record_scheduled_multimedia_failure(uuid, boolean, text) to service_role;
grant execute on function public.purge_scheduled_message_attachments(uuid) to service_role;
grant execute on function public.list_orphaned_scheduled_media(integer) to service_role;

create or replace function private.process_due_scheduled_messages(batch_size integer default 50)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_batch_size integer := least(greatest(coalesce(batch_size, 50), 1), 100);
  v_schedule record;
  v_result public.scheduled_messages%rowtype;
  v_claimed integer := 0;
  v_sent integer := 0;
  v_failed integer := 0;
  v_retried integer := 0;
begin
  for v_schedule in
    select schedule_row.id
    from public.scheduled_messages as schedule_row
    where schedule_row.status = 'scheduled'::text
      and not schedule_row.has_attachments
      and schedule_row.next_attempt_at <= pg_catalog.clock_timestamp()
    order by schedule_row.next_attempt_at, schedule_row.id
    for update skip locked
    limit v_batch_size
  loop
    v_claimed := v_claimed + 1;
    v_result := private.execute_scheduled_message(v_schedule.id, false);
    if v_result.status = 'sent'::text then v_sent := v_sent + 1;
    elsif v_result.status = 'failed'::text then v_failed := v_failed + 1;
    elsif v_result.status = 'scheduled'::text then v_retried := v_retried + 1;
    end if;
  end loop;
  return pg_catalog.jsonb_build_object('claimed', v_claimed, 'sent', v_sent, 'failed', v_failed, 'retried', v_retried);
end;
$$;

revoke all on function private.process_due_scheduled_messages(integer) from public, anon, authenticated;

create or replace function public.send_scheduled_message_now(target_scheduled_message_id uuid)
returns public.scheduled_messages
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_schedule public.scheduled_messages%rowtype;
begin
  if v_actor_id is null or not private.is_active_account(v_actor_id) then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  select schedule_row.* into v_schedule
  from public.scheduled_messages as schedule_row
  where schedule_row.id = target_scheduled_message_id and schedule_row.sender_id = v_actor_id
  for update;
  if v_schedule.id is null then raise exception using errcode = 'P0002', message = 'Scheduled message not found.'; end if;
  if v_schedule.status = 'sent'::text then return v_schedule; end if;
  if v_schedule.status <> 'scheduled'::text then raise exception using errcode = '55000', message = 'This scheduled message cannot be sent now.'; end if;
  if v_schedule.has_attachments then raise exception using errcode = '55000', message = 'Multimedia delivery must use the scheduled media worker.'; end if;
  return private.execute_scheduled_message(v_schedule.id, true);
end;
$$;

revoke all on function public.send_scheduled_message_now(uuid) from public, anon, authenticated;
grant execute on function public.send_scheduled_message_now(uuid) to authenticated;

create or replace function public.update_scheduled_message(
  target_scheduled_message_id uuid,
  candidate_content_snapshot text,
  candidate_scheduled_for timestamptz
)
returns public.scheduled_messages
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_schedule public.scheduled_messages%rowtype;
begin
  if v_actor_id is null or not private.is_active_account(v_actor_id) then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  select schedule_row.* into v_schedule
  from public.scheduled_messages as schedule_row
  where schedule_row.id = target_scheduled_message_id and schedule_row.sender_id = v_actor_id
  for update;
  if v_schedule.id is null then raise exception using errcode = 'P0002', message = 'Scheduled message not found.'; end if;
  if v_schedule.status <> 'scheduled'::text then raise exception using errcode = '55000', message = 'This scheduled message can no longer be changed.'; end if;
  if candidate_content_snapshot is null
    or candidate_content_snapshot <> pg_catalog.btrim(candidate_content_snapshot)
    or pg_catalog.char_length(candidate_content_snapshot) > 2000
    or (candidate_content_snapshot = ''::text and not v_schedule.has_attachments)
  then
    raise exception using errcode = '22023', message = 'Scheduled message text is invalid.';
  end if;
  perform private.assert_valid_scheduled_message(
    case when candidate_content_snapshot = ''::text then 'media'::text else candidate_content_snapshot end,
    candidate_scheduled_for
  );
  if not private.can_sender_send_conversation_message(v_actor_id, v_schedule.conversation_id) then
    raise exception using errcode = '42501', message = 'Messaging is unavailable for this conversation.';
  end if;
  update public.scheduled_messages as schedule_row
  set content_snapshot = candidate_content_snapshot,
      text_message_id = case
        when not schedule_row.has_attachments then null
        when candidate_content_snapshot = ''::text then null
        else coalesce(schedule_row.text_message_id, pg_catalog.gen_random_uuid())
      end,
      scheduled_for = candidate_scheduled_for,
      next_attempt_at = candidate_scheduled_for,
      attempt_count = 0,
      failure_code = null,
      failure_message = null,
      updated_at = pg_catalog.clock_timestamp()
  where schedule_row.id = v_schedule.id
  returning * into v_schedule;
  return v_schedule;
end;
$$;

revoke all on function public.update_scheduled_message(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.update_scheduled_message(uuid, text, timestamptz) to authenticated;

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
        and pg_catalog.split_part(object_row.name, '/', 1) = target_account_id::text
      )
      or (
        object_row.bucket_id = 'message-media'::text
        and pg_catalog.split_part(object_row.name, '/', 2) = target_account_id::text
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

create or replace function private.invoke_scheduled_media_worker()
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_project_url text;
  v_worker_key text;
  v_request_id bigint;
begin
  select secret_row.decrypted_secret into v_project_url
  from vault.decrypted_secrets as secret_row
  where secret_row.name = 'nemissive_project_url'::text
  order by secret_row.updated_at desc limit 1;
  select secret_row.decrypted_secret into v_worker_key
  from vault.decrypted_secrets as secret_row
  where secret_row.name = 'nemissive_scheduled_worker_key'::text
  order by secret_row.updated_at desc limit 1;
  if v_project_url is null or v_worker_key is null then return null; end if;
  select net.http_post(
    url := pg_catalog.rtrim(v_project_url, '/') || '/functions/v1/scheduled-message-worker',
    headers := pg_catalog.jsonb_build_object('Content-Type', 'application/json', 'apikey', v_worker_key),
    body := '{"source":"cron"}'::jsonb,
    timeout_milliseconds := 25000
  ) into v_request_id;
  return v_request_id;
end;
$$;

create or replace function private.process_scheduled_delivery_cycle(batch_size integer default 50)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_text_result jsonb; v_request_id bigint;
begin
  v_text_result := private.process_due_scheduled_messages(batch_size);
  v_request_id := private.invoke_scheduled_media_worker();
  return pg_catalog.jsonb_build_object('text', v_text_result, 'media_request_id', v_request_id);
end;
$$;

revoke all on function private.invoke_scheduled_media_worker() from public, anon, authenticated, service_role;
revoke all on function private.process_scheduled_delivery_cycle(integer) from public, anon, authenticated, service_role;

select cron.schedule(
  'nemissive-process-scheduled-messages',
  '* * * * *',
  $cron$select private.process_scheduled_delivery_cycle(50);$cron$
);

notify pgrst, 'reload schema';

commit;

-- Required after deploying scheduled-message-worker (run once as an administrative role):
-- select vault.create_secret('https://PROJECT_REF.supabase.co', 'nemissive_project_url');
-- select vault.create_secret('sb_secret_DEDICATED_AUTOMATIONS_KEY', 'nemissive_scheduled_worker_key');
-- Use vault.update_secret if either named secret already exists. Never put the secret in a migration.
--
-- Verification:
-- select id, public, file_size_limit from storage.buckets where id in ('message-media','notes-private','scheduled-message-media');
-- select policyname, roles, cmd from pg_catalog.pg_policies where schemaname='public' and tablename='scheduled_message_attachments';
-- select has_table_privilege('anon','public.scheduled_message_attachments','select') as anon_can_read,
--        has_table_privilege('authenticated','public.scheduled_message_attachments','insert,update,delete') as browser_can_write;
-- select jobid, jobname, schedule, command, active from cron.job where jobname='nemissive-process-scheduled-messages';
-- select name, updated_at from vault.decrypted_secrets where name in ('nemissive_project_url','nemissive_scheduled_worker_key');
