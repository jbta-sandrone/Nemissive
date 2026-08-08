import { useRef, useState } from "react";
import AnchoredPopover from "./AnchoredPopover";

type ConversationMuteMenuProps = {
  conversationName: string;
  mutedUntil: string | null;
  onChange: (mutedUntil: string | null) => Promise<string | null>;
};

const indefiniteMuteTimestamp = "9999-12-31T23:59:59.999Z";

function isConversationMuted(mutedUntil: string | null) {
  if (!mutedUntil || mutedUntil === "-infinity") return false;
  if (mutedUntil === "infinity") return true;
  const timestamp = Date.parse(mutedUntil);
  return !Number.isNaN(timestamp) && timestamp > Date.now();
}

function getMuteSummary(mutedUntil: string | null) {
  if (!isConversationMuted(mutedUntil)) return "Notifications are on";
  if (mutedUntil === "infinity" || mutedUntil?.startsWith("9999-")) return "Muted until you turn it back on";
  const timestamp = mutedUntil ? Date.parse(mutedUntil) : Number.NaN;
  if (Number.isNaN(timestamp)) return "Muted";
  return `Muted until ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(timestamp))}`;
}

function ConversationMuteMenu({ conversationName, mutedUntil, onChange }: ConversationMuteMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const isMuted = isConversationMuted(mutedUntil);

  async function updateMute(nextMutedUntil: string | null) {
    if (isSaving) return;
    setIsSaving(true);
    setError("");
    const nextError = await onChange(nextMutedUntil);
    setIsSaving(false);
    if (nextError) {
      setError(nextError);
      return;
    }
    setIsOpen(false);
  }

  function muteFor(milliseconds: number) {
    void updateMute(new Date(Date.now() + milliseconds).toISOString());
  }

  return (
    <>
      <button ref={triggerRef} type="button" aria-label={`${isMuted ? "Change mute settings for" : "Mute notifications from"} ${conversationName}`} title={isMuted ? "Conversation muted" : "Mute notifications"} aria-expanded={isOpen} onClick={() => setIsOpen((open) => !open)} className={`chat-header-control flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover ${isMuted || isOpen ? "chat-header-control-active border-primary/25 bg-accent text-primary" : "border-border bg-background text-muted hover:bg-accent hover:text-heading"}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="M6.5 9a5.5 5.5 0 0 1 11 0c0 5 2 5.5 2 7H4.5c0-1.5 2-2 2-7Z" strokeLinejoin="round" /><path d="M9.5 19a3 3 0 0 0 5 0" strokeLinecap="round" />{isMuted && <path d="m5 5 14 14" strokeLinecap="round" />}</svg></button>
      {isOpen && <AnchoredPopover anchorRef={triggerRef} ariaLabel={`Notification settings for ${conversationName}`} placement="bottom" onClose={() => setIsOpen(false)} panelClassName="w-[min(20rem,calc(100vw-1rem))] rounded-3xl border border-border bg-surface p-3 shadow-soft"><div className="px-2 pb-2"><h2 className="font-bold text-heading">Conversation notifications</h2><p className="mt-1 text-xs leading-5 text-body">{getMuteSummary(mutedUntil)}. Unread counts are not affected.</p></div><div className="space-y-1">{isMuted && <button type="button" data-autofocus onClick={() => void updateMute(null)} disabled={isSaving} className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-semibold text-primary transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50">Unmute</button>}{!isMuted && <><button type="button" data-autofocus onClick={() => muteFor(60 * 60 * 1000)} disabled={isSaving} className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-semibold text-heading transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50">Mute for 1 hour</button><button type="button" onClick={() => muteFor(8 * 60 * 60 * 1000)} disabled={isSaving} className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-semibold text-heading transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50">Mute for 8 hours</button><button type="button" onClick={() => muteFor(24 * 60 * 60 * 1000)} disabled={isSaving} className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-semibold text-heading transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50">Mute for 1 day</button><button type="button" onClick={() => void updateMute(indefiniteMuteTimestamp)} disabled={isSaving} className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-semibold text-heading transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50">Mute until I turn it back on</button></>}</div>{isSaving && <p role="status" aria-live="polite" className="px-2 pt-2 text-xs text-muted">Saving…</p>}{error && <p role="alert" className="mt-2 rounded-xl bg-accent px-3 py-2 text-xs leading-5 text-body">{error}</p>}</AnchoredPopover>}
    </>
  );
}

export default ConversationMuteMenu;
