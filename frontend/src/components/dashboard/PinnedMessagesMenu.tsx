import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { PinnedMessagePreview } from "../../types/conversations";
import AnchoredPopover from "./AnchoredPopover";
import { formatVoiceDuration } from "./voiceUtils";

type PinnedMessagesMenuProps = {
  error: string;
  isLoading: boolean;
  pins: PinnedMessagePreview[];
  onRetry: () => void;
  onSelect: (pin: PinnedMessagePreview) => void;
};

type PinnedMessagesContentProps = Omit<PinnedMessagesMenuProps, "onSelect"> & {
  onSelect: (pin: PinnedMessagePreview) => void;
};

function PinIcon({ filled = false }: { filled?: boolean }) {
  return <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="m8 4 8 0-1 5 3 3v2H6v-2l3-3-1-5Z" strokeLinejoin="round" /><path d="M12 14v6" strokeLinecap="round" /></svg>;
}

function normalizePreview(value: string, maximumLength = 132) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maximumLength) return normalized;
  return `${normalized.slice(0, maximumLength - 1).trimEnd()}…`;
}

function getPinnedPreview(pin: PinnedMessagePreview) {
  if (pin.messageType === "voice") return `Voice message${pin.voiceDurationMs ? ` · ${formatVoiceDuration(pin.voiceDurationMs)}` : ""}`;
  if (pin.messageType === "image") {
    if (pin.body.trim()) return normalizePreview(pin.body);
    return pin.attachmentCount > 1 ? "Photos" : "Photo";
  }
  if (pin.messageType === "file") return pin.body.trim() || (pin.attachmentCount === 1 ? `File · ${pin.firstAttachmentName ?? "Attachment"}` : `${pin.attachmentCount} files`);
  return normalizePreview(pin.body);
}

function formatPinnedTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function PinnedMessagesContent({ error, isLoading, pins, onRetry, onSelect }: PinnedMessagesContentProps) {
  return (
    <div className="min-h-0">
      {isLoading && pins.length === 0 ? <div role="status" aria-live="polite" className="space-y-2"><span className="sr-only">Loading pinned messages.</span><div className="h-16 animate-pulse rounded-2xl bg-accent motion-reduce:animate-none" /><div className="h-16 animate-pulse rounded-2xl bg-accent motion-reduce:animate-none" /></div> : pins.length === 0 && !error ? <div className="rounded-2xl bg-accent px-4 py-6 text-center"><p className="text-sm font-semibold text-heading">No pinned messages</p><p className="mt-1 text-xs leading-5 text-body">Messages pinned in this conversation will appear here.</p></div> : <div className="max-h-[min(24rem,58dvh)] space-y-1 overflow-y-auto overscroll-contain pr-1">{pins.map((pin, index) => <button key={pin.messageId} data-autofocus={index === 0 ? true : undefined} type="button" onClick={() => onSelect(pin)} aria-label={`Jump to pinned message from ${pin.senderName}: ${getPinnedPreview(pin)}`} className="flex min-h-16 w-full min-w-0 items-start gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent text-primary"><PinIcon filled /></span><span className="min-w-0 flex-1"><span className="flex min-w-0 items-baseline justify-between gap-3"><span className="truncate text-sm font-semibold text-heading">{pin.senderName}</span><time dateTime={pin.createdAt} className="shrink-0 text-[0.68rem] text-muted">{formatPinnedTimestamp(pin.createdAt)}</time></span><span className="mt-0.5 line-clamp-2 break-words text-xs leading-5 text-body">{getPinnedPreview(pin)}</span></span></button>)}</div>}
      {isLoading && pins.length > 0 && <p role="status" aria-live="polite" className="mt-2 text-center text-xs text-muted">Refreshing pinned messages…</p>}
      {error && <div role="alert" className="mt-2 rounded-2xl bg-accent px-3 py-3 text-xs leading-5 text-body"><p>{error}</p><button type="button" onClick={onRetry} className="mt-2 min-h-9 rounded-xl px-3 py-1.5 font-semibold text-primary transition hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">Retry</button></div>}
    </div>
  );
}

function MobilePinnedMessages({ triggerRef, error, isLoading, pins, onClose, onRetry, onSelect }: PinnedMessagesMenuProps & { triggerRef: RefObject<HTMLButtonElement | null>; onClose: () => void }) {
  const shouldReduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const returnFocusElement = triggerRef.current;
    document.body.style.overflow = "hidden";
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), [tabindex]:not([tabindex='-1'])")];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    const focusFrame = window.requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("[data-autofocus], button:not([disabled])")?.focus());
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() => returnFocusElement?.focus());
    };
  }, [triggerRef]);

  return createPortal(
    <motion.div initial={shouldReduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1, transition: { duration: shouldReduceMotion ? 0 : 0.22 } }} exit={{ opacity: 0, transition: { duration: shouldReduceMotion ? 0.06 : 0.18 } }} className="fixed inset-0 z-[85] flex items-end bg-heading/20 md:hidden" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <motion.div ref={panelRef} initial={shouldReduceMotion ? false : { y: "100%", opacity: 0.98 }} animate={{ y: 0, opacity: 1, transition: { duration: shouldReduceMotion ? 0 : 0.25, ease: [0.22, 1, 0.36, 1] } }} exit={shouldReduceMotion ? { opacity: 1 } : { y: "100%", opacity: 0.98, transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } }} role="dialog" aria-modal="true" aria-labelledby="pinned-messages-mobile-title" className="max-h-[min(84dvh,40rem)] w-full overflow-hidden rounded-t-3xl border-t border-border bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-soft">
        <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
        <div className="flex items-center justify-between gap-3"><h2 id="pinned-messages-mobile-title" className="text-lg font-semibold text-heading">Pinned messages</h2><button type="button" onClick={onClose} aria-label="Close pinned messages" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" strokeLinecap="round" /></svg></button></div>
        <div className="mt-4 min-h-0 overflow-hidden"><PinnedMessagesContent error={error} isLoading={isLoading} pins={pins} onRetry={onRetry} onSelect={(pin) => { onClose(); onSelect(pin); }} /></div>
        <button type="button" onClick={onClose} className="mt-4 min-h-11 w-full rounded-2xl bg-accent px-4 py-2.5 text-sm font-semibold text-heading transition hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">Close</button>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

function PinnedMessagesMenu({ error, isLoading, pins, onRetry, onSelect }: PinnedMessagesMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia("(min-width: 768px)").matches);
  const count = pins.length;

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const handleChange = () => setIsDesktop(mediaQuery.matches);
    handleChange();
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setIsOpen((open) => !open)} aria-label={count === 0 ? "Pinned messages" : `Pinned messages, ${count} ${count === 1 ? "message" : "messages"}`} title="Pinned messages" aria-haspopup="dialog" aria-expanded={isOpen} className={`chat-header-control relative flex h-10 shrink-0 items-center justify-center gap-1 rounded-2xl border px-2.5 transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover ${isOpen || count > 0 ? "chat-header-control-active border-primary/25 bg-accent text-primary" : "border-border bg-background text-muted hover:bg-accent hover:text-heading"}`}><PinIcon filled={count > 0} />{count > 0 && <span aria-hidden="true" className="hidden min-w-4 text-center text-xs font-semibold sm:inline">{count}</span>}</button>
      <AnimatePresence initial={false}>{isOpen && (isDesktop ? <AnchoredPopover key="desktop-pinned-messages" anchorRef={triggerRef} ariaLabel="Pinned messages" placement="bottom" onClose={() => setIsOpen(false)} panelClassName="w-80 max-w-[calc(100vw-1rem)] rounded-3xl border border-border bg-surface p-4 shadow-soft"><h2 className="mb-4 text-base font-semibold text-heading">Pinned messages</h2><PinnedMessagesContent error={error} isLoading={isLoading} pins={pins} onRetry={onRetry} onSelect={(pin) => { setIsOpen(false); onSelect(pin); }} /></AnchoredPopover> : <MobilePinnedMessages key="mobile-pinned-messages" triggerRef={triggerRef} error={error} isLoading={isLoading} pins={pins} onClose={() => setIsOpen(false)} onRetry={onRetry} onSelect={onSelect} />)}</AnimatePresence>
    </>
  );
}

export default PinnedMessagesMenu;
