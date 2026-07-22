import type { ConversationRequestItem, RequestAction } from "./useMessageRequests";
import ProfileAvatar from "./ProfileAvatar";
import { getProfileDisplayName } from "./profileUtils";

type RequestsSidebarContentProps = {
  requests: ConversationRequestItem[];
  pendingCount: number;
  isLoading: boolean;
  loadError: string;
  responseError: string;
  statusMessage: string;
  respondingRequestId: string | null;
  respondingAction: RequestAction | null;
  onRefresh: () => void;
  onRespond: (request: ConversationRequestItem, action: RequestAction) => void;
};

function formatRequestTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function RequestsSidebarContent({ requests, pendingCount, isLoading, loadError, responseError, statusMessage, respondingRequestId, respondingAction, onRefresh, onRespond }: RequestsSidebarContentProps) {
  const isResponding = Boolean(respondingRequestId);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 px-5 pb-4 pt-6 sm:px-6 sm:pt-7 md:px-5 lg:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><h1 className="text-2xl font-bold tracking-tight text-heading">Requests</h1><p className="mt-2 text-sm leading-6 text-body">Preview introductions before deciding who can message you.</p></div>
          <span className="inline-flex min-w-8 shrink-0 items-center justify-center rounded-full bg-accent px-2.5 py-1.5 text-xs font-bold text-primary" aria-label={`${pendingCount} pending message ${pendingCount === 1 ? "request" : "requests"}`}>{pendingCount}</span>
        </div>
        <button type="button" onClick={onRefresh} disabled={isResponding || isLoading} className="mt-4 inline-flex min-h-10 items-center justify-center rounded-2xl border border-border bg-background px-4 py-2 text-sm font-semibold text-heading transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-50">Refresh</button>
      </header>

      {responseError && <div role="alert" className="mx-4 mb-3 rounded-2xl border border-primary/25 bg-accent px-4 py-3 text-sm leading-6 text-body sm:mx-5">{responseError}</div>}
      {statusMessage && <p role="status" aria-live="polite" className="mx-4 mb-3 rounded-2xl border border-online/40 bg-background px-4 py-3 text-sm text-body sm:mx-5">{statusMessage}</p>}

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-4 sm:px-4">
        {isLoading ? (
          <div role="status" aria-live="polite" aria-label="Loading message requests" className="space-y-3 pt-2">{[0, 1, 2].map((item) => <div key={item} className="rounded-3xl border border-border bg-background p-4"><div className="flex items-center gap-3"><div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-accent" /><div className="min-w-0 flex-1 space-y-2"><div className="h-4 w-2/5 animate-pulse rounded-full bg-accent" /><div className="h-3 w-1/3 animate-pulse rounded-full bg-accent" /></div></div><div className="mt-4 h-16 animate-pulse rounded-2xl bg-accent" /></div>)}</div>
        ) : loadError ? (
          <div role="alert" className="px-4 py-10 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-xl font-bold text-primary" aria-hidden="true">!</div><h2 className="mt-4 font-semibold text-heading">Unable to load requests</h2><p className="mt-2 text-sm leading-6 text-body">{loadError}</p><button type="button" onClick={onRefresh} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Retry</button></div>
        ) : requests.length === 0 ? (
          <div className="px-4 py-10 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-primary" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6"><path d="M5 12.5 9.5 17 19 7.5" strokeLinecap="round" strokeLinejoin="round" /></svg></div><h2 className="mt-4 font-semibold text-heading">No pending requests</h2><p className="mt-2 text-sm leading-6 text-body">New introductions will appear here when someone reaches out.</p></div>
        ) : (
          <div className="space-y-3">{requests.map((request) => { const senderName = getProfileDisplayName(request.senderProfile); const isCurrentRequest = respondingRequestId === request.id; return <article key={request.id} className="rounded-3xl border border-border bg-background p-4 shadow-soft"><div className="flex min-w-0 items-center gap-3"><ProfileAvatar profile={request.senderProfile} size="sm" /><div className="min-w-0 flex-1"><h2 className="truncate font-semibold text-heading">{senderName}</h2><p className="truncate text-sm text-body">{request.senderProfile.username ? `@${request.senderProfile.username}` : "Nemissive member"}</p></div><time dateTime={request.created_at} className="max-w-20 shrink-0 text-right text-xs leading-5 text-muted">{formatRequestTime(request.created_at)}</time></div><div className="mt-4 rounded-2xl border border-border bg-surface px-4 py-3"><p className="whitespace-pre-wrap break-words text-sm leading-6 text-body">{request.introduction}</p></div><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => onRespond(request, "decline")} disabled={isResponding} aria-label={`Decline request from ${senderName}`} className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-border bg-surface px-3 py-2.5 text-sm font-semibold text-heading transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-50">{isCurrentRequest && respondingAction === "decline" ? "Declining..." : "Decline"}</button><button type="button" onClick={() => onRespond(request, "accept")} disabled={isResponding} aria-label={`Accept request from ${senderName}`} className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary px-3 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-60">{isCurrentRequest && respondingAction === "accept" ? "Accepting..." : "Accept"}</button></div></article>; })}</div>
        )}
      </div>
    </div>
  );
}

export default RequestsSidebarContent;
