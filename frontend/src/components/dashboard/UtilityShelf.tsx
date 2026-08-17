import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

type UtilityShelfProps = {
  isOpen: boolean;
  isFocusMode: boolean;
  isCompactChatVisible: boolean;
  onToggle: (trigger: HTMLButtonElement) => void;
  onClose: () => void;
};

type UtilityTool = {
  id: "notes" | "gallery" | "reminders";
  label: string;
  description: string;
};

const utilityTools: readonly UtilityTool[] = [
  { id: "notes", label: "Notes", description: "Personal writing and saved thoughts" },
  { id: "gallery", label: "Gallery", description: "Personal photos and media" },
  { id: "reminders", label: "Reminders", description: "Personal things to remember" },
];

export function UtilityShelfIcon({ className = "h-5 w-5" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" /><rect x="4" y="14" width="6" height="6" rx="1.5" /><rect x="14" y="14" width="6" height="6" rx="1.5" /></svg>;
}

function ToolIcon({ tool }: { tool: UtilityTool["id"] }) {
  const className = "h-5 w-5";
  if (tool === "notes") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true"><path d="M6 3.5h9l3 3V20.5H6v-17Z" strokeLinejoin="round" /><path d="M15 3.5v4h4M9 11h6M9 14.5h6M9 18h4" strokeLinecap="round" /></svg>;
  if (tool === "gallery") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><circle cx="9" cy="10" r="1.5" /><path d="m5.5 17 4.2-4.2 3.1 3 2.2-2.1 3.5 3.3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2M8 3.5 5.5 6M16 3.5 18.5 6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function CloseShelfIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-5 w-5" aria-hidden="true"><path d="m7 10 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function UtilityShelf({ isOpen, isFocusMode, isCompactChatVisible, onToggle, onClose }: UtilityShelfProps) {
  const shouldReduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLElement>(null);
  const panelPositionClasses = isFocusMode ? "bottom-[max(11rem,calc(env(safe-area-inset-bottom)+10.5rem))]" : "bottom-[max(9.25rem,calc(env(safe-area-inset-bottom)+8.75rem))] md:bottom-[max(5.25rem,calc(env(safe-area-inset-bottom)+4.75rem))]";

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

  return (
    <>
      {!isFocusMode && <button type="button" data-utility-shelf-trigger="workspace" onClick={(event) => onToggle(event.currentTarget)} aria-label={isOpen ? "Close utility shelf" : "Open utility shelf"} aria-controls="nemissive-utility-shelf" aria-expanded={isOpen} title={isOpen ? "Close utility shelf" : "Open utility shelf"} className={`${isCompactChatVisible ? "hidden md:flex" : "flex"} fixed bottom-[max(5.25rem,calc(env(safe-area-inset-bottom)+4.75rem))] left-1/2 z-40 h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full border border-border shadow-soft backdrop-blur-md transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover md:bottom-[max(1rem,env(safe-area-inset-bottom))] ${isOpen ? "bg-primary text-white" : "bg-surface/95 text-primary hover:bg-accent"}`}><UtilityShelfIcon /></button>}

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.section ref={panelRef} id="nemissive-utility-shelf" role="region" aria-labelledby="utility-shelf-title" initial={shouldReduceMotion ? false : { opacity: 0, y: 12, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.99 }} transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }} className={`${panelPositionClasses} fixed left-1/2 z-40 w-[calc(100vw-1rem)] max-w-3xl -translate-x-1/2 rounded-3xl border border-border bg-surface/95 p-3 shadow-soft backdrop-blur-md sm:w-[calc(100vw-2rem)] sm:p-4`}>
            <header className="flex items-center justify-between gap-4 px-1 pb-3 sm:px-2"><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Personal workspace</p><h2 id="utility-shelf-title" className="mt-1 text-lg font-semibold text-heading">Tools</h2></div><button type="button" onClick={onClose} aria-label="Close utility shelf" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-muted transition-colors hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover"><CloseShelfIcon /></button></header>
            <ul aria-label="Future personal tools" className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">{utilityTools.map((tool) => <li key={tool.id} aria-label={`${tool.label}, coming soon`} className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3.5"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent text-primary" aria-hidden="true"><ToolIcon tool={tool.id} /></span><span className="min-w-0"><span className="block truncate text-sm font-semibold text-heading">{tool.label}</span><span className="mt-0.5 block text-xs font-medium text-muted">Coming soon</span><span className="sr-only">{tool.description}</span></span></li>)}</ul>
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}

export default UtilityShelf;
