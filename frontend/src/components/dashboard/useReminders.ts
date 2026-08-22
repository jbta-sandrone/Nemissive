import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { ProfileSearchResult } from "../../types/conversations";

export type ReminderScope = "personal" | "shared";
export type ReminderScheduleKind = "date_time" | "timer";
export type ReminderPersonalStatus = "pending" | "due" | "snoozed" | "dismissed" | "completed";

export type ReminderRecord = {
  id: string;
  creatorId: string;
  conversationId: string | null;
  scope: ReminderScope;
  title: string;
  details: string;
  dueAt: string;
  scheduleKind: ReminderScheduleKind;
  timerDurationMinutes: number | null;
  lifecycleStatus: "active";
  createdAt: string;
  updatedAt: string;
  personalStatus: ReminderPersonalStatus;
  snoozedUntil: string | null;
  dismissedAt: string | null;
  completedAt: string | null;
  notifiedAt: string | null;
  notificationVersion: number;
  removedAt: string | null;
  creatorProfile: ProfileSearchResult;
  conversationPeer: ProfileSearchResult | null;
  participantCount: number;
  completedCount: number;
};

export type ReminderDraft = {
  title: string;
  details: string;
  dueAt: string;
  scope: ReminderScope;
  conversationId: string | null;
  scheduleKind: ReminderScheduleKind;
  timerDurationMinutes: number | null;
};

function isScope(value: unknown): value is ReminderScope { return value === "personal" || value === "shared"; }
function isScheduleKind(value: unknown): value is ReminderScheduleKind { return value === "date_time" || value === "timer"; }
function isPersonalStatus(value: unknown): value is ReminderPersonalStatus { return ["pending", "due", "snoozed", "dismissed", "completed"].includes(String(value)); }
function nullableString(value: unknown) { return typeof value === "string" ? value : null; }

function parseReminder(value: unknown): ReminderRecord | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.creator_id !== "string" || !isScope(row.scope)
    || typeof row.title !== "string" || typeof row.details !== "string" || typeof row.due_at !== "string"
    || !isScheduleKind(row.schedule_kind) || row.lifecycle_status !== "active" || typeof row.created_at !== "string"
    || typeof row.updated_at !== "string" || !isPersonalStatus(row.personal_status)
    || typeof row.notification_version !== "number") return null;
  return {
    id: row.id,
    creatorId: row.creator_id,
    conversationId: nullableString(row.conversation_id),
    scope: row.scope,
    title: row.title,
    details: row.details,
    dueAt: row.due_at,
    scheduleKind: row.schedule_kind,
    timerDurationMinutes: typeof row.timer_duration_minutes === "number" ? row.timer_duration_minutes : null,
    lifecycleStatus: "active",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    personalStatus: row.personal_status,
    snoozedUntil: nullableString(row.snoozed_until),
    dismissedAt: nullableString(row.dismissed_at),
    completedAt: nullableString(row.completed_at),
    notifiedAt: nullableString(row.notified_at),
    notificationVersion: row.notification_version,
    removedAt: nullableString(row.removed_at),
    creatorProfile: {
      id: row.creator_id,
      display_name: nullableString(row.creator_display_name),
      username: nullableString(row.creator_username),
      avatar_url: nullableString(row.creator_avatar_url),
    },
    conversationPeer: typeof row.conversation_peer_id === "string" ? {
      id: row.conversation_peer_id,
      display_name: nullableString(row.conversation_peer_display_name),
      username: nullableString(row.conversation_peer_username),
      avatar_url: nullableString(row.conversation_peer_avatar_url),
    } : null,
    participantCount: typeof row.participant_count === "number" ? row.participant_count : 1,
    completedCount: typeof row.completed_count === "number" ? row.completed_count : 0,
  };
}

export function normalizeReminderError(error: { code?: string } | null, fallback: string) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "You're offline. Reconnect and try again.";
  if (error?.code === "42501" || error?.code === "PGRST301") return "This reminder or conversation is no longer available.";
  if (error?.code === "P0002") return "This reminder is no longer available.";
  if (error?.code === "22023") return "Check the reminder details and time, then try again.";
  if (error?.code === "55000") return "This reminder can no longer be changed.";
  return fallback;
}

function sortReminders(items: ReminderRecord[]) {
  return [...items].sort((left, right) => {
    const statusRank = (item: ReminderRecord) => item.personalStatus === "due" ? 0 : item.personalStatus === "snoozed" ? 1 : item.personalStatus === "pending" ? 2 : item.personalStatus === "completed" ? 3 : 4;
    return statusRank(left) - statusRank(right)
      || Date.parse(left.snoozedUntil ?? left.dueAt) - Date.parse(right.snoozedUntil ?? right.dueAt)
      || left.id.localeCompare(right.id);
  });
}

function useReminders(currentUserId: string | null) {
  const [reminders, setReminders] = useState<ReminderRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const mountedRef = useRef(true);
  const refreshTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const load = useCallback(async (showLoading = false) => {
    if (!currentUserId) { setReminders([]); setIsLoading(false); setLoadError(""); return; }
    if (showLoading) setIsLoading(true);
    const { data, error } = await supabase.rpc("list_my_reminders", { page_size: 250 });
    if (!mountedRef.current) return;
    setIsLoading(false);
    if (error) { setLoadError(normalizeReminderError(error, "Reminders couldn't be loaded right now.")); return; }
    setReminders(sortReminders((Array.isArray(data) ? data : []).map(parseReminder).filter((item): item is ReminderRecord => Boolean(item))));
    setLoadError("");
  }, [currentUserId]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => { refreshTimerRef.current = null; void load(false); }, 120);
  }, [load]);

  useEffect(() => { const timer = window.setTimeout(() => void load(true), 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => {
    if (!currentUserId) return;
    let subscribed = false;
    const channel = supabase.channel(`nemissive-reminders:${currentUserId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reminders" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "reminder_participants", filter: `user_id=eq.${currentUserId}` }, scheduleRefresh)
      .subscribe((status) => { if (status === "SUBSCRIBED") { if (subscribed) scheduleRefresh(); subscribed = true; } });
    const refreshWhenAvailable = () => { if (document.visibilityState === "visible") scheduleRefresh(); };
    window.addEventListener("online", refreshWhenAvailable);
    window.addEventListener("focus", refreshWhenAvailable);
    document.addEventListener("visibilitychange", refreshWhenAvailable);
    return () => {
      if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
      window.removeEventListener("online", refreshWhenAvailable);
      window.removeEventListener("focus", refreshWhenAvailable);
      document.removeEventListener("visibilitychange", refreshWhenAvailable);
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, scheduleRefresh]);

  const mutate = useCallback(async (rpcName: string, parameters: Record<string, unknown>, fallback: string) => {
    const { error } = await supabase.rpc(rpcName, parameters);
    if (error) return normalizeReminderError(error, fallback);
    await load(false);
    return null;
  }, [load]);
  const refresh = useCallback(() => load(true), [load]);

  return {
    reminders,
    isLoading,
    loadError,
    refresh,
    create: (draft: ReminderDraft) => mutate("create_reminder", {
      candidate_title: draft.title,
      candidate_details: draft.details,
      candidate_due_at: draft.dueAt,
      candidate_scope: draft.scope,
      target_conversation_id: draft.scope === "shared" ? draft.conversationId : null,
      candidate_schedule_kind: draft.scheduleKind,
      candidate_timer_duration_minutes: draft.scheduleKind === "timer" ? draft.timerDurationMinutes : null,
    }, "This reminder couldn't be created."),
    update: (id: string, draft: ReminderDraft) => mutate("update_reminder", {
      target_reminder_id: id,
      candidate_title: draft.title,
      candidate_details: draft.details,
      candidate_due_at: draft.dueAt,
      candidate_schedule_kind: draft.scheduleKind,
      candidate_timer_duration_minutes: draft.scheduleKind === "timer" ? draft.timerDurationMinutes : null,
    }, "This reminder couldn't be updated."),
    remove: (id: string) => mutate("remove_reminder", { target_reminder_id: id }, "This reminder couldn't be removed."),
    removeForMe: (id: string) => mutate("remove_reminder_for_me", { target_reminder_id: id }, "This shared reminder couldn't be removed from your list."),
    deleteForEveryone: (id: string) => mutate("delete_shared_reminder_for_everyone", { target_reminder_id: id }, "This shared reminder couldn't be deleted for everyone."),
    clearCompleted: () => mutate("clear_completed_reminders", {}, "Completed reminders couldn't be cleared."),
    snooze: (id: string, minutes: number) => mutate("snooze_reminder", { target_reminder_id: id, snooze_minutes: minutes }, "This reminder couldn't be snoozed."),
    dismiss: (id: string) => mutate("dismiss_reminder", { target_reminder_id: id }, "This reminder couldn't be dismissed."),
    complete: (id: string) => mutate("complete_reminder", { target_reminder_id: id }, "This reminder couldn't be marked done."),
  };
}

export type RemindersController = ReturnType<typeof useReminders>;
export default useReminders;
