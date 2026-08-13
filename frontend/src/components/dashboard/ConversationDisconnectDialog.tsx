import { useEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";

type Props = {
  conversationName: string;
  error: string;
  isDisconnecting: boolean;
  returnFocusRef: RefObject<HTMLElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
};

function ConversationDisconnectDialog({ conversationName, error, isDisconnecting, returnFocusRef, onCancel, onConfirm }: Props) {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(onCancel);
  const disconnectingRef = useRef(isDisconnecting);

  useEffect(() => { cancelRef.current = onCancel; }, [onCancel]);
  useEffect(() => { disconnectingRef.current = isDisconnecting; }, [isDisconnecting]);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const returnFocus = returnFocusRef.current;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus());
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !disconnectingRef.current) { event.preventDefault(); cancelRef.current(); return; }
      if (event.key !== "Tab" || !panelRef.current) return;
      const controls = [...panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled])")];
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() => returnFocus?.focus());
    };
  }, [returnFocusRef]);

  return createPortal(
    <motion.div initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-heading/20 p-4" onPointerDown={(event) => { if (event.target === event.currentTarget && !isDisconnecting) onCancel(); }}>
      <motion.div ref={panelRef} initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} role="alertdialog" aria-modal="true" aria-labelledby="disconnect-conversation-title" aria-describedby="disconnect-conversation-description" aria-busy={isDisconnecting} className="w-full max-w-md rounded-3xl border border-border bg-surface p-5 shadow-soft sm:p-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-primary" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M8.5 8.5 5 12l3.5 3.5M15.5 8.5 19 12l-3.5 3.5M5 12h14" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
        <h2 id="disconnect-conversation-title" className="mt-4 text-xl font-semibold text-heading">Disconnect from {conversationName}?</h2>
        <p id="disconnect-conversation-description" className="mt-2 text-sm leading-6 text-body">You’ll keep your existing conversation history, but neither of you will be able to send new messages until you connect again. They won’t be blocked, and you can reconnect later.</p>
        <p role="status" aria-live="polite" className="sr-only">{isDisconnecting ? `Disconnecting from ${conversationName}.` : ""}</p>
        {error && <p role="alert" className="mt-4 rounded-2xl border border-primary/25 bg-accent px-4 py-3 text-sm leading-6 text-body">{error}</p>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button data-autofocus type="button" onClick={onCancel} disabled={isDisconnecting} className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-heading hover:bg-card focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:opacity-60">Cancel</button><button type="button" onClick={onConfirm} disabled={isDisconnecting} className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-soft hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:opacity-60">{isDisconnecting ? "Disconnecting…" : "Disconnect"}</button></div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

export default ConversationDisconnectDialog;
