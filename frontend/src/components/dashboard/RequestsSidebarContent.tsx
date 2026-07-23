import type { SelectedConversation } from "../../types/conversations";
import type { ConversationRequestItem, RequestAction, RequestUpdateItem } from "./useMessageRequests";
import ProfileAvatar from "./ProfileAvatar";
import { getProfileDisplayName } from "./profileUtils";

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
  onConversationReady: (conversation: SelectedConversation) => void;
};

function formatRequestTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function RequestsSidebarContent({ requests, updates, pendingCount, isLoading, loadError, responseError, statusMessage, respondingRequestId, respondingAction, onRefresh, onRespond, onConversationReady }: RequestsSidebarContentProps) {
  const isResponding = Boolean(respondingRequestId);
  const isEmpty = requests.length === 0 && updates.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 px-5 pb-4 pt-6 sm:px-6 sm:pt-7 md:px-5 lg:px-6">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h1 className="text-2xl font-bold tracking-tight text-heading">Requests</h1><p className="mt-2 text-sm leading-6 text-body">Review introductions and updates to requests you sent.</p></div><span className="inline-flex min-w-8 shrink-0 items-center justify-center rounded-full bg-accent px-2.5 py-1.5 text-xs font-bold text-primary" aria-label={`${pendingCount} pending incoming message ${pendingCount === 1 ? "request" : "requests"}`}>{pendingCount}</span></div>
        <button type="button" onClick={onRefresh} disabled={isResponding || isLoading} className="mt-4 inline-flex min-h-10 items-center justify-center rounded-2xl border border-border bg-background px-4 py-2 text-sm font-semibold text-heading transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-50">Refresh</button>
      </header>

      {responseError && <div role="alert" className="mx-4 mb-3 rounded-2xl border border-primary/25 bg-accent px-4 py-3 text-sm leading-6 text-body sm:mx-5">{responseError}</div>}
      {statusMessage && <p role="status" aria-live="polite" className="mx-4 mb-3 rounded-2xl border border-online/40 bg-background px-4 py-3 text-sm text-body sm:mx-5">{statusMessage}</p>}

      <div aria-busy={isLoading} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-4 sm:px-4">
        {isLoading ? (
          <div role="status" aria-live="polite" aria-label="Loading conversation requests and updates" className="space-y-3 pt-2">{[0, 1, 2].map((item) => <div key={item} className="rounded-3xl border border-border bg-background p-4"><div className="flex items-center gap-3"><div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-accent" /><div className="min-w-0 flex-1 space-y-2"><div className="h-4 w-2/5 animate-pulse rounded-full bg-accent" /><div className="h-3 w-2/3 animate-pulse rounded-full bg-accent" /></div></div><div className="mt-4 h-12 animate-pulse rounded-2xl bg-accent" /></div>)}</div>
        ) : loadError ? (
          <div role="alert" className="px-4 py-10 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-xl font-bold text-primary" aria-hidden="true">!</div><h2 className="mt-4 font-semibold text-heading">Unable to load requests</h2><p className="mt-2 text-sm leading-6 text-body">{loadError}</p><button type="button" onClick={onRefresh} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Retry</button></div>
        ) : isEmpty ? (
          <div className="px-4 py-10 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-primary" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6"><path d="M5 12.5 9.5 17 19 7.5" strokeLinecap="round" strokeLinejoin="round" /></svg></div><h2 className="mt-4 font-semibold text-heading">Nothing new yet</h2><p className="mt-2 text-sm leading-6 text-body">New conversation requests and updates will appear here.</p></div>
        ) : (
          <div className="space-y-6">
            {requests.length > 0 && <section aria-labelledby="incoming-requests-heading"><h2 id="incoming-requests-heading" className="px-2 pb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">Incoming Requests</h2><div className="space-y-3">{requests.map((request) => { const senderName = getProfileDisplayName(request.senderProfile); const isCurrentRequest = respondingRequestId === request.id; return <article key={request.id} className="rounded-3xl border border-border bg-background p-4 shadow-soft"><div className="flex min-w-0 items-center gap-3"><ProfileAvatar profile={request.senderProfile} size="sm" /><div className="min-w-0 flex-1"><h3 className="truncate font-semibold text-heading">{senderName}</h3><p className="truncate text-sm text-body">{request.senderProfile.username ? `@${request.senderProfile.username}` : "Nemissive member"}</p></div><time dateTime={request.created_at} className="max-w-20 shrink-0 text-right text-xs leading-5 text-muted">{formatRequestTime(request.created_at)}</time></div><div className="mt-4 rounded-2xl border border-border bg-surface px-4 py-3"><p className="whitespace-pre-wrap break-words text-sm leading-6 text-body">{request.introduction}</p></div><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => onRespond(request, "decline")} disabled={isResponding} aria-label={`Decline request from ${senderName}`} className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-border bg-surface px-3 py-2.5 text-sm font-semibold text-heading transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-50">{isCurrentRequest && respondingAction === "decline" ? "Declining..." : "Decline"}</button><button type="button" onClick={() => onRespond(request, "accept")} disabled={isResponding} aria-label={`Accept request from ${senderName}`} className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary px-3 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-60">{isCurrentRequest && respondingAction === "accept" ? "Accepting..." : "Accept"}</button></div></article>; })}</div></section>}

            {updates.length > 0 && <section aria-labelledby="request-updates-heading"><h2 id="request-updates-heading" className="px-2 pb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">Request Updates</h2><div className="space-y-3">{updates.map((update) => { const recipientName = getProfileDisplayName(update.recipientProfile); const isAccepted = update.status === "accepted"; return <article key={update.id} className="rounded-3xl border border-border bg-background p-4 shadow-soft"><div className="flex min-w-0 items-center gap-3"><ProfileAvatar profile={update.recipientProfile} size="sm" /><div className="min-w-0 flex-1"><h3 className="truncate font-semibold text-heading">{recipientName}</h3><p className="truncate text-sm text-body">{update.recipientProfile.username ? `@${update.recipientProfile.username}` : "Nemissive member"}</p></div><time dateTime={update.updated_at} className="max-w-20 shrink-0 text-right text-xs leading-5 text-muted">{formatRequestTime(update.updated_at)}</time></div><div className="mt-4 rounded-2xl bg-surface px-4 py-3"><p className="text-sm font-semibold text-heading">{isAccepted ? "Accepted your conversation request" : "Declined your conversation request"}</p><p className="mt-1 text-sm leading-6 text-body">{isAccepted ? "You can now chat with each other." : "You can search for them again later."}</p></div>{isAccepted && update.conversation_id && <button type="button" onClick={() => onConversationReady({ id: update.conversation_id as string, otherProfile: update.recipientProfile })} aria-label={`Open conversation with ${recipientName}`} className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Open conversation</button>}</article>; })}</div></section>}
          </div>
        )}
      </div>
    </div>
  );
}

export default RequestsSidebarContent;
