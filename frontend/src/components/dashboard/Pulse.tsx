import type { AcceptedConversationItem } from "../../types/conversations";
import ProfileAvatar from "./ProfileAvatar";
import { getConversationDisplayName } from "./profileUtils";

type PulseProps = {
  conversations: AcceptedConversationItem[];
  onConversationSelect: (conversation: AcceptedConversationItem) => void;
  variant?: "desktop" | "mobile";
};

function AskAiIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="m12 3 1.3 4.2L17.5 9l-4.2 1.8L12 15l-1.3-4.2L6.5 9l4.2-1.8L12 3ZM18.5 14l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3ZM5 13l.6 1.8 1.9.7-1.9.7L5 18l-.6-1.8-1.9-.7 1.9-.7L5 13Z" strokeLinejoin="round" /></svg>;
}

function Pulse({ conversations, onConversationSelect, variant = "desktop" }: PulseProps) {
  const headingId = variant === "mobile" ? "mobile-pulse-heading" : "pulse-heading";
  const layoutClass = variant === "mobile" ? "flex h-full" : "hidden flex-1 md:flex";

  return (
    <section className={`${layoutClass} min-h-0 flex-col bg-surface ${variant === "desktop" ? "border-t border-border" : ""}`} aria-labelledby={headingId}>
      <header className="shrink-0 px-2 pb-1.5 pt-3 text-center">
        <h2 id={headingId} className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Pulse</h2>
      </header>
      <div className="pulse-list min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-1.5 pb-3" role="region" aria-label="Pulse utilities and active connections" tabIndex={0}>
        <div role="group" aria-label="Ask AI, coming soon" className="flex min-w-0 flex-col items-center rounded-2xl px-1 py-2 text-center text-muted">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-background text-primary"><AskAiIcon /></span>
          <span className="mt-1.5 block w-full truncate text-[11px] font-semibold text-heading">Ask AI</span>
          <span className="block text-[9px] font-semibold uppercase tracking-[0.06em] text-muted">Coming soon</span>
        </div>
        <div className="my-1.5 border-t border-border" aria-hidden="true" />
        {conversations.length === 0 ? (
          <p className="px-1 py-2 text-center text-[10px] leading-4 text-muted">No one active</p>
        ) : (
          <div className="space-y-1">{conversations.map((conversation) => {
            const profile = conversation.otherProfile;
            const name = getConversationDisplayName(profile, conversation.otherNickname);
            return (
              <button key={profile.id} type="button" onClick={() => onConversationSelect(conversation)} aria-label={`Open conversation with ${name}, active now`} title={`${name} · Active now`} className="group flex w-full min-w-0 flex-col items-center rounded-2xl px-1 py-2 text-center transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-hover">
                <span className="relative"><ProfileAvatar profile={profile} size="md" accessibleLabel={`${name}'s profile photo`} /><span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-[2px] border-surface bg-online" aria-hidden="true" /></span>
                <span className="mt-1 block w-full truncate text-[10px] font-semibold text-heading">{name}</span>
                <span className="sr-only">Active now</span>
              </button>
            );
          })}</div>
        )}
      </div>
    </section>
  );
}

export default Pulse;
