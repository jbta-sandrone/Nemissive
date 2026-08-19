begin;

do $$
begin
  if pg_catalog.to_regclass('public.notes') is null
    or pg_catalog.to_regclass('storage.buckets') is null
    or pg_catalog.to_regclass('storage.objects') is null
  then
    raise exception 'Notes V2 requires Notes V1 and Supabase Storage.';
  end if;
end;
$$;

alter table public.notes
  add column document jsonb,
  add column search_text text not null default ''::text,
  add column theme_id text not null default 'default'::text;

update public.notes as note_row
set search_text = note_row.content
where note_row.search_text = ''::text
  and note_row.content <> ''::text;

alter table public.notes
  add constraint notes_document_size_check check (
    document is null or pg_catalog.octet_length(document::text) <= 131072
  ),
  add constraint notes_search_text_length_check check (pg_catalog.char_length(search_text) <= 20000),
  add constraint notes_theme_id_check check (theme_id in ('default', 'midnight', 'ocean', 'lavender', 'emerald', 'rose', 'sunset')),
  add constraint notes_id_user_unique unique (id, user_id);

comment on column public.notes.document is 'Constrained Tiptap JSON. Null retains a not-yet-edited V1 plain-text note.';
comment on column public.notes.content is 'Server-derived plain-text compatibility projection for Notes V1 clients.';
comment on column public.notes.search_text is 'Server-derived visible-text projection for bounded Notes search and list previews.';

create table public.note_attachments (
  id uuid primary key,
  note_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  attachment_type text not null,
  mime_type text not null,
  file_name text not null,
  file_size integer not null,
  duration_ms integer,
  created_at timestamptz not null default pg_catalog.now(),
  constraint note_attachments_note_owner_fk foreign key (note_id, user_id) references public.notes(id, user_id) on delete cascade,
  constraint note_attachments_type_check check (attachment_type in ('image', 'voice', 'file')),
  constraint note_attachments_name_check check (pg_catalog.char_length(file_name) between 1 and 255),
  constraint note_attachments_metadata_check check (
    (attachment_type = 'image' and mime_type in ('image/jpeg', 'image/png', 'image/webp') and file_size between 1 and 10485760 and duration_ms is null)
    or (attachment_type = 'voice' and mime_type in ('audio/webm', 'audio/ogg', 'audio/mp4') and file_size between 1 and 15728640 and duration_ms between 500 and 300000)
    or (attachment_type = 'file' and mime_type in (
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain', 'text/csv', 'application/zip'
    ) and file_size between 1 and 26214400 and duration_ms is null)
  )
);

create index note_attachments_owner_note_idx on public.note_attachments (user_id, note_id, created_at, id);
alter table public.note_attachments enable row level security;
revoke all on table public.note_attachments from public, anon, authenticated;
create policy note_attachments_owner_select on public.note_attachments for select to authenticated
using (note_attachments.user_id = auth.uid() and private.is_active_account(auth.uid()));
grant select on table public.note_attachments to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'notes-private', 'notes-private', false, 26214400,
  array[
    'image/jpeg','image/png','image/webp','audio/webm','audio/ogg','audio/mp4',
    'application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain','text/csv','application/zip'
  ]::text[]
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists notes_private_insert_own on storage.objects;
create policy notes_private_insert_own on storage.objects for insert to authenticated
with check (
  bucket_id = 'notes-private'
  and pg_catalog.array_length(pg_catalog.string_to_array(name, '/'), 1) = 3
  and pg_catalog.split_part(name, '/', 1) = auth.uid()::text
  and pg_catalog.split_part(name, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and pg_catalog.split_part(pg_catalog.split_part(name, '/', 3), '.', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and pg_catalog.lower(pg_catalog.split_part(name, '.', -1)) in ('jpg','jpeg','png','webp','webm','ogg','m4a','mp4','pdf','doc','docx','xls','xlsx','ppt','pptx','txt','csv','zip')
  and private.is_active_account(auth.uid())
  and exists (
    select 1 from public.notes as note_row
    where note_row.id = pg_catalog.split_part(name, '/', 2)::uuid
      and note_row.user_id = auth.uid()
  )
);

drop policy if exists notes_private_select_own on storage.objects;
create policy notes_private_select_own on storage.objects for select to authenticated
using (bucket_id = 'notes-private' and pg_catalog.split_part(name, '/', 1) = auth.uid()::text and private.is_active_account(auth.uid()));

drop policy if exists notes_private_delete_own on storage.objects;
create policy notes_private_delete_own on storage.objects for delete to authenticated
using (bucket_id = 'notes-private' and pg_catalog.split_part(name, '/', 1) = auth.uid()::text and private.is_active_account(auth.uid()));

create or replace function private.note_document_plain_text(candidate_document jsonb)
returns text language sql immutable set search_path = '' as $$
  with recursive document_nodes(node) as (
    select candidate_document
    union all
    select child.value
    from document_nodes as parent
    cross join lateral pg_catalog.jsonb_array_elements(
      case when pg_catalog.jsonb_typeof(parent.node -> 'content') = 'array' then parent.node -> 'content' else '[]'::jsonb end
    ) as child(value)
  )
  select pg_catalog.btrim(pg_catalog.regexp_replace(coalesce(pg_catalog.string_agg(node ->> 'text', ' '), ''::text), '[[:space:]]+', ' ', 'g'))
  from document_nodes
  where pg_catalog.jsonb_typeof(node -> 'text') = 'string';
$$;

create or replace function private.note_document_is_valid(candidate_document jsonb, target_note_id uuid, target_user_id uuid)
returns boolean language plpgsql stable set search_path = '' as $$
declare v_invalid boolean;
begin
  if candidate_document is null or pg_catalog.jsonb_typeof(candidate_document) <> 'object' or candidate_document ->> 'type' <> 'doc' or pg_catalog.octet_length(candidate_document::text) > 131072 then return false; end if;
  with recursive document_nodes(node) as (
    select candidate_document
    union all
    select child.value from document_nodes as parent cross join lateral pg_catalog.jsonb_array_elements(case when pg_catalog.jsonb_typeof(parent.node -> 'content') = 'array' then parent.node -> 'content' else '[]'::jsonb end) as child(value)
  )
  select exists (
    select 1 from document_nodes
    where coalesce(node ->> 'type','') not in ('doc','paragraph','text','heading','bulletList','orderedList','listItem','taskList','taskItem','blockquote','horizontalRule','hardBreak','noteAttachment')
      or (node ? 'content' and pg_catalog.jsonb_typeof(node -> 'content') <> 'array')
      or (node ? 'marks' and pg_catalog.jsonb_typeof(node -> 'marks') <> 'array')
      or (node ->> 'type' = 'text' and pg_catalog.jsonb_typeof(node -> 'text') <> 'string')
      or (node ->> 'type' = 'heading' and coalesce(node -> 'attrs' ->> 'level', '') not in ('1','2','3'))
      or (node ->> 'type' = 'noteAttachment' and (node -> 'attrs' ->> 'attachmentId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
      or (node ->> 'type' = 'noteAttachment' and coalesce(node -> 'attrs' ->> 'attachmentType','') not in ('image','voice','file'))
  ) into v_invalid;
  if v_invalid then return false; end if;

  with recursive document_nodes(node) as (
    select candidate_document
    union all
    select child.value from document_nodes as parent cross join lateral pg_catalog.jsonb_array_elements(case when pg_catalog.jsonb_typeof(parent.node -> 'content') = 'array' then parent.node -> 'content' else '[]'::jsonb end) as child(value)
  ), marks(mark) as (
    select mark.value from document_nodes cross join lateral pg_catalog.jsonb_array_elements(case when pg_catalog.jsonb_typeof(document_nodes.node -> 'marks') = 'array' then document_nodes.node -> 'marks' else '[]'::jsonb end) as mark(value)
  )
  select exists (select 1 from marks where coalesce(mark ->> 'type','') not in ('bold','italic','underline','strike','highlight','link') or (mark ->> 'type' = 'link' and coalesce(mark -> 'attrs' ->> 'href','') !~* '^https?://')) into v_invalid;
  if v_invalid then return false; end if;

  with recursive document_nodes(node) as (
    select candidate_document
    union all
    select child.value from document_nodes as parent cross join lateral pg_catalog.jsonb_array_elements(case when pg_catalog.jsonb_typeof(parent.node -> 'content') = 'array' then parent.node -> 'content' else '[]'::jsonb end) as child(value)
  ), attachment_refs(id, kind) as (
    select (node -> 'attrs' ->> 'attachmentId')::uuid, node -> 'attrs' ->> 'attachmentType' from document_nodes where node ->> 'type' = 'noteAttachment'
  )
  select exists (
    select 1 from attachment_refs as reference_row
    where not exists (
      select 1 from public.note_attachments as attachment_row
      where attachment_row.id = reference_row.id and attachment_row.note_id = target_note_id and attachment_row.user_id = target_user_id and attachment_row.attachment_type = reference_row.kind
    )
  ) into v_invalid;
  return not v_invalid;
end;
$$;

drop function public.save_note(uuid, text, text);
create function public.save_note(target_note_id uuid, candidate_title text, candidate_document jsonb, candidate_theme_id text)
returns public.notes language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid(); v_note public.notes; v_note_id uuid := target_note_id; v_plain_text text;
begin
  if v_user_id is null or not private.is_active_account(v_user_id) then raise exception using errcode='42501', message='Authentication required.'; end if;
  if candidate_title is null or candidate_document is null or candidate_theme_id is null then raise exception using errcode='22004', message='Complete note content is required.'; end if;
  if pg_catalog.char_length(candidate_title) > 120 then raise exception using errcode='22001', message='Note titles may not exceed 120 characters.'; end if;
  if candidate_theme_id not in ('default','midnight','ocean','lavender','emerald','rose','sunset') then raise exception using errcode='22023', message='Unsupported note theme.'; end if;
  if v_note_id is null then v_note_id := pg_catalog.gen_random_uuid(); end if;
  if not private.note_document_is_valid(candidate_document, v_note_id, v_user_id) then raise exception using errcode='22023', message='Unsupported or unauthorized note document.'; end if;
  v_plain_text := private.note_document_plain_text(candidate_document);
  if pg_catalog.char_length(v_plain_text) > 20000 then raise exception using errcode='22001', message='Note text may not exceed 20,000 characters.'; end if;
  if target_note_id is null then
    if pg_catalog.length(pg_catalog.btrim(candidate_title)) = 0 and pg_catalog.length(v_plain_text) = 0 then raise exception using errcode='22023', message='An empty note is not saved.'; end if;
    insert into public.notes (id,user_id,title,content,document,search_text,theme_id) values (v_note_id,v_user_id,candidate_title,v_plain_text,candidate_document,v_plain_text,candidate_theme_id) returning * into v_note;
  else
    update public.notes as note_row set title=candidate_title,content=v_plain_text,document=candidate_document,search_text=v_plain_text,theme_id=candidate_theme_id,updated_at=pg_catalog.clock_timestamp() where note_row.id=v_note_id and note_row.user_id=v_user_id returning * into v_note;
    if not found then raise exception using errcode='P0002', message='Note not found.'; end if;
  end if;
  return v_note;
end;
$$;

create function public.create_note_draft()
returns public.notes language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_note public.notes;
begin
  if v_user_id is null or not private.is_active_account(v_user_id) then raise exception using errcode='42501', message='Authentication required.'; end if;
  insert into public.notes (user_id,title,content,document,search_text,theme_id) values (v_user_id,''::text,''::text,'{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,''::text,'default'::text) returning * into v_note;
  return v_note;
end;
$$;

create function public.create_note_attachment(target_attachment_id uuid, target_note_id uuid, candidate_storage_path text, candidate_attachment_type text, candidate_mime_type text, candidate_file_name text, candidate_file_size integer, candidate_duration_ms integer)
returns public.note_attachments language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_attachment public.note_attachments; v_expected_prefix text;
begin
  if v_user_id is null or not private.is_active_account(v_user_id) then raise exception using errcode='42501', message='Authentication required.'; end if;
  if target_attachment_id is null or target_note_id is null or candidate_storage_path is null then raise exception using errcode='22004', message='Complete attachment metadata is required.'; end if;
  v_expected_prefix := v_user_id::text || '/' || target_note_id::text || '/' || target_attachment_id::text || '.';
  if pg_catalog.strpos(candidate_storage_path, v_expected_prefix) <> 1 then raise exception using errcode='22023', message='Invalid attachment path.'; end if;
  if not exists (select 1 from public.notes as note_row where note_row.id=target_note_id and note_row.user_id=v_user_id) then raise exception using errcode='P0002', message='Note not found.'; end if;
  if not exists (
    select 1 from storage.objects as object_row
    where object_row.bucket_id='notes-private'
      and object_row.name=candidate_storage_path
      and object_row.owner_id=v_user_id::text
      and object_row.metadata ->> 'mimetype' = candidate_mime_type
      and coalesce((object_row.metadata ->> 'size')::bigint, 0::bigint) = candidate_file_size::bigint
  ) then raise exception using errcode='55000', message='Private attachment upload is unavailable or does not match its metadata.'; end if;
  insert into public.note_attachments (id,note_id,user_id,storage_path,attachment_type,mime_type,file_name,file_size,duration_ms) values (target_attachment_id,target_note_id,v_user_id,candidate_storage_path,candidate_attachment_type,candidate_mime_type,candidate_file_name,candidate_file_size,candidate_duration_ms) returning * into v_attachment;
  return v_attachment;
end;
$$;

create function public.delete_note_attachment(target_attachment_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_attachment public.note_attachments;
begin
  if v_user_id is null or not private.is_active_account(v_user_id) then raise exception using errcode='42501', message='Authentication required.'; end if;
  select * into v_attachment from public.note_attachments as attachment_row where attachment_row.id=target_attachment_id and attachment_row.user_id=v_user_id;
  if v_attachment.id is null then raise exception using errcode='P0002', message='Attachment not found.'; end if;
  if exists (select 1 from storage.objects as object_row where object_row.bucket_id='notes-private' and object_row.name=v_attachment.storage_path) then raise exception using errcode='55000', message='Remove the private Storage object first.'; end if;
  if exists (
    with recursive document_nodes(node) as (
      select note_row.document from public.notes as note_row where note_row.id=v_attachment.note_id and note_row.user_id=v_user_id
      union all
      select child.value from document_nodes as parent cross join lateral pg_catalog.jsonb_array_elements(case when pg_catalog.jsonb_typeof(parent.node -> 'content')='array' then parent.node -> 'content' else '[]'::jsonb end) as child(value)
    ) select 1 from document_nodes where node ->> 'type'='noteAttachment' and node -> 'attrs' ->> 'attachmentId'=target_attachment_id::text
  ) then raise exception using errcode='55000', message='Save the note without this attachment first.'; end if;
  delete from public.note_attachments as attachment_row where attachment_row.id=target_attachment_id and attachment_row.user_id=v_user_id;
  return true;
end;
$$;

create or replace function public.delete_note(target_note_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not private.is_active_account(v_user_id) then raise exception using errcode='42501', message='Authentication required.'; end if;
  if exists (select 1 from public.note_attachments as attachment_row join storage.objects as object_row on object_row.bucket_id='notes-private' and object_row.name=attachment_row.storage_path where attachment_row.note_id=target_note_id and attachment_row.user_id=v_user_id) then raise exception using errcode='55000', message='Remove note Storage objects before deleting the note.'; end if;
  delete from public.notes as note_row where note_row.id=target_note_id and note_row.user_id=v_user_id;
  if not found then raise exception using errcode='P0002', message='Note not found.'; end if;
  return true;
end;
$$;

revoke all on function private.note_document_plain_text(jsonb) from public, anon, authenticated;
revoke all on function private.note_document_is_valid(jsonb,uuid,uuid) from public, anon, authenticated;
revoke all on function public.save_note(uuid,text,jsonb,text) from public, anon, authenticated;
revoke all on function public.create_note_draft() from public, anon, authenticated;
revoke all on function public.create_note_attachment(uuid,uuid,text,text,text,text,integer,integer) from public, anon, authenticated;
revoke all on function public.delete_note_attachment(uuid) from public, anon, authenticated;
revoke all on function public.delete_note(uuid) from public, anon, authenticated;
grant execute on function public.save_note(uuid,text,jsonb,text) to authenticated;
grant execute on function public.create_note_draft() to authenticated;
grant execute on function public.create_note_attachment(uuid,uuid,text,text,text,text,integer,integer) to authenticated;
grant execute on function public.delete_note_attachment(uuid) to authenticated;
grant execute on function public.delete_note(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;

-- Verification (run as an administrative SQL role after applying):
-- select id, public, file_size_limit, allowed_mime_types from storage.buckets where id='notes-private';
-- select policyname, roles, cmd from pg_catalog.pg_policies where schemaname in ('public','storage') and tablename in ('notes','note_attachments','objects') and policyname like 'note%';
-- select has_table_privilege('authenticated','public.note_attachments','insert,update,delete') as authenticated_can_write_attachments_directly,
--        has_function_privilege('authenticated','public.save_note(uuid,text,jsonb,text)','execute') as authenticated_can_save_v2,
--        has_function_privilege('anon','public.save_note(uuid,text,jsonb,text)','execute') as anon_can_save_v2;
-- select id,user_id,title,content,document,search_text,theme_id from public.notes order by updated_at desc limit 10;
