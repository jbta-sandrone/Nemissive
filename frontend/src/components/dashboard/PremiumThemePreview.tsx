import { useState, type RefObject } from "react";
import { beginBillingCheckout } from "./billing";
import { getConversationThemeStyle, type ConversationThemeDefinition } from "./conversationThemes";
import { eliteMonthlyProductId, formatPremiumPrice, premiumCatalog, premiumThemePurchaseCatalog, type BillingProductId } from "./premiumCatalog";
import type { PremiumProductAccessSource } from "./premiumAccess";
import { premiumThemeAccessLabels } from "./premiumPresentation";

type PremiumThemePreviewProps = {
  theme: ConversationThemeDefinition;
  accessSource: PremiumProductAccessSource;
  current: boolean;
  error: string;
  isSaving: boolean;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onApply: () => void;
  onBack: () => void;
  onClose: () => void;
};

function BackIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true"><path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function CloseIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" strokeLinecap="round" /></svg>;
}

function MediaIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-7 w-7" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="10" r="2" /><path d="m5.5 17 4.2-4 2.8 2.4 2.3-2.1 3.7 3.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function FileIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5" aria-hidden="true"><path d="M7 3.5h6l4 4V20H7V3.5Z" strokeLinejoin="round" /><path d="M13 3.5V8h4M9.5 12h5M9.5 15h5" strokeLinecap="round" /></svg>;
}

function PlayIcon() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true"><path d="m9 7 8 5-8 5V7Z" /></svg>;
}

function SendIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="m4 5 16 7-16 7 3-7-3-7Z" strokeLinejoin="round" /><path d="M7 12h13" /></svg>;
}

function StaticChatPreview({ theme }: { theme: ConversationThemeDefinition }) {
  return (
    <section aria-label={`${theme.name} simulated conversation preview`} className="chat-theme min-h-[30rem] overflow-hidden rounded-[1.75rem] border border-border shadow-soft" data-chat-theme={theme.id} style={getConversationThemeStyle(theme.id)}>
      <div className="chat-panel-root relative flex h-[clamp(34rem,62dvh,40rem)] min-h-0 flex-col overflow-hidden">
        <div className="chat-theme-artwork pointer-events-none absolute inset-0" aria-hidden="true" />
        <header className="chat-header relative flex shrink-0 items-center gap-3 border-b px-4 py-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-bold" style={{ background: "var(--chat-surface-elevated)", borderColor: "var(--chat-header-border)", color: "var(--chat-accent)" }} aria-hidden="true">N</span>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-heading">Sample conversation</span><span className="block truncate text-xs text-body">Theme preview · No real messages</span></span>
          <span className="chat-header-control flex h-9 w-9 items-center justify-center rounded-xl border" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg></span>
        </header>

        <div className="chat-timeline relative flex min-h-0 flex-1 flex-col justify-end gap-3 overflow-hidden px-3 py-4 sm:px-5">
          <div className="chat-activity-row mx-auto flex items-center gap-2 px-3 py-1.5 text-[0.68rem] text-muted"><span className="chat-activity-icon flex h-5 w-5 items-center justify-center rounded-full" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5"><path d="M12 4v10M8 10l4 4 4-4M6 19h12" strokeLinecap="round" /></svg></span><span>Theme preview · Today</span></div>

          <div className="max-w-[82%] self-start">
            <div className="chat-message-incoming rounded-3xl rounded-bl-md border px-4 py-3 text-sm leading-5">
              <div className="chat-reply-quote mb-2 rounded-xl border-l-2 px-3 py-2 text-xs"><p className="font-semibold text-heading">Sample reply</p><p className="mt-0.5 text-muted">The background feels cinematic.</p></div>
              <p>This theme looks incredible.</p>
              <p className="mt-1.5 text-[0.65rem] text-muted">10:18 PM</p>
            </div>
            <span className="chat-reaction-chip -mt-1 ml-3 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs shadow-soft"><svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.4A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" /></svg><span>2</span></span>
          </div>

          <div className="chat-message-outgoing max-w-[78%] self-end rounded-3xl rounded-br-md px-4 py-3 text-sm leading-5"><p>Right? The atmosphere is perfect.</p><p className="mt-1.5 text-right text-[0.65rem] opacity-70">10:19 PM · Read</p></div>

          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] items-end gap-2">
            <div className="chat-message-incoming min-w-0 rounded-3xl rounded-bl-md border p-2">
              <div className="chat-media-placeholder flex aspect-[16/8] items-center justify-center rounded-2xl"><MediaIcon /></div>
              <p className="px-2 pb-1 pt-2 text-xs">A sample media surface</p>
            </div>
            <div className="space-y-2">
              <div className="chat-message-outgoing rounded-3xl rounded-br-md px-3 py-2.5"><div className="flex items-center gap-2"><span className="chat-voice-play flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-white"><PlayIcon /></span><span className="h-1.5 min-w-0 flex-1 rounded-full bg-white/35"><span className="block h-full w-2/5 rounded-full bg-white/80" /></span><span className="text-[0.62rem] opacity-75">0:12</span></div></div>
              <div className="chat-message-incoming rounded-3xl rounded-bl-md border px-3 py-2"><div className="chat-file-card flex min-w-0 items-center gap-2 rounded-2xl border p-2"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent"><FileIcon /></span><span className="min-w-0"><span className="block truncate text-xs font-semibold">Concept.pdf</span><span className="block text-[0.62rem] text-muted">1.8 MB</span></span></div></div>
            </div>
          </div>
        </div>

        <div className="chat-composer-region relative shrink-0 border-t px-3 py-3 sm:px-5">
          <div className="chat-composer-shell flex min-w-0 items-center gap-2 rounded-2xl px-3 py-2.5"><span className="chat-composer-input min-w-0 flex-1 text-sm">Write a message…</span><span className="chat-primary-action flex h-9 w-9 shrink-0 items-center justify-center rounded-full"><SendIcon /></span></div>
        </div>
      </div>
    </section>
  );
}

function PremiumThemePreview({ theme, accessSource, current, error, isSaving, headingRef, onApply, onBack, onClose }: PremiumThemePreviewProps) {
  const [checkoutProductId, setCheckoutProductId] = useState<BillingProductId | null>(null);
  const [checkoutError, setCheckoutError] = useState("");
  const accessLabel = premiumThemeAccessLabels[accessSource];
  const canApply = accessSource !== "locked";
  const applyLabel = accessSource === "preview" ? "Apply development preview" : "Apply theme";
  const themeProductId = theme.premiumProductId ?? null;
  const themeProduct = themeProductId ? premiumThemePurchaseCatalog[themeProductId] : null;
  const themeCheckoutProductId = themeProduct?.checkoutProductId ?? null;
  const eliteProduct = premiumCatalog[eliteMonthlyProductId];

  async function startCheckout(productId: BillingProductId) {
    if (checkoutProductId) return;
    setCheckoutError("");
    setCheckoutProductId(productId);
    const nextError = await beginBillingCheckout(productId);
    if (nextError) {
      setCheckoutError(nextError);
      setCheckoutProductId(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
        <button data-autofocus type="button" onClick={onBack} disabled={isSaving} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-2.5 text-sm font-semibold text-primary transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50"><BackIcon /> Themes</button>
        <div className="min-w-0 flex-1 text-center"><h2 ref={headingRef} id="premium-theme-preview-title" tabIndex={-1} className="truncate text-base font-semibold text-heading outline-none sm:text-lg">{theme.name}</h2><p className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-primary">Elite conversation theme</p></div>
        <button type="button" onClick={onClose} disabled={isSaving} aria-label="Close theme picker" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50"><CloseIcon /></button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5 lg:p-6">
        <div className="mx-auto grid w-full max-w-6xl items-start gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(18rem,0.75fr)] lg:gap-6">
          <StaticChatPreview theme={theme} />

          <aside aria-label={`${theme.name} access options`} className="rounded-[1.75rem] border border-border bg-background p-4 shadow-soft sm:p-5 lg:sticky lg:top-0">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Your access</p><h3 className="mt-1 text-xl font-bold text-heading">{accessLabel}</h3></div><span className="rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-primary">{theme.name}</span></div>
            <p className="mt-4 text-sm leading-6 text-body">{accessSource === "owned" ? "You own this theme permanently, independent of your account plan." : accessSource === "elite" ? "This theme is available while your Nemissive Elite plan is active." : accessSource === "preview" ? "Development access lets you test this theme. It is not permanent ownership or Elite." : themeCheckoutProductId ? "Preview the complete visual design, then choose permanent ownership or Nemissive Elite through secure checkout." : "Preview the complete visual design. Permanent purchase is coming soon, or access this theme now with Nemissive Elite."}</p>

            {canApply ? (
              <button type="button" onClick={onApply} disabled={isSaving || current} className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-50">
                {isSaving ? "Applying…" : current ? "Current theme" : applyLabel}
              </button>
            ) : themeProduct && themeProductId && (
              <div className="mt-5 space-y-3">
                <section aria-labelledby={`${theme.id}-permanent-title`} className="rounded-2xl border border-border bg-surface p-4">
                  <p className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-muted">Buy once</p>
                  <h4 id={`${theme.id}-permanent-title`} className="mt-1 text-sm font-bold text-heading">Own {theme.name} forever</h4>
                  <p className="mt-3 text-3xl font-black tracking-tight text-heading">{formatPremiumPrice(themeProductId)}</p>
                  <p className="mt-1 text-xs font-semibold text-body">Pay once · Own forever</p>
                  {themeCheckoutProductId ? (
                    <button type="button" onClick={() => void startCheckout(themeCheckoutProductId)} disabled={Boolean(checkoutProductId)} aria-label={`Buy ${theme.name} for ${formatPremiumPrice(themeProductId)}`} className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-wait disabled:opacity-60">
                      {checkoutProductId === themeCheckoutProductId ? "Preparing secure checkout…" : `Buy ${theme.name}`}
                    </button>
                  ) : (
                    <button type="button" disabled aria-label={`${theme.name} permanent purchase coming soon`} className="mt-4 inline-flex min-h-11 w-full cursor-not-allowed items-center justify-center rounded-2xl border border-border bg-background px-4 py-2.5 text-sm font-bold text-muted opacity-80">
                      Coming soon
                    </button>
                  )}
                </section>
                <p className="text-center text-[0.65rem] font-bold uppercase tracking-[0.16em] text-muted">or</p>
                <section aria-labelledby={`${theme.id}-elite-title`} className="rounded-2xl border border-primary/25 bg-accent p-4">
                  <p className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-primary">Nemissive Elite</p>
                  <h4 id={`${theme.id}-elite-title`} className="mt-1 text-sm font-bold text-heading">Premium access while subscribed</h4>
                  <p className="mt-3 text-3xl font-black tracking-tight text-heading">{formatPremiumPrice(eliteMonthlyProductId)} <span className="text-sm font-bold text-body">/ month</span></p>
                  <p className="mt-1 text-xs leading-5 text-body">Access Obsidian, Celestial, Sakura, Ember, Glacier, Verdant, Abyss, Eclipse, Dune, and other included Elite benefits while your plan is active.</p>
                  <button type="button" onClick={() => void startCheckout(eliteMonthlyProductId)} disabled={Boolean(checkoutProductId)} aria-label={`Get Nemissive Elite for ${formatPremiumPrice(eliteMonthlyProductId)} per month`} className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-primary/30 bg-surface px-4 py-2.5 text-sm font-bold text-heading transition hover:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-wait disabled:opacity-60">
                    {checkoutProductId === eliteMonthlyProductId ? "Preparing secure checkout…" : "Get Nemissive Elite"}
                  </button>
                </section>
                <p className="sr-only">Displayed prices are {formatPremiumPrice(themeProductId)} for {themeProduct.name} as an intended one-time purchase and {formatPremiumPrice(eliteMonthlyProductId)} per {eliteProduct.interval} for Nemissive Elite. {themeCheckoutProductId ? "Permanent checkout is available." : "Permanent checkout is coming soon."}</p>
              </div>
            )}

            {checkoutError && <p role="alert" className="mt-4 rounded-2xl border border-primary/25 bg-accent px-4 py-3 text-sm leading-6 text-body">{checkoutError}</p>}
            {error && <p role="alert" className="mt-4 rounded-2xl border border-primary/25 bg-accent px-4 py-3 text-sm leading-6 text-body">{error}</p>}
            <p className="sr-only" role="status" aria-live="polite">{checkoutProductId ? "Preparing secure checkout." : ""}</p>
            <p className="mt-5 border-t border-border pt-4 text-xs leading-5 text-muted">This is a static visual preview. It uses fictional content, does not connect to a conversation, and never changes your saved theme unless an authorized Apply succeeds.</p>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default PremiumThemePreview;
