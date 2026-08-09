import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import InterestIcon from "./InterestIcon";
import { INTEREST_OPTIONS, normalizeInterestKeys, type InterestKey } from "./profileInterests";

type InterestPickerDialogProps = {
  initialInterests: string[];
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onSave: (interests: InterestKey[]) => void;
};

function InterestPickerDialog({ initialInterests, returnFocusRef, onClose, onSave }: InterestPickerDialogProps) {
  const shouldReduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const [selectedInterests, setSelectedInterests] = useState<InterestKey[]>(() => normalizeInterestKeys(initialInterests));
  const atLimit = selectedInterests.length >= 5;

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
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
      const controls = [...panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), [tabindex]:not([tabindex='-1'])")];
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }

    document.addEventListener("keydown", handleKeyDown);
    const frame = window.requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() => returnFocusElement?.focus());
    };
  }, [returnFocusRef]);

  function toggleInterest(key: InterestKey) {
    setSelectedInterests((current) => {
      if (current.includes(key)) return current.filter((interest) => interest !== key);
      if (current.length >= 5) return current;
      return [...current, key];
    });
  }

  return createPortal(
    <motion.div initial={shouldReduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: shouldReduceMotion ? 0 : 0.18 }} className="fixed inset-0 z-[110] flex items-end justify-center overflow-hidden bg-heading/25 md:items-center md:p-4" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <motion.div ref={panelRef} initial={shouldReduceMotion ? false : { opacity: 0, y: 18, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.99 }} transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }} role="dialog" aria-modal="true" aria-labelledby="interest-picker-title" aria-describedby="interest-picker-description interest-picker-limit" className="flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-border bg-surface shadow-soft md:max-h-[min(46rem,calc(100dvh-2rem))] md:max-w-2xl md:rounded-3xl md:border">
        <div aria-hidden="true" className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-border md:hidden" />
        <header className="flex shrink-0 items-start justify-between gap-4 px-4 pb-3 pt-4 sm:px-6 sm:pt-5">
          <div className="min-w-0">
            <h2 id="interest-picker-title" className="text-xl font-semibold text-heading">Choose interests</h2>
            <p id="interest-picker-description" className="mt-1 text-sm leading-6 text-body">Pick up to 5 interests that describe what you’re into.</p>
          </div>
          <button data-autofocus type="button" onClick={onClose} aria-label="Close interest picker" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" strokeLinecap="round" /></svg></button>
        </header>

        <div className="flex shrink-0 items-center justify-between gap-3 border-y border-border bg-background px-4 py-3 sm:px-6">
          <p role="status" aria-live="polite" aria-atomic="true" className="text-sm font-semibold text-heading">{selectedInterests.length} / 5 selected</p>
          <p id="interest-picker-limit" className="text-right text-xs leading-5 text-muted">{atLimit ? "Maximum selected. Deselect one to choose another." : "Choose what feels like you."}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {INTEREST_OPTIONS.map((option) => {
              const selected = selectedInterests.includes(option.key);
              const disabled = atLimit && !selected;
              return (
                <button key={option.key} type="button" aria-pressed={selected} aria-describedby={disabled ? "interest-picker-limit" : undefined} disabled={disabled} onClick={() => toggleInterest(option.key)} className={`flex min-h-13 min-w-0 items-center gap-2 rounded-2xl border px-3 py-2.5 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-45 ${selected ? "border-primary bg-accent text-heading shadow-soft" : "border-border bg-background text-body hover:border-primary/40 hover:bg-accent"}`}>
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${selected ? "bg-primary text-white" : "bg-surface text-primary"}`}><InterestIcon icon={option.icon} /></span>
                  <span className="min-w-0 flex-1 break-words leading-5">{option.label}</span>
                  {selected && <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0 text-primary" aria-hidden="true"><path d="m4 10 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </button>
              );
            })}
          </div>
        </div>

        <footer className="flex shrink-0 justify-end gap-2 border-t border-border bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-5">
          <button type="button" onClick={onClose} className="min-h-11 rounded-2xl px-4 py-2.5 text-sm font-semibold text-body transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">Cancel</button>
          <button type="button" onClick={() => onSave(selectedInterests)} className="min-h-11 rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Save interests</button>
        </footer>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

export default InterestPickerDialog;
