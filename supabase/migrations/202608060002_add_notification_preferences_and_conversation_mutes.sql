begin;

do $$
begin
  if pg_catalog.to_regclass('public.profiles') is null
    or pg_catalog.to_regclass('public.conversation_participants') is null then
    raise exception 'Notification preference prerequisites are missing. Apply the profile and conversation migrations first.';
  end if;
end;
$$;

alter table public.profiles
  add column if not exists browser_notifications_enabled boolean not null default false,
  add column if not exists notification_sound_enabled boolean not null default true;

alter table public.conversation_participants
  add column if not exists muted_until timestamptz null;

comment on column public.profiles.browser_notifications_enabled is 'Whether auth.uid() opted into browser notifications while Nemissive is open.';
comment on column public.profiles.notification_sound_enabled is 'Whether eligible browser notifications may play the local notification tone.';
comment on column public.conversation_participants.muted_until is 'Suppresses browser notifications and sound for this participant until the timestamp; null is unmuted.';

create or replace function public.set_notification_preferences(
  notifications_enabled boolean,
  sound_enabled boolean
)
returns table (
  browser_notifications_enabled boolean,
  notification_sound_enabled boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if notifications_enabled is null or sound_enabled is null then
    raise exception using errcode = '22004', message = 'Notification preferences cannot be null.';
  end if;

  return query
  update public.profiles as profile
  set
    browser_notifications_enabled = notifications_enabled,
    notification_sound_enabled = sound_enabled
  where profile.id = v_user_id
  returning profile.browser_notifications_enabled, profile.notification_sound_enabled;

  if not found then
    raise exception using errcode = '42501', message = 'The authenticated profile is unavailable.';
  end if;
end;
$$;

create or replace function public.set_conversation_mute(
  target_conversation_id uuid,
  mute_until timestamptz
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_saved_muted_until timestamptz;
  v_updated_rows integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if target_conversation_id is null then
    raise exception using errcode = '22004', message = 'A conversation is required.';
  end if;

  if mute_until is not null and mute_until < pg_catalog.now() - interval '5 minutes' then
    raise exception using errcode = '22023', message = 'The mute time cannot be in the past.';
  end if;

  update public.conversation_participants as participant
  set muted_until = mute_until
  where participant.conversation_id = target_conversation_id
    and participant.user_id = v_user_id
  returning participant.muted_until into v_saved_muted_until;

  get diagnostics v_updated_rows = row_count;
  if v_updated_rows = 0 then
    raise exception using errcode = '42501', message = 'The conversation is unavailable.';
  end if;

  return v_saved_muted_until;
end;
$$;

revoke all on function public.set_notification_preferences(boolean, boolean) from public;
revoke all on function public.set_notification_preferences(boolean, boolean) from anon;
grant execute on function public.set_notification_preferences(boolean, boolean) to authenticated;

revoke all on function public.set_conversation_mute(uuid, timestamptz) from public;
revoke all on function public.set_conversation_mute(uuid, timestamptz) from anon;
grant execute on function public.set_conversation_mute(uuid, timestamptz) to authenticated;

comment on function public.set_notification_preferences(boolean, boolean) is 'Updates only auth.uid() browser-notification and sound preferences.';
comment on function public.set_conversation_mute(uuid, timestamptz) is 'Updates only auth.uid() mute state for an existing conversation membership.';

notify pgrst, 'reload schema';

commit;
