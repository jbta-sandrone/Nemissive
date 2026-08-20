import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

export type ScheduledMessageStatus = "scheduled" | "processing" | "sent" | "failed" | "cancelled";
export type ScheduledAttachmentSummary = { id: string; type: "image" | "voice" | "file"; mimeType: string; fileName: string; fileSize: number; durationMs: number | null; ordinal: number };
export type ScheduledMessage = {
  id: string;
  senderId: string;
  conversationId: string;
  contentSnapshot: string;
  scheduledFor: string;
  nextAttemptAt: string;
  status: ScheduledMessageStatus;
  attemptCount: number;
  hasAttachments: boolean;
  deliveredMessageIds: string[];
  attachmentSummaries: ScheduledAttachmentSummary[];
  messageId: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  sentAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type MutationResult = { item: ScheduledMessage | null; error: string | null };
const scheduledMessageSelect = "id, sender_id, conversation_id, content_snapshot, scheduled_for, next_attempt_at, status, attempt_count, has_attachments, delivered_message_ids, message_id, failure_code, failure_message, sent_at, failed_at, cancelled_at, created_at, updated_at";

function isStatus(value: unknown): value is ScheduledMessageStatus {
  return value === "scheduled" || value === "processing" || value === "sent" || value === "failed" || value === "cancelled";
}

function parseScheduledMessage(value: unknown): ScheduledMessage | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.sender_id !== "string" || typeof row.conversation_id !== "string" || typeof row.content_snapshot !== "string" || typeof row.scheduled_for !== "string" || typeof row.next_attempt_at !== "string" || !isStatus(row.status) || typeof row.attempt_count !== "number" || typeof row.created_at !== "string" || typeof row.updated_at !== "string") return null;
  return {
    id: row.id,
    senderId: row.sender_id,
    conversationId: row.conversation_id,
    contentSnapshot: row.content_snapshot,
    scheduledFor: row.scheduled_for,
    nextAttemptAt: row.next_attempt_at,
    status: row.status,
    attemptCount: row.attempt_count,
    hasAttachments: row.has_attachments === true,
    deliveredMessageIds: Array.isArray(row.delivered_message_ids) ? row.delivered_message_ids.filter((item): item is string => typeof item === "string") : [],
    attachmentSummaries: [],
    messageId: typeof row.message_id === "string" ? row.message_id : null,
    failureCode: typeof row.failure_code === "string" ? row.failure_code : null,
    failureMessage: typeof row.failure_message === "string" ? row.failure_message : null,
    sentAt: typeof row.sent_at === "string" ? row.sent_at : null,
    failedAt: typeof row.failed_at === "string" ? row.failed_at : null,
    cancelledAt: typeof row.cancelled_at === "string" ? row.cancelled_at : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeScheduledMessageError(error: { code?: string } | null, fallback: string) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "You're offline. Reconnect and try again.";
  if (error?.code === "42501" || error?.code === "PGRST301") return "Messaging is no longer available for this conversation.";
  if (error?.code === "P0002") return "This scheduled message is no longer available.";
  if (error?.code === "22023") return "Check the message, date, and time and try again.";
  if (error?.code === "55000") return "This scheduled message is already being processed or can no longer be changed.";
  return fallback;
}

function sortItems(items: ScheduledMessage[]) {
  const rank: Record<ScheduledMessageStatus, number> = { scheduled: 0, processing: 1, failed: 2, sent: 3, cancelled: 4 };
  return [...items].sort((a, b) => rank[a.status] - rank[b.status]
    || (a.status === "scheduled" ? Date.parse(a.scheduledFor) - Date.parse(b.scheduledFor) : Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    || a.id.localeCompare(b.id));
}

function useScheduledMessages(currentUserId: string | null) {
  const [items, setItems] = useState<ScheduledMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  const merge = useCallback((item: ScheduledMessage) => setItems((current) => sortItems([...current.filter((existing) => existing.id !== item.id), item])), []);

  const load = useCallback(async (showLoading = false) => {
    if (!currentUserId) { setItems([]); setIsLoading(false); setLoadError(""); return; }
    if (showLoading) setIsLoading(true);
    const { data, error } = await supabase.from("scheduled_messages").select(scheduledMessageSelect).eq("sender_id", currentUserId).order("scheduled_for", { ascending: false }).limit(250);
    if (!mountedRef.current) return;
    setIsLoading(false);
    if (error) { setLoadError(normalizeScheduledMessageError(error, "Scheduled messages couldn't be loaded.")); return; }
    const parsed = (data ?? []).map(parseScheduledMessage).filter((item): item is ScheduledMessage => Boolean(item));
    const mediaIds = parsed.filter((item) => item.hasAttachments).map((item) => item.id);
    const summariesBySchedule = new Map<string, ScheduledAttachmentSummary[]>();
    if (mediaIds.length) {
      const attachmentResult = await supabase.from("scheduled_message_attachments").select("id, scheduled_message_id, attachment_type, mime_type, file_name, file_size, duration_ms, ordinal, created_at").in("scheduled_message_id", mediaIds).order("ordinal", { ascending: true });
      if (attachmentResult.error) { setLoadError(normalizeScheduledMessageError(attachmentResult.error, "Scheduled media details couldn't be loaded.")); return; }
      for (const row of attachmentResult.data ?? []) {
        if (typeof row.scheduled_message_id !== "string" || typeof row.id !== "string" || !["image", "voice", "file"].includes(String(row.attachment_type)) || typeof row.mime_type !== "string" || typeof row.file_name !== "string" || typeof row.file_size !== "number" || typeof row.ordinal !== "number") continue;
        const summary: ScheduledAttachmentSummary = { id: row.id, type: row.attachment_type as ScheduledAttachmentSummary["type"], mimeType: row.mime_type, fileName: row.file_name, fileSize: row.file_size, durationMs: typeof row.duration_ms === "number" ? row.duration_ms : null, ordinal: row.ordinal };
        summariesBySchedule.set(row.scheduled_message_id, [...(summariesBySchedule.get(row.scheduled_message_id) ?? []), summary]);
      }
    }
    setItems(sortItems(parsed.map((item) => ({ ...item, attachmentSummaries: summariesBySchedule.get(item.id) ?? [] }))));
    setLoadError("");
  }, [currentUserId]);

  useEffect(() => { const timer = window.setTimeout(() => void load(true), 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => {
    if (!currentUserId) return;
    let subscribed = false;
    const channel = supabase.channel(`nemissive-scheduled-messages:${currentUserId}`).on("postgres_changes", { event: "*", schema: "public", table: "scheduled_messages", filter: `sender_id=eq.${currentUserId}` }, (payload) => {
      if (payload.eventType === "DELETE") {
        const id = payload.old && typeof payload.old === "object" && typeof (payload.old as Record<string, unknown>).id === "string" ? (payload.old as Record<string, unknown>).id as string : null;
        if (id) setItems((current) => current.filter((item) => item.id !== id));
        return;
      }
      const item = parseScheduledMessage(payload.new);
      if (item?.senderId === currentUserId) {
        if (item.hasAttachments) void load(false);
        else merge(item);
      }
    }).subscribe((status) => { if (status === "SUBSCRIBED") { if (subscribed) void load(false); subscribed = true; } });
    const refresh = () => { if (document.visibilityState === "visible") void load(false); };
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("online", refresh); document.removeEventListener("visibilitychange", refresh); void supabase.removeChannel(channel); };
  }, [currentUserId, load, merge]);

  const mutate = useCallback(async (rpcName: "update_scheduled_message" | "cancel_scheduled_message" | "send_scheduled_message_now", parameters: Record<string, unknown>, fallback: string): Promise<MutationResult> => {
    const { data, error } = await supabase.rpc(rpcName, parameters);
    if (error) return { item: null, error: normalizeScheduledMessageError(error, fallback) };
    const item = parseScheduledMessage(Array.isArray(data) ? data[0] : data);
    if (!item) return { item: null, error: "Nemissive couldn't confirm the scheduled-message update." };
    merge(item);
    return { item, error: null };
  }, [merge]);

  const mutateMedia = useCallback(async (action: "cancel_schedule" | "send_schedule_now", id: string, fallback: string): Promise<MutationResult> => {
    const { data, error } = await supabase.functions.invoke("message-media-delivery", { body: { action, scheduledMessageId: id } });
    if (error || !data || typeof data !== "object") return { item: null, error: normalizeScheduledMessageError(error, fallback) };
    const item = parseScheduledMessage((data as Record<string, unknown>).schedule);
    if (!item) return { item: null, error: fallback };
    const existing = items.find((current) => current.id === id);
    const merged = { ...item, attachmentSummaries: existing?.attachmentSummaries ?? [] };
    merge(merged);
    return { item: merged, error: null };
  }, [items, merge]);

  return {
    items,
    isLoading,
    loadError,
    refresh: () => load(true),
    update: (id: string, content: string, instant: string) => mutate("update_scheduled_message", { target_scheduled_message_id: id, candidate_content_snapshot: content, candidate_scheduled_for: instant }, "This scheduled message couldn't be updated."),
    cancel: (id: string) => items.find((item) => item.id === id)?.hasAttachments ? mutateMedia("cancel_schedule", id, "This scheduled multimedia message couldn't be cancelled.") : mutate("cancel_scheduled_message", { target_scheduled_message_id: id }, "This scheduled message couldn't be cancelled."),
    sendNow: (id: string) => items.find((item) => item.id === id)?.hasAttachments ? mutateMedia("send_schedule_now", id, "This scheduled multimedia message couldn't be sent now.") : mutate("send_scheduled_message_now", { target_scheduled_message_id: id }, "This scheduled message couldn't be sent now."),
  };
}

export default useScheduledMessages;
