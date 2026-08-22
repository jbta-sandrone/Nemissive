import type { ConversationActivityEvent } from "../../types/conversations";
import { getConversationTheme } from "./conversationThemes";
import { formatReminderTime } from "./reminderTime";

function PinIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="m9 4 6 1-1 5 3 3-4 1-2 6-2-6-4-1 3-3 1-6Z" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function NicknameIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="M5 5h14v10H9l-4 4V5Z" strokeLinejoin="round" /><path d="M9 9h6" strokeLinecap="round" /></svg>;
}

function ThemeIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.7 1.5-1.7-.4-1.1.3-2.1 1.5-2.1h1.4a4.1 4.1 0 0 0 4.1-4.1A9.1 9.1 0 0 0 12 3.5Z" strokeLinejoin="round" /><path d="M7.7 9h.01m3-2h.01m3.3.8h.01m-7.1 4.5h.01" strokeLinecap="round" /></svg>;
}

function ReminderIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 8H3c0-1 3-1 3-8m6-2v5l3 2m-6 6h6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

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

function ConversationActivityRow({ event, currentUserId, onActivate }: { event: ConversationActivityEvent; currentUserId: string | null; onActivate: (event: ConversationActivityEvent, trigger: HTMLButtonElement) => void }) {
  const isPinnedMessageEvent = event.eventType === "message_pinned";
  const isThemeEvent = event.eventType === "theme_changed";
  const isReminderEvent = event.eventType === "reminder_created";
  const text = isPinnedMessageEvent ? `${event.actorName} pinned a message` : isThemeEvent ? `${event.actorName} changed the theme to ${getConversationTheme(event.themeKey).name}` : isReminderEvent ? `${event.actorName} set a reminder` : getNicknameEventText(event, currentUserId);
  const isInteractive = isPinnedMessageEvent || (isReminderEvent && Boolean(event.targetReminderId));
  const icon = isPinnedMessageEvent ? <PinIcon /> : isThemeEvent ? <ThemeIcon /> : isReminderEvent ? <ReminderIcon /> : <NicknameIcon />;
  const content = <><span className="chat-activity-icon shrink-0 text-primary">{icon}</span><span className={isReminderEvent ? "min-w-0 text-left" : "break-words"}><span className="block">{text}</span>{isReminderEvent && <><span className="mt-0.5 block truncate font-semibold text-heading">{event.reminderTitle ?? "Shared reminder"}</span>{event.reminderDueAt && <time dateTime={event.reminderDueAt} className="mt-0.5 block text-[11px] text-muted">{formatReminderTime(event.reminderDueAt)}</time>}</>}</span></>;

  return (
    <div className="chat-activity-row flex justify-center py-1">
      {isInteractive ? <button type="button" onClick={(clickEvent) => onActivate(event, clickEvent.currentTarget)} aria-label={isReminderEvent ? `${text}. ${event.reminderTitle ?? "Shared reminder"}. Open reminder details.` : `${text}. Jump to pinned message.`} className={`chat-accent-control inline-flex min-h-10 max-w-full items-center gap-2 rounded-2xl px-3 py-2 text-xs font-medium text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover active:scale-[0.985] motion-reduce:transition-none ${isReminderEvent ? "justify-start" : "justify-center text-center"}`}>{content}</button> : <div className="inline-flex min-h-10 max-w-full items-center justify-center gap-2 px-3 py-2 text-center text-xs font-medium text-muted">{content}</div>}
    </div>
  );
}

export default ConversationActivityRow;
