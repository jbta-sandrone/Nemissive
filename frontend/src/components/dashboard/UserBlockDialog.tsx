import { useEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";

type Props = {
  blocked: boolean;
  displayName: string;
  error: string;
  isSaving: boolean;
  returnFocusRef: RefObject<HTMLElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
};

function UserBlockDialog({ blocked, displayName, error, isSaving, returnFocusRef, onCancel, onConfirm }: Props) {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCancelRef = useRef(onCancel);
  const savingRef = useRef(isSaving);
  useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);
  useEffect(() => { savingRef.current = isSaving; }, [isSaving]);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const returnFocus = returnFocusRef.current;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus());
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape" && !savingRef.current) { event.preventDefault(); onCancelRef.current(); return; }
      if (event.key !== "Tab" || !panelRef.current) return;
      const controls = [...panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled])")];
      const first = controls[0]; const last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keydown);
    return () => { cancelAnimationFrame(frame); document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", keydown); requestAnimationFrame(() => returnFocus?.focus()); };
  }, [returnFocusRef]);

  const action = blocked ? "Block" : "Unblock";
  return createPortal(
    <motion.div initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-heading/20 p-4" onPointerDown={(event) => { if (event.target === event.currentTarget && !isSaving) onCancel(); }}>
      <motion.div ref={panelRef} initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} role="alertdialog" aria-modal="true" aria-labelledby="user-block-title" aria-describedby="user-block-description" aria-busy={isSaving} className="w-full max-w-md rounded-3xl border border-border bg-surface p-5 shadow-soft sm:p-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-primary" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><circle cx="12" cy="12" r="8" /><path d="m6.5 6.5 11 11" /></svg></div>
        <h2 id="user-block-title" className="mt-4 text-xl font-semibold text-heading">{action} {displayName}?</h2>
        <p id="user-block-description" className="mt-2 text-sm leading-6 text-body">{blocked ? `${displayName} won’t be able to message or interact with you, and you won’t be able to message them while they’re blocked. They won’t be notified that you blocked them.` : "You’ll be able to message each other again if no other block remains."}</p>
        <p role="status" aria-live="polite" className="sr-only">{isSaving ? `${action}ing ${displayName}.` : ""}</p>
        {error && <p role="alert" className="mt-4 rounded-2xl border border-primary/25 bg-accent px-4 py-3 text-sm leading-6 text-body">{error}</p>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button data-autofocus type="button" onClick={onCancel} disabled={isSaving} className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-heading hover:bg-card focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:opacity-60">Cancel</button><button type="button" onClick={onConfirm} disabled={isSaving} className={`inline-flex min-h-11 items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold shadow-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:opacity-60 ${blocked ? "bg-primary text-white hover:bg-primary-hover" : "border border-border bg-surface text-heading hover:bg-card"}`}>{isSaving ? `${action}ing…` : action}</button></div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

export default UserBlockDialog;
