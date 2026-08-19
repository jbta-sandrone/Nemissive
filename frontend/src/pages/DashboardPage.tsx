import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { useNavigate } from "react-router-dom";
import ActivityToastViewport from "../components/dashboard/ActivityToasts";
import ChatPanel from "../components/dashboard/ChatPanel";
import CommandDock from "../components/dashboard/CommandDock";
import ConfirmationDialog from "../components/dashboard/ConfirmationDialog";
import GlobalSearchDialog from "../components/dashboard/GlobalSearchDialog";
import NavigationRail from "../components/dashboard/NavigationRail";
import NewConversationModal from "../components/dashboard/NewConversationModal";
import PersonalSettingsDialog from "../components/dashboard/PersonalSettingsDialog";
import Pulse from "../components/dashboard/Pulse";
import Sidebar from "../components/dashboard/Sidebar";
import UtilityShelf from "../components/dashboard/UtilityShelf";
import useConversationReceipts from "../components/dashboard/useConversationReceipts";
import useConversationRealtime from "../components/dashboard/useConversationRealtime";
import useBrowserNotifications, { isConversationMuted } from "../components/dashboard/useBrowserNotifications";
import useMessageRequests from "../components/dashboard/useMessageRequests";
import useMessagesData from "../components/dashboard/useMessagesData";
import useActivityToasts, { isAppActive, type ActivityToastItem } from "../components/dashboard/useActivityToasts";
import useUserPresence from "../components/dashboard/useUserPresence";
import { normalizeQuickReactions } from "../components/dashboard/emojiData";
import { getConversationDisplayName } from "../components/dashboard/profileUtils";
import type { PersonalSurface } from "../components/dashboard/AccountMenuPopover";
import { privacyPreferencesChangeEvent } from "../lib/privacyPreferences";
import { supabase } from "../lib/supabase";
import type { DashboardSection, WorkspaceLayoutState } from "../types/dashboard";
import type { AcceptedConversationItem, ChatMessage, ConversationActivityRealtimeChange, ConversationConnectionRealtimeChange, ConversationNicknameRealtimeChange, ConversationRequestRealtimeChange, ConversationThemeRealtimeChange, DashboardChatState, MessageReactionRealtimeChange, MessageSearchResult, MessageSearchTarget, ParticipantConversationPreferencesState, ParticipantMuteState, PendingOutgoingRequest, PinnedMessageRealtimeChange, ProfileRelationship, ProfileSearchResult, RealtimeChatMessageEvent, RealtimeChatMessageUpdateEvent, RealtimeConversationActivityEvent, RealtimeConversationNicknameEvent, RealtimeMessageReactionEvent, RealtimeNotificationPreferencesEvent, RealtimePinnedMessageEvent, RealtimeProfileIdentityEvent, SelectedConversation } from "../types/conversations";

const pulseVisibilityStorageKey = "nemissive.pulse-visible.v1";
const NotesWorkspace = lazy(() => import("../components/dashboard/NotesWorkspace"));

function normalizeActivityMessagePreview(message: ChatMessage) {
  if (message.messageType === "image") return "Sent a photo";
  if (message.messageType === "voice") return "Sent a voice message";
  if (message.messageType === "file") return "Sent a file";
  const normalized = message.body.replace(/\s+/g, " ").trim();
  if (!normalized) return "Sent a message";
  return normalized.length > 120 ? `${normalized.slice(0, 119).trimEnd()}…` : normalized;
}

function isActivityConversationEligible(conversation: AcceptedConversationItem) {
  const accountStatus = conversation.otherProfile.account_status;
  return conversation.connectionStatus === "accepted"
    && conversation.interactionAllowed
    && conversation.messagingAvailable
    && !conversation.iBlocked
    && accountStatus !== "deleting"
    && accountStatus !== "deleted";
}

function readInitialWorkspaceLayout(): WorkspaceLayoutState {
  if (typeof window === "undefined") return { mode: "workspace", pulseVisible: true };
  try {
    return { mode: "workspace", pulseVisible: window.localStorage.getItem(pulseVisibilityStorageKey) !== "false" };
  } catch {
    return { mode: "workspace", pulseVisible: true };
  }
}

function SignOutIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function DashboardPage() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<DashboardSection>("messages");
  const [workspaceLayout, setWorkspaceLayout] = useState<WorkspaceLayoutState>(readInitialWorkspaceLayout);
  const [isDesktopWorkspace, setIsDesktopWorkspace] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches);
  const [isNewConversationOpen, setIsNewConversationOpen] = useState(false);
  const [reconnectProfile, setReconnectProfile] = useState<ProfileSearchResult | null>(null);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [isUtilityShelfOpen, setIsUtilityShelfOpen] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [mobileComposerClearance, setMobileComposerClearance] = useState<number | null>(null);
  const [personalSurface, setPersonalSurface] = useState<PersonalSurface | null>(null);
  const [isSignOutDialogOpen, setIsSignOutDialogOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
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
  const personalSurfaceReturnFocusRef = useRef<HTMLElement | null>(null);
  const signOutReturnFocusRef = useRef<HTMLElement | null>(null);
  const utilityShelfReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const notesReturnFocusRef = useRef<HTMLElement | null>(null);
  const isSigningOutRef = useRef(false);
  const activityViewRef = useRef({ activeSection, chatState, isCompactChatVisible, isDesktopWorkspace, hasBlockingOverlay: false });

  useEffect(() => {
    activityViewRef.current = { activeSection, chatState, isCompactChatVisible, isDesktopWorkspace, hasBlockingOverlay: Boolean(personalSurface || isGlobalSearchOpen || isNewConversationOpen) };
  }, [activeSection, chatState, isCompactChatVisible, isDesktopWorkspace, isGlobalSearchOpen, isNewConversationOpen, personalSurface]);

  useEffect(() => {
    try {
      window.localStorage.setItem(pulseVisibilityStorageKey, String(workspaceLayout.pulseVisible));
    } catch {
      // Pulse persistence is optional; the in-memory workspace remains functional.
    }
  }, [workspaceLayout.pulseVisible]);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    function handleDesktopWorkspaceChange(event: MediaQueryListEvent) {
      setIsDesktopWorkspace(event.matches);
      if (!event.matches) setWorkspaceLayout((current) => current.mode === "workspace" ? current : { ...current, mode: "workspace" });
    }
    query.addEventListener("change", handleDesktopWorkspaceChange);
    return () => query.removeEventListener("change", handleDesktopWorkspaceChange);
  }, []);

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

      const { data: profileData, error: profileError } = await supabase.from("profiles").select("id, username, display_name, avatar_url, quick_reactions, browser_notifications_enabled, notification_sound_enabled, account_status, deleted_at").eq("id", userData.user.id).abortSignal(abortController.signal).maybeSingle();

      if (isCancelled) return;
      if (profileError || !profileData) {
        setAccountError("Your Nemissive profile could not be loaded.");
        if (profileError && import.meta.env.DEV) console.error("Loading dashboard profile failed", profileError);
      } else if (profileData.account_status === "deleted") {
        await supabase.auth.signOut({ scope: "local" });
        if (!isCancelled) navigate("/login", { replace: true, state: { accountDeleted: true } });
        return;
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
  }, [navigate]);

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

  const toggleUtilityShelf = useCallback((trigger: HTMLButtonElement) => {
    utilityShelfReturnFocusRef.current = trigger;
    setIsUtilityShelfOpen((open) => !open);
  }, []);

  const closeUtilityShelf = useCallback(() => {
    setIsUtilityShelfOpen(false);
    window.requestAnimationFrame(() => {
      const preferredTrigger = utilityShelfReturnFocusRef.current;
      const visibleTrigger = [...document.querySelectorAll<HTMLButtonElement>("[data-utility-shelf-trigger]")].find((trigger) => trigger.getClientRects().length > 0);
      if (preferredTrigger?.isConnected && preferredTrigger.getClientRects().length > 0) preferredTrigger.focus();
      else visibleTrigger?.focus();
    });
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
  const activityToasts = useActivityToasts();
  const claimActivityEvent = activityToasts.claim;
  const enqueueClaimedActivityToast = activityToasts.enqueueClaimed;
  const activityConversationsRef = useRef(messagesController.notificationConversations);

  useEffect(() => {
    activityConversationsRef.current = messagesController.notificationConversations;
  }, [messagesController.notificationConversations]);

  const loadActivityProfile = useCallback(async (profileId: string) => {
    const { data, error } = await supabase.from("profiles").select("id, username, display_name, avatar_url, account_status, deleted_at").eq("id", profileId).maybeSingle();
    if (error || !data || data.account_status === "deleting" || data.account_status === "deleted") return null;
    return data as ProfileSearchResult;
  }, []);

  const openNotes = useCallback(() => {
    const visibleShelfTrigger = [...document.querySelectorAll<HTMLButtonElement>("[data-utility-shelf-trigger]")].find((trigger) => trigger.getClientRects().length > 0);
    notesReturnFocusRef.current = visibleShelfTrigger ?? utilityShelfReturnFocusRef.current;
    setIsUtilityShelfOpen(false);
    setIsNotesOpen(true);
  }, []);

  function openPersonalSurface(surface: PersonalSurface, trigger: HTMLButtonElement) {
    personalSurfaceReturnFocusRef.current = trigger;
    setPersonalSurface(surface);
  }

  function requestSignOut(trigger: HTMLButtonElement) {
    signOutReturnFocusRef.current = trigger;
    setSignOutError("");
    setIsSignOutDialogOpen(true);
  }

  async function handleSignOut() {
    if (isSigningOutRef.current) return;
    isSigningOutRef.current = true;
    setIsSigningOut(true);
    setSignOutError("");
    void presenceController.markLastSeenNow();
    const { error } = await supabase.auth.signOut();
    if (error) {
      isSigningOutRef.current = false;
      setIsSigningOut(false);
      setSignOutError("We couldn’t sign you out. Please try again.");
      if (import.meta.env.DEV) console.error("Supabase sign out failed", error);
      return;
    }
    navigate("/login", { replace: true });
  }

  function handleAccountDeleted() {
    navigate("/login", { replace: true, state: { accountDeleted: true } });
  }
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
  const handleRealtimeConversationRequestChanged = useCallback((change: ConversationRequestRealtimeChange) => {
    const { request } = change;
    if (!currentUserId) return;

    const isNewIncomingRequest = change.action === "insert" && request.status === "pending" && request.recipientId === currentUserId && request.senderId !== currentUserId;
    const isAcceptedOutgoingRequest = change.action === "update" && request.status === "accepted" && request.senderId === currentUserId && request.recipientId !== currentUserId && Boolean(request.conversationId);
    if (!isNewIncomingRequest && !isAcceptedOutgoingRequest) return;
    const eventId = `${isNewIncomingRequest ? "request-received" : "request-accepted"}:${request.id}`;
    if (!claimActivityEvent(eventId) || !isAppActive()) return;

    void (async () => {
      const actorId = isNewIncomingRequest ? request.senderId : request.recipientId;
      const profile = await loadActivityProfile(actorId);
      if (!profile || !isAppActive()) return;
      if (isNewIncomingRequest) {
        enqueueClaimedActivityToast({ kind: "connection_request_received", eventId, requestId: request.id, profile });
        return;
      }
      enqueueClaimedActivityToast({ kind: "connection_request_accepted", eventId, requestId: request.id, conversationId: request.conversationId as string, profile });
    })();
  }, [claimActivityEvent, currentUserId, enqueueClaimedActivityToast, loadActivityProfile]);
  const handleRealtimeMessageInserted = useCallback((message: ChatMessage) => {
    const event = { sequence: ++realtimeMessageSequenceRef.current, message };
    setRealtimeMessageEvents((currentEvents) => [...currentEvents.slice(-99), event]);
    if (currentUserId && message.senderId !== currentUserId) advanceDelivered(message.conversationId, message.createdAt);
    notificationController.handleIncomingMessage(message);

    if (!currentUserId || message.senderId === currentUserId || message.isDeleted) return;
    const activityEventId = `message:${message.id}`;
    if (!claimActivityEvent(activityEventId) || !isAppActive()) return;
    const conversation = activityConversationsRef.current.find((item) => item.conversationId === message.conversationId && item.otherProfile.id === message.senderId);
    if (!conversation || !isActivityConversationEligible(conversation) || isConversationMuted(conversation.mutedUntil)) return;
    const view = activityViewRef.current;
    const isAlreadyVisible = view.activeSection === "messages"
      && view.chatState?.kind === "accepted"
      && view.chatState.conversation.id === message.conversationId
      && (view.isDesktopWorkspace || view.isCompactChatVisible)
      && !view.hasBlockingOverlay;
    if (isAlreadyVisible) return;

    enqueueClaimedActivityToast({
      kind: "message_received",
      eventId: activityEventId,
      conversationId: conversation.conversationId,
      profile: conversation.otherProfile,
      otherNickname: conversation.otherNickname,
      preview: normalizeActivityMessagePreview(message),
    });
  }, [advanceDelivered, claimActivityEvent, currentUserId, enqueueClaimedActivityToast, notificationController]);
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
    if (change.action !== "insert" || !currentUserId || change.reaction.userId === currentUserId) return;
    const activityEventId = `reaction:${change.reaction.id}`;
    if (!claimActivityEvent(activityEventId) || !isAppActive()) return;

    void (async () => {
      const { data, error } = await supabase.from("messages").select("id, conversation_id, sender_id, is_deleted").eq("id", change.reaction.messageId).maybeSingle();
      if (error || !data || data.sender_id !== currentUserId || data.is_deleted || !isAppActive()) return;
      const conversation = activityConversationsRef.current.find((item) => item.conversationId === data.conversation_id && item.otherProfile.id === change.reaction.userId);
      if (!conversation || !isActivityConversationEligible(conversation) || isConversationMuted(conversation.mutedUntil)) return;
      const view = activityViewRef.current;
      const isAlreadyVisible = view.activeSection === "messages"
        && view.chatState?.kind === "accepted"
        && view.chatState.conversation.id === conversation.conversationId
        && (view.isDesktopWorkspace || view.isCompactChatVisible)
        && !view.hasBlockingOverlay;
      if (isAlreadyVisible) return;

      enqueueClaimedActivityToast({
        kind: "reaction_received",
        eventId: activityEventId,
        conversationId: conversation.conversationId,
        profile: conversation.otherProfile,
        otherNickname: conversation.otherNickname,
        messageId: change.reaction.messageId,
        emoji: change.reaction.emoji,
      });
    })();
  }, [claimActivityEvent, currentUserId, enqueueClaimedActivityToast]);
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
  const handleProfileIdentityUpdated = useCallback((identity: RealtimeProfileIdentityEvent) => {
    if (identity.id === currentUserId && identity.account_status === "deleted") {
      void supabase.auth.signOut({ scope: "local" }).finally(() => navigate("/login", { replace: true, state: { accountDeleted: identity.account_status === "deleted" } }));
      return;
    }
    if (identity.id === currentUserId) setCurrentProfile((profile) => profile ? { ...profile, ...identity } : profile);
    messagesController.patchProfileIdentity(identity);
    requestsController.patchProfileIdentity(identity);
    if (identity.account_status && identity.account_status !== "active") {
      messagesController.refreshSilently();
      setChatRealtimeRefreshKey((key) => key + 1);
    }
  }, [currentUserId, messagesController, navigate, requestsController]);

  useConversationRealtime({
    currentUserId,
    onRequestsChanged: handleRealtimeRequestsChanged,
    onConversationRequestChanged: handleRealtimeConversationRequestChanged,
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
    onProfileIdentityUpdated: handleProfileIdentityUpdated,
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
  const hasFocusEligibleConversation = resolvedChatState?.kind === "accepted";
  const effectiveLayoutMode = hasFocusEligibleConversation && isDesktopWorkspace ? workspaceLayout.mode : "workspace";
  const isFocusMode = effectiveLayoutMode === "focus";

  useEffect(() => {
    if (hasFocusEligibleConversation || workspaceLayout.mode !== "focus") return;
    const resetTimer = window.setTimeout(() => setWorkspaceLayout((current) => ({ ...current, mode: "workspace" })), 0);
    return () => window.clearTimeout(resetTimer);
  }, [hasFocusEligibleConversation, workspaceLayout.mode]);

  function handleSectionChange(section: DashboardSection) {
    setActiveSection(section);
    setIsCompactChatVisible(false);
    setWorkspaceLayout((current) => current.mode === "workspace" ? current : { ...current, mode: "workspace" });
  }

  function enterFocusMode() {
    if (!hasFocusEligibleConversation) return;
    setWorkspaceLayout((current) => ({ ...current, mode: "focus" }));
    window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-focus-mode-control="exit"]')?.focus());
  }

  function exitFocusMode() {
    setActiveSection("messages");
    setIsCompactChatVisible(false);
    setWorkspaceLayout((current) => ({ ...current, mode: "workspace" }));
    window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-focus-mode-control="enter"]')?.focus());
  }

  function handleDockDestinationChange(section: DashboardSection) {
    handleSectionChange(section);
    window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`aside[aria-label="Nemissive command rail"] [data-dashboard-section="${section}"]`)?.focus());
  }

  function setPulseVisible(visible: boolean) {
    setWorkspaceLayout((current) => ({ ...current, pulseVisible: visible }));
  }

  function hidePulse() {
    setPulseVisible(false);
    window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-pulse-visibility-control="true"]')?.focus());
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
  const pulseConversations = useMemo(() => {
    const eligibleByProfileId = new Map<string, AcceptedConversationItem>();
    messagesController.connectedConversations.forEach((conversation) => {
      const profile = conversation.otherProfile;
      const eligible = conversation.connectionStatus === "accepted"
        && conversation.interactionAllowed
        && conversation.messagingAvailable
        && !conversation.iBlocked
        && profile.account_status === "active"
        && profile.active_status_visible === true
        && visibleOnlineUserIds.has(profile.id);
      if (eligible && !eligibleByProfileId.has(profile.id)) eligibleByProfileId.set(profile.id, conversation);
    });
    return [...eligibleByProfileId.values()].sort((first, second) => getConversationDisplayName(first.otherProfile, first.otherNickname).localeCompare(getConversationDisplayName(second.otherProfile, second.otherNickname), undefined, { sensitivity: "base" }));
  }, [messagesController.connectedConversations, visibleOnlineUserIds]);

  function openPulseConversation(conversation: AcceptedConversationItem) {
    handleConversationReady({ id: conversation.conversationId, otherProfile: conversation.otherProfile, otherNickname: conversation.otherNickname, themeKey: conversation.themeKey, historyClearedAt: conversation.historyClearedAt, conversationDeletedAt: conversation.conversationDeletedAt, connectionStatus: conversation.connectionStatus, iBlocked: conversation.iBlocked, interactionAllowed: conversation.interactionAllowed, messagingAvailable: conversation.messagingAvailable, requestAvailable: conversation.requestAvailable });
  }

  function handleActivityToastActivate(toast: ActivityToastItem) {
    activityToasts.dismiss(toast.id);
    if (toast.kind === "connection_request_received") {
      handleSectionChange("requests");
      requestsController.refreshSilently();
      return;
    }

    const conversationId = toast.conversationId;
    const currentConversation = activityConversationsRef.current.find((item) => item.conversationId === conversationId);
    handleConversationReady(currentConversation ? {
      id: currentConversation.conversationId,
      otherProfile: currentConversation.otherProfile,
      otherNickname: currentConversation.otherNickname,
      themeKey: currentConversation.themeKey,
      historyClearedAt: currentConversation.historyClearedAt,
      conversationDeletedAt: currentConversation.conversationDeletedAt,
      connectionStatus: currentConversation.connectionStatus,
      iBlocked: currentConversation.iBlocked,
      interactionAllowed: currentConversation.interactionAllowed,
      messagingAvailable: currentConversation.messagingAvailable,
      requestAvailable: currentConversation.requestAvailable,
    } : { id: conversationId, otherProfile: toast.profile, connectionStatus: "accepted", interactionAllowed: true, messagingAvailable: true });

    if (toast.kind === "reaction_received") {
      setMessageSearchTarget({ conversationId, messageId: toast.messageId, token: `${Date.now()}:${toast.messageId}` });
    }
  }

  return (
    <>
      <div className="relative flex h-dvh w-full min-w-0 flex-col overflow-hidden bg-background md:flex-row">
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{isFocusMode ? "Focus mode" : "Workspace mode"}</p>
        <NavigationRail activeSection={activeSection} pendingRequestCount={requestsController.pendingCount} unreadMessageCount={messagesController.aggregateUnreadCount} archivedConversationCount={messagesController.archivedConversations.length} isCompactChatVisible={effectiveCompactChatVisible} isFocusMode={isFocusMode} currentProfile={currentProfile} isSigningOut={isSigningOut} pulseVisible={workspaceLayout.pulseVisible} onPulseVisibilityChange={setPulseVisible} onOpenPersonalSurface={openPersonalSurface} onRequestSignOut={requestSignOut} onSectionChange={handleSectionChange} onSearch={openGlobalSearch} />
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <Sidebar activeSection={activeSection} currentProfile={currentProfile} isAccountResolved={isAccountResolved} accountError={accountError} isCompactChatVisible={effectiveCompactChatVisible} isDesktopCollapsed={isFocusMode} requestsController={requestsController} messagesController={messagesController} chatState={resolvedChatState} onlineUserIds={visibleOnlineUserIds} quickReactions={quickReactions} onSaveQuickReactions={saveQuickReactions} notificationPermission={notificationController.permission} isNotificationSupported={notificationController.isSupported} onEnableNotifications={enableBrowserNotifications} onSaveNotificationPreferences={saveNotificationPreferences} onProfileIdentityUpdated={handleProfileIdentityUpdated} onRequestSignOut={requestSignOut} onAccountDeleted={handleAccountDeleted} onNewConversation={openNewConversation} onPendingRequestSelected={handlePendingRequestSelected} onConversationReady={handleConversationReady} onPeopleConversationReady={handlePeopleConversationReady} onArchivedConversationReady={handleArchivedConversationReady} onConversationDeleted={handleConversationDeleted} />
          <ChatPanel chatState={resolvedChatState} currentProfile={currentProfile} currentUserId={currentUserId} isMobileVisible={effectiveCompactChatVisible} layoutMode={effectiveLayoutMode} messageSearchTarget={messageSearchTarget} realtimeRefreshKey={chatRealtimeRefreshKey} realtimeMessageEvents={realtimeMessageEvents} realtimeMessageUpdateEvents={realtimeMessageUpdateEvents} realtimeReactionEvents={realtimeReactionEvents} realtimePinnedMessageEvents={realtimePinnedMessageEvents} realtimeConversationActivityEvents={realtimeConversationActivityEvents} realtimeConversationNicknameEvents={realtimeConversationNicknameEvents} realtimeReceiptEvents={receiptEvents} onlineUserIds={visibleOnlineUserIds} quickReactions={quickReactions} conversationMutedUntil={activeConversationMutedUntil} conversationArchivedAt={activeConversationArchivedAt} onConversationMuteChange={setConversationMute} onConversationThemeChange={setConversationTheme} onConversationArchiveChange={messagesController.setConversationArchived} onConversationDelete={handleConversationDeleted} onConversationDisconnect={handleConversationDisconnect} onReconnectRequested={handleReconnectRequested} onIncomingMessagesSynchronized={advanceDelivered} onConversationRead={advanceRead} onMessageConfirmed={refreshMessagesSilently} onMessageUpdated={patchMessagePreview} onMessageDeletionRolledBack={handleMessageDeletionRolledBack} onStartConversation={openNewConversation} onMobileBack={() => setIsCompactChatVisible(false)} onEnterFocusMode={enterFocusMode} onMobileComposerClearanceChange={setMobileComposerClearance} />
          {!isFocusMode && <Pulse conversations={pulseConversations} expanded={workspaceLayout.pulseVisible} onHide={hidePulse} onConversationSelect={openPulseConversation} />}
        </div>
        {isFocusMode && <CommandDock activeSection={activeSection} pendingRequestCount={requestsController.pendingCount} unreadMessageCount={messagesController.aggregateUnreadCount} archivedConversationCount={messagesController.archivedConversations.length} currentProfile={currentProfile} isSigningOut={isSigningOut} isUtilityShelfOpen={isUtilityShelfOpen} onDestinationChange={handleDockDestinationChange} onOpenPersonalSurface={openPersonalSurface} onRequestSignOut={requestSignOut} onExitFocus={exitFocusMode} onSearch={openGlobalSearch} onUtilityShelfToggle={toggleUtilityShelf} />}
        <UtilityShelf isOpen={isUtilityShelfOpen} isFocusMode={isFocusMode} isCompactChatVisible={effectiveCompactChatVisible} mobileComposerClearance={mobileComposerClearance} onToggle={toggleUtilityShelf} onClose={closeUtilityShelf} onOpenNotes={openNotes} />
        <div id="nemissive-activity-layer" className="pointer-events-none fixed inset-0 z-[48]"><ActivityToastViewport toasts={activityToasts.toasts} offsetForPulse={!isFocusMode && workspaceLayout.pulseVisible} onActivate={handleActivityToastActivate} onDismiss={activityToasts.dismiss} onPause={activityToasts.pause} onResume={activityToasts.resume} /></div>
      </div>

      <NewConversationModal key={reconnectProfile?.id ?? "new-conversation"} isOpen={isNewConversationOpen} currentUserId={currentUserId} isAccountResolved={isAccountResolved} accountError={accountError} initialProfile={reconnectProfile} relationshipsByProfileId={relationshipsByProfileId} isRelationshipsLoading={messagesController.isLoading || requestsController.isLoading} relationshipsError={messagesController.loadError || requestsController.loadError} onClose={closeNewConversation} onConversationSelected={handleConversationReady} onPendingRequestSelected={handlePendingRequestSelected} onRequestCreated={handleRequestCreated} onOpenIncomingRequests={openMessageRequestsSection} onRefreshRelationships={refreshRelationships} />
      <AnimatePresence initial={false}>{isGlobalSearchOpen && <GlobalSearchDialog currentProfile={currentProfile} conversations={messagesController.conversations} outgoingRequests={messagesController.pendingRequests} incomingRequests={requestsController.requests} returnFocusRef={searchReturnFocusRef} onClose={() => setIsGlobalSearchOpen(false)} onConversationSelected={handleConversationReady} onOutgoingRequestSelected={handlePendingRequestSelected} onIncomingRequestSelected={openMessageRequestsSection} onMessageSelected={handleSearchMessageSelected} />}</AnimatePresence>
      <AnimatePresence initial={false}>{personalSurface && currentProfile && <PersonalSettingsDialog key={personalSurface} surface={personalSurface} profile={currentProfile} quickReactions={quickReactions} notificationPermission={notificationController.permission} isNotificationSupported={notificationController.isSupported} returnFocusRef={personalSurfaceReturnFocusRef} onClose={() => setPersonalSurface(null)} onSaveQuickReactions={saveQuickReactions} onEnableNotifications={enableBrowserNotifications} onSaveNotificationPreferences={saveNotificationPreferences} onProfileIdentityUpdated={handleProfileIdentityUpdated} onAccountDeleted={handleAccountDeleted} />}</AnimatePresence>
      <Suspense fallback={null}><AnimatePresence initial={false}>{isNotesOpen && currentUserId && <NotesWorkspace currentUserId={currentUserId} returnFocusRef={notesReturnFocusRef} onClose={() => setIsNotesOpen(false)} />}</AnimatePresence></Suspense>
      <AnimatePresence initial={false}>{isSignOutDialogOpen && <ConfirmationDialog dialogId="sign-out" title="Sign out of Nemissive?" description="You'll need to sign in again to access your conversations on this device." confirmLabel="Sign out" pendingLabel="Signing out…" pendingAnnouncement="Signing out of Nemissive." icon={<SignOutIcon />} error={signOutError} isPending={isSigningOut} returnFocusRef={signOutReturnFocusRef} onCancel={() => { if (!isSigningOut) { setIsSignOutDialogOpen(false); setSignOutError(""); } }} onConfirm={() => void handleSignOut()} />}</AnimatePresence>
    </>
  );
}

export default DashboardPage;
