import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";

type UtilityShelfProps = {
  isOpen: boolean;
  isFocusMode: boolean;
  isCompactChatVisible: boolean;
  mobileComposerClearance: number | null;
  onToggle: (trigger: HTMLButtonElement) => void;
  onClose: () => void;
  onOpenNotes: (trigger: HTMLButtonElement) => void;
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
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" /><rect x="4" y="14" width="6" height="6" rx="1.5" /><rect x="14" y="14" width="6" height="6" rx="1.5" /></svg>;
}

function ToolIcon({ tool }: { tool: UtilityTool["id"] }) {
  const className = "h-6 w-6";
  if (tool === "notes") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true"><path d="M6 3.5h9l3 3V20.5H6v-17Z" strokeLinejoin="round" /><path d="M15 3.5v4h4M9 11h6M9 14.5h6M9 18h4" strokeLinecap="round" /></svg>;
  if (tool === "gallery") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><circle cx="9" cy="10" r="1.5" /><path d="m5.5 17 4.2-4.2 3.1 3 2.2-2.1 3.5 3.3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2M8 3.5 5.5 6M16 3.5 18.5 6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ShelfHandleIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <span className="flex flex-col items-center gap-0.5" aria-hidden="true">
      <UtilityShelfIcon className="h-[18px] w-[18px]" />
      <svg viewBox="0 0 16 8" fill="none" stroke="currentColor" strokeWidth="1.7" className={`h-2 w-4 transition-transform duration-200 motion-reduce:transition-none ${isOpen ? "rotate-180" : ""}`}><path d="m3 6 5-4 5 4" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span>
  );
}

function UtilityShelf({ isOpen, isFocusMode, isCompactChatVisible, mobileComposerClearance, onToggle, onClose, onOpenNotes }: UtilityShelfProps) {
  const shouldReduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const activeElement = document.activeElement;
      const hasModalLayer = Boolean(document.querySelector('[aria-modal="true"]'));
      const activeHigherSurface = activeElement instanceof HTMLElement && !panelRef.current?.contains(activeElement) && !activeElement.matches("[data-utility-shelf-trigger]") && Boolean(activeElement.closest('[role="dialog"], [role="alertdialog"], [role="menu"]'));
      if (hasModalLayer || activeHigherSurface) return;
      event.preventDefault();
      onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="utility-shelf-layer pointer-events-none fixed inset-0 z-[45]" data-compact-chat={isCompactChatVisible ? "true" : "false"} style={{ "--utility-shelf-mobile-composer-clearance": mobileComposerClearance === null ? undefined : `${mobileComposerClearance}px` } as CSSProperties}>
      {!isFocusMode && (
        <button
          type="button"
          data-utility-shelf-trigger="workspace"
          data-open={isOpen ? "true" : "false"}
          onClick={(event) => onToggle(event.currentTarget)}
          aria-label={isOpen ? "Close utility shelf" : "Open utility shelf"}
          aria-controls="nemissive-utility-shelf"
          aria-expanded={isOpen}
          title={isOpen ? "Close utility shelf" : "Open utility shelf"}
          className={`utility-shelf-handle pointer-events-auto absolute left-1/2 z-10 flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full border border-border shadow-soft backdrop-blur-md transition-[bottom,background-color,color] duration-200 ease-out focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover motion-reduce:transition-none ${isOpen ? "bg-primary text-white" : "bg-surface/95 text-primary hover:bg-accent"}`}
        >
          <ShelfHandleIcon isOpen={isOpen} />
        </button>
      )}

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.section
            ref={panelRef}
            id="nemissive-utility-shelf"
            role="region"
            aria-labelledby="utility-shelf-title"
            initial={shouldReduceMotion ? false : { opacity: 0.92, y: "calc(100% + 2rem)" }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0.92, y: "calc(100% + 2rem)" }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="utility-shelf-panel pointer-events-auto absolute flex flex-col overflow-hidden rounded-[1.75rem] border border-border bg-surface/95 px-3 pb-3 pt-7 shadow-soft backdrop-blur-md sm:px-5 sm:pb-5 sm:pt-8"
          >
            <header className="shrink-0 text-center">
              <h2 id="utility-shelf-title" className="text-sm font-semibold text-heading">Utility shelf</h2>
              <p className="mt-0.5 text-xs text-muted">Personal tools</p>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-0.5 py-3 sm:px-1 sm:py-4">
              <ul aria-label="Personal tools" className="mx-auto grid min-h-full w-full max-w-5xl content-center grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-4">
                {utilityTools.map((tool) => (
                  <li key={tool.id} className="min-w-0">
                    {tool.id === "notes" ? <button type="button" onClick={(event) => onOpenNotes(event.currentTarget)} className="flex w-full min-w-0 items-center gap-3 rounded-2xl border border-border bg-background/80 px-4 py-3.5 text-left transition hover:border-primary/25 hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover sm:min-h-28 sm:flex-col sm:items-start sm:justify-center sm:px-5 sm:py-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-primary" aria-hidden="true"><ToolIcon tool={tool.id} /></span><span className="min-w-0 sm:w-full"><span className="text-sm font-semibold text-heading sm:text-base">{tool.label}</span><span className="mt-1 block text-xs leading-5 text-body">{tool.description}</span></span></button> : <div aria-label={`${tool.label}, coming soon`} className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-background/80 px-4 py-3.5 opacity-80 sm:min-h-28 sm:flex-col sm:items-start sm:justify-center sm:px-5 sm:py-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-primary" aria-hidden="true"><ToolIcon tool={tool.id} /></span><span className="min-w-0 sm:w-full"><span className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="text-sm font-semibold text-heading sm:text-base">{tool.label}</span><span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">Coming soon</span></span><span className="mt-1 block text-xs leading-5 text-body">{tool.description}</span></span></div>}
                  </li>
                ))}
              </ul>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

export default UtilityShelf;
