import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

type UseConversationTypingOptions = {
  conversationId: string;
  currentUserId: string | null;
  otherUserId: string;
};

type TypingBroadcast = {
  userId: string;
  isTyping: boolean;
  conversationId: string;
};

const localTypingInactivityMs = 2000;
const typingHeartbeatMs = 2500;
const remoteTypingSafetyMs = 4500;

function parseTypingBroadcast(value: unknown): TypingBroadcast | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  if (typeof payload.userId !== "string" || typeof payload.isTyping !== "boolean" || typeof payload.conversationId !== "string") return null;
  return { userId: payload.userId, isTyping: payload.isTyping, conversationId: payload.conversationId };
}

function useConversationTyping({ conversationId, currentUserId, otherUserId }: UseConversationTypingOptions) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isSubscribedRef = useRef(false);
  const isLocallyTypingRef = useRef(false);
  const lastTypingBroadcastAtRef = useRef(0);
  const localInactivityTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const remoteSafetyTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);

  const clearLocalInactivityTimer = useCallback(() => {
    if (localInactivityTimerRef.current === null) return;
    window.clearTimeout(localInactivityTimerRef.current);
    localInactivityTimerRef.current = null;
  }, []);

  const broadcastTyping = useCallback((isTyping: boolean) => {
    const channel = channelRef.current;
    if (!channel || !isSubscribedRef.current || !currentUserId) return;
    void channel.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: currentUserId, isTyping, conversationId } satisfies TypingBroadcast,
    });
  }, [conversationId, currentUserId]);

  const stopTyping = useCallback(() => {
    clearLocalInactivityTimer();
    if (!isLocallyTypingRef.current) return;
    isLocallyTypingRef.current = false;
    lastTypingBroadcastAtRef.current = 0;
    broadcastTyping(false);
  }, [broadcastTyping, clearLocalInactivityTimer]);

  const notifyTyping = useCallback((hasContent: boolean) => {
    if (!hasContent) {
      stopTyping();
      return;
    }

    const now = Date.now();
    if (!isLocallyTypingRef.current || now - lastTypingBroadcastAtRef.current >= typingHeartbeatMs) {
      isLocallyTypingRef.current = true;
      lastTypingBroadcastAtRef.current = now;
      broadcastTyping(true);
    }

    clearLocalInactivityTimer();
    localInactivityTimerRef.current = window.setTimeout(stopTyping, localTypingInactivityMs);
  }, [broadcastTyping, clearLocalInactivityTimer, stopTyping]);

  useEffect(() => {
    if (!currentUserId) return;

    let isCleaningUp = false;

    function clearRemoteSafetyTimer() {
      if (remoteSafetyTimerRef.current === null) return;
      window.clearTimeout(remoteSafetyTimerRef.current);
      remoteSafetyTimerRef.current = null;
    }

    function hideRemoteTyping() {
      clearRemoteSafetyTimer();
      setIsOtherUserTyping(false);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") stopTyping();
    }

    function handleDisconnect() {
      stopTyping();
      hideRemoteTyping();
    }

    const channel = supabase
      .channel(`conversation:${conversationId}:typing`, { config: { broadcast: { self: false, ack: false } } })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const typingEvent = parseTypingBroadcast(payload);
        if (!typingEvent || typingEvent.userId === currentUserId || typingEvent.userId !== otherUserId || typingEvent.conversationId !== conversationId) return;

        clearRemoteSafetyTimer();
        setIsOtherUserTyping(typingEvent.isTyping);
        if (typingEvent.isTyping) remoteSafetyTimerRef.current = window.setTimeout(hideRemoteTyping, remoteTypingSafetyMs);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          isSubscribedRef.current = true;
          if (isLocallyTypingRef.current) {
            lastTypingBroadcastAtRef.current = Date.now();
            void channel.send({
              type: "broadcast",
              event: "typing",
              payload: { userId: currentUserId, isTyping: true, conversationId } satisfies TypingBroadcast,
            });
          }
          if (import.meta.env.DEV) console.info("Nemissive typing channel subscribed", { conversationId });
          return;
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          isSubscribedRef.current = false;
          if (!isCleaningUp) {
            stopTyping();
            hideRemoteTyping();
            if (import.meta.env.DEV) console.warn("Nemissive typing channel interrupted", { conversationId, status });
          }
        }
      });

    channelRef.current = channel;
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("offline", handleDisconnect);

    return () => {
      isCleaningUp = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("offline", handleDisconnect);
      clearLocalInactivityTimer();
      clearRemoteSafetyTimer();
      if (isLocallyTypingRef.current && isSubscribedRef.current) {
        void channel.send({
          type: "broadcast",
          event: "typing",
          payload: { userId: currentUserId, isTyping: false, conversationId } satisfies TypingBroadcast,
        });
      }
      isLocallyTypingRef.current = false;
      lastTypingBroadcastAtRef.current = 0;
      isSubscribedRef.current = false;
      if (channelRef.current === channel) channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [clearLocalInactivityTimer, conversationId, currentUserId, otherUserId, stopTyping]);

  return { isOtherUserTyping, notifyTyping, stopTyping };
}

export default useConversationTyping;
