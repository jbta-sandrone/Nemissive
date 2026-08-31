import type { AccountStatus } from "../../types/account";
import type { ConversationActivityEvent, ProfileSearchResult } from "../../types/conversations";
import { getConversationTheme } from "./conversationThemes";
import { formatReminderTime } from "./reminderTime";
import UserIdentityAvatar from "./UserIdentityAvatar";

function PinIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="m9 4 6 1-1 5 3 3-4 1-2 6-2-6-4-1 3-3 1-6Z" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function NicknameIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="M5 5h14v10H9l-4 4V5Z" strokeLinejoin="round" /><path d="M9 9h6" strokeLinecap="round" /></svg>; }
function ThemeIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.7 1.5-1.7-.4-1.1.3-2.1 1.5-2.1h1.4a4.1 4.1 0 0 0 4.1-4.1A9.1 9.1 0 0 0 12 3.5Z" strokeLinejoin="round" /><path d="M7.7 9h.01m3-2h.01m3.3.8h.01m-7.1 4.5h.01" strokeLinecap="round" /></svg>; }
function ReminderIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 8H3c0-1 3-1 3-8m6-2v5l3 2m-6 6h6" strokeLinecap="round" strokeLinejoin="round" /></svg>; }

function getNicknameEventText(event: ConversationActivityEvent, currentUserId: string | null) {
  const actorIsCurrentUser = event.actorId === currentUserId;
  const targetIsCurrentUser = event.targetUserId === currentUserId;
  const actorIsTarget = event.actorId === event.targetUserId;
  const targetName = event.targetUserName ?? "a participant";
  if (event.eventType === "nickname_removed") {
    if (actorIsCurrentUser && targetIsCurrentUser) return "You removed your nickname";
    if (actorIsCurrentUser) return `You removed ${targetName}’s nickname`;
    if (targetIsCurrentUser) return `${event.actorName} removed your nickname`;
    if (actorIsTarget) return `${event.actorName} removed their nickname`;
    return `${event.actorName} removed ${targetName}’s nickname`;
  }
  const nickname = event.nicknameValue ?? "a nickname";
  if (actorIsCurrentUser && targetIsCurrentUser) return `You set your nickname to ${nickname}`;
  if (actorIsCurrentUser) return `You set ${targetName}’s nickname to ${nickname}`;
  if (targetIsCurrentUser) return `${event.actorName} set your nickname to ${nickname}`;
  if (actorIsTarget) return `${event.actorName} set their nickname to ${nickname}`;
  return `${event.actorName} set ${targetName}’s nickname to ${nickname}`;
}

function formatActivityTimestamp(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(timestamp));
}

type Props = {
  event: ConversationActivityEvent;
  currentUserId: string | null;
  actorProfile?: ProfileSearchResult | null;
  actorAccountStatus?: AccountStatus | null;
  onActivate: (event: ConversationActivityEvent, trigger: HTMLButtonElement) => void;
};

function ConversationActivityRow({ event, currentUserId, actorProfile, actorAccountStatus = null, onActivate }: Props) {
  const isPinnedMessageEvent = event.eventType === "message_pinned";
  const isThemeEvent = event.eventType === "theme_changed";
  const isReminderEvent = event.eventType === "reminder_created";
  const text = isPinnedMessageEvent ? `${event.actorName} pinned a message` : isThemeEvent ? `${event.actorName} changed the theme to ${getConversationTheme(event.themeKey).name}` : isReminderEvent ? `${event.actorName} created a shared reminder` : getNicknameEventText(event, currentUserId);
  const isInteractive = isPinnedMessageEvent || (isReminderEvent && Boolean(event.targetReminderId));
  const icon = isPinnedMessageEvent ? <PinIcon /> : isThemeEvent ? <ThemeIcon /> : isReminderEvent ? <ReminderIcon /> : <NicknameIcon />;
  const fullTimestamp = Number.isNaN(Date.parse(event.createdAt)) ? "" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.createdAt));
  const content = <><span className="relative mt-0.5 shrink-0">{actorProfile ? <><UserIdentityAvatar profile={actorProfile} accountStatus={actorAccountStatus} size="xs" /><span className="pointer-events-none absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-surface text-primary" aria-hidden="true">{icon}</span></> : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-primary">{icon}</span>}</span><span className="min-w-0 flex-1"><span className="block text-sm font-medium leading-5 text-heading">{text}</span>{isReminderEvent && <><span className="mt-0.5 block truncate text-xs font-semibold text-body">{event.reminderTitle ?? "Shared reminder"}</span>{event.reminderDueAt && <time dateTime={event.reminderDueAt} className="mt-0.5 block text-[0.68rem] text-muted">Due {formatReminderTime(event.reminderDueAt)}</time>}</>}<time dateTime={event.createdAt} title={fullTimestamp} className="mt-1 block text-[0.68rem] text-muted">{formatActivityTimestamp(event.createdAt)}</time></span></>;
  return isInteractive ? <button type="button" onClick={(clickEvent) => onActivate(event, clickEvent.currentTarget)} aria-label={isReminderEvent ? `${text}. ${event.reminderTitle ?? "Shared reminder"}. Open reminder details.` : `${text}. Jump to pinned message.`} className="flex min-h-16 w-full min-w-0 items-start gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">{content}</button> : <div className="flex min-h-16 min-w-0 items-start gap-3 rounded-2xl px-3 py-2.5">{content}</div>;
}

export default ConversationActivityRow;
