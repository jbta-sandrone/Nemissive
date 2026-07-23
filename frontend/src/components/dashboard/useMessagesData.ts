import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { AcceptedConversationItem, ParticipantReceiptCursor, PendingOutgoingRequest, ProfileSearchResult } from "../../types/conversations";

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
};

type DirectConversationRow = {
  id: string;
  created_at: string;
  updated_at: string;
  conversation_participants: Array<{ user_id: string }>;
  messages: Array<{ body: string; created_at: string; sender_id: string }>;
};

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
      const [pendingResult, membershipResult] = await Promise.all([
        supabase.from("conversation_requests").select("id, recipient_id, introduction, created_at, status, conversation_id").eq("sender_id", userId).eq("status", "pending").order("created_at", { ascending: false }).abortSignal(abortController.signal),
        supabase.from("conversation_participants").select("conversation_id, last_read_at").eq("user_id", userId).abortSignal(abortController.signal),
      ]);

      if (isCancelled || loadId !== latestLoadRef.current) return;

      if (pendingResult.error || membershipResult.error) {
        setIsLoading(false);
        setHasLoaded(true);
        setLoadError("We couldn’t load your messages right now. Check your connection and try again.");
        if (import.meta.env.DEV) console.error("Loading message sidebar records failed", { pendingError: pendingResult.error, membershipError: membershipResult.error });
        return;
      }

      const pendingRows = (pendingResult.data ?? []) as PendingRequestRow[];
      const membershipRows = (membershipResult.data ?? []) as MembershipRow[];
      const conversationIds = [...new Set(membershipRows.map((row) => row.conversation_id))];
      const membershipByConversationId = new Map(membershipRows.map((row) => [row.conversation_id, row]));
      let directConversationRows: DirectConversationRow[] = [];

      if (conversationIds.length > 0) {
        const { data: conversationData, error: conversationError } = await supabase
          .from("conversations")
          .select("id, created_at, updated_at, conversation_participants(user_id), messages(body, created_at, sender_id)")
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
        const { data: profileData, error: profileError } = await supabase.from("profiles").select("id, username, display_name, avatar_url, last_seen_at").in("id", profileIds).abortSignal(abortController.signal);

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
        if (latestMessage && latestMessage.sender_id !== userId) onIncomingMessageSynchronized(conversation.id, latestMessage.created_at);
        return [{
          kind: "conversation",
          conversationId: conversation.id,
          otherProfile: profileById.get(otherUserId) ?? fallbackProfile(otherUserId),
          latestMessage: latestMessage?.body ?? null,
          latestMessageAt: latestMessage?.created_at ?? null,
          latestMessageSentByCurrentUser: latestMessage ? latestMessage.sender_id === userId : null,
          updatedAt: conversation.updated_at || conversation.created_at,
          unreadCount: unreadCountByConversationId.get(conversation.id) ?? 0,
          currentUserLastReadAt: membershipByConversationId.get(conversation.id)?.last_read_at ?? null,
          latestUnreadMessageAt: latestUnreadMessageAtByConversationId.get(conversation.id) ?? null,
        }];
      }).sort((first, second) => {
        const firstTimestamp = Date.parse(first.latestMessageAt ?? first.updatedAt);
        const secondTimestamp = Date.parse(second.latestMessageAt ?? second.updatedAt);
        return secondTimestamp - firstTimestamp;
      });

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

  const mergeProfileLastSeen = useCallback((profileId: string, lastSeenAt: string) => {
    const incomingTime = Date.parse(lastSeenAt);
    if (Number.isNaN(incomingTime)) return;

    setConversations((currentConversations) => currentConversations.map((conversation) => {
      if (conversation.otherProfile.id !== profileId) return conversation;
      const currentTime = Date.parse(conversation.otherProfile.last_seen_at ?? "");
      if (!Number.isNaN(currentTime) && currentTime >= incomingTime) return conversation;
      return { ...conversation, otherProfile: { ...conversation.otherProfile, last_seen_at: lastSeenAt } };
    }));
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

  return {
    pendingRequests: currentUserId ? pendingRequests : [],
    conversations: currentUserId ? conversationsWithReceiptState : [],
    isLoading: currentUserId ? isLoading : !isAccountResolved,
    hasLoaded: currentUserId ? hasLoaded : isAccountResolved,
    loadError: currentUserId ? loadError : isAccountResolved ? "Your session has expired. Please sign in again." : "",
    aggregateUnreadCount: currentUserId ? conversationsWithReceiptState.reduce((total, conversation) => total + conversation.unreadCount, 0) : 0,
    refresh,
    refreshSilently,
    mergeProfileLastSeen,
  };
}

export type MessagesDataController = ReturnType<typeof useMessagesData>;

export default useMessagesData;
