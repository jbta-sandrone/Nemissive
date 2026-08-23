import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

type UtilityShelfProps = {
  isOpen: boolean;
  anchorRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onOpenNotes: (trigger: HTMLButtonElement) => void;
  onOpenGallery: (trigger: HTMLButtonElement) => void;
  onOpenReminders: (trigger: HTMLButtonElement) => void;
};

type UtilityTool = {
  id: "notes" | "gallery" | "reminders";
  label: string;
  description: string;
};

const utilityTools: readonly UtilityTool[] = [
  { id: "notes", label: "Notes", description: "Capture thoughts and ideas" },
  { id: "gallery", label: "Gallery", description: "Keep photos and memories" },
  { id: "reminders", label: "Reminders", description: "Remember what matters" },
];

export function UtilityShelfIcon({ className = "h-5 w-5" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true"><path d="M4 8.5h16v11H4v-11ZM8.5 8.5V6h7v2.5M4 12h16" strokeLinecap="round" strokeLinejoin="round" /><path d="M10 12v2h4v-2" strokeLinejoin="round" /></svg>;
}

export function UtilityShelfLauncher({ isOpen, onToggle, className = "" }: { isOpen: boolean; onToggle: (trigger: HTMLButtonElement) => void; className?: string }) {
  return (
    <button
      type="button"
      data-utility-shelf-trigger="workspace"
      onClick={(event) => onToggle(event.currentTarget)}
      aria-label={isOpen ? "Close utilities" : "Open utilities"}
      aria-haspopup="menu"
      aria-controls="nemissive-utility-menu"
      aria-expanded={isOpen}
      title={isOpen ? "Close utilities" : "Open utilities"}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border shadow-soft transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover ${isOpen ? "border-primary/25 bg-accent text-primary" : "border-border bg-background text-muted hover:bg-accent hover:text-heading"} ${className}`}
    >
      <UtilityShelfIcon />
    </button>
  );
}

function ToolIcon({ tool }: { tool: UtilityTool["id"] }) {
  const className = "h-5 w-5";
  if (tool === "notes") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true"><path d="M6 3.5h9l3 3V20.5H6v-17Z" strokeLinejoin="round" /><path d="M15 3.5v4h4M9 11h6M9 14.5h6M9 18h4" strokeLinecap="round" /></svg>;
  if (tool === "gallery") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><circle cx="9" cy="10" r="1.5" /><path d="m5.5 17 4.2-4.2 3.1 3 2.2-2.1 3.5 3.3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2M8 3.5 5.5 6M16 3.5 18.5 6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function UtilityShelf({ isOpen, anchorRef, onClose, onOpenNotes, onOpenGallery, onOpenReminders }: UtilityShelfProps) {
  const shouldReduceMotion = useReducedMotion();
  const menuRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const shouldRestoreFocusRef = useRef(true);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useLayoutEffect(() => {
    if (!isOpen || !anchorRef.current || !menuRef.current) return;
    function updatePosition() {
      const anchor = anchorRef.current;
      const menu = menuRef.current;
      if (!anchor || !menu) return;
      const edge = 12;
      const gap = 10;
      const anchorBounds = anchor.getBoundingClientRect();
      const menuBounds = menu.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportRight = viewportLeft + (viewport?.width ?? window.innerWidth);
      const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
      const roomAbove = anchorBounds.top - viewportTop - gap - edge;
      const preferredTop = roomAbove >= menuBounds.height ? anchorBounds.top - menuBounds.height - gap : anchorBounds.bottom + gap;
      const preferredLeft = anchorBounds.right - menuBounds.width;
      setPosition({
        left: Math.max(viewportLeft + edge, Math.min(preferredLeft, viewportRight - menuBounds.width - edge)),
        top: Math.max(viewportTop + edge, Math.min(preferredTop, viewportBottom - menuBounds.height - edge)),
      });
    }
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.visualViewport?.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("scroll", updatePosition);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.visualViewport?.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("scroll", updatePosition);
    };
  }, [anchorRef, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const anchor = anchorRef.current;
    shouldRestoreFocusRef.current = true;
    const menuItems = () => [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? [])];
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node) || menuRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onCloseRef.current();
    }
    function handleKeyDown(event: KeyboardEvent) {
      const items = menuItems();
      const currentIndex = items.findIndex((item) => item === document.activeElement);
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key === "Tab") { shouldRestoreFocusRef.current = false; onCloseRef.current(); return; }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || items.length === 0) return;
      event.preventDefault();
      if (event.key === "Home") items[0]?.focus();
      else if (event.key === "End") items.at(-1)?.focus();
      else if (event.key === "ArrowDown") items[(currentIndex + 1 + items.length) % items.length]?.focus();
      else items[(currentIndex - 1 + items.length) % items.length]?.focus();
    }
    const frame = window.requestAnimationFrame(() => menuItems()[0]?.focus());
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      if (shouldRestoreFocusRef.current) window.requestAnimationFrame(() => anchor?.isConnected && anchor.focus());
    };
  }, [anchorRef, isOpen]);

  if (typeof document === "undefined") return null;

  const itemClass = "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-65";
  return createPortal(
    <>
      <AnimatePresence initial={false}>
        {isOpen && <motion.div
          ref={menuRef}
          id="nemissive-utility-menu"
          role="menu"
          aria-label="Personal utilities"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 5, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.985 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.15, ease: [0.22, 1, 0.36, 1] }}
          style={position ?? { left: 0, top: 0, visibility: "hidden" }}
          className="fixed z-[70] w-[min(17rem,calc(100vw-1.5rem))] rounded-2xl border border-border bg-surface p-1.5 shadow-soft"
        >
          {utilityTools.map((tool) => (
            <button key={tool.id} type="button" role="menuitem" onClick={() => { const trigger = anchorRef.current; if (!trigger) return; shouldRestoreFocusRef.current = false; if (tool.id === "notes") onOpenNotes(trigger); else if (tool.id === "gallery") onOpenGallery(trigger); else onOpenReminders(trigger); }} className={`${itemClass} hover:bg-accent`}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-primary"><ToolIcon tool={tool.id} /></span>
              <span className="min-w-0"><span className="block text-sm font-semibold text-heading">{tool.label}</span><span className="block truncate text-xs text-body">{tool.description}</span></span>
            </button>
          ))}
        </motion.div>}
      </AnimatePresence>
    </>,
    document.body,
  );
}

export default UtilityShelf;
