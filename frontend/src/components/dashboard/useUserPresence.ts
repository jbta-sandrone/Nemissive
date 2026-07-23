import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

type PresencePayload = {
  userId: string;
  onlineAt: string;
  sessionId: string;
};

const lastSeenHeartbeatMs = 60_000;
const emptyOnlineUserIds = new Set<string>();

function createSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `presence-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function parsePresencePayload(value: unknown): PresencePayload | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  if (typeof payload.userId !== "string" || typeof payload.onlineAt !== "string" || typeof payload.sessionId !== "string") return null;
  if (!payload.userId || !payload.sessionId || Number.isNaN(Date.parse(payload.onlineAt))) return null;
  return { userId: payload.userId, onlineAt: payload.onlineAt, sessionId: payload.sessionId };
}

function setsMatch(first: ReadonlySet<string>, second: ReadonlySet<string>) {
  if (first.size !== second.size) return false;
  return [...first].every((value) => second.has(value));
}

function useUserPresence(currentUserId: string | null) {
  const sessionIdRef = useRef(createSessionId());
  const userIdRef = useRef(currentUserId);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(() => new Set());
  const [isPresenceReady, setIsPresenceReady] = useState(false);

  useEffect(() => {
    userIdRef.current = currentUserId;
  }, [currentUserId]);

  const markLastSeenNow = useCallback(async () => {
    const userId = userIdRef.current;
    if (!userId) return;

    const { error } = await supabase.rpc("advance_last_seen", { candidate_timestamp: new Date().toISOString() });
    if (error && import.meta.env.DEV) console.warn("Nemissive last-seen acknowledgement failed", { userId, code: error.code });
  }, []);

  useEffect(() => {
    if (!currentUserId) return;

    const userId = currentUserId;
    let isCleaningUp = false;
    let isTracked = false;
    let heartbeatTimer: ReturnType<typeof window.setInterval> | null = null;

    function syncOnlineUsers(channel: ReturnType<typeof supabase.channel>) {
      const nextOnlineUserIds = new Set<string>();
      const presenceState = channel.presenceState() as Record<string, unknown>;

      Object.entries(presenceState).forEach(([presenceKey, presenceEntries]) => {
        if (!Array.isArray(presenceEntries)) return;
        presenceEntries.forEach((entry) => {
          const payload = parsePresencePayload(entry);
          if (payload?.userId === presenceKey) nextOnlineUserIds.add(payload.userId);
        });
      });

      setOnlineUserIds((currentIds) => setsMatch(currentIds, nextOnlineUserIds) ? currentIds : nextOnlineUserIds);
      setIsPresenceReady(true);
    }

    function clearHeartbeat() {
      if (heartbeatTimer === null) return;
      window.clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }

    function startHeartbeat() {
      clearHeartbeat();
      void markLastSeenNow();
      heartbeatTimer = window.setInterval(() => {
        if (isTracked) void markLastSeenNow();
      }, lastSeenHeartbeatMs);
    }

    const channel = supabase
      .channel("nemissive:presence", { config: { presence: { key: userId } } })
      .on("presence", { event: "sync" }, () => syncOnlineUsers(channel))
      .on("presence", { event: "join" }, () => syncOnlineUsers(channel))
      .on("presence", { event: "leave" }, () => syncOnlineUsers(channel))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (isTracked) return;
          isTracked = true;
          void channel.track({ userId, onlineAt: new Date().toISOString(), sessionId: sessionIdRef.current }).then((result) => {
            if (result !== "ok" && import.meta.env.DEV) console.warn("Nemissive Presence tracking was not acknowledged", { userId, result });
          });
          startHeartbeat();
          return;
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          isTracked = false;
          clearHeartbeat();
          setOnlineUserIds(new Set());
          setIsPresenceReady(false);
          if (!isCleaningUp && import.meta.env.DEV) console.warn("Nemissive Presence connection interrupted", { userId, status });
        }
      });

    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && isTracked) void markLastSeenNow();
    }

    function handleOnline() {
      if (isTracked) void markLastSeenNow();
    }

    function attemptFinalLastSeen() {
      if (isTracked) void markLastSeenNow();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);
    window.addEventListener("pagehide", attemptFinalLastSeen);

    return () => {
      isCleaningUp = true;
      isTracked = false;
      clearHeartbeat();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("pagehide", attemptFinalLastSeen);
      void markLastSeenNow();
      void channel.untrack().finally(() => {
        void supabase.removeChannel(channel);
      });
    };
  }, [currentUserId, markLastSeenNow]);

  return { onlineUserIds: currentUserId ? onlineUserIds : emptyOnlineUserIds, isPresenceReady: Boolean(currentUserId) && isPresenceReady, markLastSeenNow };
}

export default useUserPresence;
