import { useCallback, useEffect, useRef, useState } from "react";
import type { AcceptedConversationItem, ChatMessage, SelectedConversation } from "../../types/conversations";
import { getConversationDisplayName } from "./profileUtils";

type BrowserNotificationPermission = NotificationPermission | "unsupported";

type UseBrowserNotificationsOptions = {
  currentUserId: string | null;
  browserNotificationsEnabled: boolean;
  notificationSoundEnabled: boolean;
  conversations: AcceptedConversationItem[];
  onConversationOpen: (conversation: SelectedConversation) => void;
};

type NotificationCoordinationMessage = {
  type: "handled";
  messageId: string;
  handledAt: number;
};

const handledMessageLimit = 300;
const handledMessageTtlMs = 30 * 60 * 1000;
const notificationSoundCooldownMs = 350;
const notificationSoundUrl = `${import.meta.env.BASE_URL}sounds/notification.wav`;
let sharedNotificationAudio: HTMLAudioElement | null = null;
let hasNotificationAssetFailed = false;

function getSharedNotificationAudio() {
  if (sharedNotificationAudio) return sharedNotificationAudio;
  const audio = new Audio(notificationSoundUrl);
  audio.preload = "auto";
  audio.volume = 0.54;
  audio.addEventListener("canplaythrough", () => {
    hasNotificationAssetFailed = false;
  });
  audio.addEventListener("error", () => {
    hasNotificationAssetFailed = true;
  });
  audio.load();
  sharedNotificationAudio = audio;
  return audio;
}

function isNotificationCoordinationMessage(value: unknown): value is NotificationCoordinationMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return message.type === "handled" && typeof message.messageId === "string" && typeof message.handledAt === "number";
}

function isMuted(mutedUntil: string | null) {
  if (!mutedUntil) return false;
  if (mutedUntil === "infinity") return true;
  const timestamp = Date.parse(mutedUntil);
  return !Number.isNaN(timestamp) && timestamp > Date.now();
}

function normalizeNotificationPreview(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return "New message";
  return normalized.length > 140 ? `${normalized.slice(0, 139).trimEnd()}…` : normalized;
}

function useBrowserNotifications({ currentUserId, browserNotificationsEnabled, notificationSoundEnabled, conversations, onConversationOpen }: UseBrowserNotificationsOptions) {
  const isSupported = typeof window !== "undefined" && "Notification" in window;
  const [permission, setPermission] = useState<BrowserNotificationPermission>(() => isSupported ? Notification.permission : "unsupported");
  const recentMessageIdsRef = useRef(new Map<string, number>());
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const notificationAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const hasUserInteractedRef = useRef(false);
  const lastSoundPlayedAtRef = useRef(0);
  const latestRef = useRef({ currentUserId, browserNotificationsEnabled, notificationSoundEnabled, conversations, onConversationOpen });

  useEffect(() => {
    latestRef.current = { currentUserId, browserNotificationsEnabled, notificationSoundEnabled, conversations, onConversationOpen };
  }, [browserNotificationsEnabled, conversations, currentUserId, notificationSoundEnabled, onConversationOpen]);

  const rememberMessage = useCallback((messageId: string, handledAt = Date.now()) => {
    const entries = recentMessageIdsRef.current;
    const expiryThreshold = handledAt - handledMessageTtlMs;
    for (const [knownMessageId, knownAt] of entries) {
      if (knownAt < expiryThreshold) entries.delete(knownMessageId);
    }
    entries.delete(messageId);
    entries.set(messageId, handledAt);
    while (entries.size > handledMessageLimit) {
      const oldestMessageId = entries.keys().next().value;
      if (typeof oldestMessageId !== "string") break;
      entries.delete(oldestMessageId);
    }
  }, []);

  useEffect(() => {
    if (!currentUserId || typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(`nemissive:message-notifications:${currentUserId}`);
    broadcastChannelRef.current = channel;
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (isNotificationCoordinationMessage(event.data)) rememberMessage(event.data.messageId, event.data.handledAt);
    };
    return () => {
      channel.close();
      if (broadcastChannelRef.current === channel) broadcastChannelRef.current = null;
    };
  }, [currentUserId, rememberMessage]);

  useEffect(() => {
    if (!isSupported) return;
    function refreshPermission() {
      setPermission(Notification.permission);
    }
    document.addEventListener("visibilitychange", refreshPermission);
    window.addEventListener("focus", refreshPermission);
    return () => {
      document.removeEventListener("visibilitychange", refreshPermission);
      window.removeEventListener("focus", refreshPermission);
    };
  }, [isSupported]);

  useEffect(() => {
    notificationAudioRef.current = getSharedNotificationAudio();
  }, []);

  useEffect(() => {
    function registerInteraction() {
      hasUserInteractedRef.current = true;
      if (audioContextRef.current || typeof AudioContext === "undefined") return;
      try {
        const context = new AudioContext();
        audioContextRef.current = context;
        if (context.state === "suspended") void context.resume().catch(() => undefined);
      } catch {
        // Notification audio is optional and must never interrupt messaging.
      }
    }
    window.addEventListener("pointerdown", registerInteraction, { once: true });
    window.addEventListener("keydown", registerInteraction, { once: true });
    return () => {
      window.removeEventListener("pointerdown", registerInteraction);
      window.removeEventListener("keydown", registerInteraction);
      const context = audioContextRef.current;
      audioContextRef.current = null;
      if (context && context.state !== "closed") void context.close().catch(() => undefined);
    };
  }, []);

  const playFallbackTone = useCallback(() => {
    const context = audioContextRef.current;
    if (!context || context.state !== "running") return;
    try {
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(660, now);
      oscillator.frequency.setValueAtTime(880, now + 0.09);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.035, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.21);
    } catch {
      // Browsers may suspend audio while backgrounded; notification delivery still proceeds.
    }
  }, []);

  const playNotificationSound = useCallback(() => {
    if (!hasUserInteractedRef.current) return;
    const now = Date.now();
    if (now - lastSoundPlayedAtRef.current < notificationSoundCooldownMs) return;
    lastSoundPlayedAtRef.current = now;

    const audio = notificationAudioRef.current;
    if (!audio || hasNotificationAssetFailed) {
      playFallbackTone();
      return;
    }

    try {
      audio.pause();
      audio.currentTime = 0;
      const playback = audio.play();
      void playback.catch(() => {
        if (hasNotificationAssetFailed || audio.error) playFallbackTone();
      });
    } catch {
      if (hasNotificationAssetFailed || audio.error) playFallbackTone();
    }
  }, [playFallbackTone]);

  const requestPermission = useCallback(async (): Promise<BrowserNotificationPermission> => {
    if (!isSupported) {
      setPermission("unsupported");
      return "unsupported";
    }
    if (Notification.permission !== "default") {
      setPermission(Notification.permission);
      return Notification.permission;
    }
    try {
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      return nextPermission;
    } catch {
      setPermission(Notification.permission);
      return Notification.permission;
    }
  }, [isSupported]);

  const handleIncomingMessage = useCallback((message: ChatMessage) => {
    const state = latestRef.current;
    if (!state.currentUserId || message.senderId === state.currentUserId || message.isDeleted || recentMessageIdsRef.current.has(message.id)) return;

    const conversation = state.conversations.find((item) => item.conversationId === message.conversationId && item.otherProfile.id === message.senderId);
    rememberMessage(message.id);
    broadcastChannelRef.current?.postMessage({ type: "handled", messageId: message.id, handledAt: Date.now() } satisfies NotificationCoordinationMessage);

    // Missing relationship data is suppressed rather than risking content or mute-state leakage.
    if (!conversation) return;
    if (document.visibilityState === "visible" && document.hasFocus()) return;
    if (!state.browserNotificationsEnabled || !isSupported || Notification.permission !== "granted" || isMuted(conversation.mutedUntil)) return;

    const title = getConversationDisplayName(conversation.otherProfile, conversation.otherNickname);
    const body = message.messageType === "voice" ? "Sent a voice message" : message.messageType === "image" ? message.body.trim() ? normalizeNotificationPreview(message.body) : "Sent a photo" : message.messageType === "file" ? message.body.trim() ? normalizeNotificationPreview(message.body) : message.attachments.length > 1 ? `Sent ${message.attachments.length} files` : "Sent a file" : normalizeNotificationPreview(message.body);
    try {
      const notification = new Notification(title, { body, tag: `nemissive-message-${message.id}`, silent: true });
      notification.onclick = () => {
        window.focus();
        state.onConversationOpen({ id: conversation.conversationId, otherProfile: conversation.otherProfile, otherNickname: conversation.otherNickname });
        notification.close();
      };
      if (state.notificationSoundEnabled) playNotificationSound();
    } catch (error) {
      if (import.meta.env.DEV) console.warn("Nemissive browser notification could not be displayed", { error: error instanceof Error ? error.message : "unknown error" });
    }
  }, [isSupported, playNotificationSound, rememberMessage]);

  return { isSupported, permission, requestPermission, handleIncomingMessage };
}

export type BrowserNotificationsController = ReturnType<typeof useBrowserNotifications>;

export default useBrowserNotifications;
