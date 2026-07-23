import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { ParticipantReceiptCursor, RealtimeParticipantReceiptEvent } from "../../types/conversations";

type PendingReceipt = {
  deliveredAt: string | null;
  readAt: string | null;
  timer: ReturnType<typeof window.setTimeout> | null;
};

type ReceiptRpcRow = {
  conversation_id: string;
  user_id: string;
  last_delivered_at: string | null;
  last_read_at: string | null;
};

const receiptWriteDebounceMs = 220;

function getLaterTimestamp(first: string | null, second: string | null) {
  if (!first) return second;
  if (!second) return first;
  return Date.parse(second) > Date.parse(first) ? second : first;
}

function isTimestampAfter(candidate: string, existing: string | null) {
  const candidateTime = Date.parse(candidate);
  if (Number.isNaN(candidateTime)) return false;
  if (!existing) return true;
  const existingTime = Date.parse(existing);
  return Number.isNaN(existingTime) || candidateTime > existingTime;
}

function mapReceiptRow(row: ReceiptRpcRow): ParticipantReceiptCursor {
  return {
    conversationId: row.conversation_id,
    userId: row.user_id,
    lastDeliveredAt: row.last_delivered_at,
    lastReadAt: row.last_read_at,
  };
}

function mergeReceipt(current: ParticipantReceiptCursor | undefined, incoming: ParticipantReceiptCursor) {
  if (!current) return incoming;
  return {
    ...incoming,
    lastDeliveredAt: getLaterTimestamp(current.lastDeliveredAt, incoming.lastDeliveredAt),
    lastReadAt: getLaterTimestamp(current.lastReadAt, incoming.lastReadAt),
  };
}

function useConversationReceipts(currentUserId: string | null) {
  const isMountedRef = useRef(true);
  const sequenceRef = useRef(0);
  const pendingByConversationRef = useRef(new Map<string, PendingReceipt>());
  const currentUserReceiptsRef = useRef(new Map<string, ParticipantReceiptCursor>());
  const [receiptEvents, setReceiptEvents] = useState<RealtimeParticipantReceiptEvent[]>([]);
  const [currentUserReceiptsByConversationId, setCurrentUserReceiptsByConversationId] = useState<ReadonlyMap<string, ParticipantReceiptCursor>>(new Map());

  const rememberCurrentUserReceipt = useCallback((receipt: ParticipantReceiptCursor) => {
    const mergedReceipt = mergeReceipt(currentUserReceiptsRef.current.get(receipt.conversationId), receipt);
    currentUserReceiptsRef.current.set(receipt.conversationId, mergedReceipt);
    setCurrentUserReceiptsByConversationId((currentReceipts) => {
      const nextReceipts = new Map(currentReceipts);
      nextReceipts.set(receipt.conversationId, mergedReceipt);
      return nextReceipts;
    });
  }, []);

  const publishReceipt = useCallback((receipt: ParticipantReceiptCursor) => {
    if (!isMountedRef.current) return;
    const event = { sequence: ++sequenceRef.current, receipt };
    setReceiptEvents((currentEvents) => [...currentEvents.slice(-99), event]);
  }, []);

  const flushReceipt = useCallback(async (conversationId: string) => {
    const pending = pendingByConversationRef.current.get(conversationId);
    if (!pending || !currentUserId) return;
    pendingByConversationRef.current.delete(conversationId);

    const { data, error } = await supabase.rpc("advance_conversation_receipts", {
      target_conversation_id: conversationId,
      delivered_through: pending.deliveredAt,
      read_through: pending.readAt,
    });

    if (error) {
      if (import.meta.env.DEV) console.warn("Advancing conversation receipts failed", { conversationId, error });
      return;
    }

    const firstRow = Array.isArray(data) ? data[0] : data;
    if (!firstRow || typeof firstRow !== "object") return;
    const row = firstRow as Record<string, unknown>;
    if (typeof row.conversation_id !== "string" || typeof row.user_id !== "string") return;

    const receipt = mapReceiptRow({
      conversation_id: row.conversation_id,
      user_id: row.user_id,
      last_delivered_at: typeof row.last_delivered_at === "string" ? row.last_delivered_at : null,
      last_read_at: typeof row.last_read_at === "string" ? row.last_read_at : null,
    });
    rememberCurrentUserReceipt(receipt);
    publishReceipt(receipt);
  }, [currentUserId, publishReceipt, rememberCurrentUserReceipt]);

  const enqueueReceipt = useCallback((conversationId: string, deliveredAt: string | null, readAt: string | null) => {
    if (!currentUserId) return;
    const knownReceipt = currentUserReceiptsRef.current.get(conversationId);
    const shouldAdvanceDelivery = deliveredAt ? isTimestampAfter(deliveredAt, knownReceipt?.lastDeliveredAt ?? null) : false;
    const shouldAdvanceRead = readAt ? isTimestampAfter(readAt, knownReceipt?.lastReadAt ?? null) : false;
    if (!shouldAdvanceDelivery && !shouldAdvanceRead) return;

    const existing = pendingByConversationRef.current.get(conversationId);
    if (existing?.timer) window.clearTimeout(existing.timer);
    const nextPending: PendingReceipt = {
      deliveredAt: getLaterTimestamp(existing?.deliveredAt ?? null, deliveredAt),
      readAt: getLaterTimestamp(existing?.readAt ?? null, readAt),
      timer: null,
    };
    if (nextPending.readAt) nextPending.deliveredAt = getLaterTimestamp(nextPending.deliveredAt, nextPending.readAt);
    nextPending.timer = window.setTimeout(() => void flushReceipt(conversationId), receiptWriteDebounceMs);
    pendingByConversationRef.current.set(conversationId, nextPending);
  }, [currentUserId, flushReceipt]);

  const advanceDelivered = useCallback((conversationId: string, messageCreatedAt: string) => {
    enqueueReceipt(conversationId, messageCreatedAt, null);
  }, [enqueueReceipt]);

  const advanceRead = useCallback((conversationId: string, messageCreatedAt: string) => {
    enqueueReceipt(conversationId, messageCreatedAt, messageCreatedAt);
  }, [enqueueReceipt]);

  const handleRealtimeReceipt = useCallback((receipt: ParticipantReceiptCursor) => {
    if (receipt.userId === currentUserId) rememberCurrentUserReceipt(receipt);
    publishReceipt(receipt);
  }, [currentUserId, publishReceipt, rememberCurrentUserReceipt]);

  useEffect(() => {
    isMountedRef.current = true;
    currentUserReceiptsRef.current.clear();
    const pendingReceipts = pendingByConversationRef.current;

    return () => {
      isMountedRef.current = false;
      pendingReceipts.forEach((pending) => {
        if (pending.timer) window.clearTimeout(pending.timer);
      });
      pendingReceipts.clear();
    };
  }, [currentUserId]);

  return { receiptEvents, currentUserReceiptsByConversationId, advanceDelivered, advanceRead, handleRealtimeReceipt };
}

export default useConversationReceipts;
