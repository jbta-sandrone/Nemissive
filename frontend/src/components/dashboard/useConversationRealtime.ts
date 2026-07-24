import { useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";
import type { ChatMessage, MessageReaction, MessageReactionDeleteIdentity, MessageReactionRealtimeChange, ParticipantReceiptCursor, RealtimeProfileLastSeenEvent } from "../../types/conversations";

type UseConversationRealtimeOptions = {
  currentUserId: string | null;
  onRequestsChanged: () => void;
  onConversationDataChanged: () => void;
  onMessageInserted: (message: ChatMessage) => void;
  onMessageReactionChanged: (change: MessageReactionRealtimeChange) => void;
  onParticipantReceiptUpdated: (receipt: ParticipantReceiptCursor) => void;
  onProfileLastSeenUpdated: (profile: RealtimeProfileLastSeenEvent) => void;
  onOpenConversationMessagesChanged: () => void;
};

type InvalidationState = {
  requests: boolean;
  conversationData: boolean;
  openConversationMessages: boolean;
};

const realtimeDebounceMs = 180;

function parseRealtimeMessage(value: unknown): ChatMessage | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.conversation_id !== "string" || typeof row.sender_id !== "string" || typeof row.body !== "string" || typeof row.created_at !== "string") return null;

  return {
    kind: "confirmed",
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
    isIntroduction: typeof row.source_request_id === "string",
  };
}

function parseParticipantReceipt(value: unknown): ParticipantReceiptCursor | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.conversation_id !== "string" || typeof row.user_id !== "string") return null;
  if (row.last_delivered_at !== null && typeof row.last_delivered_at !== "string") return null;
  if (row.last_read_at !== null && typeof row.last_read_at !== "string") return null;

  return {
    conversationId: row.conversation_id,
    userId: row.user_id,
    lastDeliveredAt: row.last_delivered_at,
    lastReadAt: row.last_read_at,
  };
}

function parseProfileLastSeen(value: unknown): RealtimeProfileLastSeenEvent | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.last_seen_at !== "string" || Number.isNaN(Date.parse(row.last_seen_at))) return null;
  return { profileId: row.id, lastSeenAt: row.last_seen_at };
}

function parseInsertedMessageReaction(value: unknown): MessageReaction | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.message_id !== "string" || typeof row.user_id !== "string" || typeof row.emoji !== "string") return null;
  return { id: row.id, messageId: row.message_id, userId: row.user_id, emoji: row.emoji, createdAt: typeof row.created_at === "string" ? row.created_at : "" };
}

function parseDeletedMessageReaction(value: unknown): MessageReactionDeleteIdentity | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" && row.id ? row.id : null;
  const messageId = typeof row.message_id === "string" && row.message_id ? row.message_id : null;
  const userId = typeof row.user_id === "string" && row.user_id ? row.user_id : null;
  const emoji = typeof row.emoji === "string" && row.emoji ? row.emoji : null;
  const hasCompleteTuple = Boolean(messageId && userId && emoji);
  return id || hasCompleteTuple ? { id, messageId, userId, emoji } : null;
}

function useConversationRealtime({ currentUserId, onRequestsChanged, onConversationDataChanged, onMessageInserted, onMessageReactionChanged, onParticipantReceiptUpdated, onProfileLastSeenUpdated, onOpenConversationMessagesChanged }: UseConversationRealtimeOptions) {
  const callbacksRef = useRef({ onRequestsChanged, onConversationDataChanged, onMessageInserted, onMessageReactionChanged, onParticipantReceiptUpdated, onProfileLastSeenUpdated, onOpenConversationMessagesChanged });

  useEffect(() => {
    callbacksRef.current = { onRequestsChanged, onConversationDataChanged, onMessageInserted, onMessageReactionChanged, onParticipantReceiptUpdated, onProfileLastSeenUpdated, onOpenConversationMessagesChanged };
  }, [onConversationDataChanged, onMessageInserted, onMessageReactionChanged, onOpenConversationMessagesChanged, onParticipantReceiptUpdated, onProfileLastSeenUpdated, onRequestsChanged]);

  useEffect(() => {
    if (!currentUserId) return;

    let debounceTimer: ReturnType<typeof window.setTimeout> | null = null;
    let hasSubscribed = false;
    let hasWarnedAboutReactionDeleteIdentity = false;
    let isCleaningUp = false;
    const pendingInvalidations: InvalidationState = { requests: false, conversationData: false, openConversationMessages: false };

    function flushInvalidations() {
      debounceTimer = null;
      const nextInvalidations = { ...pendingInvalidations };
      pendingInvalidations.requests = false;
      pendingInvalidations.conversationData = false;
      pendingInvalidations.openConversationMessages = false;

      if (nextInvalidations.requests) callbacksRef.current.onRequestsChanged();
      if (nextInvalidations.conversationData) callbacksRef.current.onConversationDataChanged();
      if (nextInvalidations.openConversationMessages) callbacksRef.current.onOpenConversationMessagesChanged();
    }

    function scheduleInvalidation(invalidations: Partial<InvalidationState>) {
      if (invalidations.requests) pendingInvalidations.requests = true;
      if (invalidations.conversationData) pendingInvalidations.conversationData = true;
      if (invalidations.openConversationMessages) pendingInvalidations.openConversationMessages = true;
      if (debounceTimer !== null) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(flushInvalidations, realtimeDebounceMs);
    }

    function recoverMissedEvents() {
      scheduleInvalidation({ requests: true, conversationData: true, openConversationMessages: true });
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") recoverMissedEvents();
    }

    const channel = supabase
      .channel(`nemissive-conversation-realtime:${currentUserId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_requests" }, () => {
        scheduleInvalidation({ requests: true, conversationData: true });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "conversation_participants" }, () => {
        scheduleInvalidation({ conversationData: true });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversation_participants" }, (payload) => {
        const receipt = parseParticipantReceipt(payload.new);
        if (receipt) callbacksRef.current.onParticipantReceiptUpdated(receipt);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "conversation_participants" }, () => {
        scheduleInvalidation({ conversationData: true });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        scheduleInvalidation({ conversationData: true });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const message = parseRealtimeMessage(payload.new);
        if (message) callbacksRef.current.onMessageInserted(message);
        scheduleInvalidation({ conversationData: true, openConversationMessages: !message });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, () => {
        scheduleInvalidation({ conversationData: true, openConversationMessages: true });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, () => {
        scheduleInvalidation({ conversationData: true, openConversationMessages: true });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reactions" }, (payload) => {
        const reaction = parseInsertedMessageReaction(payload.new);
        if (reaction) callbacksRef.current.onMessageReactionChanged({ action: "insert", reaction });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "message_reactions" }, (payload) => {
        const reaction = parseDeletedMessageReaction(payload.old);
        if (reaction) {
          callbacksRef.current.onMessageReactionChanged({ action: "delete", reaction });
          return;
        }
        if (!hasWarnedAboutReactionDeleteIdentity && import.meta.env.DEV) {
          hasWarnedAboutReactionDeleteIdentity = true;
          console.warn("Nemissive received a reaction DELETE event without enough identity to reconcile it.");
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, (payload) => {
        const profile = parseProfileLastSeen(payload.new);
        if (profile) callbacksRef.current.onProfileLastSeenUpdated(profile);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (hasSubscribed) scheduleInvalidation({ requests: true, conversationData: true, openConversationMessages: true });
          hasSubscribed = true;
          if (import.meta.env.DEV) console.info("Nemissive Realtime subscribed", { currentUserId });
          return;
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          if (import.meta.env.DEV) console.warn("Nemissive Realtime connection interrupted", { currentUserId, status });
          return;
        }

        if (status === "CLOSED" && !isCleaningUp && import.meta.env.DEV) console.info("Nemissive Realtime channel closed", { currentUserId });
      });

    window.addEventListener("online", recoverMissedEvents);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isCleaningUp = true;
      if (debounceTimer !== null) window.clearTimeout(debounceTimer);
      window.removeEventListener("online", recoverMissedEvents);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void supabase.removeChannel(channel);
    };
  }, [currentUserId]);
}

export default useConversationRealtime;
