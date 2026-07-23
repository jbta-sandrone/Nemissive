import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { AcceptedConversationItem, PendingOutgoingRequest, ProfileSearchResult } from "../../types/conversations";

type UseMessagesDataOptions = {
  currentUserId: string | null;
  isAccountResolved: boolean;
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
};

type DirectConversationRow = {
  id: string;
  created_at: string;
  updated_at: string;
  conversation_participants: Array<{ user_id: string }>;
  messages: Array<{ body: string; created_at: string; sender_id: string }>;
};

function useMessagesData({ currentUserId, isAccountResolved }: UseMessagesDataOptions) {
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
        supabase.from("conversation_participants").select("conversation_id").eq("user_id", userId).abortSignal(abortController.signal),
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
      const conversationIds = [...new Set(((membershipResult.data ?? []) as MembershipRow[]).map((row) => row.conversation_id))];
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
        return [{
          kind: "conversation",
          conversationId: conversation.id,
          otherProfile: profileById.get(otherUserId) ?? fallbackProfile(otherUserId),
          latestMessage: latestMessage?.body ?? null,
          latestMessageAt: latestMessage?.created_at ?? null,
          latestMessageSentByCurrentUser: latestMessage ? latestMessage.sender_id === userId : null,
          updatedAt: conversation.updated_at || conversation.created_at,
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
  }, [currentUserId, loadKey]);

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

  return {
    pendingRequests: currentUserId ? pendingRequests : [],
    conversations: currentUserId ? conversations : [],
    isLoading: currentUserId ? isLoading : !isAccountResolved,
    hasLoaded: currentUserId ? hasLoaded : isAccountResolved,
    loadError: currentUserId ? loadError : isAccountResolved ? "Your session has expired. Please sign in again." : "",
    refresh,
    refreshSilently,
  };
}

export type MessagesDataController = ReturnType<typeof useMessagesData>;

export default useMessagesData;
