import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";

type ConfirmationDialogProps = {
  dialogId: string;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel: string;
  pendingAnnouncement: string;
  icon: ReactNode;
  error?: string;
  isPending: boolean;
  returnFocusRef: RefObject<HTMLElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
};

function ConfirmationDialog({ dialogId, title, description, confirmLabel, pendingLabel, pendingAnnouncement, icon, error = "", isPending, returnFocusRef, onCancel, onConfirm }: ConfirmationDialogProps) {
  const shouldReduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCancelRef = useRef(onCancel);
  const isPendingRef = useRef(isPending);

  useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);
  useEffect(() => { isPendingRef.current = isPending; }, [isPending]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const returnFocusElement = returnFocusRef.current;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isPendingRef.current) {
        event.preventDefault();
        onCancelRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const controls = [...panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), [tabindex]:not([tabindex='-1'])")];
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

    const focusFrame = window.requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus());
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() => returnFocusElement?.focus());
    };
  }, [returnFocusRef]);

  const titleId = `${dialogId}-title`;
  const descriptionId = `${dialogId}-description`;

  return createPortal(
    <motion.div initial={shouldReduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: shouldReduceMotion ? 0 : 0.18 }} className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-heading/20 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]" onPointerDown={(event) => { if (event.target === event.currentTarget && !isPending) onCancel(); }}>
      <motion.div ref={panelRef} initial={shouldReduceMotion ? false : { opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.99 }} transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} aria-busy={isPending} className="w-full max-w-md rounded-3xl border border-border bg-surface p-5 shadow-soft sm:p-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-primary" aria-hidden="true">{icon}</div>
        <h2 id={titleId} className="mt-4 text-xl font-semibold text-heading">{title}</h2>
        <p id={descriptionId} className="mt-2 text-sm leading-6 text-body">{description}</p>
        <p role="status" aria-live="polite" className="sr-only">{isPending ? pendingAnnouncement : ""}</p>
        {error && <p role="alert" className="mt-4 rounded-2xl border border-primary/25 bg-accent px-4 py-3 text-sm leading-6 text-body">{error}</p>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button data-autofocus type="button" onClick={onCancel} disabled={isPending} className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-heading transition hover:bg-card focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-wait disabled:opacity-60">Cancel</button><button type="button" onClick={onConfirm} disabled={isPending} className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-wait disabled:opacity-60">{isPending ? pendingLabel : confirmLabel}</button></div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

export default ConfirmationDialog;
