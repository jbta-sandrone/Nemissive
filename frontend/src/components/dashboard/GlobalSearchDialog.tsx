import { useCallback, useEffect, useMemo, useRef, useState, type RefObject, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { supabase } from "../../lib/supabase";
import type { AcceptedConversationItem, MessageSearchResult, PendingOutgoingRequest, ProfileSearchResult, SelectedConversation } from "../../types/conversations";
import type { ConversationRequestItem } from "./useMessageRequests";
import ProfileAvatar from "./ProfileAvatar";
import { getProfileDisplayName } from "./profileUtils";

type SearchTab = "all" | "conversations" | "messages";
type DatePreset = "any" | "today" | "week" | "month";

type MessageSearchRow = {
  message_id: string;
  conversation_id: string;
  sender_id: string;
  sender_display_name: string | null;
  sender_username: string | null;
  sender_avatar_url: string | null;
  other_user_id: string;
  other_display_name: string | null;
  other_username: string | null;
  other_avatar_url: string | null;
  message_type: "text" | "image";
  snippet: string;
  created_at: string;
  edited_at: string | null;
  attachment_count: number;
};

type LocalConversationResult =
  | { kind: "accepted"; id: string; profile: ProfileSearchResult; preview: string; timestamp: string; conversation: SelectedConversation }
  | { kind: "outgoing"; id: string; profile: ProfileSearchResult; preview: string; timestamp: string; request: PendingOutgoingRequest }
  | { kind: "incoming"; id: string; profile: ProfileSearchResult; preview: string; timestamp: string; request: ConversationRequestItem };

type GlobalSearchDialogProps = {
  currentProfile: ProfileSearchResult | null;
  conversations: AcceptedConversationItem[];
  outgoingRequests: PendingOutgoingRequest[];
  incomingRequests: ConversationRequestItem[];
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onConversationSelected: (conversation: SelectedConversation) => void;
  onOutgoingRequestSelected: (request: PendingOutgoingRequest) => void;
  onIncomingRequestSelected: () => void;
  onMessageSelected: (result: MessageSearchResult) => void;
};

const pageSize = 30;
const searchDebounceMs = 300;
const recentSearchesKey = "nemissive:recent-searches";
const recentSearchLimit = 6;

function mapSearchRow(row: MessageSearchRow): MessageSearchResult {
  return {
    messageId: row.message_id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    senderProfile: { id: row.sender_id, display_name: row.sender_display_name, username: row.sender_username, avatar_url: row.sender_avatar_url },
    otherProfile: { id: row.other_user_id, display_name: row.other_display_name, username: row.other_username, avatar_url: row.other_avatar_url },
    messageType: row.message_type,
    snippet: row.snippet,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    attachmentCount: Number(row.attachment_count) || 0,
  };
}

function getDateRange(preset: DatePreset) {
  if (preset === "any") return { from: null, to: null };
  const now = new Date();
  const to = new Date(now);
  to.setDate(to.getDate() + 1);
  to.setHours(0, 0, 0, 0);
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  if (preset === "week") from.setDate(from.getDate() - from.getDay());
  if (preset === "month") from.setDate(1);
  return { from: from.toISOString(), to: to.toISOString() };
}

function formatResultTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: date.getFullYear() === now.getFullYear() ? undefined : "numeric" }).format(date);
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const terms = [...new Set(query.trim().split(/\s+/).map((term) => term.replace(/^["']+|["']+$/g, "")).filter(Boolean))];
  if (terms.length === 0) return <>{text}</>;
  const lowerText = text.toLocaleLowerCase();
  const loweredTerms = terms.map((term) => ({ original: term, lowered: term.toLocaleLowerCase() }));
  const nodes: ReactNode[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const nextMatch = loweredTerms.map((term) => ({ ...term, index: lowerText.indexOf(term.lowered, cursor) })).filter((match) => match.index >= 0).sort((first, second) => first.index - second.index || second.original.length - first.original.length)[0];
    if (!nextMatch) break;
    const matchIndex = nextMatch.index;
    if (matchIndex > cursor) nodes.push(text.slice(cursor, matchIndex));
    nodes.push(<mark key={`${matchIndex}-${cursor}`} className="rounded bg-accent px-0.5 text-heading">{text.slice(matchIndex, matchIndex + nextMatch.original.length)}</mark>);
    cursor = matchIndex + nextMatch.original.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return <>{nodes.length > 0 ? nodes : text}</>;
}

function readRecentSearches() {
  try {
    const value = JSON.parse(window.localStorage.getItem(recentSearchesKey) ?? "[]") as unknown;
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length >= 2).slice(0, recentSearchLimit) : [];
  } catch {
    return [];
  }
}

function GlobalSearchDialog({ currentProfile, conversations, outgoingRequests, incomingRequests, returnFocusRef, onClose, onConversationSelected, onOutgoingRequestSelected, onIncomingRequestSelected, onMessageSelected }: GlobalSearchDialogProps) {
  const shouldReduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestSequenceRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isPageRequestInFlightRef = useRef(false);
  const messageResultsRef = useRef<MessageSearchResult[]>([]);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<SearchTab>("all");
  const [senderFilter, setSenderFilter] = useState("");
  const [imageOnly, setImageOnly] = useState(false);
  const [datePreset, setDatePreset] = useState<DatePreset>("any");
  const [messageResults, setMessageResults] = useState<MessageSearchResult[]>([]);
  const [isMessageLoading, setIsMessageLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [messageError, setMessageError] = useState("");
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(readRecentSearches);
  const normalizedQuery = query.trim();
  const canSearchMessages = normalizedQuery.length >= 2 || (imageOnly && normalizedQuery.length === 0);
  const showsConversations = tab !== "messages";
  const showsMessages = tab !== "conversations";

  const localConversationResults = useMemo<LocalConversationResult[]>(() => {
    const accepted = conversations.map((conversation): LocalConversationResult => ({ kind: "accepted", id: conversation.conversationId, profile: conversation.otherProfile, preview: conversation.latestMessageIsDeleted ? "Message deleted" : conversation.latestMessage ?? "Conversation ready", timestamp: conversation.latestMessageAt ?? conversation.updatedAt, conversation: { id: conversation.conversationId, otherProfile: conversation.otherProfile } }));
    const outgoing = outgoingRequests.map((request): LocalConversationResult => ({ kind: "outgoing", id: request.requestId, profile: request.otherProfile, preview: request.introduction, timestamp: request.createdAt, request }));
    const incoming = incomingRequests.map((request): LocalConversationResult => ({ kind: "incoming", id: request.id, profile: request.senderProfile, preview: request.introduction, timestamp: request.created_at, request }));
    const allResults = [...accepted, ...outgoing, ...incoming];
    if (!normalizedQuery) return allResults.slice(0, 8);
    const loweredQuery = normalizedQuery.toLocaleLowerCase();
    return allResults.filter((result) => getProfileDisplayName(result.profile).toLocaleLowerCase().includes(loweredQuery) || result.profile.username?.toLocaleLowerCase().includes(loweredQuery) || result.preview.toLocaleLowerCase().includes(loweredQuery));
  }, [conversations, incomingRequests, normalizedQuery, outgoingRequests]);

  const senderOptions = useMemo(() => {
    const profiles = [currentProfile, ...conversations.map((conversation) => conversation.otherProfile)].filter((profile): profile is ProfileSearchResult => Boolean(profile));
    return [...new Map(profiles.map((profile) => [profile.id, profile])).values()].sort((first, second) => getProfileDisplayName(first).localeCompare(getProfileDisplayName(second), undefined, { sensitivity: "base" }));
  }, [conversations, currentProfile]);

  const saveRecentSearch = useCallback((value: string) => {
    const normalized = value.trim();
    if (normalized.length < 2) return;
    setRecentSearches((current) => {
      const next = [normalized, ...current.filter((item) => item.toLocaleLowerCase() !== normalized.toLocaleLowerCase())].slice(0, recentSearchLimit);
      try { window.localStorage.setItem(recentSearchesKey, JSON.stringify(next)); } catch { /* Local search history is optional. */ }
      return next;
    });
  }, []);

  const runMessageSearch = useCallback(async (append: boolean) => {
    if (!showsMessages || !canSearchMessages) {
      setMessageResults([]);
      setHasMoreMessages(false);
      setMessageError("");
      return;
    }

    if (append && isPageRequestInFlightRef.current) return;

    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const requestSequence = ++requestSequenceRef.current;
    isPageRequestInFlightRef.current = true;
    const cursor = append ? messageResultsRef.current.at(-1) : null;
    if (append) setIsLoadingMore(true); else setIsMessageLoading(true);
    setMessageError("");
    const range = getDateRange(datePreset);
    const { data, error } = await supabase.rpc("search_messages", { search_text: normalizedQuery, page_size: pageSize, cursor_created_at: cursor?.createdAt ?? null, cursor_message_id: cursor?.messageId ?? null, sender_filter: senderFilter || null, image_only: imageOnly, date_from: range.from, date_to: range.to }).abortSignal(abortController.signal);
    if (requestSequence !== requestSequenceRef.current || abortController.signal.aborted) return;
    isPageRequestInFlightRef.current = false;
    setIsMessageLoading(false);
    setIsLoadingMore(false);
    if (error) {
      setMessageError(!navigator.onLine ? "You appear to be offline. Reconnect and try again." : error.code === "42501" ? "Your session has expired. Please sign in again." : "Messages couldn’t be searched. Please try again.");
      if (import.meta.env.DEV) console.warn("Message search failed", { code: error.code });
      return;
    }
    const nextResults = ((data ?? []) as MessageSearchRow[]).map(mapSearchRow);
    setMessageResults((current) => {
      const next = append ? [...new Map([...current, ...nextResults].map((result) => [result.messageId, result])).values()] : nextResults;
      messageResultsRef.current = next;
      return next;
    });
    setHasMoreMessages(nextResults.length === pageSize);
    saveRecentSearch(normalizedQuery);
  }, [canSearchMessages, datePreset, imageOnly, normalizedQuery, saveRecentSearch, senderFilter, showsMessages]);

  useEffect(() => {
    abortControllerRef.current?.abort();
    isPageRequestInFlightRef.current = false;
    const timer = window.setTimeout(() => {
      messageResultsRef.current = [];
      setMessageResults([]);
      setHasMoreMessages(false);
      if (!showsMessages || !canSearchMessages) {
        setIsMessageLoading(false);
        setMessageError("");
        return;
      }
      void runMessageSearch(false);
    }, showsMessages && canSearchMessages ? searchDebounceMs : 0);
    return () => window.clearTimeout(timer);
  }, [canSearchMessages, datePreset, imageOnly, normalizedQuery, runMessageSearch, senderFilter, showsMessages]);

  useEffect(() => () => abortControllerRef.current?.abort(), []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const returnFocusElement = returnFocusRef.current;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => inputRef.current?.focus());
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])")];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() => returnFocusElement?.focus());
    };
  }, [onClose, returnFocusRef]);

  function selectConversation(result: LocalConversationResult) {
    saveRecentSearch(normalizedQuery);
    if (result.kind === "accepted") onConversationSelected(result.conversation);
    else if (result.kind === "outgoing") onOutgoingRequestSelected(result.request);
    else onIncomingRequestSelected();
    onClose();
  }

  function clearRecentSearches() {
    try { window.localStorage.removeItem(recentSearchesKey); } catch { /* Local search history is optional. */ }
    setRecentSearches([]);
  }

  const hasConversationResults = localConversationResults.length > 0;
  const hasMessageResults = messageResults.length > 0;
  const showCombinedEmpty = normalizedQuery.length > 0 && !isMessageLoading && !messageError && showsConversations && showsMessages && !hasConversationResults && !hasMessageResults;

  return createPortal(
    <motion.div initial={shouldReduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: shouldReduceMotion ? 0 : 0.18 }} className="fixed inset-0 z-[100] flex items-stretch justify-center bg-heading/20 md:items-center md:p-5" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <motion.div ref={panelRef} initial={shouldReduceMotion ? false : { opacity: 0, y: 12, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.99 }} transition={{ duration: shouldReduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }} role="dialog" aria-modal="true" aria-labelledby="global-search-title" className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-background md:h-auto md:max-h-[min(760px,calc(100vh-2.5rem))] md:max-w-3xl md:rounded-3xl md:border md:border-border md:shadow-soft">
        <header className="shrink-0 border-b border-border bg-surface px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 md:pt-5"><div className="flex items-center justify-between gap-3"><div><h1 id="global-search-title" className="text-xl font-bold text-heading">Search Nemissive</h1><p className="mt-1 text-sm text-body">Find conversations and messages you can access.</p></div><button type="button" onClick={onClose} aria-label="Close search" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" strokeLinecap="round" /></svg></button></div><label htmlFor="global-search-input" className="sr-only">Search conversations and messages</label><div className="mt-4 flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-background px-4 focus-within:border-primary focus-within:ring-4 focus-within:ring-accent-hover"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 shrink-0 text-muted" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" strokeLinecap="round" /></svg><input ref={inputRef} id="global-search-input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations and messages..." maxLength={200} className="min-w-0 flex-1 bg-transparent py-3.5 text-sm text-heading outline-none placeholder:text-muted" /><kbd className="hidden rounded-lg border border-border bg-surface px-2 py-1 text-[10px] font-semibold text-muted sm:inline">⌘/Ctrl K</kbd></div></header>

        <div className="shrink-0 border-b border-border bg-surface px-4 py-3 sm:px-6"><div role="tablist" aria-label="Search categories" className="flex gap-1 overflow-x-auto rounded-2xl bg-background p-1">{(["all", "conversations", "messages"] as SearchTab[]).map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`min-h-10 flex-1 rounded-xl px-3 py-2 text-sm font-semibold capitalize transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 ${tab === item ? "bg-primary text-white shadow-soft" : "text-body hover:bg-accent hover:text-heading"}`}>{item}</button>)}</div>{showsMessages && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"><label className="min-w-0"><span className="sr-only">Filter messages by sender</span><select value={senderFilter} onChange={(event) => setSenderFilter(event.target.value)} className="min-h-11 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-sm text-heading outline-none focus:ring-2 focus:ring-primary/20"><option value="">From anyone</option>{senderOptions.map((profile) => <option key={profile.id} value={profile.id}>{profile.id === currentProfile?.id ? "You" : getProfileDisplayName(profile)}</option>)}</select></label><label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-medium text-body"><input type="checkbox" checked={imageOnly} onChange={(event) => setImageOnly(event.target.checked)} className="h-4 w-4 accent-primary" />Has image</label><label className="col-span-2 min-w-0 sm:col-span-1"><span className="sr-only">Filter messages by date</span><select value={datePreset} onChange={(event) => setDatePreset(event.target.value as DatePreset)} className="min-h-11 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-sm text-heading outline-none focus:ring-2 focus:ring-primary/20"><option value="any">Any time</option><option value="today">Today</option><option value="week">This week</option><option value="month">This month</option></select></label></div>}</div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6" aria-busy={isMessageLoading || isLoadingMore}>
          {!normalizedQuery && recentSearches.length > 0 && <section className="mb-6" aria-labelledby="recent-searches-title"><div className="flex items-center justify-between gap-3"><h2 id="recent-searches-title" className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Recent searches</h2><button type="button" onClick={clearRecentSearches} className="min-h-9 rounded-xl px-3 text-xs font-semibold text-primary transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">Clear</button></div><div className="mt-2 flex flex-wrap gap-2">{recentSearches.map((item) => <button key={item} type="button" onClick={() => setQuery(item)} className="max-w-full truncate rounded-full border border-border bg-surface px-3 py-2 text-sm text-body transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">{item}</button>)}</div></section>}

          {showsConversations && <section aria-labelledby="conversation-search-results"><h2 id="conversation-search-results" className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{normalizedQuery ? "Conversations" : "Suggested conversations"}</h2>{hasConversationResults ? <div className="mt-2 space-y-1">{localConversationResults.map((result) => { const name = getProfileDisplayName(result.profile); const status = result.kind === "accepted" ? "Accepted" : result.kind === "outgoing" ? "Pending" : "Incoming request"; return <button key={`${result.kind}:${result.id}`} type="button" onClick={() => selectConversation(result)} aria-label={`Open ${status.toLowerCase()} conversation with ${name}`} className="flex w-full min-w-0 items-center gap-3 rounded-2xl p-3 text-left transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover"><ProfileAvatar profile={result.profile} size="sm" /><div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-2"><p className="truncate font-semibold text-heading">{name}</p><span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">{status}</span></div><p className="mt-1 truncate text-sm text-body"><HighlightedText text={result.preview} query={normalizedQuery} /></p></div><time dateTime={result.timestamp} className="max-w-16 shrink-0 text-right text-xs text-muted">{formatResultTime(result.timestamp)}</time></button>; })}</div> : normalizedQuery && <p className="mt-3 rounded-2xl bg-surface px-4 py-5 text-sm text-body">No conversation matches.</p>}</section>}

          {showsMessages && <section className={showsConversations ? "mt-6" : ""} aria-labelledby="message-search-results"><h2 id="message-search-results" className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Messages</h2>{!canSearchMessages ? <p className="mt-3 rounded-2xl bg-surface px-4 py-5 text-sm leading-6 text-body">Enter at least two characters to search messages, or turn on “Has image” to browse image messages.</p> : isMessageLoading ? <div role="status" aria-live="polite" aria-label="Searching messages" className="mt-3 space-y-2">{[0, 1, 2].map((item) => <div key={item} className="rounded-2xl bg-surface p-4"><div className="h-4 w-1/3 animate-pulse rounded-full bg-accent" /><div className="mt-3 h-3 w-4/5 animate-pulse rounded-full bg-accent" /></div>)}</div> : messageError ? <div role="alert" className="mt-3 rounded-2xl border border-primary/25 bg-accent p-4"><p className="text-sm leading-6 text-body">{messageError}</p><button type="button" onClick={() => void runMessageSearch(false)} className="mt-3 min-h-10 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Retry</button></div> : hasMessageResults ? <div className="mt-2 space-y-1">{messageResults.map((result) => { const senderName = result.senderId === currentProfile?.id ? "You" : getProfileDisplayName(result.senderProfile); const conversationName = getProfileDisplayName(result.otherProfile); const imageLabel = result.messageType === "image" ? `${result.attachmentCount === 1 ? "Photo" : `${result.attachmentCount} photos`}${result.snippet && !["Photo", "Photos"].includes(result.snippet) ? " with caption" : ""}` : null; return <button key={result.messageId} type="button" onClick={() => { saveRecentSearch(normalizedQuery); onMessageSelected(result); onClose(); }} aria-label={`Open message from ${senderName} in conversation with ${conversationName}`} className="w-full min-w-0 rounded-2xl p-3 text-left transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover"><div className="flex min-w-0 items-center justify-between gap-3"><p className="truncate text-sm font-semibold text-heading">{senderName} <span className="font-normal text-muted">in {conversationName}</span></p><time dateTime={result.createdAt} className="shrink-0 text-xs text-muted">{formatResultTime(result.createdAt)}</time></div>{imageLabel && <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-primary">{imageLabel}</p>}<p className="mt-1 line-clamp-2 break-words text-sm leading-6 text-body"><HighlightedText text={result.snippet} query={normalizedQuery} /></p></button>; })}{hasMoreMessages && <button type="button" onClick={() => void runMessageSearch(true)} disabled={isLoadingMore} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-heading transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-wait disabled:opacity-60">{isLoadingMore ? "Loading…" : "Load more"}</button>}</div> : <p className="mt-3 rounded-2xl bg-surface px-4 py-5 text-sm text-body">No message matches.</p>}</section>}
          {showCombinedEmpty && <p className="mt-6 text-center text-sm text-muted">Try a different name, message, sender, or date range.</p>}
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

export default GlobalSearchDialog;
