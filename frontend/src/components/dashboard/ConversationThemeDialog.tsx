import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { canUseConversationTheme, conversationThemes, getConversationThemeStyle, normalizeConversationThemeId, type ConversationThemeId } from "./conversationThemes";
import { isObsidianDevelopmentPreviewEnabled, type PremiumAccessState } from "./premiumAccess";

type ConversationThemeDialogProps = {
  currentTheme: ConversationThemeId;
  premiumAccess: PremiumAccessState;
  returnFocusRef: RefObject<HTMLElement | null>;
  onApply: (theme: ConversationThemeId) => Promise<string | null>;
  onClose: () => void;
};

function LockIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
}

function ThemePreview({ themeId }: { themeId: ConversationThemeId }) {
  return <span className="chat-theme-preview relative block overflow-hidden rounded-xl border" data-chat-theme={themeId} style={{ ...getConversationThemeStyle(themeId), background: "var(--chat-canvas)", borderColor: "var(--chat-header-border)" }}><span aria-hidden="true" className="chat-theme-preview-artwork absolute inset-0" /><span className="relative block h-6 border-b" style={{ background: "var(--chat-header)", borderColor: "var(--chat-header-border)" }} /><span className="relative flex h-20 flex-col justify-center gap-2.5 px-3"><span className="h-3.5 w-3/5 rounded-full" style={{ background: "var(--chat-incoming-bg)", border: "1px solid var(--chat-header-border)" }} /><span className="ml-auto h-3.5 w-2/3 rounded-full" style={{ background: "var(--chat-outgoing-bg)" }} /></span></span>;
}

function ConversationThemeDialog({ currentTheme, premiumAccess, returnFocusRef, onApply, onClose }: ConversationThemeDialogProps) {
  const shouldReduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const isSavingRef = useRef(false);
  const [selectedTheme, setSelectedTheme] = useState<ConversationThemeId>(() => normalizeConversationThemeId(currentTheme));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const selectedAvailable = canUseConversationTheme(selectedTheme, premiumAccess);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { isSavingRef.current = isSaving; }, [isSaving]);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const returnFocusElement = returnFocusRef.current;
    document.body.style.overflow = "hidden";
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); if (!isSavingRef.current) onCloseRef.current(); return; }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), [tabindex]:not([tabindex='-1'])")];
      const first = focusable[0]; const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", handleKeyDown);
    const frame = window.requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus());
    return () => { window.cancelAnimationFrame(frame); document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", handleKeyDown); window.requestAnimationFrame(() => returnFocusElement?.focus()); };
  }, [returnFocusRef]);

  async function applyTheme() {
    if (isSaving || selectedTheme === currentTheme || !selectedAvailable) return;
    setIsSaving(true); setError("");
    const nextError = await onApply(selectedTheme);
    setIsSaving(false);
    if (nextError) { setError(nextError); return; }
    onClose();
  }

  return createPortal(
    <motion.div initial={shouldReduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: shouldReduceMotion ? 0 : 0.18 }} className="fixed inset-0 z-[90] flex items-end justify-center overflow-y-auto bg-heading/20 md:items-center md:p-4" onPointerDown={(event) => { if (event.target === event.currentTarget && !isSaving) onClose(); }}>
      <motion.div ref={panelRef} initial={shouldReduceMotion ? false : { opacity: 0, y: 18, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.99 }} transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }} role="dialog" aria-modal="true" aria-labelledby="change-theme-title" aria-describedby="change-theme-description" aria-busy={isSaving} className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border-t border-border bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-soft md:max-w-2xl md:rounded-3xl md:border md:p-6">
        <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-border md:hidden" />
        <div className="flex items-start justify-between gap-4"><div><h2 id="change-theme-title" className="text-xl font-semibold text-heading">Conversation theme</h2><p id="change-theme-description" className="mt-1 text-sm leading-6 text-body">Choose how this conversation looks for you. The other person&apos;s appearance will not change.</p></div><button type="button" onClick={onClose} disabled={isSaving} aria-label="Close theme picker" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" strokeLinecap="round" /></svg></button></div>
        <div role="radiogroup" aria-label="Conversation themes" className="mt-5 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 sm:grid-cols-3">
          {conversationThemes.map((theme, index) => {
            const available = canUseConversationTheme(theme.id, premiumAccess);
            const isSelected = selectedTheme === theme.id;
            const isCurrent = currentTheme === theme.id;
            return <button key={theme.id} data-autofocus={index === 0 ? true : undefined} type="button" role="radio" aria-checked={isSelected} aria-disabled={!available} onClick={() => { if (!available) return; setSelectedTheme(theme.id); setError(""); }} disabled={isSaving} className={`min-w-0 rounded-2xl border p-2 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:cursor-wait disabled:opacity-60 ${isSelected ? "border-primary bg-accent shadow-soft" : "border-border bg-background hover:border-primary/40 hover:bg-accent"} ${!available ? "cursor-not-allowed" : ""}`}><ThemePreview themeId={theme.id} /><span className="mt-3 flex min-w-0 items-start justify-between gap-2 px-1"><span className="min-w-0"><span className="flex items-center gap-2"><span className="truncate text-sm font-semibold text-heading">{theme.name}</span>{theme.access === "premium" && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent px-2 py-1 text-[0.65rem] font-bold uppercase tracking-wide text-primary"><LockIcon /> Elite</span>}</span><span className="mt-1 block text-xs leading-5 text-body">{theme.description}</span></span><span className="shrink-0 pt-0.5 text-xs font-semibold text-primary">{isCurrent ? "Current" : available && isSelected ? "Selected" : theme.access === "premium" ? "Preview" : ""}</span></span></button>;
          })}
        </div>
        {!canUseConversationTheme("obsidian", premiumAccess, false) && <div className="mt-4 rounded-2xl bg-accent px-4 py-3"><p className="text-sm font-semibold text-heading">Obsidian is a premium theme</p><p className="mt-1 text-xs leading-5 text-body">Planned for Nemissive Elite or permanent purchase. Billing and ownership are not available yet.</p>{isObsidianDevelopmentPreviewEnabled && <p className="mt-2 text-xs font-semibold text-primary">Development preview is enabled. Applying Obsidian saves only a development preference and is not proof of ownership.</p>}</div>}
        {error && <p role="alert" className="mt-4 rounded-xl bg-accent px-3 py-2 text-sm leading-6 text-body">{error}</p>}
        <p role="status" aria-live="polite" className="sr-only">{isSaving ? "Applying conversation theme." : ""}</p>
        <div className="sticky bottom-0 mt-5 flex justify-end gap-2 border-t border-border bg-surface pt-4"><button type="button" onClick={onClose} disabled={isSaving} className="min-h-11 rounded-2xl px-4 py-2.5 text-sm font-semibold text-body transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50">Cancel</button><button type="button" onClick={() => void applyTheme()} disabled={isSaving || selectedTheme === currentTheme || !selectedAvailable} className="min-h-11 rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-50">{isSaving ? "Applying…" : selectedTheme === "obsidian" && isObsidianDevelopmentPreviewEnabled && !canUseConversationTheme("obsidian", premiumAccess, false) ? "Apply development preview" : "Apply theme"}</button></div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

export default ConversationThemeDialog;
