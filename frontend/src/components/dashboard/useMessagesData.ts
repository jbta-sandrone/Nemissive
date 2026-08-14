import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { AcceptedConversationItem, ChatMessage, ConversationConnectionStatus, ConversationNicknameRealtimeChange, ConversationThemeRealtimeChange, ParticipantReceiptCursor, PendingOutgoingRequest, ProfileSearchResult } from "../../types/conversations";

type UseMessagesDataOptions = {
  currentUserId: string | null;
  isAccountResolved: boolean;
  currentUserReceiptsByConversationId: ReadonlyMap<string, ParticipantReceiptCursor>;
  onIncomingMessageSynchronized: (conversationId: string, messageCreatedAt: string) => void;
};

type PendingRequestRow = {
  id: string;
  recipient_id: string;
  introduction: string;
  created_at: string;
  status: "pending";
  conversation_id: string | null;
};

type MembershipRow = {
  conversation_id: string;
  last_read_at: string | null;
  muted_until: string | null;
  is_pinned: boolean;
  archived_at: string | null;
  history_cleared_at: string | null;
  deleted_at: string | null;
};

type ArchiveRpcRow = {
  archived_at: string | null;
  is_pinned: boolean;
};

type DeleteConversationRpcRow = {
  history_cleared_at: string;
  deleted_at: string;
  archived_at: null;
  is_pinned: false;
};

type DirectConversationRow = {
  id: string;
  created_at: string;
  updated_at: string;
  theme_key: string;
  connection_status: ConversationConnectionStatus;
  conversation_participants: Array<{ user_id: string }>;
  messages: Array<{ id: string; body: string; message_type: "text" | "image" | "voice" | "file"; created_at: string; edited_at: string | null; is_deleted: boolean; deleted_at: string | null; sender_id: string; message_attachments: Array<{ id: string }> }>;
};

type ConversationNicknameRow = {
  conversation_id: string;
  user_id: string;
  nickname: string;
};

type ConversationInteractionStatusRow = {
  conversation_id: string;
  target_user_id: string;
  connection_status: ConversationConnectionStatus;
  i_blocked: boolean;
  interaction_allowed: boolean;
  messaging_available: boolean;
  request_available: boolean;
};

type ConversationPresenceRow = {
  conversation_id: string;
  profile_id: string;
  active_status_visible: boolean;
  last_seen_at: string | null;
};

function compareConversations(first: AcceptedConversationItem, second: AcceptedConversationItem) {
  if (first.isPinned !== second.isPinned) return first.isPinned ? -1 : 1;
  const firstTimestamp = Date.parse(first.latestMessageAt ?? first.updatedAt);
  const secondTimestamp = Date.parse(second.latestMessageAt ?? second.updatedAt);
  const timestampDifference = secondTimestamp - firstTimestamp;
  return timestampDifference !== 0 ? timestampDifference : first.conversationId.localeCompare(second.conversationId);
}

function compareConversationActivity(first: AcceptedConversationItem, second: AcceptedConversationItem) {
  const firstTimestamp = Date.parse(first.latestMessageAt ?? first.updatedAt);
  const secondTimestamp = Date.parse(second.latestMessageAt ?? second.updatedAt);
  const timestampDifference = secondTimestamp - firstTimestamp;
  return timestampDifference !== 0 ? timestampDifference : first.conversationId.localeCompare(second.conversationId);
}

function redactDeletedConversation(conversation: AcceptedConversationItem, historyClearedAt: string | null, conversationDeletedAt: string) {
  return { ...conversation, latestMessageId: null, latestMessage: null, latestMessageAt: null, latestMessageEditedAt: null, latestMessageIsDeleted: false, latestMessageDeletedAt: null, latestMessageSentByCurrentUser: null, unreadCount: 0, latestUnreadMessageAt: null, isPinned: false, archivedAt: null, historyClearedAt, conversationDeletedAt };
}

function useMessagesData({ currentUserId, isAccountResolved, currentUserReceiptsByConversationId, onIncomingMessageSynchronized }: UseMessagesDataOptions) {
  const latestLoadRef = useRef(0);
  const [pendingRequests, setPendingRequests] = useState<PendingOutgoingRequest[]>([]);
  const [conversations, setConversations] = useState<AcceptedConversationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [loadKey, setLoadKey] = useState(0);

  useEffect(() => {
    if (!currentUserId) return;

    const userId = currentUserId;
    const loadId = ++latestLoadRef.current;
    const abortController = new AbortController();
    let isCancelled = false;

    async function loadMessagesData() {
      const [pendingResult, membershipResult, interactionStatusResult, presenceResult] = await Promise.all([
        supabase.from("conversation_requests").select("id, recipient_id, introduction, created_at, status, conversation_id").eq("sender_id", userId).eq("status", "pending").order("created_at", { ascending: false }).abortSignal(abortController.signal),
        supabase.rpc("list_my_conversation_preferences").abortSignal(abortController.signal),
        supabase.rpc("list_conversation_interaction_statuses").abortSignal(abortController.signal),
        supabase.rpc("list_conversation_presence").abortSignal(abortController.signal),
      ]);

      if (isCancelled || loadId !== latestLoadRef.current) return;

      if (pendingResult.error || membershipResult.error || interactionStatusResult.error || presenceResult.error) {
        setIsLoading(false);
        setHasLoaded(true);
        setLoadError("We couldn’t load your messages right now. Check your connection and try again.");
        if (import.meta.env.DEV) console.error("Loading message sidebar records failed", { pendingError: pendingResult.error, membershipError: membershipResult.error, interactionStatusError: interactionStatusResult.error, presenceError: presenceResult.error });
        return;
      }

      const pendingRows = (pendingResult.data ?? []) as PendingRequestRow[];
      const membershipRows = (membershipResult.data ?? []) as MembershipRow[];
      const interactionStatusRows = (interactionStatusResult.data ?? []) as ConversationInteractionStatusRow[];
      const presenceRows = (presenceResult.data ?? []) as ConversationPresenceRow[];
      const conversationIds = [...new Set(membershipRows.map((row) => row.conversation_id))];
      const membershipByConversationId = new Map(membershipRows.map((row) => [row.conversation_id, row]));
      const interactionStatusByConversationId = new Map(interactionStatusRows.map((row) => [row.conversation_id, row]));
      const presenceByConversationId = new Map(presenceRows.map((row) => [row.conversation_id, row]));
      let directConversationRows: DirectConversationRow[] = [];
      let nicknameRows: ConversationNicknameRow[] = [];

      if (conversationIds.length > 0) {
        const { data: conversationData, error: conversationError } = await supabase
          .from("conversations")
          .select("id, created_at, updated_at, theme_key, connection_status, conversation_participants(user_id), messages(id, body, message_type, created_at, edited_at, is_deleted, deleted_at, sender_id, message_attachments(id))")
          .in("id", conversationIds)
          .eq("conversation_type", "direct")
          .order("created_at", { referencedTable: "messages", ascending: false })
          .limit(1, { referencedTable: "messages" })
          .abortSignal(abortController.signal);

        if (isCancelled || loadId !== latestLoadRef.current) return;

        if (conversationError) {
          setIsLoading(false);
          setHasLoaded(true);
          setLoadError("We couldn’t load your accepted conversations. Please try again.");
          if (import.meta.env.DEV) console.error("Loading accepted conversations failed", conversationError);
          return;
        }

        directConversationRows = (conversationData ?? []) as DirectConversationRow[];

        const { data: nicknameData, error: nicknameError } = await supabase.from("conversation_nicknames").select("conversation_id, user_id, nickname").in("conversation_id", conversationIds).abortSignal(abortController.signal);
        if (isCancelled || loadId !== latestLoadRef.current) return;
        if (nicknameError) {
          setIsLoading(false);
          setHasLoaded(true);
          setLoadError("We couldn’t load conversation names. Please try again.");
          if (import.meta.env.DEV) console.error("Loading conversation nicknames failed", nicknameError);
          return;
        }
        nicknameRows = (nicknameData ?? []) as ConversationNicknameRow[];
      }

      const unreadCountResults = await Promise.all(directConversationRows.map((conversation) => {
        const lastReadAt = membershipByConversationId.get(conversation.id)?.last_read_at ?? null;
        let unreadQuery = supabase.from("messages").select("created_at", { count: "exact" }).eq("conversation_id", conversation.id).neq("sender_id", userId).order("created_at", { ascending: false }).limit(1);
        if (lastReadAt) unreadQuery = unreadQuery.gt("created_at", lastReadAt);
        return unreadQuery.abortSignal(abortController.signal);
      }));

      if (isCancelled || loadId !== latestLoadRef.current) return;
      const unreadCountError = unreadCountResults.find((result) => result.error)?.error;
      if (unreadCountError) {
        setIsLoading(false);
        setHasLoaded(true);
        setLoadError("We couldn’t load your unread messages. Please retry.");
        if (import.meta.env.DEV) console.error("Loading unread conversation counts failed", unreadCountError);
        return;
      }

      const unreadCountByConversationId = new Map(directConversationRows.map((conversation, index) => [conversation.id, unreadCountResults[index]?.count ?? 0]));
      const latestUnreadMessageAtByConversationId = new Map(directConversationRows.map((conversation, index) => [conversation.id, unreadCountResults[index]?.data?.[0]?.created_at ?? null]));

      const otherUserIdByConversationId = new Map<string, string>();
      directConversationRows.forEach((conversation) => {
        const otherParticipant = conversation.conversation_participants.find((participant) => participant.user_id !== userId);
        if (otherParticipant) otherUserIdByConversationId.set(conversation.id, otherParticipant.user_id);
      });

      const profileIds = [...new Set([...pendingRows.map((request) => request.recipient_id), ...otherUserIdByConversationId.values()])];
      let profiles: ProfileSearchResult[] = [];

      if (profileIds.length > 0) {
        const { data: profileData, error: profileError } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", profileIds).abortSignal(abortController.signal);

        if (isCancelled || loadId !== latestLoadRef.current) return;

        if (profileError) {
          setIsLoading(false);
          setHasLoaded(true);
          setLoadError("We couldn’t load the people in your messages. Please retry.");
          if (import.meta.env.DEV) console.error("Loading message sidebar profiles failed", profileError);
          return;
        }

        profiles = (profileData ?? []) as ProfileSearchResult[];
      }

      const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
      const nicknameByConversationAndUser = new Map(nicknameRows.map((row) => [`${row.conversation_id}:${row.user_id}`, row.nickname]));
      const fallbackProfile = (id: string): ProfileSearchResult => ({ id, username: null, display_name: null, avatar_url: null });
      const nextPendingRequests = pendingRows.map((request): PendingOutgoingRequest => ({
        kind: "pending",
        requestId: request.id,
        otherProfile: profileById.get(request.recipient_id) ?? fallbackProfile(request.recipient_id),
        introduction: request.introduction,
        createdAt: request.created_at,
        status: "pending",
        conversationId: request.conversation_id,
      }));
      const nextConversations = directConversationRows.flatMap((conversation): AcceptedConversationItem[] => {
        const otherUserId = otherUserIdByConversationId.get(conversation.id);
        if (!otherUserId) return [];
        const latestMessage = conversation.messages[0] ?? null;
        const presence = presenceByConversationId.get(conversation.id);
        const baseOtherProfile = profileById.get(otherUserId) ?? fallbackProfile(otherUserId);
        if (latestMessage && latestMessage.sender_id !== userId) onIncomingMessageSynchronized(conversation.id, latestMessage.created_at);
        return [{
          kind: "conversation",
          conversationId: conversation.id,
          otherProfile: {
            ...baseOtherProfile,
            active_status_visible: presence?.profile_id === otherUserId ? presence.active_status_visible : false,
            last_seen_at: presence?.profile_id === otherUserId ? presence.last_seen_at : null,
          },
          latestMessageId: latestMessage?.id ?? null,
          latestMessage: latestMessage ? latestMessage.is_deleted ? "Message deleted" : latestMessage.message_type === "voice" ? "Voice message" : latestMessage.message_type === "image" ? latestMessage.body || "Photo" : latestMessage.message_type === "file" ? latestMessage.body || ((latestMessage.message_attachments?.length ?? 0) > 1 ? `${latestMessage.message_attachments.length} files` : "File") : latestMessage.body : null,
          latestMessageAt: latestMessage?.created_at ?? null,
          latestMessageEditedAt: latestMessage?.edited_at ?? null,
          latestMessageIsDeleted: latestMessage?.is_deleted ?? false,
          latestMessageDeletedAt: latestMessage?.deleted_at ?? null,
          latestMessageSentByCurrentUser: latestMessage ? latestMessage.sender_id === userId : null,
          updatedAt: conversation.updated_at || conversation.created_at,
          unreadCount: unreadCountByConversationId.get(conversation.id) ?? 0,
          currentUserLastReadAt: membershipByConversationId.get(conversation.id)?.last_read_at ?? null,
          latestUnreadMessageAt: latestUnreadMessageAtByConversationId.get(conversation.id) ?? null,
          mutedUntil: membershipByConversationId.get(conversation.id)?.muted_until ?? null,
          isPinned: membershipByConversationId.get(conversation.id)?.is_pinned ?? false,
          archivedAt: membershipByConversationId.get(conversation.id)?.archived_at ?? null,
          historyClearedAt: membershipByConversationId.get(conversation.id)?.history_cleared_at ?? null,
          conversationDeletedAt: membershipByConversationId.get(conversation.id)?.deleted_at ?? null,
          otherNickname: nicknameByConversationAndUser.get(`${conversation.id}:${otherUserId}`) ?? null,
          themeKey: conversation.theme_key || "default",
          connectionStatus: interactionStatusByConversationId.get(conversation.id)?.connection_status ?? conversation.connection_status ?? "accepted",
          iBlocked: interactionStatusByConversationId.get(conversation.id)?.i_blocked ?? false,
          interactionAllowed: interactionStatusByConversationId.get(conversation.id)?.interaction_allowed ?? true,
          messagingAvailable: interactionStatusByConversationId.get(conversation.id)?.messaging_available ?? true,
          requestAvailable: interactionStatusByConversationId.get(conversation.id)?.request_available ?? false,
        }];
      }).sort(compareConversations);

      setPendingRequests(nextPendingRequests);
      setConversations(nextConversations);
      setIsLoading(false);
      setHasLoaded(true);
      setLoadError("");
    }

    void loadMessagesData();

    return () => {
      isCancelled = true;
      abortController.abort();
    };
  }, [currentUserId, loadKey, onIncomingMessageSynchronized]);

  const refresh = useCallback(() => {
    latestLoadRef.current += 1;
    setIsLoading(true);
    setLoadError("");
    setLoadKey((key) => key + 1);
  }, []);

  const refreshSilently = useCallback(() => {
    latestLoadRef.current += 1;
    setLoadKey((key) => key + 1);
  }, []);

  const patchMessagePreview = useCallback((message: ChatMessage, allowDeletedRestore = false) => {
    setConversations((currentConversations) => currentConversations.map((conversation) => {
      if (conversation.conversationId !== message.conversationId || conversation.latestMessageId !== message.id) return conversation;
      if (conversation.latestMessageIsDeleted && !message.isDeleted && !allowDeletedRestore) return conversation;
      if (message.isDeleted) {
        return {
          ...conversation,
          latestMessage: "Message deleted",
          latestMessageEditedAt: message.editedAt,
          latestMessageIsDeleted: true,
          latestMessageDeletedAt: message.deletedAt,
        };
      }
      const currentEditedTime = Date.parse(conversation.latestMessageEditedAt ?? "");
      const incomingEditedTime = Date.parse(message.editedAt ?? "");
      if (!Number.isNaN(currentEditedTime) && (Number.isNaN(incomingEditedTime) || incomingEditedTime < currentEditedTime)) return conversation;
      if (!Number.isNaN(currentEditedTime) && incomingEditedTime === currentEditedTime && conversation.latestMessage !== message.body) return conversation;
      return { ...conversation, latestMessage: message.messageType === "voice" ? "Voice message" : message.messageType === "image" ? message.body || "Photo" : message.messageType === "file" ? message.body || (message.attachments.length > 1 ? `${message.attachments.length} files` : "File") : message.body, latestMessageEditedAt: message.editedAt, latestMessageIsDeleted: false, latestMessageDeletedAt: null };
    }));
  }, []);

  const patchConversationMute = useCallback((conversationId: string, mutedUntil: string | null) => {
    setConversations((currentConversations) => currentConversations.map((conversation) => conversation.conversationId === conversationId ? { ...conversation, mutedUntil } : conversation));
  }, []);

  const setConversationPinned = useCallback(async (conversationId: string, pinned: boolean) => {
    const { data, error } = await supabase.rpc("set_conversation_pinned", { target_conversation_id: conversationId, pinned });
    if (error) {
      if (import.meta.env.DEV) console.warn("Saving conversation pin failed", { conversationId, code: error.code });
      return "We couldn’t update this pinned conversation. Please try again.";
    }

    const savedPinned = typeof data === "boolean" ? data : pinned;
    setConversations((currentConversations) => currentConversations.map((conversation) => conversation.conversationId === conversationId ? { ...conversation, isPinned: savedPinned } : conversation).sort(compareConversations));
    return null;
  }, []);

  const setConversationArchived = useCallback(async (conversationId: string, archived: boolean) => {
    const { data, error } = await supabase.rpc("set_conversation_archived", { target_conversation_id: conversationId, archived });
    if (error) {
      if (import.meta.env.DEV) console.warn("Saving conversation archive failed", { conversationId, code: error.code });
      return "We couldn’t update this archived conversation. Please try again.";
    }

    const result = (Array.isArray(data) ? data[0] : data) as ArchiveRpcRow | null;
    const savedArchivedAt = archived ? result?.archived_at ?? new Date().toISOString() : null;
    const savedPinned = result?.is_pinned ?? (archived ? false : undefined);
    setConversations((currentConversations) => currentConversations.map((conversation) => conversation.conversationId === conversationId ? { ...conversation, archivedAt: savedArchivedAt, isPinned: savedPinned ?? conversation.isPinned } : conversation).sort(compareConversations));
    return null;
  }, []);

  const deleteConversationForMe = useCallback(async (conversationId: string) => {
    const { data, error } = await supabase.rpc("delete_conversation_for_me", { target_conversation_id: conversationId });
    if (error) {
      if (import.meta.env.DEV) console.warn("Deleting conversation for participant failed", { conversationId, code: error.code });
      return "We couldn’t delete this chat. Please try again.";
    }

    const result = (Array.isArray(data) ? data[0] : data) as DeleteConversationRpcRow | null;
    if (!result?.deleted_at) return "We couldn’t confirm that this chat was deleted. Please try again.";
    setConversations((currentConversations) => currentConversations.map((conversation) => conversation.conversationId === conversationId ? redactDeletedConversation(conversation, result.history_cleared_at, result.deleted_at) : conversation).sort(compareConversations));
    return null;
  }, []);

  const patchConversationPreferences = useCallback((conversationId: string, isPinned: boolean, archivedAt: string | null, historyClearedAt: string | null, conversationDeletedAt: string | null) => {
    setConversations((currentConversations) => currentConversations.map((conversation) => {
      if (conversation.conversationId !== conversationId) return conversation;
      if (conversationDeletedAt) return redactDeletedConversation(conversation, historyClearedAt, conversationDeletedAt);
      return { ...conversation, isPinned, archivedAt, historyClearedAt, conversationDeletedAt: null };
    }).sort(compareConversations));
  }, []);

  const patchConversationNickname = useCallback((change: ConversationNicknameRealtimeChange) => {
    setConversations((currentConversations) => currentConversations.map((conversation) => {
      if (conversation.conversationId !== change.nickname.conversationId || conversation.otherProfile.id !== change.nickname.userId) return conversation;
      return { ...conversation, otherNickname: change.action === "delete" ? null : change.nickname.nickname };
    }));
  }, []);

  const patchConversationTheme = useCallback((change: ConversationThemeRealtimeChange) => {
    setConversations((currentConversations) => currentConversations.map((conversation) => conversation.conversationId === change.conversationId ? { ...conversation, themeKey: change.themeKey } : conversation));
  }, []);

  const patchProfileIdentity = useCallback((identity: Pick<ProfileSearchResult, "id" | "username" | "display_name" | "avatar_url">) => {
    setPendingRequests((currentRequests) => currentRequests.map((request) => request.otherProfile.id === identity.id ? { ...request, otherProfile: { ...request.otherProfile, ...identity } } : request));
    setConversations((currentConversations) => currentConversations.map((conversation) => conversation.otherProfile.id === identity.id ? { ...conversation, otherProfile: { ...conversation.otherProfile, ...identity } } : conversation));
  }, []);

  const patchConversationInteractionStatus = useCallback((conversationId: string, iBlocked: boolean, messagingAvailable: boolean) => {
    setConversations((currentConversations) => currentConversations.map((conversation) => conversation.conversationId === conversationId ? { ...conversation, iBlocked, messagingAvailable } : conversation));
  }, []);

  const patchConversationConnectionStatus = useCallback((conversationId: string, connectionStatus: ConversationConnectionStatus, requestAvailable?: boolean) => {
    setConversations((currentConversations) => currentConversations.map((conversation) => conversation.conversationId === conversationId ? {
      ...conversation,
      connectionStatus,
      messagingAvailable: connectionStatus === "accepted" && conversation.interactionAllowed,
      requestAvailable: requestAvailable ?? conversation.requestAvailable,
    } : conversation));
  }, []);

  const conversationsWithReceiptState = useMemo(() => conversations.map((conversation) => {
    const receipt = currentUserReceiptsByConversationId.get(conversation.conversationId);
    const nextReadAt = receipt?.lastReadAt ?? null;
    if (!nextReadAt) return conversation;
    const currentReadTime = Date.parse(conversation.currentUserLastReadAt ?? "");
    const nextReadTime = Date.parse(nextReadAt);
    if (Number.isNaN(nextReadTime) || (!Number.isNaN(currentReadTime) && nextReadTime <= currentReadTime)) return conversation;
    const latestUnreadTime = Date.parse(conversation.latestUnreadMessageAt ?? "");
    const clearsUnread = Number.isNaN(latestUnreadTime) || nextReadTime >= latestUnreadTime;
    return { ...conversation, currentUserLastReadAt: nextReadAt, unreadCount: clearsUnread ? 0 : conversation.unreadCount, latestUnreadMessageAt: clearsUnread ? null : conversation.latestUnreadMessageAt };
  }), [conversations, currentUserReceiptsByConversationId]);
  const visibleConversations = useMemo(() => conversationsWithReceiptState.filter((conversation) => !conversation.conversationDeletedAt), [conversationsWithReceiptState]);
  const inboxConversations = useMemo(() => visibleConversations.filter((conversation) => !conversation.archivedAt).sort(compareConversations), [visibleConversations]);
  const archivedConversations = useMemo(() => visibleConversations.filter((conversation) => Boolean(conversation.archivedAt)).sort(compareConversationActivity), [visibleConversations]);
  const connectedConversations = useMemo(() => conversationsWithReceiptState.filter((conversation) => conversation.connectionStatus === "accepted"), [conversationsWithReceiptState]);

  return {
    pendingRequests: currentUserId ? pendingRequests : [],
    conversations: currentUserId ? visibleConversations : [],
    relationshipConversations: currentUserId ? conversationsWithReceiptState : [],
    connectedConversations: currentUserId ? connectedConversations : [],
    notificationConversations: currentUserId ? conversationsWithReceiptState : [],
    inboxConversations: currentUserId ? inboxConversations : [],
    archivedConversations: currentUserId ? archivedConversations : [],
    isLoading: currentUserId ? isLoading : !isAccountResolved,
    hasLoaded: currentUserId ? hasLoaded : isAccountResolved,
    loadError: currentUserId ? loadError : isAccountResolved ? "Your session has expired. Please sign in again." : "",
    aggregateUnreadCount: currentUserId ? visibleConversations.reduce((total, conversation) => total + conversation.unreadCount, 0) : 0,
    refresh,
    refreshSilently,
    patchMessagePreview,
    patchConversationMute,
    setConversationPinned,
    setConversationArchived,
    deleteConversationForMe,
    patchConversationPreferences,
    patchConversationNickname,
    patchConversationTheme,
    patchProfileIdentity,
    patchConversationInteractionStatus,
    patchConversationConnectionStatus,
  };
}

export type MessagesDataController = ReturnType<typeof useMessagesData>;

export default useMessagesData;
