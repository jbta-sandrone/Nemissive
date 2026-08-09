import { useEffect, useRef, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { getEmojiLabel } from "./emojiData";

type MessageActionSheetProps = {
  canDelete: boolean;
  canEdit: boolean;
  canPin: boolean;
  canInteract: boolean;
  isPinned: boolean;
  isPinPending: boolean;
  messageLabel: string;
  quickReactions: string[];
  returnFocusRef: RefObject<HTMLElement | null>;
  themeStyle?: CSSProperties;
  onClose: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onOpenEmojiPicker: () => void;
  onPin: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
};

function ReplyIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="m10 8-5 4 5 4" strokeLinecap="round" strokeLinejoin="round" /><path d="M6 12h6.5c3.6 0 5.5 1.8 5.5 5" strokeLinecap="round" /></svg>;
}

function EditIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="m5 15.5-.8 4.3 4.3-.8L18 9.5 14.5 6 5 15.5Z" strokeLinecap="round" strokeLinejoin="round" /><path d="m12.8 7.7 3.5 3.5" strokeLinecap="round" /></svg>;
}

function DeleteIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function PinIcon({ filled }: { filled: boolean }) {
  return <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="m8 4 8 0-1 5 3 3v2H6v-2l3-3-1-5Z" strokeLinejoin="round" /><path d="M12 14v6" strokeLinecap="round" /></svg>;
}

function MessageActionSheet({ canDelete, canEdit, canPin, canInteract, isPinned, isPinPending, messageLabel, quickReactions, returnFocusRef, themeStyle, onClose, onDelete, onEdit, onOpenEmojiPicker, onPin, onReact, onReply }: MessageActionSheetProps) {
  const shouldReduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const shouldRestoreFocusRef = useRef(true);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const returnFocusElement = returnFocusRef.current;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
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

    const focusFrame = window.requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("[data-autofocus], button:not([disabled])")?.focus());
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      if (shouldRestoreFocusRef.current) window.requestAnimationFrame(() => returnFocusElement?.focus());
    };
  }, [returnFocusRef]);

  function runAction(action: () => void) {
    shouldRestoreFocusRef.current = false;
    onClose();
    action();
  }

  return createPortal(
    <motion.div initial={shouldReduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1, transition: { duration: shouldReduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] } }} exit={{ opacity: 0, transition: { duration: shouldReduceMotion ? 0.06 : 0.2, ease: shouldReduceMotion ? "linear" : [0.4, 0, 1, 1] } }} className="fixed inset-0 z-[80] flex items-end bg-heading/20 md:hidden" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <motion.div ref={panelRef} style={themeStyle} initial={shouldReduceMotion ? false : { y: "100%", opacity: 0.98 }} animate={{ y: 0, opacity: 1, transition: { duration: shouldReduceMotion ? 0 : 0.25, ease: [0.22, 1, 0.36, 1] } }} exit={shouldReduceMotion ? { opacity: 1 } : { y: "100%", opacity: 0.98, transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } }} role="dialog" aria-modal="true" aria-label={`Actions for ${messageLabel}`} className="chat-theme chat-action-sheet max-h-[min(80dvh,36rem)] w-full overscroll-contain overflow-y-auto overflow-x-hidden rounded-t-3xl border-t border-border bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-soft">
        <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
        {canInteract && <section aria-label="Quick reactions" className="border-b border-border pb-3">
          <div className="flex max-w-full items-center gap-1 overflow-x-auto pb-1">{quickReactions.map((emoji, index) => <button key={emoji} data-autofocus={index === 0 ? true : undefined} type="button" onClick={() => { onReact(emoji); onClose(); }} aria-label={`React with ${getEmojiLabel(emoji)}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">{emoji}</button>)}<button type="button" onClick={() => runAction(onOpenEmojiPicker)} aria-label="Open full emoji picker" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg font-semibold text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">+</button></div>
        </section>}
        <section aria-label="Message actions" className="border-b border-border py-2">
          {canInteract && <button type="button" onClick={() => runAction(onReply)} className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold text-heading transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-primary"><ReplyIcon /></span><span>Reply</span></button>}
          {canPin && <button type="button" onClick={() => { onClose(); onPin(); }} disabled={isPinPending} aria-pressed={isPinned} aria-label={isPinned ? "Unpin this message" : "Pin this message"} className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold text-heading transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-wait disabled:opacity-60"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-primary"><PinIcon filled={isPinned} /></span><span>{isPinned ? "Unpin message" : "Pin message"}</span></button>}
          {canEdit && <button type="button" onClick={() => runAction(onEdit)} className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold text-heading transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-primary"><EditIcon /></span><span>Edit</span></button>}
          {canDelete && <button type="button" onClick={() => runAction(onDelete)} aria-label="Delete your message" className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold text-primary transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-primary"><DeleteIcon /></span><span>Delete</span></button>}
        </section>
        <button type="button" onClick={onClose} className="mt-2 min-h-12 w-full rounded-2xl px-4 py-3 text-sm font-semibold text-body transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">Cancel</button>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

export default MessageActionSheet;
