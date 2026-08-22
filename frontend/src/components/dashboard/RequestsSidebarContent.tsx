import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { SelectedConversation } from "../../types/conversations";
import type { ConversationRequestItem, RequestAction, RequestUpdateItem } from "./useMessageRequests";
import ProfileAvatar from "./ProfileAvatar";
import { getProfileDisplayName } from "./profileUtils";
import ConfirmationDialog from "./ConfirmationDialog";
import RequestUpdateMenu from "./RequestUpdateMenu";

type RequestsSidebarContentProps = {
  requests: ConversationRequestItem[];
  updates: RequestUpdateItem[];
  pendingCount: number;
  isLoading: boolean;
  loadError: string;
  responseError: string;
  statusMessage: string;
  respondingRequestId: string | null;
  respondingAction: RequestAction | null;
  onRefresh: () => void;
  onRespond: (request: ConversationRequestItem, action: RequestAction) => void;
  onDismissUpdate: (requestId: string) => Promise<string | null>;
  onDismissAllUpdates: () => Promise<string | null>;
  onConversationReady: (conversation: SelectedConversation) => void;
};

function formatRequestTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function RequestsSidebarContent({ requests, updates, pendingCount, isLoading, loadError, responseError, statusMessage, respondingRequestId, respondingAction, onRefresh, onRespond, onDismissUpdate, onDismissAllUpdates, onConversationReady }: RequestsSidebarContentProps) {
  const shouldReduceMotion = useReducedMotion();
  const toastTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const toastSequenceRef = useRef(0);
  const clearAllButtonRef = useRef<HTMLButtonElement>(null);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const [isClearAllDialogOpen, setIsClearAllDialogOpen] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [clearAllError, setClearAllError] = useState("");
  const isResponding = Boolean(respondingRequestId);
  const isEmpty = requests.length === 0 && updates.length === 0;

  useEffect(() => () => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
  }, []);

  function showToast(message: string) {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastSequenceRef.current += 1;
    setToast({ id: toastSequenceRef.current, message });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3000);
  }

  async function dismissUpdate(requestId: string) {
    const error = await onDismissUpdate(requestId);
    if (error) return error;

    showToast("Request update deleted");
    return null;
  }

  async function clearAllUpdates() {
    if (isClearingAll) return;
    setIsClearingAll(true);
    setClearAllError("");
    const error = await onDismissAllUpdates();
    setIsClearingAll(false);
    if (error) {
      setClearAllError(error);
      return;
    }
    setIsClearAllDialogOpen(false);
    showToast("Request updates cleared");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="pointer-events-none fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-[120] w-[min(calc(100%-2rem),22rem)] -translate-x-1/2"><AnimatePresence initial={false}>{toast && <motion.div key={toast.id} role="status" aria-live="polite" aria-atomic="true" initial={shouldReduceMotion ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }} transition={{ duration: shouldReduceMotion ? 0 : 0.16 }} className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 text-center text-sm font-semibold text-heading shadow-soft"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-primary"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true"><path d="m4 10 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" /></svg></span><span>{toast.message}</span></motion.div>}</AnimatePresence></div>
      <AnimatePresence>{isClearAllDialogOpen && <ConfirmationDialog dialogId="clear-request-updates" title="Clear all request updates?" description="This will remove all accepted and declined request updates from your view. It won't change the underlying requests or affect the other person." confirmLabel="Clear all" pendingLabel="Clearingâ€¦" pendingAnnouncement="Clearing request updates." icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5" strokeLinecap="round" strokeLinejoin="round" /></svg>} error={clearAllError} isPending={isClearingAll} returnFocusRef={clearAllButtonRef} onCancel={() => { if (!isClearingAll) setIsClearAllDialogOpen(false); }} onConfirm={() => void clearAllUpdates()} />}</AnimatePresence>
      <header className="shrink-0 px-5 pb-4 pt-6 sm:px-6 sm:pt-7 md:px-5 lg:px-6">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h1 className="text-2xl font-bold tracking-tight text-heading">Requests</h1><p className="mt-2 text-sm leading-6 text-body">Review introductions and updates to requests you sent.</p></div><span className="inline-flex min-w-8 shrink-0 items-center justify-center rounded-full bg-accent px-2.5 py-1.5 text-xs font-bold text-primary" aria-label={`${pendingCount} pending incoming message ${pendingCount === 1 ? "request" : "requests"}`}>{pendingCount}</span></div>
        <button type="button" onClick={onRefresh} disabled={isResponding || isLoading} className="mt-4 inline-flex min-h-10 items-center justify-center rounded-2xl border border-border bg-background px-4 py-2 text-sm font-semibold text-heading transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-50">Refresh</button>
      </header>

      {responseError && <div role="alert" className="mx-4 mb-3 rounded-2xl border border-primary/25 bg-accent px-4 py-3 text-sm leading-6 text-body sm:mx-5">{responseError}</div>}
      {statusMessage && <p role="status" aria-live="polite" className="mx-4 mb-3 rounded-2xl border border-online/40 bg-background px-4 py-3 text-sm text-body sm:mx-5">{statusMessage}</p>}

      <div aria-busy={isLoading} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-20 sm:px-4">
        {isLoading ? (
          <div role="status" aria-live="polite" aria-label="Loading conversation requests and updates" className="space-y-3 pt-2">{[0, 1, 2].map((item) => <div key={item} className="rounded-3xl border border-border bg-background p-4"><div className="flex items-center gap-3"><div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-accent" /><div className="min-w-0 flex-1 space-y-2"><div className="h-4 w-2/5 animate-pulse rounded-full bg-accent" /><div className="h-3 w-2/3 animate-pulse rounded-full bg-accent" /></div></div><div className="mt-4 h-12 animate-pulse rounded-2xl bg-accent" /></div>)}</div>
        ) : loadError ? (
          <div role="alert" className="px-4 py-10 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-xl font-bold text-primary" aria-hidden="true">!</div><h2 className="mt-4 font-semibold text-heading">Unable to load requests</h2><p className="mt-2 text-sm leading-6 text-body">{loadError}</p><button type="button" onClick={onRefresh} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Retry</button></div>
        ) : isEmpty ? (
          <div className="px-4 py-10 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-primary" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6"><path d="M5 12.5 9.5 17 19 7.5" strokeLinecap="round" strokeLinejoin="round" /></svg></div><h2 className="mt-4 font-semibold text-heading">Nothing new yet</h2><p className="mt-2 text-sm leading-6 text-body">New conversation requests and updates will appear here.</p></div>
        ) : (
          <div className="space-y-6">
            {requests.length > 0 && <section aria-labelledby="incoming-requests-heading"><h2 id="incoming-requests-heading" className="px-2 pb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">Incoming Requests</h2><div className="space-y-3">{requests.map((request) => { const senderName = getProfileDisplayName(request.senderProfile); const isCurrentRequest = respondingRequestId === request.id; return <article key={request.id} className="rounded-3xl border border-border bg-background p-4 shadow-soft"><div className="flex min-w-0 items-center gap-3"><ProfileAvatar profile={request.senderProfile} size="sm" /><div className="min-w-0 flex-1"><h3 className="truncate font-semibold text-heading">{senderName}</h3><p className="truncate text-sm text-body">{request.senderProfile.username ? `@${request.senderProfile.username}` : "Nemissive member"}</p></div><time dateTime={request.created_at} className="max-w-20 shrink-0 text-right text-xs leading-5 text-muted">{formatRequestTime(request.created_at)}</time></div><div className="mt-4 rounded-2xl border border-border bg-surface px-4 py-3"><p className="whitespace-pre-wrap break-words text-sm leading-6 text-body">{request.introduction}</p></div><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => onRespond(request, "decline")} disabled={isResponding} aria-label={`Decline request from ${senderName}`} className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-border bg-surface px-3 py-2.5 text-sm font-semibold text-heading transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-50">{isCurrentRequest && respondingAction === "decline" ? "Declining..." : "Decline"}</button><button type="button" onClick={() => onRespond(request, "accept")} disabled={isResponding} aria-label={`Accept request from ${senderName}`} className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary px-3 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-60">{isCurrentRequest && respondingAction === "accept" ? "Accepting..." : "Accept"}</button></div></article>; })}</div></section>}

            {updates.length > 0 && <section aria-labelledby="request-updates-heading"><div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-3"><h2 id="request-updates-heading" className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Request Updates</h2><button ref={clearAllButtonRef} type="button" onClick={() => { setClearAllError(""); setIsClearAllDialogOpen(true); }} disabled={isClearingAll} className="min-h-9 rounded-xl px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-wait disabled:opacity-60">Clear all</button></div><div className="space-y-3">{updates.map((update) => { const recipientName = getProfileDisplayName(update.recipientProfile); const isAccepted = update.status === "accepted"; return <article key={update.id} className="rounded-3xl border border-border bg-background p-4 shadow-soft"><div className="flex min-w-0 items-center gap-3"><ProfileAvatar profile={update.recipientProfile} size="sm" /><div className="min-w-0 flex-1"><h3 className="truncate font-semibold text-heading">{recipientName}</h3><p className="truncate text-sm text-body">{update.recipientProfile.username ? `@${update.recipientProfile.username}` : "Nemissive member"}</p></div><div className="flex shrink-0 items-start gap-1"><time dateTime={update.updated_at} className="max-w-20 pt-1 text-right text-xs leading-5 text-muted">{formatRequestTime(update.updated_at)}</time><RequestUpdateMenu participantName={recipientName} onDelete={() => dismissUpdate(update.id)} /></div></div><div className="mt-4 rounded-2xl bg-surface px-4 py-3"><p className="text-sm font-semibold text-heading">{isAccepted ? "Accepted your conversation request" : "Declined your conversation request"}</p><p className="mt-1 text-sm leading-6 text-body">{isAccepted ? "You can now chat with each other." : "You can search for them again later."}</p></div>{isAccepted && update.conversation_id && <button type="button" onClick={() => onConversationReady({ id: update.conversation_id as string, otherProfile: update.recipientProfile })} aria-label={`Open conversation with ${recipientName}`} className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Open conversation</button>}</article>; })}</div></section>}
          </div>
        )}
      </div>
    </div>
  );
}

export default RequestsSidebarContent;
