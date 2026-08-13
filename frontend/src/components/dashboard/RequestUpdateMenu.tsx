import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import AnchoredPopover from "./AnchoredPopover";

type RequestUpdateMenuProps = {
  participantName: string;
  onDelete: () => Promise<string | null>;
};

function DeleteIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function MobileRequestUpdateMenu({ triggerRef, isDeleting, error, onClose, onDelete }: { triggerRef: RefObject<HTMLButtonElement | null>; isDeleting: boolean; error: string; onClose: () => void; onDelete: () => void }) {
  const shouldReduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const returnFocus = triggerRef.current;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus());

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const controls = [...panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled])")];
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() => returnFocus?.focus());
    };
  }, [triggerRef]);

  return createPortal(
    <motion.div initial={shouldReduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[85] flex items-end bg-heading/20 md:hidden" onPointerDown={(event) => { if (event.target === event.currentTarget && !isDeleting) onClose(); }}>
      <motion.div ref={panelRef} initial={shouldReduceMotion ? false : { y: "100%" }} animate={{ y: 0 }} exit={shouldReduceMotion ? { opacity: 0 } : { y: "100%" }} role="dialog" aria-modal="true" aria-labelledby="request-update-options-title" className="w-full rounded-t-3xl border-t border-border bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-soft">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
        <div className="mb-3 flex items-center justify-between gap-3"><h2 id="request-update-options-title" className="text-lg font-semibold text-heading">Request update options</h2><button type="button" onClick={onClose} disabled={isDeleting} aria-label="Close request update options" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:opacity-50"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" /></svg></button></div>
        <button type="button" data-autofocus onClick={onDelete} disabled={isDeleting} className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold text-primary transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-wait disabled:opacity-60"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-primary"><DeleteIcon /></span><span>{isDeleting ? "Deleting updateâ€¦" : "Delete update"}</span></button>
        {error && <p role="alert" className="mt-2 rounded-xl bg-accent px-3 py-2 text-xs leading-5 text-body">{error}</p>}
      </motion.div>
    </motion.div>,
    document.body,
  );
}

function RequestUpdateMenu({ participantName, onDelete }: RequestUpdateMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia("(min-width: 768px)").matches);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  async function deleteUpdate() {
    if (isDeleting) return;
    setIsDeleting(true);
    setError("");
    const nextError = await onDelete();
    if (nextError) {
      setIsDeleting(false);
      setError(nextError);
    }
  }

  const deleteButton = <button type="button" role="menuitem" data-autofocus onClick={() => void deleteUpdate()} disabled={isDeleting} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold text-primary transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-wait disabled:opacity-60"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent text-primary"><DeleteIcon /></span><span>{isDeleting ? "Deleting updateâ€¦" : "Delete update"}</span></button>;

  return (
    <>
      <button ref={triggerRef} type="button" aria-label={`Options for request update from ${participantName}`} title="Request update options" aria-haspopup="dialog" aria-expanded={isOpen} onClick={() => { setError(""); setIsOpen((open) => !open); }} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover"><svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg></button>
      <AnimatePresence>{isOpen && (isDesktop ? <AnchoredPopover anchorRef={triggerRef} ariaLabel={`Options for request update from ${participantName}`} placement="bottom" onClose={() => { if (!isDeleting) setIsOpen(false); }} panelClassName="w-[min(14rem,calc(100vw-1rem))] rounded-2xl border border-border bg-surface p-2 shadow-soft"><div role="menu">{deleteButton}</div>{error && <p role="alert" className="mt-1 rounded-xl bg-accent px-3 py-2 text-xs leading-5 text-body">{error}</p>}</AnchoredPopover> : <MobileRequestUpdateMenu triggerRef={triggerRef} isDeleting={isDeleting} error={error} onClose={() => { if (!isDeleting) setIsOpen(false); }} onDelete={() => void deleteUpdate()} />)}</AnimatePresence>
    </>
  );
}

export default RequestUpdateMenu;
