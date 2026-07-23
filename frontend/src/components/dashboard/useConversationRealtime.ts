import { useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";

type UseConversationRealtimeOptions = {
  currentUserId: string | null;
  onRequestsChanged: () => void;
  onConversationDataChanged: () => void;
  onOpenConversationMessagesChanged: () => void;
};

type InvalidationState = {
  requests: boolean;
  conversationData: boolean;
  openConversationMessages: boolean;
};

const realtimeDebounceMs = 180;

function useConversationRealtime({ currentUserId, onRequestsChanged, onConversationDataChanged, onOpenConversationMessagesChanged }: UseConversationRealtimeOptions) {
  const callbacksRef = useRef({ onRequestsChanged, onConversationDataChanged, onOpenConversationMessagesChanged });

  useEffect(() => {
    callbacksRef.current = { onRequestsChanged, onConversationDataChanged, onOpenConversationMessagesChanged };
  }, [onConversationDataChanged, onOpenConversationMessagesChanged, onRequestsChanged]);

  useEffect(() => {
    if (!currentUserId) return;

    let debounceTimer: ReturnType<typeof window.setTimeout> | null = null;
    let hasSubscribed = false;
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
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_participants" }, () => {
        scheduleInvalidation({ conversationData: true });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        scheduleInvalidation({ conversationData: true });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        scheduleInvalidation({ conversationData: true, openConversationMessages: true });
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
