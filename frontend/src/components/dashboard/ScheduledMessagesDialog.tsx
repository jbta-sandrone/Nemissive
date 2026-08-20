import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { AcceptedConversationItem } from "../../types/conversations";
import ConfirmationDialog from "./ConfirmationDialog";
import ProfileAvatar from "./ProfileAvatar";
import { getConversationDisplayName } from "./profileUtils";
import { formatScheduledInstant, formatScheduledInstantAccessible, localInputsFromInstant, parseLocalScheduledTime } from "./scheduledMessageTime";
import useScheduledMessages, { type ScheduledMessage } from "./useScheduledMessages";

type ScheduledMessagesDialogProps = {
  currentUserId: string;
  conversations: AcceptedConversationItem[];
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onMessageSent: () => void;
};

type ConfirmationState = { kind: "cancel" | "send"; item: ScheduledMessage } | null;

function CalendarIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="M6 3v3m12-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ScheduledMessagesDialog({ currentUserId, conversations, returnFocusRef, onClose, onMessageSent }: ScheduledMessagesDialogProps) {
  const reducedMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmationTriggerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const isBusyRef = useRef(false);
  const { items, isLoading, loadError, refresh, update, cancel, sendNow } = useScheduledMessages(currentUserId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [dateValue, setDateValue] = useState("");
  const [timeValue, setTimeValue] = useState("");
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationState>(null);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { isBusyRef.current = isBusy; }, [isBusy]);
  const conversationById = useMemo(() => new Map(conversations.map((conversation) => [conversation.conversationId, conversation])), [conversations]);
  const upcoming = items.filter((item) => item.status === "scheduled" || item.status === "processing");
  const history = items.filter((item) => item.status !== "scheduled" && item.status !== "processing").slice(0, 50);
  const editingItem = items.find((item) => item.id === editingId) ?? null;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const returnTo = returnFocusRef.current;
    document.body.style.overflow = "hidden";
    function handleKeyDown(event: KeyboardEvent) {
      const modals = [...document.querySelectorAll<HTMLElement>('[aria-modal="true"]')];
      if (modals.at(-1) !== panelRef.current) return;
      if (event.key === "Escape" && !isBusyRef.current) { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab" || !panelRef.current) return;
      const controls = [...panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')];
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    const frame = window.requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("[data-autofocus],button:not([disabled])")?.focus());
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() => returnTo?.isConnected && returnTo.focus());
    };
  }, [returnFocusRef]);

  function beginEdit(item: ScheduledMessage, trigger: HTMLElement) {
    confirmationTriggerRef.current = trigger;
    const local = localInputsFromInstant(item.scheduledFor);
    setEditingId(item.id);
    setContent(item.contentSnapshot);
    setDateValue(local.date);
    setTimeValue(local.time);
    setError("");
    setStatusMessage("");
  }

  async function saveEdit() {
    if (!editingItem || isBusy) return;
    const normalizedContent = content.trim();
    if (!normalizedContent) { setError("Enter message text before saving."); return; }
    const parsed = parseLocalScheduledTime(dateValue, timeValue);
    if (!parsed.instant) { setError(parsed.error); return; }
    setIsBusy(true); setError(""); setStatusMessage("");
    const result = await update(editingItem.id, normalizedContent, parsed.instant.toISOString());
    setIsBusy(false);
    if (result.error || !result.item) { setError(result.error ?? "This scheduled message couldn't be updated."); return; }
    setEditingId(null);
    setStatusMessage(`Scheduled message updated for ${formatScheduledInstant(result.item.scheduledFor)}.`);
  }

  function requestConfirmation(kind: "cancel" | "send", item: ScheduledMessage, trigger: HTMLElement) {
    confirmationTriggerRef.current = trigger;
    setError("");
    setStatusMessage("");
    setConfirmation({ kind, item });
  }

  async function confirmAction() {
    if (!confirmation || isBusy) return;
    setIsBusy(true); setError("");
    const result = confirmation.kind === "cancel" ? await cancel(confirmation.item.id) : await sendNow(confirmation.item.id);
    setIsBusy(false);
    if (result.error || !result.item) { setError(result.error ?? "The scheduled message couldn't be updated."); setConfirmation(null); return; }
    if (confirmation.kind === "send") {
      if (result.item.status === "sent") { onMessageSent(); setStatusMessage("Scheduled message sent now."); }
      else setError(result.item.failureMessage ?? "Delivery was delayed. Nemissive will retry automatically.");
    } else setStatusMessage("Scheduled message cancelled.");
    setConfirmation(null);
  }

  function renderItem(item: ScheduledMessage) {
    const conversation = conversationById.get(item.conversationId);
    const name = conversation ? getConversationDisplayName(conversation.otherProfile, conversation.otherNickname) : "Unavailable conversation";
    const statusLabel = item.status === "scheduled" ? "Scheduled" : item.status === "processing" ? "Processing" : item.status === "sent" ? "Sent" : item.status === "failed" ? "Failed" : "Cancelled";
    return <li key={item.id} className="rounded-2xl border border-border bg-background p-4"><div className="flex items-start gap-3">{conversation ? <ProfileAvatar profile={conversation.otherProfile} size="sm" /> : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-primary"><CalendarIcon /></span>}<div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="truncate text-sm font-semibold text-heading">{name}</p><span className="rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-primary">{statusLabel}</span></div><time dateTime={item.scheduledFor} aria-label={formatScheduledInstantAccessible(item.scheduledFor)} className="mt-1 block text-xs font-medium text-muted">{formatScheduledInstant(item.scheduledFor)}</time><p className="mt-3 line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6 text-body">{item.contentSnapshot}</p>{item.failureMessage && <p className="mt-3 text-xs leading-5 text-body">{item.failureMessage}</p>}{item.status === "scheduled" && <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={(event) => beginEdit(item, event.currentTarget)} className="min-h-10 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-heading hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">Edit / Reschedule</button><button type="button" onClick={(event) => requestConfirmation("send", item, event.currentTarget)} className="min-h-10 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-heading hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">Send now</button><button type="button" onClick={(event) => requestConfirmation("cancel", item, event.currentTarget)} className="min-h-10 rounded-xl px-3 py-2 text-xs font-semibold text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">Cancel</button></div>}</div></div></li>;
  }

  if (typeof document === "undefined") return null;
  return createPortal(<motion.div initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[110] flex items-end justify-center overflow-y-auto bg-heading/20 sm:items-center sm:p-5" onPointerDown={(event) => { if (event.target === event.currentTarget && !isBusy) onClose(); }}><motion.div ref={panelRef} initial={reducedMotion ? false : { opacity: 0, y: 12, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.99 }} role="dialog" aria-modal="true" aria-labelledby="scheduled-messages-title" aria-busy={isBusy} className="flex max-h-[min(94dvh,52rem)] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-border bg-surface shadow-soft sm:rounded-3xl"><header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6"><div><h2 id="scheduled-messages-title" className="text-lg font-semibold text-heading">Scheduled messages</h2><p className="mt-1 text-sm leading-6 text-body">Private outgoing snapshots prepared from Notes.</p></div><button data-autofocus type="button" onClick={onClose} disabled={isBusy} aria-label="Close scheduled messages" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" strokeLinecap="round" /></svg></button></header><div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">{editingItem ? <section aria-labelledby="edit-scheduled-title" className="mx-auto max-w-xl"><button type="button" onClick={() => { setEditingId(null); setError(""); }} disabled={isBusy} className="text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">← Back to scheduled messages</button><h3 id="edit-scheduled-title" className="mt-5 text-lg font-semibold text-heading">Edit scheduled snapshot</h3><p className="mt-1 text-sm leading-6 text-body">This changes only the scheduled copy, never the source Note.</p><label htmlFor="scheduled-edit-content" className="mt-5 block text-sm font-semibold text-heading">Message</label><textarea id="scheduled-edit-content" value={content} onChange={(event) => { setContent(event.target.value); setError(""); }} maxLength={2000} rows={7} className="mt-2 w-full resize-y rounded-2xl border border-border bg-background p-4 text-sm leading-6 text-heading outline-none focus:border-primary/40 focus:ring-4 focus:ring-accent-hover" /><p className="mt-1 text-right text-xs text-muted">{content.length.toLocaleString()}/2,000</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-heading">Date<input type="date" value={dateValue} onChange={(event) => { setDateValue(event.target.value); setError(""); }} className="mt-2 min-h-12 w-full rounded-2xl border border-border bg-background px-4 text-heading outline-none focus:border-primary/40 focus:ring-4 focus:ring-accent-hover" /></label><label className="text-sm font-semibold text-heading">Time<input type="time" value={timeValue} onChange={(event) => { setTimeValue(event.target.value); setError(""); }} className="mt-2 min-h-12 w-full rounded-2xl border border-border bg-background px-4 text-heading outline-none focus:border-primary/40 focus:ring-4 focus:ring-accent-hover" /></label></div>{error && <p role="alert" className="mt-4 rounded-2xl border border-primary/25 bg-accent px-4 py-3 text-sm text-body">{error}</p>}<div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setEditingId(null)} disabled={isBusy} className="min-h-11 rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold text-heading hover:bg-accent">Cancel</button><button type="button" onClick={() => void saveEdit()} disabled={isBusy || !content.trim() || !dateValue || !timeValue} className="min-h-11 rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{isBusy ? "Saving…" : "Save changes"}</button></div></section> : <>{statusMessage && <p role="status" aria-live="polite" className="mb-4 rounded-2xl border border-border bg-accent px-4 py-3 text-sm text-body">{statusMessage}</p>}{error && <p role="alert" className="mb-4 rounded-2xl border border-primary/25 bg-accent px-4 py-3 text-sm text-body">{error}</p>}{isLoading ? <p role="status" className="py-12 text-center text-sm text-body">Loading scheduled messages…</p> : loadError ? <div role="alert" className="rounded-2xl border border-border p-5 text-center text-sm text-body"><p>{loadError}</p><button type="button" onClick={refresh} className="mt-3 font-semibold text-primary">Try again</button></div> : <div className="space-y-8"><section aria-labelledby="upcoming-scheduled-heading"><div className="flex items-center justify-between gap-3"><h3 id="upcoming-scheduled-heading" className="text-sm font-semibold uppercase tracking-[0.14em] text-muted">Upcoming</h3><span className="text-xs text-muted">{upcoming.length}</span></div>{upcoming.length ? <ul className="mt-3 grid gap-3 sm:grid-cols-2">{upcoming.map(renderItem)}</ul> : <div className="mt-3 rounded-2xl border border-dashed border-border bg-background px-5 py-8 text-center"><p className="font-semibold text-heading">Nothing scheduled</p><p className="mt-1 text-sm text-body">Use Send later from any Note to prepare a future message.</p></div>}</section>{history.length > 0 && <section aria-labelledby="scheduled-history-heading"><h3 id="scheduled-history-heading" className="text-sm font-semibold uppercase tracking-[0.14em] text-muted">Recent activity</h3><ul className="mt-3 grid gap-3 sm:grid-cols-2">{history.map(renderItem)}</ul></section>}</div>}</>}</div>{confirmation && <ConfirmationDialog dialogId={`scheduled-${confirmation.kind}`} title={confirmation.kind === "cancel" ? "Cancel this scheduled message?" : "Send this message now?"} description={confirmation.kind === "cancel" ? "It will not be delivered at its scheduled time. This action can't be reversed." : "Nemissive will attempt delivery immediately and will not send it again at the original time."} confirmLabel={confirmation.kind === "cancel" ? "Cancel message" : "Send now"} pendingLabel={confirmation.kind === "cancel" ? "Cancelling…" : "Sending…"} pendingAnnouncement={confirmation.kind === "cancel" ? "Cancelling scheduled message." : "Sending scheduled message now."} icon={<CalendarIcon />} error="" isPending={isBusy} returnFocusRef={confirmationTriggerRef} onCancel={() => { if (!isBusy) setConfirmation(null); }} onConfirm={() => void confirmAction()} />}</motion.div></motion.div>, document.body);
}

export default ScheduledMessagesDialog;
