import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import type { ProfileSearchResult } from "../../types/conversations";
import ProfileAvatar from "./ProfileAvatar";
import { getConversationDisplayName, getProfileDisplayName } from "./profileUtils";

type ConversationNicknameDialogProps = {
  nicknamesByUserId: ReadonlyMap<string, string>;
  participants: ProfileSearchResult[];
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onSave: (userId: string, nickname: string | null) => Promise<string | null>;
};

const nicknameMaximumLength = 40;

function ConversationNicknameDialog({ nicknamesByUserId, participants, returnFocusRef, onClose, onSave }: ConversationNicknameDialogProps) {
  const shouldReduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  const isSavingRef = useRef(false);
  const editingUserIdRef = useRef<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    isSavingRef.current = isSaving;
  }, [isSaving]);

  useEffect(() => {
    editingUserIdRef.current = editingUserId;
  }, [editingUserId]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const returnFocusElement = returnFocusRef.current;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (isSavingRef.current) return;
        if (editingUserIdRef.current) {
          setEditingUserId(null);
          setError("");
        } else {
          onCloseRef.current();
        }
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])")];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    const focusFrame = window.requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("[data-autofocus], button:not([disabled])")?.focus());
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() => returnFocusElement?.focus());
    };
  }, [returnFocusRef]);

  useEffect(() => {
    if (!editingUserId) return;
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editingUserId]);

  function beginEditing(profile: ProfileSearchResult) {
    setEditingUserId(profile.id);
    setDraft(nicknamesByUserId.get(profile.id) ?? "");
    setError("");
  }

  async function saveNickname(nickname: string | null) {
    if (!editingUserId || isSaving) return;
    const normalized = nickname?.trim() ?? null;
    if (normalized !== null && !normalized) {
      setError("Enter a nickname, or use Remove nickname.");
      return;
    }
    if (normalized && normalized.length > nicknameMaximumLength) {
      setError(`Nicknames must be ${nicknameMaximumLength} characters or fewer.`);
      return;
    }
    if (normalized && [...normalized].some((character) => { const codePoint = character.codePointAt(0) ?? 0; return codePoint < 32 || codePoint === 127; })) {
      setError("That nickname contains unsupported control characters.");
      return;
    }
    if (normalized === (nicknamesByUserId.get(editingUserId) ?? null)) {
      setEditingUserId(null);
      setDraft("");
      return;
    }

    setIsSaving(true);
    setError("");
    const nextError = await onSave(editingUserId, normalized);
    setIsSaving(false);
    if (nextError) {
      setError(nextError);
      return;
    }
    setEditingUserId(null);
    setDraft("");
  }

  return createPortal(
    <motion.div initial={shouldReduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: shouldReduceMotion ? 0 : 0.18 }} className="fixed inset-0 z-[90] flex items-end justify-center overflow-y-auto bg-heading/20 p-0 md:items-center md:p-4" onPointerDown={(event) => { if (event.target === event.currentTarget && !isSaving) onClose(); }}>
      <motion.div ref={panelRef} initial={shouldReduceMotion ? false : { opacity: 0, y: 18, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.99 }} transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }} role="dialog" aria-modal="true" aria-labelledby="edit-nicknames-title" aria-describedby="edit-nicknames-description" aria-busy={isSaving} className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl border-t border-border bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-soft md:max-w-lg md:rounded-3xl md:border md:p-6">
        <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-border md:hidden" />
        <div className="flex items-start justify-between gap-4"><div><h2 id="edit-nicknames-title" className="text-xl font-semibold text-heading">Edit nicknames</h2><p id="edit-nicknames-description" className="mt-1 text-sm leading-6 text-body">Nicknames are shared with everyone in this conversation.</p></div><button type="button" onClick={onClose} disabled={isSaving} aria-label="Close nickname editor" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" strokeLinecap="round" /></svg></button></div>
        <div className="mt-5 space-y-3">{participants.map((profile, index) => {
          const nickname = nicknamesByUserId.get(profile.id) ?? null;
          const actualName = getProfileDisplayName(profile);
          const isEditing = editingUserId === profile.id;
          return <section key={profile.id} className="rounded-2xl border border-border bg-background p-4"><div className="flex min-w-0 items-center gap-3"><ProfileAvatar profile={profile} size="sm" /><div className="min-w-0 flex-1"><p className="truncate font-semibold text-heading">{getConversationDisplayName(profile, nickname)}</p><p className="truncate text-xs text-muted">{nickname ? `Account name: ${actualName}` : profile.username ? `@${profile.username}` : actualName}</p>{nickname && profile.username && <p className="truncate text-xs text-muted">@{profile.username}</p>}</div>{!isEditing && <button data-autofocus={index === 0 ? true : undefined} type="button" onClick={() => beginEditing(profile)} disabled={isSaving} aria-label={`Edit nickname for ${actualName}`} className="min-h-10 shrink-0 rounded-xl px-3 py-2 text-sm font-semibold text-primary transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50">Edit</button>}</div>{isEditing && <form onSubmit={(event) => { event.preventDefault(); void saveNickname(draft); }} className="mt-4"><label htmlFor={`nickname-${profile.id}`} className="text-xs font-semibold text-heading">Nickname for {actualName}</label><input ref={inputRef} id={`nickname-${profile.id}`} value={draft} onChange={(event) => { setDraft(event.target.value); setError(""); }} maxLength={nicknameMaximumLength} disabled={isSaving} aria-invalid={Boolean(error)} aria-describedby={error ? `nickname-error-${profile.id}` : undefined} placeholder={actualName} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-heading outline-none placeholder:text-muted focus:border-primary focus:ring-4 focus:ring-accent-hover disabled:cursor-wait disabled:opacity-60" /><div className="mt-3 flex flex-wrap justify-end gap-2">{nickname && <button type="button" onClick={() => void saveNickname(null)} disabled={isSaving} className="mr-auto min-h-10 rounded-xl px-3 py-2 text-sm font-semibold text-body transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50">Remove nickname</button>}<button type="button" onClick={() => { setEditingUserId(null); setError(""); }} disabled={isSaving} className="min-h-10 rounded-xl px-3 py-2 text-sm font-semibold text-body transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50">Cancel</button><button type="submit" disabled={isSaving || !draft.trim()} className="min-h-10 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-wait disabled:opacity-50">{isSaving ? "Saving…" : "Save"}</button></div>{error && <p id={`nickname-error-${profile.id}`} role="alert" className="mt-3 rounded-xl bg-accent px-3 py-2 text-xs leading-5 text-body">{error}</p>}</form>}</section>;
        })}</div>
        <p role="status" aria-live="polite" className="sr-only">{isSaving ? "Saving nickname." : ""}</p>
        <button type="button" onClick={onClose} disabled={isSaving} className="mt-5 min-h-11 w-full rounded-2xl bg-accent px-4 py-2.5 text-sm font-semibold text-heading transition hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50">Done</button>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

export default ConversationNicknameDialog;
