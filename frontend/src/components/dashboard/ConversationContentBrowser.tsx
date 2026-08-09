import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { supabase } from "../../lib/supabase";
import type { ConversationContentItem, ConversationContentKind, MessageAttachment, ProfileSearchResult } from "../../types/conversations";
import ImageViewer from "./ImageViewer";
import ProfileAvatar from "./ProfileAvatar";
import { extractHttpUrls, formatFileSize, getFriendlyFileType } from "./fileAttachments";
import { getProfileDisplayName } from "./profileUtils";
import useSignedMessageMedia, { createSignedMessageAttachmentUrl } from "./useSignedMessageMedia";

type ContentRow = {
  content_id: string;
  message_id: string;
  sender_id: string;
  message_body: string;
  message_created_at: string;
  message_type: "text" | "image" | "voice" | "file";
  attachment_kind: "image" | "voice" | "file" | null;
  storage_path: string | null;
  original_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  attachment_position: number | null;
};

const pageSize = 30;

function mapRow(row: ContentRow): ConversationContentItem {
  return { contentId: row.content_id, messageId: row.message_id, senderId: row.sender_id, messageBody: row.message_body, messageCreatedAt: row.message_created_at, messageType: row.message_type, attachmentKind: row.attachment_kind, storagePath: row.storage_path, originalName: row.original_name, mimeType: row.mime_type, size: row.size_bytes, width: row.width, height: row.height, position: row.attachment_position };
}

function formatContentTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function ConversationContentBrowser({ conversationId, participants, returnFocusRef, onClose, onJump }: { conversationId: string; participants: ProfileSearchResult[]; returnFocusRef: RefObject<HTMLButtonElement | null>; onClose: () => void; onJump: (messageId: string) => void }) {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<ConversationContentKind>("media");
  const [itemsByTab, setItemsByTab] = useState<Record<ConversationContentKind, ConversationContentItem[]>>({ media: [], files: [], links: [] });
  const [loadedTabs, setLoadedTabs] = useState<Set<ConversationContentKind>>(() => new Set());
  const [hasMoreByTab, setHasMoreByTab] = useState<Record<ConversationContentKind, boolean>>({ media: true, files: true, links: true });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [openingFileId, setOpeningFileId] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const requestIdRef = useRef(0);
  const profileById = useMemo(() => new Map(participants.map((profile) => [profile.id, profile])), [participants]);
  const mediaItems = itemsByTab.media.filter((item) => item.storagePath && item.attachmentKind === "image");
  const signedMedia = useSignedMessageMedia(mediaItems.flatMap((item) => item.storagePath ? [item.storagePath] : []));

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const returnFocus = returnFocusRef.current;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus());
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape" && viewerIndex === null) { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !panelRef.current || viewerIndex !== null) return;
      const controls = [...panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]),a[href]")]; const first = controls[0]; const last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keydown);
    return () => { cancelAnimationFrame(frame); document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", keydown); requestAnimationFrame(() => returnFocus?.focus()); };
  }, [onClose, returnFocusRef, viewerIndex]);

  const loadPage = useCallback(async (kind: ConversationContentKind, append: boolean) => {
    if (loading) return;
    const current = itemsByTab[kind];
    const cursor = append ? current.at(-1) : null;
    const requestId = ++requestIdRef.current;
    setLoading(true); setError("");
    const { data, error: rpcError } = await supabase.rpc("list_conversation_content", { target_conversation_id: conversationId, content_kind: kind, page_size: pageSize, cursor_created_at: cursor?.messageCreatedAt ?? null, cursor_content_id: cursor?.contentId ?? null });
    if (requestId !== requestIdRef.current) return;
    setLoading(false);
    if (rpcError) { setError("We couldn’t load this conversation content. Please try again."); if (import.meta.env.DEV) console.warn("Loading conversation content failed", { conversationId, kind, code: rpcError.code }); return; }
    const next = ((data ?? []) as ContentRow[]).map(mapRow);
    setItemsByTab((existing) => ({ ...existing, [kind]: append ? [...existing[kind].filter((item) => !next.some((candidate) => candidate.contentId === item.contentId)), ...next] : next }));
    setHasMoreByTab((existing) => ({ ...existing, [kind]: next.length === pageSize }));
    setLoadedTabs((existing) => new Set(existing).add(kind));
  }, [conversationId, itemsByTab, loading]);

  useEffect(() => {
    if (loadedTabs.has(tab) || loading) return;
    const timer = window.setTimeout(() => void loadPage(tab, false), 0);
    return () => window.clearTimeout(timer);
  }, [loadPage, loadedTabs, loading, tab]);

  async function openFile(item: ConversationContentItem) {
    if (!item.storagePath || openingFileId) return;
    setOpeningFileId(item.contentId); setError("");
    try { const url = await createSignedMessageAttachmentUrl(item.storagePath); const link = document.createElement("a"); link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.download = item.originalName ?? "attachment"; link.click(); }
    catch { setError("That file couldn’t be opened. Its access may have expired or changed."); }
    finally { setOpeningFileId(null); }
  }

  const links = itemsByTab.links.flatMap((item) => extractHttpUrls(item.messageBody).map((url, index) => ({ item, url, key: `${item.contentId}:${index}:${url}` })));
  const viewerImages = mediaItems.map((item): MessageAttachment & { url: string | null; width: number; height: number } => ({ id: item.contentId, messageId: item.messageId, storagePath: item.storagePath ?? "", originalName: item.originalName ?? "Photo", mimeType: item.mimeType ?? "image/jpeg", size: item.size ?? 0, width: item.width ?? 1, height: item.height ?? 1, position: item.position ?? 0, attachmentKind: "image", durationMs: null, url: item.storagePath ? signedMedia.urls.get(item.storagePath) ?? null : null }));
  const emptyText = tab === "media" ? ["No shared photos yet", "Photos shared in this conversation will appear here."] : tab === "files" ? ["No shared files yet", "Documents and archives shared here will appear here."] : ["No shared links yet", "Links in accessible messages will appear here."];

  return createPortal(<motion.div initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[92] flex items-end justify-center bg-heading/20 sm:items-center sm:p-4" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><motion.div ref={panelRef} initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} role="dialog" aria-modal="true" aria-labelledby="conversation-content-title" className="flex h-[100dvh] w-full max-w-4xl flex-col bg-surface shadow-soft sm:h-[min(48rem,calc(100dvh-2rem))] sm:rounded-3xl sm:border sm:border-border"><header className="flex items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6"><div><h2 id="conversation-content-title" className="text-lg font-semibold text-heading">Media, files & links</h2><p className="text-xs text-muted">Shared in this conversation</p></div><button data-autofocus type="button" onClick={onClose} aria-label="Close shared content" className="flex h-11 w-11 items-center justify-center rounded-2xl text-muted hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" strokeLinecap="round" /></svg></button></header><div role="tablist" aria-label="Conversation content" className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-4 pt-2 sm:px-6">{(["media", "files", "links"] as const).map((kind) => <button key={kind} type="button" role="tab" aria-selected={tab === kind} onClick={() => { requestIdRef.current += 1; setLoading(false); setError(""); setTab(kind); }} className={`min-h-11 shrink-0 rounded-t-xl px-4 text-sm font-semibold capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 ${tab === kind ? "border-b-2 border-primary text-primary" : "text-muted hover:bg-accent hover:text-heading"}`}>{kind}</button>)}</div><div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">{error && <div role="alert" className="mb-4 rounded-2xl bg-accent p-3 text-sm text-body">{error}</div>}{loading && itemsByTab[tab].length === 0 ? <div role="status" aria-live="polite" className="grid grid-cols-2 gap-3 sm:grid-cols-3"><span className="aspect-square animate-pulse rounded-2xl bg-accent" /><span className="aspect-square animate-pulse rounded-2xl bg-accent" /></div> : tab === "media" && mediaItems.length > 0 ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">{mediaItems.map((item, index) => <article key={item.contentId} className="group relative aspect-square overflow-hidden rounded-2xl bg-background"><button type="button" onClick={() => setViewerIndex(index)} aria-label={`Open photo shared ${formatContentTime(item.messageCreatedAt)}`} className="h-full w-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30">{item.storagePath && signedMedia.urls.get(item.storagePath) ? <img src={signedMedia.urls.get(item.storagePath)} alt={item.originalName ?? "Shared photo"} loading="lazy" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-xs text-muted">Loading photo…</span>}</button><button type="button" onClick={() => { onClose(); onJump(item.messageId); }} className="absolute bottom-2 right-2 min-h-9 rounded-xl bg-surface/95 px-3 text-xs font-semibold text-heading opacity-100 shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">Jump</button></article>)}</div> : tab === "files" && itemsByTab.files.length > 0 ? <div className="space-y-2">{itemsByTab.files.map((item) => { const sender = profileById.get(item.senderId); return <article key={item.contentId} className="rounded-2xl border border-border bg-background p-3"><div className="flex min-w-0 items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="M6 3h8l4 4v14H6V3Z" strokeLinejoin="round" /><path d="M14 3v5h5" /></svg></span><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold text-heading">{item.originalName}</h3><p className="text-xs text-muted">{getFriendlyFileType(item.originalName ?? "", item.mimeType ?? "")} · {formatFileSize(item.size ?? 0)}</p><p className="mt-1 text-xs text-body">{sender ? getProfileDisplayName(sender) : "Conversation participant"} · {formatContentTime(item.messageCreatedAt)}</p></div></div><div className="mt-3 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => { onClose(); onJump(item.messageId); }} className="min-h-10 rounded-xl px-3 text-xs font-semibold text-heading hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">Jump to message</button><button type="button" onClick={() => void openFile(item)} disabled={Boolean(openingFileId)} className="min-h-10 rounded-xl bg-primary px-3 text-xs font-semibold text-white hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-60">{openingFileId === item.contentId ? "Opening…" : "Download"}</button></div></article>; })}</div> : tab === "links" && links.length > 0 ? <div className="space-y-2">{links.map(({ item, url, key }) => { const sender = profileById.get(item.senderId); return <article key={key} className="min-w-0 rounded-2xl border border-border bg-background p-3"><div className="flex items-center gap-3">{sender && <ProfileAvatar profile={sender} size="sm" />}<div className="min-w-0"><p className="text-xs text-muted">{sender ? getProfileDisplayName(sender) : "Conversation participant"} · {formatContentTime(item.messageCreatedAt)}</p><a href={url} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-sm font-semibold text-primary underline underline-offset-2 focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">{url}</a></div></div><button type="button" onClick={() => { onClose(); onJump(item.messageId); }} className="mt-2 min-h-10 rounded-xl px-3 text-xs font-semibold text-heading hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">Jump to message</button></article>; })}</div> : !loading && <div className="flex min-h-64 items-center justify-center text-center"><div><h3 className="font-semibold text-heading">{emptyText[0]}</h3><p className="mt-2 text-sm text-body">{emptyText[1]}</p></div></div>}{hasMoreByTab[tab] && itemsByTab[tab].length > 0 && <button type="button" onClick={() => void loadPage(tab, true)} disabled={loading} className="mt-5 min-h-11 w-full rounded-2xl border border-border text-sm font-semibold text-heading hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-60">{loading ? "Loading…" : "Load more"}</button>}</div></motion.div>{viewerIndex !== null && viewerImages.length > 0 && <ImageViewer images={viewerImages} initialIndex={viewerIndex} isLoading={signedMedia.isLoading} returnFocusRef={returnFocusRef} onClose={() => setViewerIndex(null)} onRetry={signedMedia.retry} />}</motion.div>, document.body);
}

export default ConversationContentBrowser;
