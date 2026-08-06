import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import ChatPanel from "../components/dashboard/ChatPanel";
import GlobalSearchDialog from "../components/dashboard/GlobalSearchDialog";
import NavigationRail from "../components/dashboard/NavigationRail";
import NewConversationModal from "../components/dashboard/NewConversationModal";
import Sidebar from "../components/dashboard/Sidebar";
import useConversationReceipts from "../components/dashboard/useConversationReceipts";
import useConversationRealtime from "../components/dashboard/useConversationRealtime";
import useMessageRequests from "../components/dashboard/useMessageRequests";
import useMessagesData from "../components/dashboard/useMessagesData";
import useUserPresence from "../components/dashboard/useUserPresence";
import { normalizeQuickReactions } from "../components/dashboard/emojiData";
import { supabase } from "../lib/supabase";
import type { DashboardSection } from "../types/dashboard";
import type { ChatMessage, DashboardChatState, MessageReactionRealtimeChange, MessageSearchResult, MessageSearchTarget, ParticipantReceiptCursor, PendingOutgoingRequest, ProfileRelationship, ProfileSearchResult, RealtimeChatMessageEvent, RealtimeChatMessageUpdateEvent, RealtimeMessageReactionEvent, RealtimeProfileLastSeenEvent, SelectedConversation } from "../types/conversations";

function DashboardPage() {
  const [activeSection, setActiveSection] = useState<DashboardSection>("messages");
  const [isNewConversationOpen, setIsNewConversationOpen] = useState(false);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [messageSearchTarget, setMessageSearchTarget] = useState<MessageSearchTarget | null>(null);
  const [chatState, setChatState] = useState<DashboardChatState | null>(null);
  const [isCompactChatVisible, setIsCompactChatVisible] = useState(false);
  const [chatRealtimeRefreshKey, setChatRealtimeRefreshKey] = useState(0);
  const [realtimeMessageEvents, setRealtimeMessageEvents] = useState<RealtimeChatMessageEvent[]>([]);
  const [realtimeMessageUpdateEvents, setRealtimeMessageUpdateEvents] = useState<RealtimeChatMessageUpdateEvent[]>([]);
  const [realtimeReactionEvents, setRealtimeReactionEvents] = useState<RealtimeMessageReactionEvent[]>([]);
  const realtimeMessageSequenceRef = useRef(0);
  const realtimeMessageUpdateSequenceRef = useRef(0);
  const realtimeReactionSequenceRef = useRef(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentProfile, setCurrentProfile] = useState<ProfileSearchResult | null>(null);
  const [isAccountResolved, setIsAccountResolved] = useState(false);
  const [accountError, setAccountError] = useState("");
  const searchReturnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const abortController = new AbortController();
    let isCancelled = false;

    async function loadAccount() {
      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (isCancelled) return;
      if (userError || !userData.user) {
        setAccountError("Your session has expired. Please sign in again.");
        setIsAccountResolved(true);
        return;
      }

      setCurrentUserId(userData.user.id);

      const { data: profileData, error: profileError } = await supabase.from("profiles").select("id, username, display_name, avatar_url, quick_reactions").eq("id", userData.user.id).abortSignal(abortController.signal).maybeSingle();

      if (isCancelled) return;
      if (profileError || !profileData) {
        setAccountError("Your Nemissive profile could not be loaded.");
        if (profileError && import.meta.env.DEV) console.error("Loading dashboard profile failed", profileError);
      } else {
        setCurrentProfile(profileData as ProfileSearchResult);
        setAccountError("");
      }

      setIsAccountResolved(true);
    }

    void loadAccount();

    return () => {
      isCancelled = true;
      abortController.abort();
    };
  }, []);

  const handleConversationReady = useCallback((conversation: SelectedConversation) => {
    setMessageSearchTarget(null);
    setChatState({ kind: "accepted", conversation });
    setActiveSection("messages");
    setIsNewConversationOpen(false);
    setIsCompactChatVisible(true);
  }, []);

  const openGlobalSearch = useCallback((trigger?: HTMLElement | null) => {
    searchReturnFocusRef.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setIsGlobalSearchOpen(true);
  }, []);

  useEffect(() => {
    function handleGlobalSearchShortcut(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLocaleLowerCase() !== "k") return;
      const target = event.target;
      const isEditableTarget = target instanceof HTMLElement && (target.matches("input, textarea, select") || target.isContentEditable);
      if (isEditableTarget && !isGlobalSearchOpen) return;
      event.preventDefault();
      if (!isGlobalSearchOpen) openGlobalSearch(target instanceof HTMLElement ? target : null);
    }
    document.addEventListener("keydown", handleGlobalSearchShortcut);
    return () => document.removeEventListener("keydown", handleGlobalSearchShortcut);
  }, [isGlobalSearchOpen, openGlobalSearch]);

  const receiptsController = useConversationReceipts(currentUserId);
  const presenceController = useUserPresence(currentUserId);
  const { receiptEvents, currentUserReceiptsByConversationId, advanceDelivered, advanceRead, handleRealtimeReceipt } = receiptsController;
  const messagesController = useMessagesData({ currentUserId, isAccountResolved, currentUserReceiptsByConversationId, onIncomingMessageSynchronized: advanceDelivered });
  const mergeProfileLastSeen = messagesController.mergeProfileLastSeen;
  const patchMessagePreview = messagesController.patchMessagePreview;
  const refreshMessages = messagesController.refresh;
  const refreshMessagesSilently = messagesController.refreshSilently;
  const requestsController = useMessageRequests({ currentUserId, isAccountResolved, onConversationReady: handleConversationReady, onRequestsChanged: refreshMessages });
  const refreshRequestsSilently = requestsController.refreshSilently;
  const handleRealtimeRequestsChanged = useCallback(() => {
    refreshRequestsSilently();
  }, [refreshRequestsSilently]);
  const handleRealtimeConversationDataChanged = useCallback(() => {
    refreshMessagesSilently();
  }, [refreshMessagesSilently]);
  const handleRealtimeOpenConversationMessagesChanged = useCallback(() => {
    setChatRealtimeRefreshKey((key) => key + 1);
  }, []);
  const handleRealtimeMessageInserted = useCallback((message: ChatMessage) => {
    const event = { sequence: ++realtimeMessageSequenceRef.current, message };
    setRealtimeMessageEvents((currentEvents) => [...currentEvents.slice(-99), event]);
    if (currentUserId && message.senderId !== currentUserId) advanceDelivered(message.conversationId, message.createdAt);
  }, [advanceDelivered, currentUserId]);
  const handleRealtimeMessageUpdated = useCallback((message: ChatMessage) => {
    const event = { sequence: ++realtimeMessageUpdateSequenceRef.current, message };
    setRealtimeMessageUpdateEvents((currentEvents) => [...currentEvents.slice(-99), event]);
    patchMessagePreview(message);
  }, [patchMessagePreview]);
  const handleMessageDeletionRolledBack = useCallback((message: ChatMessage) => {
    patchMessagePreview(message, true);
  }, [patchMessagePreview]);
  const handleRealtimeMessageReactionChanged = useCallback((change: MessageReactionRealtimeChange) => {
    const event = { sequence: ++realtimeReactionSequenceRef.current, ...change };
    setRealtimeReactionEvents((currentEvents) => [...currentEvents.slice(-199), event]);
  }, []);
  const handleRealtimeParticipantReceiptUpdated = useCallback((receipt: ParticipantReceiptCursor) => {
    handleRealtimeReceipt(receipt);
  }, [handleRealtimeReceipt]);
  const handleRealtimeProfileLastSeenUpdated = useCallback(({ profileId, lastSeenAt }: RealtimeProfileLastSeenEvent) => {
    mergeProfileLastSeen(profileId, lastSeenAt);
  }, [mergeProfileLastSeen]);

  useConversationRealtime({
    currentUserId,
    onRequestsChanged: handleRealtimeRequestsChanged,
    onConversationDataChanged: handleRealtimeConversationDataChanged,
    onMessageInserted: handleRealtimeMessageInserted,
    onMessageUpdated: handleRealtimeMessageUpdated,
    onMessageReactionChanged: handleRealtimeMessageReactionChanged,
    onParticipantReceiptUpdated: handleRealtimeParticipantReceiptUpdated,
    onProfileLastSeenUpdated: handleRealtimeProfileLastSeenUpdated,
    onOpenConversationMessagesChanged: handleRealtimeOpenConversationMessagesChanged,
  });

  const handlePendingRequestSelected = useCallback((request: PendingOutgoingRequest) => {
    setChatState({ kind: "pending", request });
    setActiveSection("messages");
    setIsCompactChatVisible(true);
  }, []);

  const handleRequestCreated = useCallback((request: PendingOutgoingRequest) => {
    handlePendingRequestSelected(request);
    refreshMessages();
  }, [handlePendingRequestSelected, refreshMessages]);

  const relationshipsByProfileId = useMemo(() => {
    const relationships = new Map<string, ProfileRelationship>();

    messagesController.pendingRequests.forEach((request) => {
      relationships.set(request.otherProfile.id, { state: "outgoing_pending", request });
    });

    requestsController.requests.forEach((request) => {
      if (!relationships.has(request.senderProfile.id)) relationships.set(request.senderProfile.id, { state: "incoming_pending", requestId: request.id });
    });

    messagesController.conversations.forEach((conversation) => {
      relationships.set(conversation.otherProfile.id, { state: "accepted", conversation: { id: conversation.conversationId, otherProfile: conversation.otherProfile } });
    });

    return relationships;
  }, [messagesController.conversations, messagesController.pendingRequests, requestsController.requests]);

  const resolvedChatState = useMemo<DashboardChatState | null>(() => {
    if (chatState?.kind === "accepted") {
      const acceptedConversation = messagesController.conversations.find((conversation) => conversation.conversationId === chatState.conversation.id);
      if (!acceptedConversation) return chatState;
      return { kind: "accepted", conversation: { ...chatState.conversation, otherProfile: acceptedConversation.otherProfile } };
    }

    if (chatState?.kind !== "pending" || !messagesController.hasLoaded || messagesController.isLoading || messagesController.loadError) return chatState;
    if (messagesController.pendingRequests.some((request) => request.requestId === chatState.request.requestId)) return chatState;

    const acceptedConversation = messagesController.conversations.find((conversation) => conversation.otherProfile.id === chatState.request.otherProfile.id);
    if (!acceptedConversation) return null;
    return { kind: "accepted", conversation: { id: acceptedConversation.conversationId, otherProfile: acceptedConversation.otherProfile } };
  }, [chatState, messagesController.conversations, messagesController.hasLoaded, messagesController.isLoading, messagesController.loadError, messagesController.pendingRequests]);
  const effectiveCompactChatVisible = isCompactChatVisible && Boolean(resolvedChatState);

  function handleSectionChange(section: DashboardSection) {
    setActiveSection(section);
    setIsCompactChatVisible(false);
  }

  function openNewConversation() {
    setIsNewConversationOpen(true);
  }

  function openMessageRequestsSection() {
    setIsNewConversationOpen(false);
    handleSectionChange("requests");
  }

  function refreshRelationships() {
    refreshMessages();
    requestsController.refresh();
  }

  function handleSearchMessageSelected(result: MessageSearchResult) {
    handleConversationReady({ id: result.conversationId, otherProfile: result.otherProfile });
    setMessageSearchTarget({ conversationId: result.conversationId, messageId: result.messageId, token: `${Date.now()}:${result.messageId}` });
  }

  const quickReactions = normalizeQuickReactions(currentProfile?.quick_reactions);

  async function saveQuickReactions(reactions: string[]) {
    const { data, error } = await supabase.rpc("set_quick_reactions", { candidate_reactions: reactions });
    if (error) {
      if (import.meta.env.DEV) console.error("Saving quick reactions failed", { code: error.code });
      return false;
    }

    const savedReactions = Array.isArray(data) && data.every((item) => typeof item === "string") ? data : reactions;
    setCurrentProfile((profile) => profile ? { ...profile, quick_reactions: savedReactions } : profile);
    return true;
  }

  return (
    <>
      <div className="flex h-screen w-full min-w-0 flex-col overflow-hidden bg-background md:flex-row">
        <NavigationRail activeSection={activeSection} pendingRequestCount={requestsController.pendingCount} unreadMessageCount={messagesController.aggregateUnreadCount} isCompactChatVisible={effectiveCompactChatVisible} onSectionChange={handleSectionChange} onSearch={openGlobalSearch} />
        <Sidebar activeSection={activeSection} currentProfile={currentProfile} isAccountResolved={isAccountResolved} accountError={accountError} isCompactChatVisible={effectiveCompactChatVisible} requestsController={requestsController} messagesController={messagesController} chatState={resolvedChatState} onlineUserIds={presenceController.onlineUserIds} quickReactions={quickReactions} onSaveQuickReactions={saveQuickReactions} onBeforeSignOut={() => void presenceController.markLastSeenNow()} onNewConversation={openNewConversation} onPendingRequestSelected={handlePendingRequestSelected} onConversationReady={handleConversationReady} />
        <ChatPanel chatState={resolvedChatState} currentProfile={currentProfile} currentUserId={currentUserId} isMobileVisible={effectiveCompactChatVisible} messageSearchTarget={messageSearchTarget} realtimeRefreshKey={chatRealtimeRefreshKey} realtimeMessageEvents={realtimeMessageEvents} realtimeMessageUpdateEvents={realtimeMessageUpdateEvents} realtimeReactionEvents={realtimeReactionEvents} realtimeReceiptEvents={receiptEvents} onlineUserIds={presenceController.onlineUserIds} quickReactions={quickReactions} onIncomingMessagesSynchronized={advanceDelivered} onConversationRead={advanceRead} onMessageConfirmed={refreshMessagesSilently} onMessageUpdated={patchMessagePreview} onMessageDeletionRolledBack={handleMessageDeletionRolledBack} onStartConversation={openNewConversation} onMobileBack={() => setIsCompactChatVisible(false)} />
      </div>

      <NewConversationModal isOpen={isNewConversationOpen} currentUserId={currentUserId} isAccountResolved={isAccountResolved} accountError={accountError} relationshipsByProfileId={relationshipsByProfileId} isRelationshipsLoading={messagesController.isLoading || requestsController.isLoading} relationshipsError={messagesController.loadError || requestsController.loadError} onClose={() => setIsNewConversationOpen(false)} onConversationSelected={handleConversationReady} onPendingRequestSelected={handlePendingRequestSelected} onRequestCreated={handleRequestCreated} onOpenIncomingRequests={openMessageRequestsSection} onRefreshRelationships={refreshRelationships} />
      <AnimatePresence initial={false}>{isGlobalSearchOpen && <GlobalSearchDialog currentProfile={currentProfile} conversations={messagesController.conversations} outgoingRequests={messagesController.pendingRequests} incomingRequests={requestsController.requests} returnFocusRef={searchReturnFocusRef} onClose={() => setIsGlobalSearchOpen(false)} onConversationSelected={handleConversationReady} onOutgoingRequestSelected={handlePendingRequestSelected} onIncomingRequestSelected={openMessageRequestsSection} onMessageSelected={handleSearchMessageSelected} />}</AnimatePresence>
    </>
  );
}

export default DashboardPage;
