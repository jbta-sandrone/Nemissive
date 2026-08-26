type BillingReturnState = "confirming" | "confirmed" | "pending" | "error";

type BillingReturnNoticeProps = {
  state: BillingReturnState;
  isRetrying: boolean;
  onDismiss: () => void;
  onRetry: () => void;
};

function CloseIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" strokeLinecap="round" /></svg>;
}

function BillingReturnNotice({ state, isRetrying, onDismiss, onRetry }: BillingReturnNoticeProps) {
  const title = state === "confirmed"
    ? "Purchase confirmed"
    : state === "confirming"
      ? "Confirming your purchase…"
      : state === "error"
        ? "Confirmation unavailable"
        : "Payment received";
  const description = state === "confirmed"
    ? "Your authoritative Nemissive premium access is now up to date."
    : state === "confirming"
      ? "Nemissive is waiting for the verified Lemon Squeezy webhook."
      : state === "error"
        ? "Nemissive could not refresh your premium access. Your payment status was not changed locally."
        : "Your access is still being confirmed. You can retry safely in a moment.";

  return (
    <section role={state === "error" ? "alert" : "status"} aria-live="polite" aria-atomic="true" className="fixed left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] z-[72] w-[min(calc(100vw-1.5rem),28rem)] -translate-x-1/2 rounded-3xl border border-border bg-surface p-4 shadow-soft">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-accent text-primary" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4.5 w-4.5"><path d="M12 3.5 19 8v8l-7 4.5L5 16V8l7-4.5Z" strokeLinejoin="round" /><path d="m8.5 12 2.2 2.2 4.8-5" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
        <div className="min-w-0 flex-1"><h2 className="text-sm font-bold text-heading">{title}</h2><p className="mt-1 text-xs leading-5 text-body">{description}</p>{(state === "pending" || state === "error") && <button type="button" onClick={onRetry} disabled={isRetrying} className="mt-3 min-h-9 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-wait disabled:opacity-60">{isRetrying ? "Checking…" : "Check access again"}</button>}</div>
        <button type="button" onClick={onDismiss} aria-label="Dismiss billing confirmation" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"><CloseIcon /></button>
      </div>
    </section>
  );
}

export default BillingReturnNotice;
