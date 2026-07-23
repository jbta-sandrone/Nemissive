begin;

create policy messages_participants_insert
on public.messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and source_request_id is null
  and private.is_conversation_participant(conversation_id)
);

grant insert (conversation_id, sender_id, body)
on public.messages
to authenticated;

comment on policy messages_participants_insert on public.messages is 'Allows authenticated conversation participants to send non-request messages as themselves.';

commit;
