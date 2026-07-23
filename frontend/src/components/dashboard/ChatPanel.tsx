import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { DashboardChatState, SelectedConversation } from "../../types/conversations";
import ProfileAvatar from "./ProfileAvatar";
import { getProfileDisplayName } from "./profileUtils";

type ConversationMessage = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  source_request_id: string | null;
};

type ChatPanelProps = {
  chatState: DashboardChatState | null;
  isMobileVisible: boolean;
  realtimeRefreshKey: number;
  onStartConversation: () => void;
  onMobileBack: () => void;
};

function MobileBackButton({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-label="Back to dashboard section" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-xl text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover lg:hidden">←</button>;
}

function AcceptedConversationPanel({ conversation, realtimeRefreshKey, onMobileBack }: { conversation: SelectedConversation; realtimeRefreshKey: number; onMobileBack: () => void }) {
  const latestLoadRef = useRef(0);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const hasLoadedMessagesRef = useRef(false);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const otherName = getProfileDisplayName(conversation.otherProfile);

  useEffect(() => {
    const loadId = ++latestLoadRef.current;
    const abortController = new AbortController();
    let isCancelled = false;

    async function loadMessages() {
      const viewport = scrollViewportRef.current;
      const shouldScrollAfterLoad = !hasLoadedMessagesRef.current || Boolean(viewport && viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 120);
      const { data, error } = await supabase.from("messages").select("id, sender_id, body, created_at, source_request_id").eq("conversation_id", conversation.id).order("created_at", { ascending: false }).limit(100).abortSignal(abortController.signal);

      if (isCancelled || loadId !== latestLoadRef.current) return;

      setIsLoading(false);

      if (error) {
        if (!hasLoadedMessagesRef.current) setErrorMessage("We couldn’t load this conversation. Please try again.");
        if (import.meta.env.DEV) console.error("Loading conversation messages failed", { conversationId: conversation.id, error });
        return;
      }

      const messagesById = new Map(((data ?? []) as ConversationMessage[]).map((message) => [message.id, message]));
      const nextMessages = [...messagesById.values()].sort((first, second) => Date.parse(first.created_at) - Date.parse(second.created_at));
      setMessages(nextMessages);
      setErrorMessage("");
      hasLoadedMessagesRef.current = true;

      if (shouldScrollAfterLoad) {
        window.requestAnimationFrame(() => {
          const currentViewport = scrollViewportRef.current;
          if (currentViewport) currentViewport.scrollTop = currentViewport.scrollHeight;
        });
      }
    }

    void loadMessages();

    return () => {
      isCancelled = true;
      abortController.abort();
    };
  }, [conversation.id, realtimeRefreshKey, retryKey]);

  function handleRetry() {
    latestLoadRef.current += 1;
    setMessages([]);
    setIsLoading(true);
    setErrorMessage("");
    hasLoadedMessagesRef.current = false;
    setRetryKey((key) => key + 1);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-4 py-4 sm:px-6"><MobileBackButton onClick={onMobileBack} /><ProfileAvatar profile={conversation.otherProfile} size="sm" /><div className="min-w-0 flex-1"><h1 className="truncate font-semibold text-heading">{otherName}</h1>{conversation.otherProfile.username && <p className="truncate text-sm text-body">@{conversation.otherProfile.username}</p>}</div><span className="shrink-0 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-primary">Accepted</span></header>

      <div ref={scrollViewportRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-6 lg:px-10">
        {isLoading ? (
          <div role="status" aria-live="polite" className="mx-auto max-w-2xl space-y-4"><div className="h-20 w-3/4 animate-pulse rounded-3xl bg-accent" /><div className="ml-auto h-16 w-2/3 animate-pulse rounded-3xl bg-accent" /></div>
        ) : errorMessage ? (
          <div role="alert" className="mx-auto max-w-md rounded-3xl border border-border bg-surface p-6 text-center shadow-soft"><h2 className="font-semibold text-heading">Unable to load messages</h2><p className="mt-2 text-sm leading-6 text-body">{errorMessage}</p><button type="button" onClick={handleRetry} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Retry</button></div>
        ) : messages.length > 0 ? (
          <div role="log" aria-live="polite" aria-relevant="additions text" className="mx-auto max-w-2xl space-y-4">{messages.map((message) => { const isFromOther = message.sender_id === conversation.otherProfile.id; return <div key={message.id} className={`flex ${isFromOther ? "justify-start" : "justify-end"}`}><div className={`max-w-[85%] rounded-3xl px-4 py-3 shadow-soft sm:max-w-[75%] ${isFromOther ? "rounded-bl-md bg-surface text-body" : "rounded-br-md bg-primary text-white"}`}><p className="whitespace-pre-wrap break-words text-sm leading-6">{message.body}</p>{message.source_request_id && <p className={`mt-2 text-xs ${isFromOther ? "text-muted" : "text-white/70"}`}>Introduction</p>}</div></div>; })}<p className="pt-4 text-center text-sm text-muted">You’re all caught up.</p></div>
        ) : conversation.introductoryMessage ? (
          <div className="mx-auto max-w-2xl"><div className="max-w-[85%] rounded-3xl rounded-bl-md bg-surface px-4 py-3 text-body shadow-soft sm:max-w-[75%]"><p className="whitespace-pre-wrap break-words text-sm leading-6">{conversation.introductoryMessage}</p><p className="mt-2 text-xs text-muted">Introduction</p></div><p className="pt-8 text-center text-sm text-muted">No additional messages yet.</p></div>
        ) : (
          <div className="mx-auto max-w-md py-12 text-center"><h2 className="font-semibold text-heading">Conversation ready</h2><p className="mt-2 text-sm leading-6 text-body">No messages are available yet.</p></div>
        )}
      </div>

      <div className="shrink-0 border-t border-border bg-surface px-4 py-3 text-center sm:px-6"><p className="text-sm text-muted">Messaging will be available in the next update.</p></div>
    </div>
  );
}

function ChatPanel({ chatState, isMobileVisible, realtimeRefreshKey, onStartConversation, onMobileBack }: ChatPanelProps) {
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
    return <main className={`${visibilityClasses} min-w-0 flex-1 flex-col overflow-hidden bg-background`}><AcceptedConversationPanel key={chatState.conversation.id} conversation={chatState.conversation} realtimeRefreshKey={realtimeRefreshKey} onMobileBack={onMobileBack} /></main>;
  }

  return (
    <main className="hidden min-w-0 flex-1 items-center justify-center overflow-hidden bg-background p-6 lg:flex lg:p-10">
      <div className="w-full max-w-md text-center"><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-accent text-primary shadow-soft lg:h-24 lg:w-24"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-10 w-10 lg:h-12 lg:w-12" aria-hidden="true"><path d="M4 5.5h16v11H8l-4 3v-14Z" strokeLinejoin="round" /><path d="M8 10h8M8 13h5" strokeLinecap="round" /></svg></div><h1 className="mt-6 text-2xl font-bold tracking-tight text-heading lg:mt-8 lg:text-3xl">Welcome to Nemissive</h1><p className="mt-4 text-base leading-7 text-body">Every meaningful conversation starts with a hello.</p><p className="mt-2 text-base leading-7 text-body">Choose someone from the left or start a new conversation.</p><button type="button" onClick={onStartConversation} className="mt-8 inline-flex items-center rounded-2xl bg-primary px-6 py-3 text-sm font-medium text-white shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-lg lg:mt-10">Start Conversation</button></div>
    </main>
  );
}

export default ChatPanel;
