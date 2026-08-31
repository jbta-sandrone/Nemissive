import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { AccountStatus } from "../../types/account";
import type { ConversationActivityEvent, ProfileSearchResult } from "../../types/conversations";
import AnchoredPopover from "./AnchoredPopover";
import ConversationActivityRow from "./ConversationActivityRow";

type Props = {
  error: string;
  events: ConversationActivityEvent[];
  isLoading: boolean;
  unseenCount: number;
  currentUserId: string | null;
  profilesById: ReadonlyMap<string, ProfileSearchResult>;
  statusesById: ReadonlyMap<string, AccountStatus | null>;
  onOpenChange: (open: boolean) => void;
  onRetry: () => void;
  onSelect: (event: ConversationActivityEvent, trigger: HTMLButtonElement) => void;
};

function ActivityIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.34-5.66L4 8.68" strokeLinecap="round" /><path d="M4 4v4.68h4.68M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" /></svg>; }

type ContentProps = Omit<Props, "unseenCount" | "onOpenChange">;

function ActivityContent({ error, events, isLoading, currentUserId, profilesById, statusesById, onRetry, onSelect }: ContentProps) {
  const newestFirst = [...events].reverse();
  return <div className="min-h-0">{isLoading && events.length === 0 ? <div role="status" aria-live="polite" className="space-y-2"><span className="sr-only">Loading conversation activity.</span><div className="h-16 animate-pulse rounded-2xl bg-accent motion-reduce:animate-none" /><div className="h-16 animate-pulse rounded-2xl bg-accent motion-reduce:animate-none" /></div> : events.length === 0 && !error ? <div className="rounded-2xl bg-accent px-4 py-6 text-center"><p className="text-sm font-semibold text-heading">No conversation activity yet</p><p className="mt-1 text-xs leading-5 text-body">Theme, nickname, pin, and shared-reminder activity will appear here.</p></div> : <div className="max-h-[min(28rem,62dvh)] space-y-1 overflow-y-auto overscroll-contain pr-1">{newestFirst.map((event) => <ConversationActivityRow key={event.id} event={event} currentUserId={currentUserId} actorProfile={profilesById.get(event.actorId)} actorAccountStatus={statusesById.get(event.actorId) ?? null} onActivate={onSelect} />)}</div>}{isLoading && events.length > 0 && <p role="status" aria-live="polite" className="mt-2 text-center text-xs text-muted">Refreshing activity…</p>}{error && <div role="alert" className="mt-2 rounded-2xl bg-accent px-3 py-3 text-xs leading-5 text-body"><p>{error}</p><button type="button" onClick={onRetry} className="mt-2 min-h-9 rounded-xl px-3 py-1.5 font-semibold text-primary transition hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">Retry</button></div>}</div>;
}

function MobileActivity({ triggerRef, onClose, ...props }: ContentProps & { triggerRef: RefObject<HTMLButtonElement | null>; onClose: () => void }) {
  const reduceMotion = useReducedMotion(); const panelRef = useRef<HTMLDivElement>(null); const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow; const returnFocus = triggerRef.current; document.body.style.overflow = "hidden";
    function keydown(event: KeyboardEvent) { if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; } if (event.key !== "Tab" || !panelRef.current) return; const controls = [...panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), [tabindex]:not([tabindex='-1'])")]; const first = controls[0]; const last = controls.at(-1); if (!first || !last) return; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
    const frame = window.requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("button:not([disabled])")?.focus()); document.addEventListener("keydown", keydown);
    return () => { window.cancelAnimationFrame(frame); document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", keydown); window.requestAnimationFrame(() => returnFocus?.focus()); };
  }, [triggerRef]);
  return createPortal(<motion.div initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[85] flex items-end bg-heading/20 md:hidden" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><motion.div ref={panelRef} initial={reduceMotion ? false : { y: "100%" }} animate={{ y: 0 }} exit={reduceMotion ? { opacity: 0 } : { y: "100%" }} role="dialog" aria-modal="true" aria-labelledby="conversation-activity-mobile-title" className="max-h-[84dvh] w-full overflow-hidden rounded-t-3xl border-t border-border bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-soft"><div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" /><div className="flex items-center justify-between gap-3"><h2 id="conversation-activity-mobile-title" className="text-lg font-semibold text-heading">Conversation activity</h2><button type="button" onClick={onClose} aria-label="Close conversation activity" className="flex h-10 w-10 items-center justify-center rounded-xl text-muted hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">×</button></div><div className="mt-4 min-h-0 overflow-hidden"><ActivityContent {...props} onSelect={(event, trigger) => { onClose(); props.onSelect(event, trigger); }} /></div><button type="button" onClick={onClose} className="mt-4 min-h-11 w-full rounded-2xl bg-accent px-4 py-2.5 text-sm font-semibold text-heading hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">Close</button></motion.div></motion.div>, document.body);
}

function ConversationActivityMenu(props: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null); const [open, setOpen] = useState(false); const [desktop, setDesktop] = useState(() => window.matchMedia("(min-width: 768px)").matches);
  useEffect(() => { const query = window.matchMedia("(min-width: 768px)"); const update = () => setDesktop(query.matches); update(); query.addEventListener("change", update); return () => query.removeEventListener("change", update); }, []);
  function setActivityOpen(nextOpen: boolean) { setOpen(nextOpen); props.onOpenChange(nextOpen); }
  const boundedCount = props.unseenCount > 9 ? "9+" : String(props.unseenCount);
  const contentProps: ContentProps = { error: props.error, events: props.events, isLoading: props.isLoading, currentUserId: props.currentUserId, profilesById: props.profilesById, statusesById: props.statusesById, onRetry: props.onRetry, onSelect: props.onSelect };
  return <><button ref={triggerRef} type="button" onClick={() => setActivityOpen(!open)} aria-label={`Conversation activity${props.unseenCount > 0 ? `, ${props.unseenCount} unseen` : ""}`} title="Conversation activity" aria-haspopup="dialog" aria-expanded={open} className={`chat-header-control relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover ${open || props.unseenCount > 0 ? "chat-header-control-active border-primary/25 bg-accent text-primary" : "border-border bg-background text-muted hover:bg-accent hover:text-heading"}`}><ActivityIcon />{props.unseenCount > 0 && <span aria-hidden="true" className="absolute -right-1.5 -top-1.5 flex min-h-5 min-w-5 items-center justify-center rounded-full border-2 border-surface bg-primary px-1 text-[0.6rem] font-black leading-none text-white">{boundedCount}</span>}</button><AnimatePresence initial={false}>{open && (desktop ? <AnchoredPopover key="desktop-conversation-activity" anchorRef={triggerRef} ariaLabel="Conversation activity" placement="bottom" onClose={() => setActivityOpen(false)} panelClassName="w-96 max-w-[calc(100vw-1rem)] rounded-3xl border border-border bg-surface p-4 shadow-soft"><h2 className="mb-4 text-base font-semibold text-heading">Conversation activity</h2><ActivityContent {...contentProps} onSelect={(event, trigger) => { setActivityOpen(false); props.onSelect(event, trigger); }} /></AnchoredPopover> : <MobileActivity key="mobile-conversation-activity" triggerRef={triggerRef} onClose={() => setActivityOpen(false)} {...contentProps} />)}</AnimatePresence></>;
}

export default ConversationActivityMenu;
