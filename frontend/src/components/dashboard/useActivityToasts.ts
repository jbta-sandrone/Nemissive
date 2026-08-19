import { useCallback, useEffect, useRef, useState } from "react";
import type { ProfileSearchResult } from "../../types/conversations";

type ActivityToastBase = {
  eventId: string;
  profile: ProfileSearchResult;
};

export type ActivityToastInput =
  | (ActivityToastBase & { kind: "message_received"; conversationId: string; otherNickname: string | null; preview: string })
  | (ActivityToastBase & { kind: "connection_request_received"; requestId: string })
  | (ActivityToastBase & { kind: "connection_request_accepted"; requestId: string; conversationId: string })
  | (ActivityToastBase & { kind: "reaction_received"; conversationId: string; otherNickname: string | null; messageId: string; emoji: string });

export type ActivityToastItem = ActivityToastInput & {
  id: string;
  count: number;
};

const activityToastDurationMs = 5200;
const visibleToastLimit = 3;
const rememberedEventLimit = 500;

function getToastId(input: ActivityToastInput) {
  return input.kind === "message_received" ? `messages:${input.conversationId}` : `${input.kind}:${input.eventId}`;
}

export function isAppActive() {
  return typeof document !== "undefined" && document.visibilityState === "visible" && document.hasFocus();
}

export default function useActivityToasts() {
  const [toasts, setToasts] = useState<ActivityToastItem[]>([]);
  const toastsRef = useRef<ActivityToastItem[]>([]);
  const timersRef = useRef(new Map<string, ReturnType<typeof window.setTimeout>>());
  const rememberedEventIdsRef = useRef(new Set<string>());

  const dismiss = useCallback((toastId: string) => {
    const timer = timersRef.current.get(toastId);
    if (timer !== undefined) window.clearTimeout(timer);
    timersRef.current.delete(toastId);
    const nextToasts = toastsRef.current.filter((toast) => toast.id !== toastId);
    toastsRef.current = nextToasts;
    setToasts(nextToasts);
  }, []);

  const restartTimer = useCallback((toastId: string) => {
    if (!toastsRef.current.some((toast) => toast.id === toastId)) return;
    const currentTimer = timersRef.current.get(toastId);
    if (currentTimer !== undefined) window.clearTimeout(currentTimer);
    timersRef.current.set(toastId, window.setTimeout(() => dismiss(toastId), activityToastDurationMs));
  }, [dismiss]);

  const pause = useCallback((toastId: string) => {
    const timer = timersRef.current.get(toastId);
    if (timer !== undefined) window.clearTimeout(timer);
    timersRef.current.delete(toastId);
  }, []);

  const claim = useCallback((eventId: string) => {
    const rememberedEvents = rememberedEventIdsRef.current;
    if (rememberedEvents.has(eventId)) return false;
    rememberedEvents.add(eventId);
    while (rememberedEvents.size > rememberedEventLimit) {
      const oldestEventId = rememberedEvents.values().next().value;
      if (typeof oldestEventId !== "string") break;
      rememberedEvents.delete(oldestEventId);
    }
    return true;
  }, []);

  const enqueueClaimed = useCallback((input: ActivityToastInput) => {
    const toastId = getToastId(input);
    const existing = toastsRef.current.find((toast) => toast.id === toastId);
    const nextToast: ActivityToastItem = {
      ...input,
      id: toastId,
      count: input.kind === "message_received" && existing?.kind === "message_received" ? existing.count + 1 : 1,
    };
    const unboundedToasts = [nextToast, ...toastsRef.current.filter((toast) => toast.id !== toastId)];
    const nextToasts = unboundedToasts.slice(0, visibleToastLimit);
    unboundedToasts.slice(visibleToastLimit).forEach((removedToast) => {
      const timer = timersRef.current.get(removedToast.id);
      if (timer !== undefined) window.clearTimeout(timer);
      timersRef.current.delete(removedToast.id);
    });
    toastsRef.current = nextToasts;
    setToasts(nextToasts);
    restartTimer(toastId);
    return true;
  }, [restartTimer]);

  const enqueue = useCallback((input: ActivityToastInput) => claim(input.eventId) && enqueueClaimed(input), [claim, enqueueClaimed]);

  useEffect(() => () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current.clear();
  }, []);

  return { toasts, claim, enqueue, enqueueClaimed, dismiss, pause, resume: restartTimer };
}
