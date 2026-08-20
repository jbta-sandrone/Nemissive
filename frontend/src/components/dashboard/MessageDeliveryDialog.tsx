import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { motion, useReducedMotion } from "motion/react";
import { createPortal } from "react-dom";
import { supabase } from "../../lib/supabase";
import type { AcceptedConversationItem, MessageAttachmentKind, MessageType } from "../../types/conversations";
import { formatFileSize, getFriendlyFileType } from "./fileAttachments";
import ProfileAvatar from "./ProfileAvatar";
import { getConversationDisplayName } from "./profileUtils";
import { formatScheduledInstant, formatScheduledInstantAccessible, getDefaultScheduledLocalTime, parseLocalScheduledTime } from "./scheduledMessageTime";
import { formatVoiceDuration } from "./voiceUtils";

export type DeliveryAttachmentPreview = {
  id: string;
  type: MessageAttachmentKind;
  mimeType: string;
  fileName: string;
  fileSize: number;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  storagePath: string | null;
  signedUrl: string | null;
};

export type MessageDeliveryDraft =
  | { kind: "forward"; sourceMessageId: string; messageType: MessageType; preview: string; attachments: DeliveryAttachmentPreview[] }
  | { kind: "note"; noteId: string; body: string; preview: string; attachments: DeliveryAttachmentPreview[]; wasTruncated: boolean };

type Props = {
  conversations: AcceptedConversationItem[];
  currentUserId: string;
  draft: MessageDeliveryDraft;
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onOpenConversation: (conversation: AcceptedConversationItem) => void;
  onSent: () => void;
};
type DeliverySuccess = { kind: "sent"; conversationId: string } | { kind: "scheduled"; conversationId: string; scheduledFor: string };

function normalizeDeliveryError(error: { code?: string; message?: string } | null, scheduling = false) {
  if (!navigator.onLine) return "You're offline. Reconnect and try again.";
  if (error?.code === "42501" || error?.code === "PGRST301") return "That source or conversation is no longer available.";
  if (error?.code === "P0002") return "The source content is no longer available.";
  if (error?.code === "22023" || error?.code === "23514") return scheduling ? "Check the message, media, date, and time and try again." : "This content can't be sent as a message.";
  return scheduling ? "Nemissive couldn't schedule this multimedia snapshot. Please try again." : "Nemissive couldn't send this multimedia snapshot. Please try again.";
}

function SendIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="m4 5 16 7-16 7 3-7-3-7Zm3 7h13" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function MediaIcon({ type }: { type: MessageAttachmentKind }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">{type === "image" ? <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m5 17 5-5 3 3 2-2 4 4" /><circle cx="16" cy="9" r="1.5" /></> : type === "voice" ? <><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" /></> : <><path d="M6 3h8l4 4v14H6V3Z" /><path d="M14 3v5h5" /></>}</svg>;
}

function SafeImagePreview({
  src,
  fileName,
  onDimensions,
}: {
  src: string;
  fileName: string;
  onDimensions: (width: number, height: number) => void;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <><MediaIcon type="image" /><span className="sr-only">Preview unavailable for {fileName}.</span></>;
  }

  return (
    <img
      src={src}
      alt=""
      className="h-full w-full object-cover"
      onLoad={(event) => {
        const image = event.currentTarget;
        const width = image.naturalWidth;
        const height = image.naturalHeight;
        if (width > 0 && height > 0) onDimensions(width, height);
      }}
      onError={() => setFailed(true)}
    />
  );
}

function attachmentLabel(item: DeliveryAttachmentPreview) {
  if (item.type === "voice") return `Voice message, ${formatVoiceDuration(item.durationMs ?? 0)}`;
  if (item.type === "image") return `${item.fileName}, image, ${formatFileSize(item.fileSize)}`;
  return `${item.fileName}, ${getFriendlyFileType(item.fileName, item.mimeType)}, ${formatFileSize(item.fileSize)}`;
}

function MessageDeliveryDialog({ conversations, currentUserId, draft, returnFocusRef, onClose, onOpenConversation, onSent }: Props) {
  const reducedMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const isSubmittingRef = useRef(false);
  const [query, setQuery] = useState("");
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState(() => new Set(draft.attachments.map((item) => item.id)));
  const [imageDimensions, setImageDimensions] = useState<Record<string, { width: number; height: number }>>(() => Object.fromEntries(draft.attachments.filter((item) => item.width && item.height).map((item) => [item.id, { width: item.width as number, height: item.height as number }])));
  const [forwardImageUrls, setForwardImageUrls] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<"choose" | "schedule">("choose");
  const [dateValue, setDateValue] = useState("");
  const [timeValue, setTimeValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<DeliverySuccess | null>(null);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const images = draft.kind === "forward" ? draft.attachments.filter((item) => item.type === "image" && item.storagePath) : [];
    const paths = images.map((item) => item.storagePath as string);
    if (!paths.length) return;
    let active = true;
    void supabase.storage.from("message-media").createSignedUrls(paths, 300).then(({ data }) => {
      if (!active) return;
      const signedUrlByPath = new Map((data ?? []).map((item) => [item.path, item.signedUrl]));
      setForwardImageUrls(Object.fromEntries(images.flatMap((item) => {
        const signedUrl = item.storagePath ? signedUrlByPath.get(item.storagePath) : null;
        return signedUrl ? [[item.id, signedUrl]] : [];
      })));
    });
    return () => { active = false; };
  }, [draft]);

  const filteredConversations = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized ? conversations.filter((conversation) => getConversationDisplayName(conversation.otherProfile, conversation.otherNickname).toLocaleLowerCase().includes(normalized) || (conversation.otherProfile.username?.toLocaleLowerCase() ?? "").includes(normalized)) : conversations;
  }, [conversations, query]);
  const selectedConversation = conversations.find((conversation) => conversation.conversationId === selectedConversationId) ?? null;
  const successConversation = conversations.find((conversation) => conversation.conversationId === success?.conversationId) ?? null;
  const selectedAttachments = draft.attachments.filter((item) => selectedAttachmentIds.has(item.id));
  const missingImageDimensions = selectedAttachments.some((item) => item.type === "image" && !imageDimensions[item.id]);
  const hasDeliverableContent = Boolean(draft.preview.trim() || selectedAttachments.length);
  const parsedSchedule = mode === "schedule" ? parseLocalScheduledTime(dateValue, timeValue) : { instant: null, error: "" };

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const returnTo = returnFocusRef.current;
    document.body.style.overflow = "hidden";
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSubmittingRef.current) { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab" || !panelRef.current) return;
      const controls = [...panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])')];
      const first = controls[0]; const last = controls.at(-1);
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
  useEffect(() => {
    if (!success) return;
    const frame = window.requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("[data-success-autofocus]")?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [success]);

  async function invokeMedia(action: "forward" | "note_send" | "note_schedule", scheduledFor?: string) {
    if (!selectedConversation) return { data: null, error: { message: "No destination" } };
    return supabase.functions.invoke("message-media-delivery", { body: {
      action,
      conversationId: selectedConversation.conversationId,
      sourceMessageId: draft.kind === "forward" ? draft.sourceMessageId : undefined,
      noteId: draft.kind === "note" ? draft.noteId : undefined,
      body: draft.kind === "note" ? draft.body : undefined,
      attachmentIds: draft.kind === "note" ? selectedAttachments.map((item) => item.id) : undefined,
      imageDimensions,
      scheduledFor,
    } });
  }

  async function sendNow() {
    if (!selectedConversation || isSubmitting || !hasDeliverableContent || missingImageDimensions) return;
    isSubmittingRef.current = true; setIsSubmitting(true); setError("");
    let result: { data: unknown; error: { code?: string; message?: string } | null };
    if (draft.kind === "forward" && draft.messageType === "text") result = await supabase.rpc("forward_text_message", { source_message_id: draft.sourceMessageId, target_conversation_id: selectedConversation.conversationId });
    else if (draft.kind === "note" && selectedAttachments.length === 0) result = await supabase.from("messages").insert({ conversation_id: selectedConversation.conversationId, sender_id: currentUserId, body: draft.body }).select("id").single();
    else result = await invokeMedia(draft.kind === "forward" ? "forward" : "note_send");
    isSubmittingRef.current = false; setIsSubmitting(false);
    if (result.error || !result.data) { setError(normalizeDeliveryError(result.error)); return; }
    setSuccess({ kind: "sent", conversationId: selectedConversation.conversationId }); onSent();
  }

  function beginScheduling() {
    if (draft.kind !== "note" || !selectedConversation) return;
    const initial = getDefaultScheduledLocalTime();
    setDateValue(initial.date); setTimeValue(initial.time); setMode("schedule"); setError("");
  }
  async function scheduleMessage() {
    if (draft.kind !== "note" || !selectedConversation || isSubmitting || !hasDeliverableContent || missingImageDimensions) return;
    const parsed = parseLocalScheduledTime(dateValue, timeValue);
    if (!parsed.instant) { setError(parsed.error); return; }
    isSubmittingRef.current = true; setIsSubmitting(true); setError("");
    const result = selectedAttachments.length ? await invokeMedia("note_schedule", parsed.instant.toISOString()) : await supabase.rpc("schedule_note_message", { target_conversation_id: selectedConversation.conversationId, content_snapshot: draft.body, scheduled_for: parsed.instant.toISOString() });
    isSubmittingRef.current = false; setIsSubmitting(false);
    if (result.error || !result.data) { setError(normalizeDeliveryError(result.error, true)); return; }
    const raw = result.data as Record<string, unknown>;
    const row = (raw.schedule && typeof raw.schedule === "object" ? raw.schedule : Array.isArray(result.data) ? result.data[0] : result.data) as Record<string, unknown>;
    setSuccess({ kind: "scheduled", conversationId: selectedConversation.conversationId, scheduledFor: typeof row.scheduled_for === "string" ? row.scheduled_for : parsed.instant.toISOString() });
  }
  function toggleAttachment(id: string) {
    if (draft.kind !== "note" || isSubmitting) return;
    setSelectedAttachmentIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); setError("");
  }

  function rememberImageDimensions(id: string, width: number, height: number) {
    setImageDimensions((current) => {
      const existing = current[id];
      if (existing?.width === width && existing.height === height) return current;
      return { ...current, [id]: { width, height } };
    });
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <motion.div initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : .18 }} className="fixed inset-0 z-[110] flex items-end justify-center overflow-y-auto bg-heading/20 sm:items-center sm:p-5" onPointerDown={(event) => { if (event.target === event.currentTarget && !isSubmitting) onClose(); }}>
      <motion.div ref={panelRef} initial={reducedMotion ? false : { opacity: 0, y: 14, scale: .99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: .99 }} role="dialog" aria-modal="true" aria-labelledby="message-delivery-title" aria-describedby="message-delivery-description" aria-busy={isSubmitting} className="flex max-h-[min(96dvh,52rem)] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-border bg-surface shadow-soft sm:rounded-3xl">
        {success && successConversation ? <div className="p-6 sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-primary"><SendIcon /></div>
          <h2 id="message-delivery-title" className="mt-5 text-xl font-semibold text-heading">{success.kind === "scheduled" ? "Message scheduled" : draft.kind === "forward" ? "Message forwarded" : "Note sent"}</h2>
          <p id="message-delivery-description" role="status" aria-live="polite" className="mt-2 text-sm leading-6 text-body">{success.kind === "scheduled" ? <>The text and selected media snapshot is scheduled for {getConversationDisplayName(successConversation.otherProfile, successConversation.otherNickname)} on <time dateTime={success.scheduledFor} aria-label={formatScheduledInstantAccessible(success.scheduledFor)}>{formatScheduledInstant(success.scheduledFor)}</time>. Delivery may occur within approximately one minute.</> : <>Sent to {getConversationDisplayName(successConversation.otherProfile, successConversation.otherNickname)} as an independent shared snapshot.</>}</p>
          <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" data-success-autofocus onClick={onClose} className="min-h-11 rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold text-heading hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Done</button>{success.kind === "sent" && <button type="button" onClick={() => onOpenConversation(successConversation)} className="min-h-11 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Open conversation</button>}</div>
        </div> : <>
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6"><div><h2 id="message-delivery-title" className="text-lg font-semibold text-heading">{mode === "schedule" ? "Send later" : draft.kind === "forward" ? "Forward message" : "Send note"}</h2><p id="message-delivery-description" className="mt-1 text-sm text-body">{mode === "schedule" ? "Choose when to deliver this immutable text and media snapshot." : "Choose one connected conversation and review the snapshot."}</p></div><button type="button" onClick={onClose} disabled={isSubmitting} aria-label="Close recipient picker" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" strokeLinecap="round" /></svg></button></header>
          <span className="sr-only" role="status" aria-live="polite">
            {isSubmitting ? (mode === "schedule" ? "Scheduling multimedia message" : selectedAttachments.length ? "Preparing multimedia delivery" : "Sending message") : ""}
          </span>
          <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)]">
            <section className="flex min-h-0 flex-col border-b border-border md:border-b-0 md:border-r" aria-label="Recipients"><div className="shrink-0 p-4"><label htmlFor="delivery-recipient-search" className="sr-only">Search connected conversations</label><input data-autofocus id="delivery-recipient-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search connected conversations…" disabled={isSubmitting} className="min-h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm text-heading outline-none placeholder:text-muted focus:border-primary/40 focus:ring-4 focus:ring-accent-hover disabled:opacity-60" /></div><div className="min-h-40 flex-1 overflow-y-auto px-3 pb-3">{filteredConversations.length ? <ul className="space-y-1">{filteredConversations.map((conversation) => { const selected = conversation.conversationId === selectedConversationId; const name = getConversationDisplayName(conversation.otherProfile, conversation.otherNickname); return <li key={conversation.conversationId}><button type="button" onClick={() => { setSelectedConversationId(conversation.conversationId); setError(""); }} disabled={isSubmitting} aria-pressed={selected} className={`flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-60 ${selected ? "bg-accent" : "hover:bg-card"}`}><ProfileAvatar profile={conversation.otherProfile} size="sm" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-heading">{name}</span>{conversation.otherProfile.username && <span className="block truncate text-xs text-muted">@{conversation.otherProfile.username}</span>}</span><span className="text-xs font-semibold text-primary">{selected ? "Selected" : "Select"}</span></button></li>; })}</ul> : <p role="status" className="px-3 py-8 text-center text-sm leading-6 text-body">{conversations.length ? "No connected conversations match your search." : "No eligible connected conversations are available."}</p>}</div></section>
            <section className="min-h-0 overflow-y-auto p-5 sm:p-6" aria-label={mode === "schedule" ? "Schedule and message preview" : "Message preview"}>
              <p className="text-xs font-semibold uppercase tracking-[.14em] text-muted">Preview</p>{draft.kind === "forward" && <p className="mt-3 text-xs font-semibold text-primary">Forwarded</p>}{draft.preview && <div className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-2xl border border-border bg-background p-4 text-sm leading-6 text-body">{draft.preview}</div>}{draft.kind === "note" && draft.wasTruncated && <p className="mt-3 text-xs leading-5 text-body">The text message uses the first 2,000 characters of this Note snapshot.</p>}
              {draft.attachments.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-heading">{draft.kind === "note" ? "Included attachments" : "Attachment"}</p>
                    <span className="text-xs text-muted">{selectedAttachments.length}/{draft.attachments.length}</span>
                  </div>
                  <ul className="mt-2 space-y-2">
                    {draft.attachments.map((item) => {
                      const selected = selectedAttachmentIds.has(item.id);
                      const imageUrl = draft.kind === "forward" ? forwardImageUrls[item.id] ?? null : item.signedUrl;
                      return (
                        <li key={item.id}>
                          <label className={`flex min-w-0 items-center gap-3 rounded-2xl border p-3 ${selected ? "border-primary/30 bg-accent" : "border-border bg-background opacity-70"}`}>
                            <input type="checkbox" checked={selected} disabled={draft.kind === "forward" || isSubmitting} onChange={() => toggleAttachment(item.id)} className={draft.kind === "forward" ? "sr-only" : "h-4 w-4 accent-primary"} />
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface text-primary">
                              {item.type === "image" && imageUrl ? (
                                <SafeImagePreview
                                  key={imageUrl}
                                  src={imageUrl}
                                  fileName={item.fileName}
                                  onDimensions={(width, height) => rememberImageDimensions(item.id, width, height)}
                                />
                              ) : <MediaIcon type={item.type} />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-heading">{item.fileName}</span>
                              <span className="block truncate text-xs text-muted">{attachmentLabel(item)}</span>
                            </span>
                            <span className="sr-only">{selected ? "Included" : "Not included"}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  {mode === "schedule" && selectedAttachments.length > 0 && <p className="mt-2 text-xs leading-5 text-body">Selected media is copied into a private scheduled snapshot now. Later Note edits or deletion won't change delivery.</p>}
                  {missingImageDimensions && <p role="status" className="mt-2 text-xs text-body">Preparing image details…</p>}
                </div>
              )}
              {mode === "schedule" && <div className="mt-5"><p className="text-sm font-semibold text-heading">Send to {selectedConversation ? getConversationDisplayName(selectedConversation.otherProfile, selectedConversation.otherNickname) : "a recipient"}</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><label htmlFor="scheduled-message-date" className="text-sm font-semibold text-heading">Date<input id="scheduled-message-date" type="date" value={dateValue} onChange={(event) => { setDateValue(event.target.value); setError(""); }} disabled={isSubmitting} className="mt-2 min-h-12 w-full rounded-2xl border border-border bg-background px-4 text-heading outline-none focus:border-primary/40 focus:ring-4 focus:ring-accent-hover" /></label><label htmlFor="scheduled-message-time" className="text-sm font-semibold text-heading">Time<input id="scheduled-message-time" type="time" value={timeValue} onChange={(event) => { setTimeValue(event.target.value); setError(""); }} disabled={isSubmitting} className="mt-2 min-h-12 w-full rounded-2xl border border-border bg-background px-4 text-heading outline-none focus:border-primary/40 focus:ring-4 focus:ring-accent-hover" /></label></div>{parsedSchedule.instant && <p role="status" className="mt-3 text-xs leading-5 text-body">Local time: <time dateTime={parsedSchedule.instant.toISOString()} aria-label={formatScheduledInstantAccessible(parsedSchedule.instant.toISOString())}>{formatScheduledInstant(parsedSchedule.instant.toISOString())}</time></p>}</div>}{error && <p role="alert" className="mt-4 rounded-2xl border border-primary/25 bg-accent px-4 py-3 text-sm leading-6 text-body">{error}</p>}
            </section>
          </div>
          <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6"><button type="button" onClick={mode === "schedule" ? () => { setMode("choose"); setError(""); } : onClose} disabled={isSubmitting} className="min-h-11 rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold text-heading hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:opacity-50">{mode === "schedule" ? "Back" : "Cancel"}</button>{mode === "choose" && draft.kind === "note" && <button type="button" onClick={beginScheduling} disabled={!selectedConversation || !hasDeliverableContent || missingImageDimensions || isSubmitting} className="min-h-11 rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold text-heading hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:opacity-50">Send later</button>}{mode === "choose" ? <button type="button" onClick={() => void sendNow()} disabled={!selectedConversation || !hasDeliverableContent || missingImageDimensions || isSubmitting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-50"><SendIcon />{isSubmitting ? selectedAttachments.length ? "Preparing…" : "Sending…" : draft.kind === "forward" ? "Forward" : "Send now"}</button> : <button type="button" onClick={() => void scheduleMessage()} disabled={!selectedConversation || !dateValue || !timeValue || !hasDeliverableContent || missingImageDimensions || Boolean(parsedSchedule.error) || isSubmitting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-50"><SendIcon />{isSubmitting ? "Scheduling…" : "Schedule message"}</button>}</footer>
        </>}
      </motion.div>
    </motion.div>,
    document.body,
  );
}

export default MessageDeliveryDialog;
