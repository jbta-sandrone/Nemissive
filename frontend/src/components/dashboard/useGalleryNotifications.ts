import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { ProfileSearchResult } from "../../types/conversations";
import { isAppActive } from "./useActivityToasts";

export type GalleryNotification = {
  id: string;
  type: "heart" | "comment";
  galleryItemId: string;
  commentId: string | null;
  createdAt: string;
  readAt: string | null;
  mediaType: "image" | "video";
  previewPath: string;
  commentBody: string | null;
  actor: ProfileSearchResult;
  actorAvailable: boolean;
};

type UseGalleryNotificationsOptions = {
  currentUserId: string | null;
  onNewNotification: (notification: GalleryNotification) => void;
};

const notificationPageSize = 50;
const rememberedNotificationLimit = 500;

function nullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function parseGalleryNotification(value: unknown): GalleryNotification | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string"
    || (row.notification_type !== "heart" && row.notification_type !== "comment")
    || typeof row.gallery_item_id !== "string"
    || typeof row.created_at !== "string"
    || (row.media_type !== "image" && row.media_type !== "video")
    || typeof row.preview_path !== "string") return null;
  const actorAvailable = row.actor_available === true && typeof row.actor_id === "string";
  return {
    id: row.id,
    type: row.notification_type,
    galleryItemId: row.gallery_item_id,
    commentId: nullableString(row.comment_id),
    createdAt: row.created_at,
    readAt: nullableString(row.read_at),
    mediaType: row.media_type,
    previewPath: row.preview_path,
    commentBody: nullableString(row.comment_body),
    actorAvailable,
    actor: actorAvailable ? {
      id: row.actor_id as string,
      username: nullableString(row.actor_username),
      display_name: nullableString(row.actor_display_name),
      avatar_url: nullableString(row.actor_avatar_url),
      account_status: "active",
    } : {
      id: `unavailable-gallery-actor:${row.id}`,
      username: null,
      display_name: "Unavailable account",
      avatar_url: null,
      account_status: "deleted",
    },
  };
}

function normalizeNotificationError(error: unknown, fallback: string) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code === "42501" || code === "PGRST301") return "Your Gallery activity is unavailable until you sign in again.";
  if (typeof navigator !== "undefined" && !navigator.onLine) return "You're offline. Gallery activity will refresh when you reconnect.";
  return fallback;
}

function useGalleryNotifications({ currentUserId, onNewNotification }: UseGalleryNotificationsOptions) {
  const [notifications, setNotifications] = useState<GalleryNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const mountedRef = useRef(true);
  const notificationsRef = useRef<GalleryNotification[]>([]);
  const onNewNotificationRef = useRef(onNewNotification);
  const refreshTimerRef = useRef<number | null>(null);
  const pendingToastIdsRef = useRef(new Set<string>());
  const rememberedIdsRef = useRef(new Set<string>());

  useEffect(() => { notificationsRef.current = notifications; }, [notifications]);
  useEffect(() => { onNewNotificationRef.current = onNewNotification; }, [onNewNotification]);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const remember = useCallback((id: string) => {
    const remembered = rememberedIdsRef.current;
    if (remembered.has(id)) return false;
    remembered.add(id);
    while (remembered.size > rememberedNotificationLimit) {
      const oldest = remembered.values().next().value;
      if (typeof oldest !== "string") break;
      remembered.delete(oldest);
    }
    return true;
  }, []);

  const load = useCallback(async () => {
    if (!currentUserId) {
      setNotifications([]); setUnreadCount(0); setIsLoading(false); setError("");
      return;
    }
    const [listResult, countResult] = await Promise.all([
      supabase.rpc("list_gallery_notifications", { page_size: notificationPageSize, page_offset: 0 }),
      supabase.rpc("get_gallery_notification_unread_count"),
    ]);
    if (!mountedRef.current) return;
    setIsLoading(false);
    if (listResult.error || countResult.error) {
      setError(normalizeNotificationError(listResult.error ?? countResult.error, "Gallery activity couldn't be loaded."));
      return;
    }
    const parsed = (Array.isArray(listResult.data) ? listResult.data : [])
      .map(parseGalleryNotification)
      .filter((item): item is GalleryNotification => Boolean(item));
    setNotifications(parsed);
    setUnreadCount(typeof countResult.data === "number" ? countResult.data : Number(countResult.data) || 0);
    setError("");

    for (const notification of parsed) {
      if (!pendingToastIdsRef.current.delete(notification.id)) continue;
      if (remember(notification.id) && isAppActive()) onNewNotificationRef.current(notification);
    }
  }, [currentUserId, remember]);

  const scheduleRefresh = useCallback((toastNotificationId?: string) => {
    if (toastNotificationId) pendingToastIdsRef.current.add(toastNotificationId);
    if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      void load();
    }, 100);
  }, [load]);

  useEffect(() => {
    rememberedIdsRef.current.clear();
    pendingToastIdsRef.current.clear();
    const timer = window.setTimeout(() => void load(), 0);
    if (!currentUserId) return () => window.clearTimeout(timer);

    let hasSubscribed = false;
    const channel = supabase.channel(`nemissive-gallery-notifications:${currentUserId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "gallery_notifications", filter: `recipient_user_id=eq.${currentUserId}` }, (payload) => {
        const id = payload.new && typeof payload.new.id === "string" ? payload.new.id : "";
        scheduleRefresh(hasSubscribed && id ? id : undefined);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "gallery_notifications", filter: `recipient_user_id=eq.${currentUserId}` }, () => scheduleRefresh())
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "gallery_notifications", filter: `recipient_user_id=eq.${currentUserId}` }, () => scheduleRefresh())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (hasSubscribed) scheduleRefresh();
          hasSubscribed = true;
        }
      });
    const reconcile = () => { if (document.visibilityState === "visible") scheduleRefresh(); };
    window.addEventListener("online", reconcile);
    window.addEventListener("focus", reconcile);
    document.addEventListener("visibilitychange", reconcile);
    return () => {
      window.clearTimeout(timer);
      if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
      window.removeEventListener("online", reconcile);
      window.removeEventListener("focus", reconcile);
      document.removeEventListener("visibilitychange", reconcile);
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, load, scheduleRefresh]);

  const markRead = useCallback(async (ids: string[]) => {
    const unique = [...new Set(ids)].slice(0, notificationPageSize);
    if (!unique.length) return null;
    const { error: markError } = await supabase.rpc("mark_gallery_notifications_read", { target_notification_ids: unique });
    if (markError) return normalizeNotificationError(markError, "Gallery activity couldn't be marked as read.");
    const now = new Date().toISOString();
    setNotifications((current) => current.map((item) => unique.includes(item.id) && !item.readAt ? { ...item, readAt: now } : item));
    setUnreadCount((current) => Math.max(0, current - notificationsRef.current.filter((item) => unique.includes(item.id) && !item.readAt).length));
    return null;
  }, []);

  const markAllRead = useCallback(async () => {
    const { error: markError } = await supabase.rpc("mark_all_gallery_notifications_read");
    if (markError) return normalizeNotificationError(markError, "Gallery activity couldn't be marked as read.");
    const now = new Date().toISOString();
    setNotifications((current) => current.map((item) => item.readAt ? item : { ...item, readAt: now }));
    setUnreadCount(0);
    return null;
  }, []);

  const removeNotification = useCallback(async (id: string) => {
    const target = notificationsRef.current.find((item) => item.id === id);
    const { error: removeError } = await supabase.rpc("remove_gallery_notification", { target_notification_id: id });
    if (removeError) return normalizeNotificationError(removeError, "Gallery activity couldn't be removed.");
    setNotifications((current) => current.filter((item) => item.id !== id));
    if (target && !target.readAt) setUnreadCount((current) => Math.max(0, current - 1));
    return null;
  }, []);

  const clearNotifications = useCallback(async () => {
    const { error: clearError } = await supabase.rpc("clear_gallery_notifications");
    if (clearError) return normalizeNotificationError(clearError, "Gallery notifications couldn't be cleared.");
    setNotifications([]);
    setUnreadCount(0);
    return null;
  }, []);

  return { notifications, unreadCount, isLoading, error, refresh: load, markRead, markAllRead, removeNotification, clearNotifications };
}

export default useGalleryNotifications;
