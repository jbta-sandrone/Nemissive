import { useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { announcePrivacyPreferencesChanged } from "../../lib/privacyPreferences";
import { announceProfileIdentityChanged } from "../../lib/profileIdentity";
import type { ChatMessage, ConversationActivityRealtimeChange, ConversationConnectionRealtimeChange, ConversationNicknameRealtimeChange, ConversationRequestRealtimeChange, ConversationThemeRealtimeChange, MessageReaction, MessageReactionDeleteIdentity, MessageReactionRealtimeChange, ParticipantConversationPreferencesState, ParticipantMuteState, PinnedMessageRealtimeChange, RealtimeNotificationPreferencesEvent, RealtimeProfileIdentityEvent } from "../../types/conversations";

type UseConversationRealtimeOptions = {
  currentUserId: string | null;
  onRequestsChanged: () => void;
  onConversationRequestChanged: (change: ConversationRequestRealtimeChange) => void;
  onConversationDataChanged: () => void;
  onMessageInserted: (message: ChatMessage) => void;
  onMessageUpdated: (message: ChatMessage) => void;
  onMessageReactionChanged: (change: MessageReactionRealtimeChange) => void;
  onPinnedMessageChanged: (change: PinnedMessageRealtimeChange) => void;
  onConversationActivityChanged: (change: ConversationActivityRealtimeChange) => void;
  onConversationNicknameChanged: (change: ConversationNicknameRealtimeChange) => void;
  onConversationThemeChanged: (change: ConversationThemeRealtimeChange) => void;
  onConversationConnectionChanged: (change: ConversationConnectionRealtimeChange) => void;
  onParticipantReceiptsChanged: (conversationId: string) => void;
  onParticipantMuteUpdated: (muteState: ParticipantMuteState) => void;
  onParticipantPreferencesUpdated: (preferences: ParticipantConversationPreferencesState) => void;
  onNotificationPreferencesUpdated: (preferences: RealtimeNotificationPreferencesEvent) => void;
  onProfileIdentityUpdated: (identity: RealtimeProfileIdentityEvent) => void;
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
  if (typeof row.is_deleted !== "boolean") return null;
  if (row.deleted_at !== null && typeof row.deleted_at !== "string") return null;

  return {
    kind: "confirmed",
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
    editedAt: typeof row.edited_at === "string" ? row.edited_at : null,
    isDeleted: row.is_deleted,
    deletedAt: typeof row.deleted_at === "string" ? row.deleted_at : null,
    isIntroduction: typeof row.source_request_id === "string",
    messageType: row.message_type === "image" || row.message_type === "voice" || row.message_type === "file" ? row.message_type : "text",
    attachments: [],
    replyToMessageId: typeof row.reply_to_message_id === "string" ? row.reply_to_message_id : null,
    replyPreview: null,
  };
}

function parseParticipantConversationId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  return typeof row.conversation_id === "string" ? row.conversation_id : null;
}

function parseConversationRequest(value: unknown): ConversationRequestRealtimeChange["request"] | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const status = row.status;
  if (typeof row.id !== "string" || typeof row.sender_id !== "string" || typeof row.recipient_id !== "string") return null;
  if (status !== "pending" && status !== "accepted" && status !== "declined" && status !== "cancelled") return null;
  if (row.conversation_id !== null && typeof row.conversation_id !== "string") return null;
  return { id: row.id, senderId: row.sender_id, recipientId: row.recipient_id, status, conversationId: row.conversation_id };
}

function parseParticipantMute(value: unknown): ParticipantMuteState | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.conversation_id !== "string" || typeof row.user_id !== "string") return null;
  if (row.muted_until !== null && typeof row.muted_until !== "string") return null;
  return { conversationId: row.conversation_id, userId: row.user_id, mutedUntil: row.muted_until };
}

function parseParticipantPreferences(value: unknown): ParticipantConversationPreferencesState | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.conversation_id !== "string" || typeof row.user_id !== "string" || typeof row.is_pinned !== "boolean") return null;
  if (row.archived_at !== null && typeof row.archived_at !== "string") return null;
  if (row.history_cleared_at !== null && typeof row.history_cleared_at !== "string") return null;
  if (row.deleted_at !== null && typeof row.deleted_at !== "string") return null;
  if (row.interaction_updated_at !== undefined && row.interaction_updated_at !== null && typeof row.interaction_updated_at !== "string") return null;
  return { conversationId: row.conversation_id, userId: row.user_id, isPinned: row.is_pinned, archivedAt: row.archived_at, historyClearedAt: row.history_cleared_at, conversationDeletedAt: row.deleted_at, interactionUpdatedAt: typeof row.interaction_updated_at === "string" ? row.interaction_updated_at : null };
}

function parseNotificationPreferences(value: unknown): RealtimeNotificationPreferencesEvent | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.browser_notifications_enabled !== "boolean" || typeof row.notification_sound_enabled !== "boolean") return null;
  return { profileId: row.id, browserNotificationsEnabled: row.browser_notifications_enabled, notificationSoundEnabled: row.notification_sound_enabled };
}

function parseProfileIdentity(value: unknown): RealtimeProfileIdentityEvent | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string") return null;
  if (row.username !== null && typeof row.username !== "string") return null;
  if (row.display_name !== null && typeof row.display_name !== "string") return null;
  if (row.avatar_url !== null && typeof row.avatar_url !== "string") return null;
  if (row.account_status !== "active" && row.account_status !== "deleting" && row.account_status !== "deleted") return null;
  if (row.deleted_at !== null && typeof row.deleted_at !== "string") return null;
  return { id: row.id, username: row.username, display_name: row.display_name, avatar_url: row.avatar_url, account_status: row.account_status, deleted_at: row.deleted_at };
}

function parseConversationTheme(value: unknown): ConversationThemeRealtimeChange | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.theme_key !== "string") return null;
  return { conversationId: row.id, themeKey: row.theme_key };
}

function parseConversationConnection(value: unknown): ConversationConnectionRealtimeChange | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || (row.connection_status !== "accepted" && row.connection_status !== "disconnected")) return null;
  return { conversationId: row.id, connectionStatus: row.connection_status };
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

function parseInsertedPinnedMessage(value: unknown): Extract<PinnedMessageRealtimeChange, { action: "insert" }> | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.message_id !== "string" || typeof row.conversation_id !== "string" || typeof row.pinned_by !== "string" || typeof row.pinned_at !== "string") return null;
  return { action: "insert", pin: { messageId: row.message_id, conversationId: row.conversation_id, pinnedBy: row.pinned_by, pinnedAt: row.pinned_at } };
}

function parseDeletedPinnedMessage(value: unknown): Extract<PinnedMessageRealtimeChange, { action: "delete" }> | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.message_id !== "string") return null;
  return { action: "delete", pin: { messageId: row.message_id, conversationId: typeof row.conversation_id === "string" ? row.conversation_id : null } };
}

function parseInsertedConversationActivity(value: unknown): Extract<ConversationActivityRealtimeChange, { action: "insert" }> | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const eventType = row.event_type;
  if (typeof row.id !== "string" || typeof row.conversation_id !== "string" || typeof row.actor_id !== "string" || (eventType !== "message_pinned" && eventType !== "nickname_changed" && eventType !== "nickname_removed" && eventType !== "theme_changed") || typeof row.created_at !== "string") return null;
  const targetMessageId = typeof row.target_message_id === "string" ? row.target_message_id : null;
  const targetUserId = typeof row.target_user_id === "string" ? row.target_user_id : null;
  const nicknameValue = typeof row.nickname_value === "string" ? row.nickname_value : null;
  const themeKey = typeof row.theme_key === "string" ? row.theme_key : null;
  if (eventType === "message_pinned" && !targetMessageId) return null;
  if ((eventType === "nickname_changed" || eventType === "nickname_removed") && !targetUserId) return null;
  if (eventType === "nickname_changed" && !nicknameValue) return null;
  if (eventType === "theme_changed" && !themeKey) return null;
  return { action: "insert", event: { id: row.id, conversationId: row.conversation_id, actorId: row.actor_id, eventType, targetMessageId, targetUserId, nicknameValue, themeKey, createdAt: row.created_at } };
}

function parseDeletedConversationActivity(value: unknown): Extract<ConversationActivityRealtimeChange, { action: "delete" }> | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string") return null;
  return { action: "delete", event: { id: row.id, conversationId: typeof row.conversation_id === "string" ? row.conversation_id : null, targetMessageId: typeof row.target_message_id === "string" ? row.target_message_id : null } };
}

function parseUpsertedConversationNickname(value: unknown): Extract<ConversationNicknameRealtimeChange, { action: "upsert" }> | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.conversation_id !== "string" || typeof row.user_id !== "string" || typeof row.nickname !== "string" || typeof row.updated_by !== "string" || typeof row.updated_at !== "string") return null;
  return { action: "upsert", nickname: { conversationId: row.conversation_id, userId: row.user_id, nickname: row.nickname, updatedBy: row.updated_by, updatedAt: row.updated_at } };
}

function parseDeletedConversationNickname(value: unknown): Extract<ConversationNicknameRealtimeChange, { action: "delete" }> | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.conversation_id !== "string" || typeof row.user_id !== "string") return null;
  return { action: "delete", nickname: { conversationId: row.conversation_id, userId: row.user_id } };
}

function useConversationRealtime({ currentUserId, onRequestsChanged, onConversationRequestChanged, onConversationDataChanged, onMessageInserted, onMessageUpdated, onMessageReactionChanged, onPinnedMessageChanged, onConversationActivityChanged, onConversationNicknameChanged, onConversationThemeChanged, onConversationConnectionChanged, onParticipantReceiptsChanged, onParticipantMuteUpdated, onParticipantPreferencesUpdated, onNotificationPreferencesUpdated, onProfileIdentityUpdated, onOpenConversationMessagesChanged }: UseConversationRealtimeOptions) {
  const callbacksRef = useRef({ onRequestsChanged, onConversationRequestChanged, onConversationDataChanged, onMessageInserted, onMessageUpdated, onMessageReactionChanged, onPinnedMessageChanged, onConversationActivityChanged, onConversationNicknameChanged, onConversationThemeChanged, onConversationConnectionChanged, onParticipantReceiptsChanged, onParticipantMuteUpdated, onParticipantPreferencesUpdated, onNotificationPreferencesUpdated, onProfileIdentityUpdated, onOpenConversationMessagesChanged });

  useEffect(() => {
    callbacksRef.current = { onRequestsChanged, onConversationRequestChanged, onConversationDataChanged, onMessageInserted, onMessageUpdated, onMessageReactionChanged, onPinnedMessageChanged, onConversationActivityChanged, onConversationNicknameChanged, onConversationThemeChanged, onConversationConnectionChanged, onParticipantReceiptsChanged, onParticipantMuteUpdated, onParticipantPreferencesUpdated, onNotificationPreferencesUpdated, onProfileIdentityUpdated, onOpenConversationMessagesChanged };
  }, [onConversationActivityChanged, onConversationConnectionChanged, onConversationDataChanged, onConversationNicknameChanged, onConversationRequestChanged, onConversationThemeChanged, onMessageInserted, onMessageReactionChanged, onMessageUpdated, onNotificationPreferencesUpdated, onOpenConversationMessagesChanged, onParticipantMuteUpdated, onParticipantPreferencesUpdated, onParticipantReceiptsChanged, onPinnedMessageChanged, onProfileIdentityUpdated, onRequestsChanged]);

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
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_requests" }, (payload) => {
        const request = parseConversationRequest(payload.new);
        if (request && payload.eventType === "INSERT") callbacksRef.current.onConversationRequestChanged({ action: "insert", request });
        if (request && payload.eventType === "UPDATE") callbacksRef.current.onConversationRequestChanged({ action: "update", request });
        scheduleInvalidation({ requests: true, conversationData: true });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "request_update_dismissals" }, () => {
        scheduleInvalidation({ requests: true });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "conversation_participants" }, () => {
        scheduleInvalidation({ conversationData: true });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversation_participants" }, (payload) => {
        const receiptConversationId = parseParticipantConversationId(payload.new);
        if (receiptConversationId) callbacksRef.current.onParticipantReceiptsChanged(receiptConversationId);
        const muteState = parseParticipantMute(payload.new);
        if (muteState) callbacksRef.current.onParticipantMuteUpdated(muteState);
        const preferences = parseParticipantPreferences(payload.new);
        if (preferences) callbacksRef.current.onParticipantPreferencesUpdated(preferences);
        const previousPreferences = parseParticipantPreferences(payload.old);
        if (preferences?.interactionUpdatedAt !== previousPreferences?.interactionUpdatedAt) scheduleInvalidation({ conversationData: true });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "conversation_participants" }, () => {
        scheduleInvalidation({ conversationData: true });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, (payload) => {
        const theme = parseConversationTheme(payload.new);
        if (theme) callbacksRef.current.onConversationThemeChanged(theme);
        const connection = parseConversationConnection(payload.new);
        if (connection) callbacksRef.current.onConversationConnectionChanged(connection);
        scheduleInvalidation({ conversationData: true });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const message = parseRealtimeMessage(payload.new);
        if (message) callbacksRef.current.onMessageInserted(message);
        scheduleInvalidation({ conversationData: true, openConversationMessages: !message });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (payload) => {
        const message = parseRealtimeMessage(payload.new);
        if (message) callbacksRef.current.onMessageUpdated(message);
        else scheduleInvalidation({ conversationData: true, openConversationMessages: true });
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
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pinned_messages" }, (payload) => {
        const change = parseInsertedPinnedMessage(payload.new);
        if (change) callbacksRef.current.onPinnedMessageChanged(change);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "pinned_messages" }, (payload) => {
        const change = parseDeletedPinnedMessage(payload.old);
        if (change) callbacksRef.current.onPinnedMessageChanged(change);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "conversation_events" }, (payload) => {
        const change = parseInsertedConversationActivity(payload.new);
        if (change) callbacksRef.current.onConversationActivityChanged(change);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "conversation_events" }, (payload) => {
        const change = parseDeletedConversationActivity(payload.old);
        if (change) callbacksRef.current.onConversationActivityChanged(change);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "conversation_nicknames" }, (payload) => {
        const change = parseUpsertedConversationNickname(payload.new);
        if (change) callbacksRef.current.onConversationNicknameChanged(change);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversation_nicknames" }, (payload) => {
        const change = parseUpsertedConversationNickname(payload.new);
        if (change) callbacksRef.current.onConversationNicknameChanged(change);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "conversation_nicknames" }, (payload) => {
        const change = parseDeletedConversationNickname(payload.old);
        if (change) callbacksRef.current.onConversationNicknameChanged(change);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, (payload) => {
        const preferences = parseNotificationPreferences(payload.new);
        if (preferences) callbacksRef.current.onNotificationPreferencesUpdated(preferences);
        const identity = parseProfileIdentity(payload.new);
        if (identity) {
          callbacksRef.current.onProfileIdentityUpdated(identity);
          announceProfileIdentityChanged();
        }
        announcePrivacyPreferencesChanged();
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
