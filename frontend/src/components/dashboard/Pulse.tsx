import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { AcceptedConversationItem } from "../../types/conversations";
import ProfileAvatar from "./ProfileAvatar";
import { getConversationDisplayName } from "./profileUtils";

type PulseProps = {
  conversations: AcceptedConversationItem[];
  expanded: boolean;
  onHide: () => void;
  onConversationSelect: (conversation: AcceptedConversationItem) => void;
};

function Pulse({ conversations, expanded, onHide, onConversationSelect }: PulseProps) {
  const shouldReduceMotion = useReducedMotion();
  const activeCount = conversations.length;

  return (
    <>
      <aside className={`hidden h-full shrink-0 items-start overflow-visible transition-[width,padding] duration-200 ease-out motion-reduce:transition-none xl:flex ${expanded ? "w-28 py-3 pl-1 pr-3" : "w-0 p-0"}`} aria-label="Pulse">
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0, x: 5, scale: 0.985 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 5, scale: 0.985 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="flex h-full w-24 min-w-0 shrink-0 flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-soft"
            >
              <header className="flex shrink-0 items-center justify-between gap-1 px-3 pb-1.5 pt-2.5">
                <h2 className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Pulse</h2>
                <button data-pulse-collapse-control="true" type="button" onClick={onHide} aria-label="Hide Pulse" title="Hide Pulse" className="flex h-8 w-8 items-center justify-center rounded-xl text-muted transition-colors hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-hover"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-4 w-4" aria-hidden="true"><path d="m15 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
              </header>

              <div className="pulse-list min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2.5">
                {activeCount === 0 ? (
                  <div className="px-1 pb-3 pt-2 text-center"><span className="mx-auto block h-2 w-2 rounded-full bg-border" aria-hidden="true" /><p className="mt-2 text-[11px] leading-4 text-muted">No one active right now</p></div>
                ) : (
                  <div className="space-y-1.5">{conversations.map((conversation) => {
                    const profile = conversation.otherProfile;
                    const name = getConversationDisplayName(profile, conversation.otherNickname);
                    return (
                      <button key={profile.id} type="button" onClick={() => onConversationSelect(conversation)} aria-label={`Open conversation with ${name}, active now`} title={`${name} · Active now`} className="group flex w-full min-w-0 flex-col items-center rounded-2xl px-1 py-2 text-center transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-hover">
                        <span className="relative"><ProfileAvatar profile={profile} size="md" accessibleLabel={`${name}'s profile photo`} /><span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-[3px] border-surface bg-online" aria-hidden="true" /></span>
                        <span className="mt-1.5 block w-full truncate text-[11px] font-semibold text-heading">{name}</span>
                        <span className="sr-only">Active now</span>
                      </button>
                    );
                  })}</div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </aside>
    </>
  );
}

export default Pulse;
