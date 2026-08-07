import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";
import type { AcceptedConversationItem, PendingOutgoingRequest } from "../../types/conversations";
import ConversationPinMenu from "./ConversationPinMenu";
import PresenceAvatar from "./PresenceAvatar";
import ProfileAvatar from "./ProfileAvatar";
import { getProfileDisplayName } from "./profileUtils";

type ConversationListProps = {
  pendingRequests: PendingOutgoingRequest[];
  conversations: AcceptedConversationItem[];
  searchQuery: string;
  selectedConversationId: string | null;
  isLoading: boolean;
  loadError: string;
  onlineUserIds: ReadonlySet<string>;
  isArchivedView?: boolean;
  hasArchivedConversations?: boolean;
  onRefresh: () => void;
  onStartConversation: () => void;
  onPendingRequestSelected: (request: PendingOutgoingRequest) => void;
  onConversationSelected: (conversation: AcceptedConversationItem) => void;
  onConversationPinned: (conversationId: string, pinned: boolean) => Promise<string | null>;
  onConversationArchived: (conversationId: string, archived: boolean) => Promise<string | null>;
  onConversationDeleted: (conversationId: string) => Promise<string | null>;
};

function formatSidebarTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
  if (date.getFullYear() === now.getFullYear()) return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function LoadingRows() {
  return <div role="status" aria-live="polite" aria-label="Loading messages" className="space-y-2 px-1">{[0, 1, 2, 3].map((item) => <div key={item} className="flex items-center gap-3 rounded-2xl p-3"><div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-accent" /><div className="min-w-0 flex-1 space-y-2"><div className="h-4 w-2/5 animate-pulse rounded-full bg-accent" /><div className="h-3 w-4/5 animate-pulse rounded-full bg-accent" /></div><div className="h-3 w-10 animate-pulse rounded-full bg-accent" /></div>)}</div>;
}

function PinIndicator() {
  return <span className="inline-flex shrink-0 text-primary" title="Pinned conversation"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5" aria-hidden="true"><path d="m9 4 6 0-.5 5 3 3v1H13v6l-1 2-1-2v-6H6.5v-1l3-3L9 4Z" strokeLinecap="round" strokeLinejoin="round" /></svg><span className="sr-only">Pinned</span></span>;
}

function ConversationList({ pendingRequests, conversations, searchQuery, selectedConversationId, isLoading, loadError, onlineUserIds, isArchivedView = false, hasArchivedConversations = false, onRefresh, onStartConversation, onPendingRequestSelected, onConversationSelected, onConversationPinned, onConversationArchived, onConversationDeleted }: ConversationListProps) {
  const shouldReduceMotion = useReducedMotion();
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const transition = shouldReduceMotion ? { duration: 0 } : { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const };
  const filteredPendingRequests = useMemo(() => pendingRequests.filter((request) => {
    if (!normalizedQuery) return true;
    const name = getProfileDisplayName(request.otherProfile).toLocaleLowerCase();
    return name.includes(normalizedQuery) || request.otherProfile.username?.toLocaleLowerCase().includes(normalizedQuery) || request.introduction.toLocaleLowerCase().includes(normalizedQuery);
  }), [normalizedQuery, pendingRequests]);
  const filteredConversations = useMemo(() => conversations.filter((conversation) => {
    if (!normalizedQuery) return true;
    const name = getProfileDisplayName(conversation.otherProfile).toLocaleLowerCase();
    return name.includes(normalizedQuery) || conversation.otherProfile.username?.toLocaleLowerCase().includes(normalizedQuery) || conversation.latestMessage?.toLocaleLowerCase().includes(normalizedQuery);
  }), [conversations, normalizedQuery]);
  const hasAnyItems = pendingRequests.length > 0 || conversations.length > 0;
  const hasFilteredItems = filteredPendingRequests.length > 0 || filteredConversations.length > 0;

  return (
    <div aria-busy={isLoading} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-4 sm:px-4">
      {isLoading ? (
        <LoadingRows />
      ) : loadError ? (
        <div role="alert" className="px-4 py-10 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-xl font-bold text-primary" aria-hidden="true">!</div><h2 className="mt-4 font-semibold text-heading">Unable to load messages</h2><p className="mt-2 text-sm leading-6 text-body">{loadError}</p><button type="button" onClick={onRefresh} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Retry</button></div>
      ) : !hasAnyItems ? (
        isArchivedView ? <div className="mx-1 rounded-3xl border border-border bg-background px-5 py-9 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-primary" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7"><path d="M5 8.5h14v10H5v-10Z" strokeLinejoin="round" /><path d="M4 5h16v3.5H4V5Zm5 7h6" strokeLinecap="round" strokeLinejoin="round" /></svg></div><h2 className="mt-4 font-semibold text-heading">No archived conversations</h2><p className="mt-2 text-sm leading-6 text-body">Conversations you archive will appear here.</p></div> : <div className="mx-1 rounded-3xl border border-border bg-background px-5 py-9 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-primary" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7"><path d="M4 5.5h16v11H8l-4 3v-14Z" strokeLinejoin="round" /><path d="M8 10h8M8 13h5" strokeLinecap="round" /></svg></div><h2 className="mt-4 font-semibold text-heading">{hasArchivedConversations ? "No conversations in your inbox" : "Your conversations will appear here."}</h2><p className="mt-2 text-sm leading-6 text-body">{hasArchivedConversations ? "Archived conversations remain available from the Archived view." : "Start with one thoughtful introduction."}</p><button type="button" onClick={onStartConversation} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Start Conversation</button></div>
      ) : !hasFilteredItems ? (
        <div className="px-4 py-10 text-center"><h2 className="font-semibold text-heading">No matching messages</h2><p className="mt-2 text-sm leading-6 text-body">Try another name, username, or message.</p></div>
      ) : (
        <div className="space-y-5">
          <AnimatePresence initial>
            {filteredPendingRequests.length > 0 && (
              <motion.section key="pending" initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: shouldReduceMotion ? 0 : -4 }} transition={transition} aria-labelledby="pending-messages-heading">
                <h2 id="pending-messages-heading" className="px-2 pb-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted">Pending</h2>
                <div className="space-y-1">{filteredPendingRequests.map((request) => { const name = getProfileDisplayName(request.otherProfile); return <motion.button layout={!shouldReduceMotion} key={request.requestId} type="button" onClick={() => onPendingRequestSelected(request)} aria-label={`Open pending request to ${name}`} className="flex w-full min-w-0 items-center gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover"><ProfileAvatar profile={request.otherProfile} /><div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-2"><p className="truncate font-semibold text-heading">{name}</p><span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">Pending</span></div><p className="mt-0.5 truncate text-sm font-medium text-body">Waiting for acceptance</p><p className="mt-0.5 truncate text-xs text-muted">{request.introduction}</p></div><time dateTime={request.createdAt} className="max-w-16 shrink-0 self-start pt-1 text-right text-xs leading-5 text-muted">{formatSidebarTime(request.createdAt)}</time></motion.button>; })}</div>
              </motion.section>
            )}

            {filteredConversations.length > 0 && (
              <motion.section key="conversations" initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: shouldReduceMotion ? 0 : -4 }} transition={transition} aria-labelledby="accepted-conversations-heading">
                <h2 id="accepted-conversations-heading" className="px-2 pb-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted">{isArchivedView ? "Archived conversations" : "Conversations"}</h2>
                <div className="space-y-1">{filteredConversations.map((conversation) => { const name = getProfileDisplayName(conversation.otherProfile); const isSelected = selectedConversationId === conversation.conversationId; const isOnline = onlineUserIds.has(conversation.otherProfile.id); const isArchived = Boolean(conversation.archivedAt); const preview = conversation.latestMessageIsDeleted ? "Message deleted" : conversation.latestMessage ? `${conversation.latestMessageSentByCurrentUser ? "You: " : ""}${conversation.latestMessage}` : "Conversation ready"; const timestamp = conversation.latestMessageAt ?? conversation.updatedAt; const unreadDescription = conversation.unreadCount > 0 ? `, ${conversation.unreadCount} unread ${conversation.unreadCount === 1 ? "message" : "messages"}` : ""; const onlineDescription = isOnline ? ", online" : ""; const pinnedDescription = conversation.isPinned ? ", pinned" : ""; const archivedDescription = isArchived ? ", archived" : ""; return <motion.div layout={!shouldReduceMotion} key={conversation.conversationId} className={`flex min-w-0 items-center rounded-2xl transition-colors ${isSelected ? "bg-accent shadow-soft" : "hover:bg-accent"}`}><button type="button" onClick={() => onConversationSelected(conversation)} aria-current={isSelected ? "true" : undefined} aria-label={`Open conversation with ${name}${archivedDescription}${pinnedDescription}${onlineDescription}${unreadDescription}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-3 text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover"><PresenceAvatar profile={conversation.otherProfile} isOnline={isOnline} /><div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-1.5"><p className="truncate font-semibold text-heading">{name}</p>{conversation.isPinned && <PinIndicator />}{isArchived && <span className="shrink-0 rounded-full bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">Archived</span>}</div><p className="mt-1 truncate text-sm text-body">{preview}</p></div><div className="flex max-w-16 shrink-0 flex-col items-end gap-2 self-start pt-1"><time dateTime={timestamp} className="truncate text-right text-xs leading-5 text-muted">{formatSidebarTime(timestamp)}</time>{conversation.unreadCount > 0 && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-white"><span aria-hidden="true">{conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}</span><span className="sr-only">{conversation.unreadCount} unread {conversation.unreadCount === 1 ? "message" : "messages"}</span></span>}</div></button><div className="shrink-0 pr-2"><ConversationPinMenu conversationName={name} isPinned={conversation.isPinned} isArchived={isArchived} onPinnedChange={(pinned) => onConversationPinned(conversation.conversationId, pinned)} onArchivedChange={(archived) => onConversationArchived(conversation.conversationId, archived)} onDelete={() => onConversationDeleted(conversation.conversationId)} /></div></motion.div>; })}</div>
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

export default ConversationList;
