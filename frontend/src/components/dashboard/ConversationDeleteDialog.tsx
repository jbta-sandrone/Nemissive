import { useEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";

type ConversationDeleteDialogProps = {
  conversationName: string;
  error: string;
  isDeleting: boolean;
  returnFocusRef: RefObject<HTMLElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
};

function ConversationDeleteDialog({ conversationName, error, isDeleting, returnFocusRef, onCancel, onConfirm }: ConversationDeleteDialogProps) {
  const shouldReduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCancelRef = useRef(onCancel);
  const isDeletingRef = useRef(isDeleting);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    isDeletingRef.current = isDeleting;
  }, [isDeleting]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const returnFocusElement = returnFocusRef.current;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isDeletingRef.current) {
        event.preventDefault();
        onCancelRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusableElements = [...panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), [tabindex]:not([tabindex='-1'])")];
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);
      if (!firstElement || !lastElement) return;
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
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

  return createPortal(
    <motion.div initial={shouldReduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: shouldReduceMotion ? 0 : 0.18 }} className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-heading/20 p-4" onPointerDown={(event) => { if (event.target === event.currentTarget && !isDeleting) onCancel(); }}>
      <motion.div ref={panelRef} initial={shouldReduceMotion ? false : { opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.99 }} transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }} role="alertdialog" aria-modal="true" aria-labelledby="delete-chat-title" aria-describedby="delete-chat-description" aria-busy={isDeleting} className="w-full max-w-md rounded-3xl border border-border bg-surface p-5 shadow-soft sm:p-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-primary" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
        <h2 id="delete-chat-title" className="mt-4 text-xl font-semibold text-heading">Delete chat?</h2>
        <p id="delete-chat-description" className="mt-2 text-sm leading-6 text-body">This removes your conversation with {conversationName} and its current message history for you. It does not delete the chat for the other person. If they message you again, the conversation will reappear with only newer messages.</p>
        <p role="status" aria-live="polite" className="sr-only">{isDeleting ? "Deleting chat." : ""}</p>
        {error && <p role="alert" className="mt-4 rounded-2xl border border-primary/25 bg-accent px-4 py-3 text-sm leading-6 text-body">{error}</p>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button data-autofocus type="button" onClick={onCancel} disabled={isDeleting} className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-heading transition hover:bg-card focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-wait disabled:opacity-60">Cancel</button><button type="button" onClick={onConfirm} disabled={isDeleting} aria-label={`Delete chat with ${conversationName}`} className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-wait disabled:opacity-60">{isDeleting ? "Deleting…" : "Delete chat"}</button></div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

export default ConversationDeleteDialog;
