import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ProfileSearchResult } from "../../types/conversations";
import AnchoredPopover from "./AnchoredPopover";
import ConversationDeleteDialog from "./ConversationDeleteDialog";
import ConversationNicknameDialog from "./ConversationNicknameDialog";
import ConversationThemeDialog from "./ConversationThemeDialog";
import type { ConversationThemeId } from "./conversationThemes";

type ConversationOptionsMenuProps = {
  conversationName: string;
  isArchived: boolean;
  nicknamesByUserId: ReadonlyMap<string, string>;
  participants: ProfileSearchResult[];
  currentTheme: ConversationThemeId;
  onArchivedChange: (archived: boolean) => Promise<string | null>;
  onDelete: () => Promise<string | null>;
  onNicknameSave: (userId: string, nickname: string | null) => Promise<string | null>;
  onThemeApply: (theme: ConversationThemeId) => Promise<string | null>;
};

type MenuContentProps = {
  isArchived: boolean;
  isSaving: boolean;
  error: string;
  onArchive: () => void;
  onDelete: () => void;
  onEditNicknames: () => void;
  onChangeTheme: () => void;
};

function Icon({ children }: { children: ReactNode }) {
  return <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">{children}</span>;
}

const iconClassName = "h-4 w-4";

function FutureItem({ label, icon }: { label: string; icon: ReactNode }) {
  return <button type="button" role="menuitem" disabled aria-disabled="true" aria-label={`${label}, coming soon`} className="flex min-h-11 w-full cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-muted opacity-70"><Icon>{icon}</Icon><span className="min-w-0 flex-1 font-semibold">{label}</span><span aria-hidden="true" className="shrink-0 rounded-lg bg-background px-2 py-1 text-[0.62rem] font-bold uppercase tracking-wide text-muted">Coming soon</span></button>;
}

function MenuContent({ isArchived, isSaving, error, onArchive, onDelete, onEditNicknames, onChangeTheme }: MenuContentProps) {
  return <><div role="menu" className="space-y-1"><FutureItem label="View profile" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName} aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" strokeLinecap="round" /></svg>} /><button data-autofocus type="button" role="menuitem" onClick={onEditNicknames} disabled={isSaving} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold text-heading transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50"><Icon><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName} aria-hidden="true"><path d="M5 5h14v10H9l-4 4V5Z" strokeLinejoin="round" /><path d="M9 9h6" strokeLinecap="round" /></svg></Icon>Edit nicknames</button><button type="button" role="menuitem" onClick={onChangeTheme} disabled={isSaving} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold text-heading transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50"><Icon><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName} aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h4a5 5 0 0 0 0-10h-4Z" strokeLinejoin="round" /><circle cx="7.5" cy="10" r=".7" fill="currentColor" /><circle cx="9" cy="6.5" r=".7" fill="currentColor" /></svg></Icon>Change theme</button><FutureItem label="Media, files & links" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName} aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2" /><path d="m7 16 4-4 3 3 2-2 2 3" strokeLinejoin="round" /><circle cx="15.5" cy="9" r="1" /></svg>} /><div role="separator" className="my-2 border-t border-border" /><button type="button" role="menuitem" onClick={onArchive} disabled={isSaving} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold text-heading transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-wait disabled:opacity-50"><Icon><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName} aria-hidden="true"><path d="M5 8.5h14v10H5v-10Z" strokeLinejoin="round" /><path d="M4 5h16v3.5H4V5Zm5 7h6" strokeLinecap="round" /></svg></Icon>{isArchived ? "Unarchive conversation" : "Archive conversation"}</button><button type="button" role="menuitem" onClick={onDelete} disabled={isSaving} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold text-primary transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50"><Icon><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName} aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5" strokeLinecap="round" /></svg></Icon>Delete chat</button><div role="separator" className="my-2 border-t border-border" /><FutureItem label="Block" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName} aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="m6.5 6.5 11 11" strokeLinecap="round" /></svg>} /><FutureItem label="Report" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName} aria-hidden="true"><path d="M6 21V4m0 1h11l-2 4 2 4H6" strokeLinecap="round" strokeLinejoin="round" /></svg>} /></div>{isSaving && <p role="status" aria-live="polite" className="px-3 pt-2 text-xs text-muted">Saving…</p>}{error && <p role="alert" className="mt-2 rounded-xl bg-accent px-3 py-2 text-xs leading-5 text-body">{error}</p>}</>;
}

function MobileOptions({ triggerRef, children, onClose }: { triggerRef: RefObject<HTMLButtonElement | null>; children: ReactNode; onClose: () => void }) {
  const shouldReduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const returnFocusElement = triggerRef.current;
    document.body.style.overflow = "hidden";
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), [tabindex]:not([tabindex='-1'])")];
      const first = focusable[0]; const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", handleKeyDown);
    const frame = window.requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("[data-autofocus], button:not([disabled])")?.focus());
    return () => { window.cancelAnimationFrame(frame); document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", handleKeyDown); window.requestAnimationFrame(() => returnFocusElement?.focus()); };
  }, [triggerRef]);
  return createPortal(<motion.div initial={shouldReduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: shouldReduceMotion ? 0 : 0.18 }} className="fixed inset-0 z-[85] flex items-end bg-heading/20 md:hidden" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><motion.div ref={panelRef} initial={shouldReduceMotion ? false : { y: "100%", opacity: 0.98 }} animate={{ y: 0, opacity: 1 }} exit={shouldReduceMotion ? { opacity: 1 } : { y: "100%", opacity: 0.98 }} transition={{ duration: shouldReduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }} role="dialog" aria-modal="true" aria-labelledby="conversation-options-mobile-title" className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border-t border-border bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-soft"><div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" /><div className="mb-3 flex items-center justify-between gap-3"><h2 id="conversation-options-mobile-title" className="text-lg font-semibold text-heading">Conversation options</h2><button type="button" onClick={onClose} aria-label="Close conversation options" className="flex h-10 w-10 items-center justify-center rounded-2xl text-muted hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" strokeLinecap="round" /></svg></button></div>{children}</motion.div></motion.div>, document.body);
}

function ConversationOptionsMenu({ conversationName, isArchived, nicknamesByUserId, participants, currentTheme, onArchivedChange, onDelete, onNicknameSave, onThemeApply }: ConversationOptionsMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia("(min-width: 768px)").matches);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [isNicknameDialogOpen, setIsNicknameDialogOpen] = useState(false);
  const [isThemeDialogOpen, setIsThemeDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  useEffect(() => { const query = window.matchMedia("(min-width: 768px)"); const update = () => setIsDesktop(query.matches); update(); query.addEventListener("change", update); return () => query.removeEventListener("change", update); }, []);
  async function archive() { if (isSaving) return; setIsSaving(true); setError(""); const nextError = await onArchivedChange(!isArchived); setIsSaving(false); if (nextError) { setError(nextError); return; } setIsOpen(false); }
  async function confirmDelete() { if (isDeleting) return; setIsDeleting(true); setDeleteError(""); const nextError = await onDelete(); setIsDeleting(false); if (nextError) { setDeleteError(nextError); return; } setIsDeleteDialogOpen(false); }
  const content = <MenuContent isArchived={isArchived} isSaving={isSaving} error={error} onArchive={() => void archive()} onEditNicknames={() => { setIsOpen(false); setIsNicknameDialogOpen(true); }} onChangeTheme={() => { setIsOpen(false); setIsThemeDialogOpen(true); }} onDelete={() => { setIsOpen(false); setDeleteError(""); setIsDeleteDialogOpen(true); }} />;
  return <><button ref={triggerRef} type="button" aria-label="Conversation options" title="Conversation options" aria-haspopup="dialog" aria-expanded={isOpen} onClick={() => { setError(""); setIsOpen((open) => !open); }} className={`chat-header-control flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover ${isOpen ? "chat-header-control-active border-primary/25 bg-accent text-primary" : "border-border bg-background text-muted hover:bg-accent hover:text-heading"}`}><svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg></button><AnimatePresence initial={false}>{isOpen && (isDesktop ? <AnchoredPopover key="conversation-options-desktop" anchorRef={triggerRef} ariaLabel="Conversation options" placement="bottom" onClose={() => setIsOpen(false)} panelClassName="max-h-[min(42rem,calc(100dvh-1rem))] w-[min(22rem,calc(100vw-1rem))] overflow-y-auto rounded-3xl border border-border bg-surface p-3 shadow-soft"><h2 className="px-3 pb-2 text-base font-semibold text-heading">Conversation options</h2>{content}</AnchoredPopover> : <MobileOptions key="conversation-options-mobile" triggerRef={triggerRef} onClose={() => setIsOpen(false)}>{content}</MobileOptions>)}</AnimatePresence><AnimatePresence>{isNicknameDialogOpen && <ConversationNicknameDialog nicknamesByUserId={nicknamesByUserId} participants={participants} returnFocusRef={triggerRef} onClose={() => setIsNicknameDialogOpen(false)} onSave={onNicknameSave} />}{isThemeDialogOpen && <ConversationThemeDialog currentTheme={currentTheme} returnFocusRef={triggerRef} onClose={() => setIsThemeDialogOpen(false)} onApply={onThemeApply} />}{isDeleteDialogOpen && <ConversationDeleteDialog conversationName={conversationName} error={deleteError} isDeleting={isDeleting} returnFocusRef={triggerRef} onCancel={() => { if (!isDeleting) setIsDeleteDialogOpen(false); }} onConfirm={() => void confirmDelete()} />}</AnimatePresence></>;
}

export default ConversationOptionsMenu;
