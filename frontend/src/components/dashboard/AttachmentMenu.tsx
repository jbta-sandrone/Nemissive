import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import AnchoredPopover from "./AnchoredPopover";

function AttachmentIcon({ children }: { children: ReactNode }) {
  return <span className="chat-accent-control flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">{children}</span>;
}

const iconClassName = "h-5 w-5";

function Options({ onPhotos, onFiles }: { onPhotos: () => void; onFiles: () => void }) {
  const options = [
    { label: "Photos", onClick: onPhotos, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName} aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="m5.5 17 4.5-4 3.5 3 2.5-2 2.5 2.5" strokeLinejoin="round" /></svg> },
    { label: "Files", onClick: onFiles, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName} aria-hidden="true"><path d="M6 3h8l4 4v14H6V3Z" strokeLinejoin="round" /><path d="M14 3v5h5M9 13h6m-6 3h5" strokeLinecap="round" /></svg> },
  ];
  return <div role="menu" className="space-y-1">{options.map((option, index) => <button key={option.label} data-autofocus={index === 0 || undefined} type="button" role="menuitem" onClick={option.onClick} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold text-heading transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"><AttachmentIcon>{option.icon}</AttachmentIcon>{option.label}</button>)}</div>;
}

function MobileSheet({ triggerRef, onClose, children }: { triggerRef: RefObject<HTMLButtonElement | null>; onClose: () => void; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const returnFocus = triggerRef.current;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus());
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !panelRef.current) return;
      const controls = [...panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]),input:not([disabled])")];
      const first = controls[0]; const last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keydown);
    return () => { cancelAnimationFrame(frame); document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", keydown); requestAnimationFrame(() => returnFocus?.focus()); };
  }, [onClose, triggerRef]);
  return createPortal(<motion.div initial={shouldReduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] flex items-end bg-heading/20 md:hidden" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><motion.div ref={panelRef} initial={shouldReduceMotion ? false : { y: "100%" }} animate={{ y: 0 }} exit={shouldReduceMotion ? { opacity: 0 } : { y: "100%" }} role="dialog" aria-modal="true" aria-labelledby="add-attachment-title" className="w-full rounded-t-3xl border-t border-border bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-soft"><div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" /><div className="mb-3 flex items-center justify-between"><h2 id="add-attachment-title" className="text-lg font-semibold text-heading">Add attachment</h2><button type="button" onClick={onClose} aria-label="Close attachment menu" className="h-10 w-10 rounded-xl text-muted hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">×</button></div>{children}</motion.div></motion.div>, document.body);
}

function AttachmentMenu({ disabled, onPhotos, onFiles }: { disabled: boolean; onPhotos: () => void; onFiles: () => void }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [desktop, setDesktop] = useState(() => window.matchMedia("(min-width: 768px)").matches);
  useEffect(() => { const query = matchMedia("(min-width: 768px)"); const update = () => setDesktop(query.matches); query.addEventListener("change", update); return () => query.removeEventListener("change", update); }, []);
  const select = (action: () => void) => { setOpen(false); action(); };
  const options = <Options onPhotos={() => select(onPhotos)} onFiles={() => select(onFiles)} />;
  return <><button ref={triggerRef} type="button" disabled={disabled} onClick={() => setOpen((value) => !value)} aria-label="Add attachment" title="Add attachment" aria-haspopup="dialog" aria-expanded={open} className={`chat-accent-control inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50 sm:h-11 sm:w-11 ${open ? "chat-header-control-active bg-accent text-primary" : ""}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-5 w-5" aria-hidden="true"><path d="m9 12.5 5.7-5.7a3 3 0 0 1 4.2 4.2l-7.8 7.8a5 5 0 0 1-7.1-7.1l7.3-7.3" strokeLinecap="round" strokeLinejoin="round" /></svg></button><AnimatePresence>{open && (desktop ? <AnchoredPopover anchorRef={triggerRef} ariaLabel="Add attachment" placement="top" onClose={() => setOpen(false)} panelClassName="w-56 rounded-2xl border border-border bg-surface p-2 shadow-soft"><h2 className="px-3 pb-2 pt-1 text-sm font-semibold text-heading">Add attachment</h2>{options}</AnchoredPopover> : <MobileSheet triggerRef={triggerRef} onClose={() => setOpen(false)}>{options}</MobileSheet>)}</AnimatePresence></>;
}

export default AttachmentMenu;
