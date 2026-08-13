import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import ChatPanel from "../components/dashboard/ChatPanel";
import GlobalSearchDialog from "../components/dashboard/GlobalSearchDialog";
import NavigationRail from "../components/dashboard/NavigationRail";
import NewConversationModal from "../components/dashboard/NewConversationModal";
import Sidebar from "../components/dashboard/Sidebar";
import useConversationReceipts from "../components/dashboard/useConversationReceipts";
import useConversationRealtime from "../components/dashboard/useConversationRealtime";
import useBrowserNotifications from "../components/dashboard/useBrowserNotifications";
import useMessageRequests from "../components/dashboard/useMessageRequests";
import useMessagesData from "../components/dashboard/useMessagesData";
import useUserPresence from "../components/dashboard/useUserPresence";
import { normalizeQuickReactions } from "../components/dashboard/emojiData";
import { privacyPreferencesChangeEvent } from "../lib/privacyPreferences";
import { supabase } from "../lib/supabase";
import type { DashboardSection } from "../types/dashboard";
import type { ChatMessage, ConversationActivityRealtimeChange, ConversationConnectionRealtimeChange, ConversationNicknameRealtimeChange, ConversationThemeRealtimeChange, DashboardChatState, MessageReactionRealtimeChange, MessageSearchResult, MessageSearchTarget, ParticipantConversationPreferencesState, ParticipantMuteState, PendingOutgoingRequest, PinnedMessageRealtimeChange, ProfileRelationship, ProfileSearchResult, RealtimeChatMessageEvent, RealtimeChatMessageUpdateEvent, RealtimeConversationActivityEvent, RealtimeConversationNicknameEvent, RealtimeMessageReactionEvent, RealtimeNotificationPreferencesEvent, RealtimePinnedMessageEvent, SelectedConversation } from "../types/conversations";

function DashboardPage() {
  const [activeSection, setActiveSection] = useState<DashboardSection>("messages");
  const [isNewConversationOpen, setIsNewConversationOpen] = useState(false);
  const [reconnectProfile, setReconnectProfile] = useState<ProfileSearchResult | null>(null);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [messageSearchTarget, setMessageSearchTarget] = useState<MessageSearchTarget | null>(null);
  const [chatState, setChatState] = useState<DashboardChatState | null>(null);
  const [isCompactChatVisible, setIsCompactChatVisible] = useState(false);
  const [chatRealtimeRefreshKey, setChatRealtimeRefreshKey] = useState(0);
  const [realtimeMessageEvents, setRealtimeMessageEvents] = useState<RealtimeChatMessageEvent[]>([]);
  const [realtimeMessageUpdateEvents, setRealtimeMessageUpdateEvents] = useState<RealtimeChatMessageUpdateEvent[]>([]);
  const [realtimeReactionEvents, setRealtimeReactionEvents] = useState<RealtimeMessageReactionEvent[]>([]);
  const [realtimePinnedMessageEvents, setRealtimePinnedMessageEvents] = useState<RealtimePinnedMessageEvent[]>([]);
  const [realtimeConversationActivityEvents, setRealtimeConversationActivityEvents] = useState<RealtimeConversationActivityEvent[]>([]);
  const [realtimeConversationNicknameEvents, setRealtimeConversationNicknameEvents] = useState<RealtimeConversationNicknameEvent[]>([]);
  const realtimeMessageSequenceRef = useRef(0);
  const realtimeMessageUpdateSequenceRef = useRef(0);
  const realtimeReactionSequenceRef = useRef(0);
  const realtimePinnedMessageSequenceRef = useRef(0);
  const realtimeConversationActivitySequenceRef = useRef(0);
  const realtimeConversationNicknameSequenceRef = useRef(0);
  const presenceMembershipSignatureRef = useRef<string | null>(null);
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

      const { data: profileData, error: profileError } = await supabase.from("profiles").select("id, username, display_name, avatar_url, quick_reactions, browser_notifications_enabled, notification_sound_enabled").eq("id", userData.user.id).abortSignal(abortController.signal).maybeSingle();

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

  const handleArchivedConversationReady = useCallback((conversation: SelectedConversation) => {
    setMessageSearchTarget(null);
    setChatState({ kind: "accepted", conversation });
    setActiveSection("archived");
    setIsNewConversationOpen(false);
    setIsCompactChatVisible(true);
  }, []);

  const handlePeopleConversationReady = useCallback((conversation: SelectedConversation) => {
    setMessageSearchTarget(null);
    setChatState({ kind: "accepted", conversation });
    setActiveSection("people");
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
  const { receiptEvents, currentUserReceiptsByConversationId, advanceDelivered, advanceRead, refreshConversationReceipts } = receiptsController;
  const messagesController = useMessagesData({ currentUserId, isAccountResolved, currentUserReceiptsByConversationId, onIncomingMessageSynchronized: advanceDelivered });
  const patchMessagePreview = messagesController.patchMessagePreview;
  const refreshMessages = messagesController.refresh;
  const refreshMessagesSilently = messagesController.refreshSilently;
  const deleteConversationForMe = messagesController.deleteConversationForMe;
  const requestsController = useMessageRequests({ currentUserId, isAccountResolved, onConversationReady: handleConversationReady, onRequestsChanged: refreshMessages });
  const notificationController = useBrowserNotifications({ currentUserId, browserNotificationsEnabled: currentProfile?.browser_notifications_enabled ?? false, notificationSoundEnabled: currentProfile?.notification_sound_enabled ?? true, conversations: messagesController.notificationConversations, onConversationOpen: handleConversationReady });
  const refreshRequestsSilently = requestsController.refreshSilently;
  const handleRealtimeRequestsChanged = useCallback(() => {
    refreshRequestsSilently();
  }, [refreshRequestsSilently]);
  const handleRealtimeConversationDataChanged = useCallback(() => {
    refreshMessagesSilently();
  }, [refreshMessagesSilently]);
  useEffect(() => {
    const nextSignature = [...presenceController.onlineUserIds].sort().join(":");
    if (presenceMembershipSignatureRef.current !== null && presenceMembershipSignatureRef.current !== nextSignature) refreshMessagesSilently();
    presenceMembershipSignatureRef.current = nextSignature;
  }, [presenceController.onlineUserIds, refreshMessagesSilently]);
  const handleRealtimeOpenConversationMessagesChanged = useCallback(() => {
    setChatRealtimeRefreshKey((key) => key + 1);
  }, []);
  useEffect(() => {
    function handlePrivacyPreferencesChanged() {
      refreshMessagesSilently();
      setChatRealtimeRefreshKey((key) => key + 1);
    }
    window.addEventListener(privacyPreferencesChangeEvent, handlePrivacyPreferencesChanged);
    return () => window.removeEventListener(privacyPreferencesChangeEvent, handlePrivacyPreferencesChanged);
  }, [refreshMessagesSilently]);
  const handleRealtimeMessageInserted = useCallback((message: ChatMessage) => {
    const event = { sequence: ++realtimeMessageSequenceRef.current, message };
    setRealtimeMessageEvents((currentEvents) => [...currentEvents.slice(-99), event]);
    if (currentUserId && message.senderId !== currentUserId) advanceDelivered(message.conversationId, message.createdAt);
    notificationController.handleIncomingMessage(message);
  }, [advanceDelivered, currentUserId, notificationController]);
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
  const handleRealtimePinnedMessageChanged = useCallback((change: PinnedMessageRealtimeChange) => {
    const event = { sequence: ++realtimePinnedMessageSequenceRef.current, ...change };
    setRealtimePinnedMessageEvents((currentEvents) => [...currentEvents.slice(-99), event]);
  }, []);
  const handleRealtimeConversationActivityChanged = useCallback((change: ConversationActivityRealtimeChange) => {
    const event = { sequence: ++realtimeConversationActivitySequenceRef.current, ...change };
    setRealtimeConversationActivityEvents((currentEvents) => [...currentEvents.slice(-199), event]);
  }, []);
  const handleRealtimeConversationNicknameChanged = useCallback((change: ConversationNicknameRealtimeChange) => {
    const event = { sequence: ++realtimeConversationNicknameSequenceRef.current, ...change };
    setRealtimeConversationNicknameEvents((currentEvents) => [...currentEvents.slice(-99), event]);
    messagesController.patchConversationNickname(change);
  }, [messagesController]);
  const handleRealtimeConversationThemeChanged = useCallback((change: ConversationThemeRealtimeChange) => {
    messagesController.patchConversationTheme(change);
  }, [messagesController]);
  const handleRealtimeConversationConnectionChanged = useCallback((change: ConversationConnectionRealtimeChange) => {
    messagesController.patchConversationConnectionStatus(change.conversationId, change.connectionStatus);
  }, [messagesController]);
  const handleRealtimeParticipantReceiptsChanged = useCallback((conversationId: string) => {
    void refreshConversationReceipts(conversationId);
  }, [refreshConversationReceipts]);
  const handleRealtimeParticipantMuteUpdated = useCallback((muteState: ParticipantMuteState) => {
    if (muteState.userId === currentUserId) messagesController.patchConversationMute(muteState.conversationId, muteState.mutedUntil);
  }, [currentUserId, messagesController]);
  const handleRealtimeParticipantPreferencesUpdated = useCallback((preferences: ParticipantConversationPreferencesState) => {
    if (preferences.userId !== currentUserId) return;
    messagesController.patchConversationPreferences(preferences.conversationId, preferences.isPinned, preferences.archivedAt, preferences.historyClearedAt, preferences.conversationDeletedAt);
    if (!preferences.conversationDeletedAt) return;
    setChatState((currentState) => currentState?.kind === "accepted" && currentState.conversation.id === preferences.conversationId ? null : currentState);
    setMessageSearchTarget((currentTarget) => currentTarget?.conversationId === preferences.conversationId ? null : currentTarget);
    setIsCompactChatVisible(false);
    setIsGlobalSearchOpen(false);
  }, [currentUserId, messagesController]);
  const handleRealtimeNotificationPreferencesUpdated = useCallback((preferences: RealtimeNotificationPreferencesEvent) => {
    if (preferences.profileId !== currentUserId) return;
    setCurrentProfile((profile) => profile ? { ...profile, browser_notifications_enabled: preferences.browserNotificationsEnabled, notification_sound_enabled: preferences.notificationSoundEnabled } : profile);
  }, [currentUserId]);

  useConversationRealtime({
    currentUserId,
    onRequestsChanged: handleRealtimeRequestsChanged,
    onConversationDataChanged: handleRealtimeConversationDataChanged,
    onMessageInserted: handleRealtimeMessageInserted,
    onMessageUpdated: handleRealtimeMessageUpdated,
    onMessageReactionChanged: handleRealtimeMessageReactionChanged,
    onPinnedMessageChanged: handleRealtimePinnedMessageChanged,
    onConversationActivityChanged: handleRealtimeConversationActivityChanged,
    onConversationNicknameChanged: handleRealtimeConversationNicknameChanged,
    onConversationThemeChanged: handleRealtimeConversationThemeChanged,
    onConversationConnectionChanged: handleRealtimeConversationConnectionChanged,
    onParticipantReceiptsChanged: handleRealtimeParticipantReceiptsChanged,
    onParticipantMuteUpdated: handleRealtimeParticipantMuteUpdated,
    onParticipantPreferencesUpdated: handleRealtimeParticipantPreferencesUpdated,
    onNotificationPreferencesUpdated: handleRealtimeNotificationPreferencesUpdated,
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

  const handleReconnectRequested = useCallback((profile: ProfileSearchResult) => {
    setReconnectProfile(profile);
    setIsNewConversationOpen(true);
  }, []);

  const relationshipsByProfileId = useMemo(() => {
    const relationships = new Map<string, ProfileRelationship>();

    messagesController.relationshipConversations.forEach((conversation) => {
      const selectedConversation = { id: conversation.conversationId, otherProfile: conversation.otherProfile, otherNickname: conversation.otherNickname, themeKey: conversation.themeKey, historyClearedAt: conversation.historyClearedAt, conversationDeletedAt: conversation.conversationDeletedAt, connectionStatus: conversation.connectionStatus, iBlocked: conversation.iBlocked, interactionAllowed: conversation.interactionAllowed, messagingAvailable: conversation.messagingAvailable, requestAvailable: conversation.requestAvailable };
      relationships.set(conversation.otherProfile.id, conversation.connectionStatus === "accepted" ? { state: "accepted", conversation: selectedConversation } : { state: "disconnected", conversation: selectedConversation });
    });

    messagesController.pendingRequests.forEach((request) => {
      relationships.set(request.otherProfile.id, { state: "outgoing_pending", request });
    });

    requestsController.requests.forEach((request) => {
      if (relationships.get(request.senderProfile.id)?.state !== "outgoing_pending") relationships.set(request.senderProfile.id, { state: "incoming_pending", requestId: request.id });
    });

    return relationships;
  }, [messagesController.pendingRequests, messagesController.relationshipConversations, requestsController.requests]);

  const resolvedChatState = useMemo<DashboardChatState | null>(() => {
    if (chatState?.kind === "accepted") {
      const acceptedConversation = messagesController.relationshipConversations.find((conversation) => conversation.conversationId === chatState.conversation.id);
      if (!acceptedConversation) return !messagesController.hasLoaded || messagesController.isLoading || Boolean(messagesController.loadError) ? chatState : null;
      return { kind: "accepted", conversation: { ...chatState.conversation, otherProfile: acceptedConversation.otherProfile, otherNickname: acceptedConversation.otherNickname, themeKey: acceptedConversation.themeKey, historyClearedAt: acceptedConversation.historyClearedAt, conversationDeletedAt: acceptedConversation.conversationDeletedAt, connectionStatus: acceptedConversation.connectionStatus, iBlocked: acceptedConversation.iBlocked, interactionAllowed: acceptedConversation.interactionAllowed, messagingAvailable: acceptedConversation.messagingAvailable, requestAvailable: acceptedConversation.requestAvailable } };
    }

    if (chatState?.kind !== "pending" || !messagesController.hasLoaded || messagesController.isLoading || messagesController.loadError) return chatState;
    if (messagesController.pendingRequests.some((request) => request.requestId === chatState.request.requestId)) return chatState;

    const acceptedConversation = messagesController.connectedConversations.find((conversation) => conversation.otherProfile.id === chatState.request.otherProfile.id);
    if (!acceptedConversation) return null;
    return { kind: "accepted", conversation: { id: acceptedConversation.conversationId, otherProfile: acceptedConversation.otherProfile, otherNickname: acceptedConversation.otherNickname, themeKey: acceptedConversation.themeKey, historyClearedAt: acceptedConversation.historyClearedAt, conversationDeletedAt: acceptedConversation.conversationDeletedAt, connectionStatus: acceptedConversation.connectionStatus, iBlocked: acceptedConversation.iBlocked, interactionAllowed: acceptedConversation.interactionAllowed, messagingAvailable: acceptedConversation.messagingAvailable, requestAvailable: acceptedConversation.requestAvailable } };
  }, [chatState, messagesController.connectedConversations, messagesController.hasLoaded, messagesController.isLoading, messagesController.loadError, messagesController.pendingRequests, messagesController.relationshipConversations]);
  const effectiveCompactChatVisible = isCompactChatVisible && Boolean(resolvedChatState);

  function handleSectionChange(section: DashboardSection) {
    setActiveSection(section);
    setIsCompactChatVisible(false);
  }

  function openNewConversation() {
    setReconnectProfile(null);
    setIsNewConversationOpen(true);
  }

  function closeNewConversation() {
    setIsNewConversationOpen(false);
    setReconnectProfile(null);
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

  const handleConversationDeleted = useCallback(async (conversationId: string) => {
    const error = await deleteConversationForMe(conversationId);
    if (error) return error;
    setChatState((currentState) => currentState?.kind === "accepted" && currentState.conversation.id === conversationId ? null : currentState);
    setMessageSearchTarget((currentTarget) => currentTarget?.conversationId === conversationId ? null : currentTarget);
    setIsGlobalSearchOpen(false);
    setActiveSection("messages");
    setIsCompactChatVisible(false);
    return null;
  }, [deleteConversationForMe]);

  const handleConversationDisconnect = useCallback(async (conversationId: string) => {
    const { data, error } = await supabase.rpc("disconnect_conversation", { target_conversation_id: conversationId });
    if (error) {
      if (import.meta.env.DEV) console.warn("Disconnecting conversation failed", { conversationId, code: error.code });
      return "We couldn’t disconnect this conversation. Please try again.";
    }
    const result = data && typeof data === "object" ? data as Record<string, unknown> : null;
    messagesController.patchConversationConnectionStatus(conversationId, "disconnected", typeof result?.request_available === "boolean" ? result.request_available : false);
    refreshMessagesSilently();
    return null;
  }, [messagesController, refreshMessagesSilently]);

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

  async function saveNotificationPreferences(notificationsEnabled: boolean, soundEnabled: boolean) {
    const { data, error } = await supabase.rpc("set_notification_preferences", { notifications_enabled: notificationsEnabled, sound_enabled: soundEnabled });
    if (error) {
      if (import.meta.env.DEV) console.error("Saving notification preferences failed", { code: error.code });
      return "We couldn’t save your notification preferences. Please try again.";
    }

    const result = Array.isArray(data) ? data[0] : data;
    const savedNotificationsEnabled = result && typeof result === "object" && typeof result.browser_notifications_enabled === "boolean" ? result.browser_notifications_enabled : notificationsEnabled;
    const savedSoundEnabled = result && typeof result === "object" && typeof result.notification_sound_enabled === "boolean" ? result.notification_sound_enabled : soundEnabled;
    setCurrentProfile((profile) => profile ? { ...profile, browser_notifications_enabled: savedNotificationsEnabled, notification_sound_enabled: savedSoundEnabled } : profile);
    return null;
  }

  async function enableBrowserNotifications() {
    const permission = await notificationController.requestPermission();
    if (permission === "unsupported") return "Browser notifications are not supported here.";
    if (permission === "denied") return "Notifications are blocked. Allow them in your browser’s site settings.";
    if (permission !== "granted") return "Notification permission was not granted.";
    return saveNotificationPreferences(true, currentProfile?.notification_sound_enabled ?? true);
  }

  async function setConversationMute(conversationId: string, mutedUntil: string | null) {
    const { data, error } = await supabase.rpc("set_conversation_mute", { target_conversation_id: conversationId, mute_until: mutedUntil });
    if (error) {
      if (import.meta.env.DEV) console.error("Saving conversation mute failed", { code: error.code, conversationId });
      return "We couldn’t update this conversation’s notification setting. Please try again.";
    }
    const savedMutedUntil = typeof data === "string" ? data : mutedUntil;
    messagesController.patchConversationMute(conversationId, savedMutedUntil);
    return null;
  }

  async function setConversationTheme(conversationId: string, themeKey: string) {
    const { data, error } = await supabase.rpc("set_conversation_theme", { target_conversation_id: conversationId, theme_key: themeKey });
    if (error) {
      if (import.meta.env.DEV) console.error("Saving conversation theme failed", { code: error.code, conversationId });
      return "We couldn’t update this conversation’s theme. Please try again.";
    }
    messagesController.patchConversationTheme({ conversationId, themeKey: typeof data === "string" ? data : themeKey });
    return null;
  }

  const activeConversationMutedUntil = resolvedChatState?.kind === "accepted" ? messagesController.relationshipConversations.find((conversation) => conversation.conversationId === resolvedChatState.conversation.id)?.mutedUntil ?? null : null;
  const activeConversationArchivedAt = resolvedChatState?.kind === "accepted" ? messagesController.relationshipConversations.find((conversation) => conversation.conversationId === resolvedChatState.conversation.id)?.archivedAt ?? null : null;
  const visibleOnlineUserIds = useMemo(() => new Set(messagesController.relationshipConversations.filter((conversation) => conversation.messagingAvailable && conversation.otherProfile.active_status_visible && presenceController.onlineUserIds.has(conversation.otherProfile.id)).map((conversation) => conversation.otherProfile.id)), [messagesController.relationshipConversations, presenceController.onlineUserIds]);

  return (
    <>
      <div className="flex h-screen w-full min-w-0 flex-col overflow-hidden bg-background md:flex-row">
        <NavigationRail activeSection={activeSection} pendingRequestCount={requestsController.pendingCount} unreadMessageCount={messagesController.aggregateUnreadCount} archivedConversationCount={messagesController.archivedConversations.length} isCompactChatVisible={effectiveCompactChatVisible} onSectionChange={handleSectionChange} onSearch={openGlobalSearch} />
        <Sidebar activeSection={activeSection} currentProfile={currentProfile} isAccountResolved={isAccountResolved} accountError={accountError} isCompactChatVisible={effectiveCompactChatVisible} requestsController={requestsController} messagesController={messagesController} chatState={resolvedChatState} onlineUserIds={visibleOnlineUserIds} quickReactions={quickReactions} onSaveQuickReactions={saveQuickReactions} notificationPermission={notificationController.permission} isNotificationSupported={notificationController.isSupported} onEnableNotifications={enableBrowserNotifications} onSaveNotificationPreferences={saveNotificationPreferences} onBeforeSignOut={() => void presenceController.markLastSeenNow()} onNewConversation={openNewConversation} onPendingRequestSelected={handlePendingRequestSelected} onConversationReady={handleConversationReady} onPeopleConversationReady={handlePeopleConversationReady} onArchivedConversationReady={handleArchivedConversationReady} onConversationDeleted={handleConversationDeleted} />
        <ChatPanel chatState={resolvedChatState} currentProfile={currentProfile} currentUserId={currentUserId} isMobileVisible={effectiveCompactChatVisible} messageSearchTarget={messageSearchTarget} realtimeRefreshKey={chatRealtimeRefreshKey} realtimeMessageEvents={realtimeMessageEvents} realtimeMessageUpdateEvents={realtimeMessageUpdateEvents} realtimeReactionEvents={realtimeReactionEvents} realtimePinnedMessageEvents={realtimePinnedMessageEvents} realtimeConversationActivityEvents={realtimeConversationActivityEvents} realtimeConversationNicknameEvents={realtimeConversationNicknameEvents} realtimeReceiptEvents={receiptEvents} onlineUserIds={visibleOnlineUserIds} quickReactions={quickReactions} conversationMutedUntil={activeConversationMutedUntil} conversationArchivedAt={activeConversationArchivedAt} onConversationMuteChange={setConversationMute} onConversationThemeChange={setConversationTheme} onConversationArchiveChange={messagesController.setConversationArchived} onConversationDelete={handleConversationDeleted} onConversationDisconnect={handleConversationDisconnect} onReconnectRequested={handleReconnectRequested} onIncomingMessagesSynchronized={advanceDelivered} onConversationRead={advanceRead} onMessageConfirmed={refreshMessagesSilently} onMessageUpdated={patchMessagePreview} onMessageDeletionRolledBack={handleMessageDeletionRolledBack} onStartConversation={openNewConversation} onMobileBack={() => setIsCompactChatVisible(false)} />
      </div>

      <NewConversationModal key={reconnectProfile?.id ?? "new-conversation"} isOpen={isNewConversationOpen} currentUserId={currentUserId} isAccountResolved={isAccountResolved} accountError={accountError} initialProfile={reconnectProfile} relationshipsByProfileId={relationshipsByProfileId} isRelationshipsLoading={messagesController.isLoading || requestsController.isLoading} relationshipsError={messagesController.loadError || requestsController.loadError} onClose={closeNewConversation} onConversationSelected={handleConversationReady} onPendingRequestSelected={handlePendingRequestSelected} onRequestCreated={handleRequestCreated} onOpenIncomingRequests={openMessageRequestsSection} onRefreshRelationships={refreshRelationships} />
      <AnimatePresence initial={false}>{isGlobalSearchOpen && <GlobalSearchDialog currentProfile={currentProfile} conversations={messagesController.conversations} outgoingRequests={messagesController.pendingRequests} incomingRequests={requestsController.requests} returnFocusRef={searchReturnFocusRef} onClose={() => setIsGlobalSearchOpen(false)} onConversationSelected={handleConversationReady} onOutgoingRequestSelected={handlePendingRequestSelected} onIncomingRequestSelected={openMessageRequestsSection} onMessageSelected={handleSearchMessageSelected} />}</AnimatePresence>
    </>
  );
}

export default DashboardPage;
