import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { AcceptedConversationItem } from "../../types/conversations";
import ProfileAvatar from "./ProfileAvatar";
import { getConversationDisplayName } from "./profileUtils";

type ConversationPickerListProps = {
  conversations: AcceptedConversationItem[];
  selectedConversationId: string | null;
  searchInputId: string;
  onSelect: (conversation: AcceptedConversationItem) => void;
  disabled?: boolean;
  isLoading?: boolean;
  autoFocus?: boolean;
};

export function ConversationPickerList({ conversations, selectedConversationId, searchInputId, onSelect, disabled = false, isLoading = false, autoFocus = false }: ConversationPickerListProps) {
  const [query, setQuery] = useState("");
  const filteredConversations = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return conversations;
    return conversations.filter((conversation) => {
      const displayName = getConversationDisplayName(conversation.otherProfile, conversation.otherNickname).toLocaleLowerCase();
      const username = conversation.otherProfile.username?.toLocaleLowerCase() ?? "";
      return displayName.includes(normalized) || username.includes(normalized);
    });
  }, [conversations, query]);

  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="shrink-0 p-4">
      <label htmlFor={searchInputId} className="sr-only">Search connected conversations</label>
      <input data-autofocus={autoFocus ? "true" : undefined} id={searchInputId} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search connected conversations…" disabled={disabled} className="min-h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm text-heading outline-none placeholder:text-muted focus:border-primary/40 focus:ring-4 focus:ring-accent-hover disabled:opacity-60" />
    </div>
    <div className="min-h-40 flex-1 overflow-y-auto px-3 pb-3">
      {isLoading ? <p role="status" className="px-3 py-8 text-center text-sm text-body">Loading conversations…</p> : filteredConversations.length ? <><p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{query.trim() ? "Results" : "Recent conversations"}</p><ul className="space-y-1">{filteredConversations.map((conversation) => {
        const selected = conversation.conversationId === selectedConversationId;
        const name = getConversationDisplayName(conversation.otherProfile, conversation.otherNickname);
        return <li key={conversation.conversationId}><button type="button" onClick={() => onSelect(conversation)} disabled={disabled} aria-pressed={selected} className={`flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-60 ${selected ? "bg-accent" : "hover:bg-card"}`}>
          <ProfileAvatar profile={conversation.otherProfile} size="sm" />
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-heading">{name}</span>{conversation.otherProfile.username && <span className="block truncate text-xs text-muted">@{conversation.otherProfile.username}</span>}</span>
          <span className="text-xs font-semibold text-primary">{selected ? "Selected" : "Select"}</span>
        </button></li>;
      })}</ul></> : <p role="status" className="px-3 py-8 text-center text-sm leading-6 text-body">{conversations.length ? "No connected conversations match your search." : "No eligible connected conversations are available."}</p>}
    </div>
  </div>;
}

type ConversationPickerDialogProps = {
  conversations: AcceptedConversationItem[];
  isLoading: boolean;
  selectedConversationId: string | null;
  returnFocusRef: RefObject<HTMLElement | null>;
  onSelect: (conversation: AcceptedConversationItem) => void;
  onClose: () => void;
};

export function ConversationPickerDialog({ conversations, isLoading, selectedConversationId, returnFocusRef, onSelect, onClose }: ConversationPickerDialogProps) {
  const reducedMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const returnTo = returnFocusRef.current;
    document.body.style.overflow = "hidden";
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); onCloseRef.current(); return; }
      if (event.key !== "Tab" || !panelRef.current) return;
      const controls = [...panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])')];
      const first = controls[0]; const last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    const frame = window.requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus());
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown, true);
      window.requestAnimationFrame(() => { if (returnTo?.isConnected) returnTo.focus(); });
    };
  }, [returnFocusRef]);

  if (typeof document === "undefined") return null;
  return createPortal(<motion.div initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[110] flex items-end justify-center overflow-y-auto bg-heading/20 sm:items-center sm:p-5" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <motion.div ref={panelRef} initial={reducedMotion ? false : { opacity: 0, y: 12, scale: .99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: .99 }} role="dialog" aria-modal="true" aria-labelledby="reminder-conversation-picker-title" className="flex max-h-[min(90dvh,42rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-border bg-surface shadow-soft sm:rounded-3xl">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4"><div><h2 id="reminder-conversation-picker-title" className="text-lg font-semibold text-heading">Choose a conversation</h2><p className="mt-1 text-sm text-body">Share with one eligible connected conversation.</p></div><button type="button" onClick={onClose} aria-label="Close conversation picker" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" strokeLinecap="round" /></svg></button></header>
      <ConversationPickerList conversations={conversations} selectedConversationId={selectedConversationId} searchInputId="reminder-conversation-search" onSelect={onSelect} isLoading={isLoading} autoFocus />
    </motion.div>
  </motion.div>, document.body);
}
