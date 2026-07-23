import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { supabase } from "../../lib/supabase";
import type { ChatMessage, DashboardChatState, DisplayChatMessage, OptimisticChatMessage, RealtimeChatMessageEvent, SelectedConversation } from "../../types/conversations";
import ProfileAvatar from "./ProfileAvatar";
import { getProfileDisplayName } from "./profileUtils";
import useConversationTyping from "./useConversationTyping";

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  source_request_id: string | null;
};

type ChatPanelProps = {
  chatState: DashboardChatState | null;
  currentUserId: string | null;
  isMobileVisible: boolean;
  realtimeRefreshKey: number;
  realtimeMessageEvents: RealtimeChatMessageEvent[];
  onMessageConfirmed: () => void;
  onStartConversation: () => void;
  onMobileBack: () => void;
};

const initialMessageLimit = 50;
const messageMaxLength = 2000;
const characterCountThreshold = 200;
const nearBottomThreshold = 140;
const comingSoonMessageDurationMs = 3000;

function mapMessageRow(row: MessageRow): ChatMessage {
  return {
    kind: "confirmed",
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
    isIntroduction: Boolean(row.source_request_id),
  };
}

function getMessageKey(message: DisplayChatMessage) {
  return message.kind === "confirmed" ? `confirmed:${message.id}` : `optimistic:${message.optimisticId}`;
}

function sortMessages(messages: DisplayChatMessage[]) {
  return [...messages].sort((first, second) => {
    const timestampDifference = Date.parse(first.createdAt) - Date.parse(second.createdAt);
    if (timestampDifference !== 0) return timestampDifference;
    return getMessageKey(first).localeCompare(getMessageKey(second));
  });
}

function reconcileConfirmedMessage(messages: DisplayChatMessage[], confirmedMessage: ChatMessage, optimisticId?: string) {
  const nextMessages = messages.filter((message) => {
    if (message.kind === "confirmed") return message.id !== confirmedMessage.id;
    return message.optimisticId !== optimisticId;
  });
  return sortMessages([...nextMessages, confirmedMessage]);
}

function createOptimisticId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatMessageTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
  if (date.toDateString() === now.toDateString()) return time;
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function MobileBackButton({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-label="Back to Messages" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover lg:hidden"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true"><path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg></button>;
}

function MediaIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><circle cx="9" cy="10" r="1.5" /><path d="m5.5 17 4.2-4.2 3.1 3 2.2-2.1 3.5 3.3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function EmojiIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M9 10h.01M15 10h.01M8.5 14.5c1 1.2 2.1 1.8 3.5 1.8s2.5-.6 3.5-1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function SendIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-5 w-5" aria-hidden="true"><path d="m4 4 16 8-16 8 3-8-3-8Z" strokeLinejoin="round" /><path d="M7 12h13" strokeLinecap="round" /></svg>;
}

function TypingIndicator({ isVisible, name, shouldReduceMotion }: { isVisible: boolean; name: string; shouldReduceMotion: boolean | null }) {
  return (
    <div className="mb-1 flex min-h-7 items-center px-2 sm:mb-1.5">
      <AnimatePresence initial={false}>
        {isVisible && (
          <motion.div role="status" aria-live="polite" aria-atomic="true" initial={shouldReduceMotion ? false : { opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 3 }} transition={{ duration: shouldReduceMotion ? 0 : 0.16 }} className="flex min-w-0 items-center gap-2 text-xs font-medium text-body">
            <span className="truncate">{name} is typing…</span>
            <span aria-hidden="true" className="flex shrink-0 items-center gap-0.5">{[0, 1, 2].map((dot) => <motion.span key={dot} animate={shouldReduceMotion ? { opacity: 0.65 } : { opacity: [0.35, 1, 0.35], y: [0, -2, 0] }} transition={shouldReduceMotion ? { duration: 0 } : { duration: 1.1, repeat: Number.POSITIVE_INFINITY, delay: dot * 0.14 }} className="h-1.5 w-1.5 rounded-full bg-primary" />)}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AcceptedConversationPanel({ conversation, currentUserId, realtimeRefreshKey, realtimeMessageEvents, onMessageConfirmed, onMobileBack }: { conversation: SelectedConversation; currentUserId: string | null; realtimeRefreshKey: number; realtimeMessageEvents: RealtimeChatMessageEvent[]; onMessageConfirmed: () => void; onMobileBack: () => void }) {
  const shouldReduceMotion = useReducedMotion();
  const latestLoadRef = useRef(0);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const comingSoonTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const hasLoadedMessagesRef = useRef(false);
  const isMountedRef = useRef(true);
  const isSubmittingRef = useRef(false);
  const inFlightMessageRef = useRef<{ optimisticId: string; conversationId: string; body: string } | null>(null);
  const processedRealtimeSequenceRef = useRef(realtimeMessageEvents.at(-1)?.sequence ?? 0);
  const realtimeSequenceByMessageIdRef = useRef(new Map<string, number>());
  const locallyConfirmedMessageIdsRef = useRef(new Set<string>());
  const [messages, setMessages] = useState<DisplayChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [newMessageAnnouncement, setNewMessageAnnouncement] = useState("");
  const [comingSoonMessage, setComingSoonMessage] = useState("");
  const otherName = getProfileDisplayName(conversation.otherProfile);
  const { isOtherUserTyping, notifyTyping, stopTyping } = useConversationTyping({ conversationId: conversation.id, currentUserId, otherUserId: conversation.otherProfile.id });

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (comingSoonTimerRef.current !== null) window.clearTimeout(comingSoonTimerRef.current);
    };
  }, []);

  const isNearBottom = useCallback(() => {
    const viewport = scrollViewportRef.current;
    return Boolean(viewport && viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < nearBottomThreshold);
  }, []);

  const scrollToLatest = useCallback((behavior: ScrollBehavior = "auto") => {
    window.requestAnimationFrame(() => {
      const viewport = scrollViewportRef.current;
      if (!viewport) return;
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: shouldReduceMotion ? "auto" : behavior });
      setShowJumpToLatest(false);
    });
  }, [shouldReduceMotion]);

  useEffect(() => {
    const loadId = ++latestLoadRef.current;
    const loadStartRealtimeSequence = processedRealtimeSequenceRef.current;
    const abortController = new AbortController();
    let isCancelled = false;

    async function loadMessages() {
      const shouldScrollAfterLoad = !hasLoadedMessagesRef.current || isNearBottom();
      const [historyResult, introductionResult] = await Promise.all([
        supabase.from("messages").select("id, conversation_id, sender_id, body, created_at, source_request_id").eq("conversation_id", conversation.id).order("created_at", { ascending: false }).limit(initialMessageLimit).abortSignal(abortController.signal),
        supabase.from("messages").select("id, conversation_id, sender_id, body, created_at, source_request_id").eq("conversation_id", conversation.id).not("source_request_id", "is", null).order("created_at", { ascending: true }).limit(1).abortSignal(abortController.signal),
      ]);

      if (isCancelled || loadId !== latestLoadRef.current) return;

      setIsLoading(false);

      if (historyResult.error || introductionResult.error) {
        if (!hasLoadedMessagesRef.current) setHistoryError("We couldn’t load this conversation. Please try again.");
        if (import.meta.env.DEV) console.error("Loading conversation messages failed", { conversationId: conversation.id, historyError: historyResult.error, introductionError: introductionResult.error });
        return;
      }

      const serverRowsById = new Map([...(historyResult.data ?? []), ...(introductionResult.data ?? [])].map((row) => [row.id, row as MessageRow]));
      const serverMessages = [...serverRowsById.values()].map(mapMessageRow).sort((first, second) => Date.parse(first.createdAt) - Date.parse(second.createdAt));
      const serverMessageIds = new Set(serverMessages.map((message) => message.id));
      serverMessageIds.forEach((messageId) => locallyConfirmedMessageIdsRef.current.delete(messageId));
      setMessages((currentMessages) => {
        const optimisticMessages = currentMessages.filter((message): message is OptimisticChatMessage => message.kind === "optimistic");
        const confirmedDuringLoad = currentMessages.filter((message): message is ChatMessage => {
          if (message.kind !== "confirmed" || serverMessageIds.has(message.id)) return false;
          const realtimeSequence = realtimeSequenceByMessageIdRef.current.get(message.id) ?? 0;
          return realtimeSequence > loadStartRealtimeSequence || locallyConfirmedMessageIdsRef.current.has(message.id);
        });
        const confirmedById = new Map([...serverMessages, ...confirmedDuringLoad].map((message) => [message.id, message]));
        return sortMessages([...confirmedById.values(), ...optimisticMessages]);
      });
      setHistoryError("");
      hasLoadedMessagesRef.current = true;
      if (shouldScrollAfterLoad) scrollToLatest("auto");
    }

    void loadMessages();

    return () => {
      isCancelled = true;
      abortController.abort();
    };
  }, [conversation.id, isNearBottom, realtimeRefreshKey, retryKey, scrollToLatest]);

  useEffect(() => {
    const newEvents = realtimeMessageEvents.filter((event) => event.sequence > processedRealtimeSequenceRef.current);
    if (newEvents.length === 0) return;

    processedRealtimeSequenceRef.current = newEvents[newEvents.length - 1]?.sequence ?? processedRealtimeSequenceRef.current;
    const relevantEvents = newEvents.filter((event) => event.message.conversationId === conversation.id);
    if (relevantEvents.length === 0) return;

    const shouldAutoScroll = isNearBottom();
    const receivedIncomingMessage = relevantEvents.some((event) => event.message.senderId !== currentUserId);

    setMessages((currentMessages) => {
      let nextMessages = currentMessages;

      relevantEvents.forEach((event) => {
        const message = event.message;
        realtimeSequenceByMessageIdRef.current.set(message.id, event.sequence);
        const inFlightMessage = inFlightMessageRef.current;
        const matchingOptimisticMessage = nextMessages.find((item): item is OptimisticChatMessage => item.kind === "optimistic" && item.senderId === message.senderId && item.body === message.body && (item.deliveryState === "sending" || item.deliveryState === "failed"));
        const optimisticId = message.senderId === currentUserId && inFlightMessage?.conversationId === message.conversationId && inFlightMessage.body === message.body ? inFlightMessage.optimisticId : message.senderId === currentUserId ? matchingOptimisticMessage?.optimisticId : undefined;
        nextMessages = reconcileConfirmedMessage(nextMessages, message, optimisticId);
      });

      return nextMessages;
    });

    if (receivedIncomingMessage) {
      setNewMessageAnnouncement(`New message from ${otherName}.`);
      if (shouldAutoScroll) scrollToLatest("auto");
      else setShowJumpToLatest(true);
    }
  }, [conversation.id, currentUserId, isNearBottom, otherName, realtimeMessageEvents, scrollToLatest]);

  function handleHistoryRetry() {
    latestLoadRef.current += 1;
    setMessages((currentMessages) => currentMessages.filter((message) => message.kind === "optimistic"));
    setIsLoading(true);
    setHistoryError("");
    hasLoadedMessagesRef.current = false;
    setRetryKey((key) => key + 1);
  }

  function resetTextareaHeight() {
    if (textareaRef.current) textareaRef.current.style.height = "";
  }

  function resizeTextarea(textarea: HTMLTextAreaElement) {
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`;
  }

  async function submitMessage(body: string, existingOptimisticId?: string) {
    if (!currentUserId || isSubmittingRef.current) return;

    const trimmedBody = body.trim();
    if (!trimmedBody || trimmedBody.length > messageMaxLength) return;
    stopTyping();

    const optimisticId = existingOptimisticId ?? createOptimisticId();
    const optimisticMessage: OptimisticChatMessage = {
      kind: "optimistic",
      optimisticId,
      conversationId: conversation.id,
      senderId: currentUserId,
      body: trimmedBody,
      createdAt: new Date().toISOString(),
      deliveryState: "sending",
    };

    isSubmittingRef.current = true;
    inFlightMessageRef.current = { optimisticId, conversationId: conversation.id, body: trimmedBody };
    setIsSubmitting(true);
    setMessages((currentMessages) => {
      const withoutExistingOptimistic = currentMessages.filter((message) => message.kind === "confirmed" || message.optimisticId !== optimisticId);
      return sortMessages([...withoutExistingOptimistic, optimisticMessage]);
    });

    if (!existingOptimisticId) {
      setDraft("");
      resetTextareaHeight();
    }
    setShowJumpToLatest(false);
    scrollToLatest("smooth");

    const { data, error } = await supabase.from("messages").insert({ conversation_id: conversation.id, sender_id: currentUserId, body: trimmedBody }).select("id, conversation_id, sender_id, body, created_at, source_request_id").single();

    if (error || !data) {
      if (isMountedRef.current) {
        setMessages((currentMessages) => currentMessages.map((message) => message.kind === "optimistic" && message.optimisticId === optimisticId ? { ...message, deliveryState: "failed" } : message));
        setIsSubmitting(false);
      }
      if (import.meta.env.DEV) console.error("Sending conversation message failed", { conversationId: conversation.id, error });
      isSubmittingRef.current = false;
      if (inFlightMessageRef.current?.optimisticId === optimisticId) inFlightMessageRef.current = null;
      return;
    }

    const confirmedMessage = mapMessageRow(data as MessageRow);
    locallyConfirmedMessageIdsRef.current.add(confirmedMessage.id);
    if (isMountedRef.current) {
      setMessages((currentMessages) => reconcileConfirmedMessage(currentMessages, confirmedMessage, optimisticId));
      setIsSubmitting(false);
      window.requestAnimationFrame(() => textareaRef.current?.focus());
    }
    isSubmittingRef.current = false;
    if (inFlightMessageRef.current?.optimisticId === optimisticId) inFlightMessageRef.current = null;
    onMessageConfirmed();
  }

  function handleSend(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    void submitMessage(draft);
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (!isSubmittingRef.current) handleSend();
  }

  function handleRetryMessage(message: OptimisticChatMessage) {
    void submitMessage(message.body, message.optimisticId);
  }

  function handleRemoveFailedMessage(optimisticId: string) {
    setMessages((currentMessages) => currentMessages.filter((message) => message.kind === "confirmed" || message.optimisticId !== optimisticId));
  }

  function handleScroll() {
    if (isNearBottom()) setShowJumpToLatest(false);
  }

  function showComingSoon(message: string) {
    if (comingSoonTimerRef.current !== null) window.clearTimeout(comingSoonTimerRef.current);
    setComingSoonMessage(message);
    comingSoonTimerRef.current = window.setTimeout(() => {
      setComingSoonMessage("");
      comingSoonTimerRef.current = null;
    }, comingSoonMessageDurationMs);
  }

  const remainingCharacters = messageMaxLength - draft.length;
  const showCharacterCount = remainingCharacters <= characterCountThreshold;
  const isSendDisabled = !currentUserId || !draft.trim() || isSubmitting || draft.length > messageMaxLength;
  const shouldShowIntroductoryFallback = Boolean(conversation.introductoryMessage) && !messages.some((message) => message.kind === "confirmed" && message.isIntroduction);
  const composerHelpId = `message-composer-help-${conversation.id}`;
  const characterCountId = `message-character-count-${conversation.id}`;
  const composerDescription = showCharacterCount ? `${composerHelpId} ${characterCountId}` : composerHelpId;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-4 py-4 sm:px-6"><MobileBackButton onClick={onMobileBack} /><ProfileAvatar profile={conversation.otherProfile} size="sm" /><div className="min-w-0 flex-1"><h1 className="truncate font-semibold text-heading">{otherName}</h1>{conversation.otherProfile.username && <p className="truncate text-sm text-body">@{conversation.otherProfile.username}</p>}</div><span className="shrink-0 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-primary">Accepted</span></header>

      <p aria-live="polite" className="sr-only">{newMessageAnnouncement}</p>
      <div className="relative min-h-0 flex-1">
        <div ref={scrollViewportRef} role="region" aria-label={`Messages with ${otherName}`} onScroll={handleScroll} className="absolute inset-0 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-6 lg:px-10">
          {isLoading ? (
            <div role="status" aria-live="polite" className="mx-auto max-w-2xl space-y-4"><div className="h-20 w-3/4 animate-pulse rounded-3xl bg-accent" /><div className="ml-auto h-16 w-2/3 animate-pulse rounded-3xl bg-accent" /></div>
          ) : historyError && messages.length === 0 ? (
            <div role="alert" className="mx-auto max-w-md rounded-3xl border border-border bg-surface p-6 text-center shadow-soft"><h2 className="font-semibold text-heading">Unable to load messages</h2><p className="mt-2 text-sm leading-6 text-body">{historyError}</p><button type="button" onClick={handleHistoryRetry} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Retry</button></div>
          ) : messages.length === 0 && !shouldShowIntroductoryFallback ? (
            <div className="mx-auto max-w-md py-12 text-center"><h2 className="font-semibold text-heading">No messages yet. Start the conversation.</h2></div>
          ) : (
            <div className="mx-auto max-w-2xl space-y-4">{historyError && <div role="alert" className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-body shadow-soft"><p>Earlier messages couldn’t be refreshed.</p><button type="button" onClick={handleHistoryRetry} className="mt-2 min-h-10 rounded-xl px-3 py-1.5 text-sm font-semibold text-primary transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Retry history</button></div>}{shouldShowIntroductoryFallback && <article className="flex justify-start"><div className="max-w-[85%] rounded-3xl rounded-bl-md border border-border bg-surface px-4 py-3 text-body shadow-soft sm:max-w-[75%]"><p className="whitespace-pre-wrap break-words text-sm leading-6">{conversation.introductoryMessage}</p><div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">{conversation.introductoryMessageCreatedAt && <time dateTime={conversation.introductoryMessageCreatedAt}>{formatMessageTimestamp(conversation.introductoryMessageCreatedAt)}</time>}<span>Introduction</span></div></div></article>}{messages.map((message) => { const isCurrentUser = message.senderId === currentUserId; const isFailed = message.kind === "optimistic" && message.deliveryState === "failed"; const isSending = message.kind === "optimistic" && message.deliveryState === "sending"; return <article key={getMessageKey(message)} className={`flex min-w-0 ${isCurrentUser ? "justify-end" : "justify-start"}`}><div className={`min-w-0 max-w-[85%] rounded-3xl px-4 py-3 shadow-soft sm:max-w-[75%] ${isCurrentUser ? isFailed ? "rounded-br-md border border-primary/25 bg-accent text-heading" : "rounded-br-md bg-primary text-white" : "rounded-bl-md border border-border bg-surface text-body"}`}><p className="whitespace-pre-wrap break-words text-sm leading-6">{message.body}</p><div className={`mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs ${isCurrentUser && !isFailed ? "text-white/70" : "text-muted"}`}><time dateTime={message.createdAt}>{formatMessageTimestamp(message.createdAt)}</time>{message.kind === "confirmed" && message.isIntroduction && <span>Introduction</span>}{isSending && <span role="status">Sending…</span>}{isFailed && <span role="alert" className="font-semibold text-primary">Couldn’t send</span>}</div>{isFailed && <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => handleRetryMessage(message)} disabled={isSubmitting} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-60">Retry</button><button type="button" onClick={() => handleRemoveFailedMessage(message.optimisticId)} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-heading transition hover:bg-card focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Remove</button><p className="w-full text-xs leading-5 text-body">We couldn’t send this message. Check your connection and try again.</p></div>}</div></article>; })}</div>
          )}
        </div>

        {showJumpToLatest && <button type="button" onClick={() => scrollToLatest("smooth")} className="absolute bottom-4 left-1/2 inline-flex min-h-11 -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-heading shadow-soft transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true"><path d="m7 10 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>Jump to latest</button>}
      </div>

      <form onSubmit={handleSend} className="shrink-0 bg-background px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-5 sm:pt-3 lg:px-6">
        <TypingIndicator isVisible={isOtherUserTyping} name={otherName} shouldReduceMotion={shouldReduceMotion} />
        <label htmlFor={`message-composer-${conversation.id}`} className="sr-only">Message {otherName}</label>
        <div className="grid min-w-0 grid-cols-[auto_auto_minmax(0,1fr)_auto] items-end gap-x-2 rounded-2xl bg-surface px-3 py-3 shadow-soft focus-within:ring-2 focus-within:ring-primary/20 sm:gap-x-3 sm:px-4">
          <button type="button" onClick={() => showComingSoon("Media sharing is coming soon.")} aria-label="Add media — coming soon" title="Media sharing is coming soon" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 sm:h-11 sm:w-11"><MediaIcon /></button>
          <button type="button" onClick={() => showComingSoon("Emoji choices are coming soon.")} aria-label="Choose emoji — coming soon" title="Emoji choices are coming soon" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 sm:h-11 sm:w-11"><EmojiIcon /></button>
          <textarea ref={textareaRef} id={`message-composer-${conversation.id}`} value={draft} onChange={(event) => { setDraft(event.target.value); resizeTextarea(event.target); notifyTyping(event.target.value.trim().length > 0); }} onBlur={stopTyping} onKeyDown={handleComposerKeyDown} maxLength={messageMaxLength} rows={1} disabled={!currentUserId} aria-describedby={composerDescription} placeholder="Write a message…" className="max-h-32 min-h-12 min-w-0 resize-none overflow-y-auto border-0 bg-transparent px-1 py-3 text-sm leading-6 text-heading outline-none ring-0 placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-60 sm:px-2" />
          <button type="submit" disabled={isSendDisabled} aria-label={isSubmitting ? `Sending message to ${otherName}` : `Send message to ${otherName}`} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-0 bg-primary text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 sm:h-12 sm:w-12"><SendIcon /><span className="sr-only">{isSubmitting ? "Sending…" : "Send"}</span></button>
          <div aria-live="polite" aria-atomic="true" className={`col-start-1 col-end-5 row-start-2 flex min-w-0 items-start justify-between gap-3 px-1 sm:col-start-3 sm:col-end-4 ${comingSoonMessage || showCharacterCount ? "mt-2 min-h-5" : "mt-0 min-h-0 sm:mt-2 sm:min-h-5"}`}>
            {comingSoonMessage ? <p id={composerHelpId} className="min-w-0 text-xs leading-5 text-muted">{comingSoonMessage}</p> : <p id={composerHelpId} className={showCharacterCount ? "sr-only" : "sr-only sm:not-sr-only sm:min-w-0 sm:text-xs sm:leading-5 sm:text-muted"}>Enter to send · Shift+Enter for a new line</p>}
            {showCharacterCount && <p id={characterCountId} className="shrink-0 text-xs font-medium leading-5 text-muted">{remainingCharacters} left</p>}
          </div>
        </div>
      </form>
    </div>
  );
}

function ChatPanel({ chatState, currentUserId, isMobileVisible, realtimeRefreshKey, realtimeMessageEvents, onMessageConfirmed, onStartConversation, onMobileBack }: ChatPanelProps) {
  const visibilityClasses = isMobileVisible ? "flex" : "hidden lg:flex";

  if (chatState?.kind === "pending") {
    const recipientName = getProfileDisplayName(chatState.request.otherProfile);

    return (
      <main className={`${visibilityClasses} min-w-0 flex-1 flex-col overflow-hidden bg-background`}>
        <header className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-4 py-4 sm:px-6"><MobileBackButton onClick={onMobileBack} /><ProfileAvatar profile={chatState.request.otherProfile} size="sm" /><div className="min-w-0 flex-1"><h1 className="truncate font-semibold text-heading">{recipientName}</h1>{chatState.request.otherProfile.username && <p className="truncate text-sm text-body">@{chatState.request.otherProfile.username}</p>}</div></header>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-5 sm:p-8"><div className="w-full max-w-xl rounded-3xl border border-border bg-surface p-5 shadow-soft sm:p-7"><div className="flex items-center gap-4"><ProfileAvatar profile={chatState.request.otherProfile} size="lg" /><div className="min-w-0"><p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Request pending</p><h2 className="mt-1 truncate text-xl font-bold text-heading">Waiting for {recipientName}</h2></div></div><p className="mt-5 text-sm leading-6 text-body">You can continue messaging after they accept.</p><div className="mt-5 rounded-2xl border border-border bg-background px-4 py-3"><p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">Your introduction</p><p className="whitespace-pre-wrap break-words text-sm leading-6 text-body">{chatState.request.introduction}</p></div><div className="mt-5 rounded-2xl bg-accent px-4 py-3 text-sm leading-6 text-body">Additional messages are unavailable while this request is pending.</div></div></div>
      </main>
    );
  }

  if (chatState?.kind === "accepted") {
    return <main className={`${visibilityClasses} min-w-0 flex-1 flex-col overflow-hidden bg-background`}><AcceptedConversationPanel key={chatState.conversation.id} conversation={chatState.conversation} currentUserId={currentUserId} realtimeRefreshKey={realtimeRefreshKey} realtimeMessageEvents={realtimeMessageEvents} onMessageConfirmed={onMessageConfirmed} onMobileBack={onMobileBack} /></main>;
  }

  return (
    <main className="hidden min-w-0 flex-1 items-center justify-center overflow-hidden bg-background p-6 lg:flex lg:p-10">
      <div className="w-full max-w-md text-center"><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-accent text-primary shadow-soft lg:h-24 lg:w-24"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-10 w-10 lg:h-12 lg:w-12" aria-hidden="true"><path d="M4 5.5h16v11H8l-4 3v-14Z" strokeLinejoin="round" /><path d="M8 10h8M8 13h5" strokeLinecap="round" /></svg></div><h1 className="mt-6 text-2xl font-bold tracking-tight text-heading lg:mt-8 lg:text-3xl">Welcome to Nemissive</h1><p className="mt-4 text-base leading-7 text-body">Every meaningful conversation starts with a hello.</p><p className="mt-2 text-base leading-7 text-body">Choose someone from the left or start a new conversation.</p><button type="button" onClick={onStartConversation} className="mt-8 inline-flex items-center rounded-2xl bg-primary px-6 py-3 text-sm font-medium text-white shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-lg lg:mt-10">Start Conversation</button></div>
    </main>
  );
}

export default ChatPanel;
