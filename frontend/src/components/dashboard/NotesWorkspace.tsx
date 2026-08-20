import type { Editor, JSONContent } from "@tiptap/core";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { AcceptedConversationItem } from "../../types/conversations";
import ConfirmationDialog from "./ConfirmationDialog";
import type { MessageDeliveryDraft } from "./MessageDeliveryDialog";
import NoteRichTextEditor from "./NoteRichTextEditor";
import ScheduledMessagesDialog from "./ScheduledMessagesDialog";
import { countWords, createNoteMessageSnapshot, documentsEqual, emptyNoteDocument, noteDocumentMaxBytes, noteTextMaxLength, noteThemeIds, noteTitleMaxLength, type NoteThemeId } from "./noteDocuments";
import useNoteAttachments, { type NoteAttachment, type NoteAttachmentType } from "./useNoteAttachments";
import useNotes, { type NoteRecord } from "./useNotes";
import useVoiceRecorder from "./useVoiceRecorder";
import { formatVoiceDuration } from "./voiceUtils";

type NotesWorkspaceProps = { currentUserId: string; conversations: AcceptedConversationItem[]; returnFocusRef: RefObject<HTMLElement | null>; onClose: () => void; onSend: (draft: MessageDeliveryDraft, trigger: HTMLElement) => void; onMessageSent: () => void };
type EditorState = { sessionKey: string; noteId: string | null; title: string; document: JSONContent; plainText: string; themeId: NoteThemeId; isPinned: boolean };
type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";
const autoSaveDelayMs = 2000;

function key() { return crypto.randomUUID(); }
function fromNote(note: NoteRecord): EditorState { return { sessionKey: key(), noteId: note.id, title: note.title, document: note.document, plainText: note.searchText || note.content, themeId: note.themeId, isPinned: note.isPinned }; }
function draft(): EditorState { return { sessionKey: key(), noteId: null, title: "", document: emptyNoteDocument, plainText: "", themeId: "default", isPinned: false }; }
function meaningful(value: EditorState) { return Boolean(value.title.trim() || value.plainText.trim() || value.document.content?.some((node) => node.type === "noteAttachment")); }
function hasUnsavedChanges(value: EditorState, saved: EditorState | null) {
  if (!value.noteId) return meaningful(value);
  return !saved || saved.noteId !== value.noteId || saved.title !== value.title || saved.themeId !== value.themeId || !documentsEqual(saved.document, value.document);
}
function noteMatchesEditor(note: NoteRecord, value: EditorState) { return note.title === value.title && note.themeId === value.themeId && note.isPinned === value.isPinned && documentsEqual(note.document, value.document); }
function title(value: string) { return value.trim() || "Untitled note"; }
function preview(value: string) { return value.replace(/\s+/gu, " ").trim() || "No additional text"; }
function updated(value: string) { const date = new Date(value); if (Number.isNaN(date.getTime())) return "Recently updated"; const today = new Date(); if (date.toDateString() === today.toDateString()) return `Today at ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date)}`; return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" }).format(date); }

function Icon({ kind }: { kind: "close" | "back" | "search" | "note" | "pin" | "delete" | "theme" | "send" }) {
  const paths = { close: "m7 7 10 10M17 7 7 17", back: "m15 6-6 6 6 6M9 12h10", search: "M16 16l4 4", note: "M6 3.5h9l3 3v14H6v-17Zm9 0v4h4M9 11h6M9 15h6", pin: "M8 4h8l-1 5 3 3v2H6v-2l3-3-1-5Zm4 10v6", delete: "M5 7h14M9 7V4h6v3M8 10v8M12 10v8M16 10v8M6.5 7l.7 13h9.6l.7-13", theme: "M12 3a9 9 0 1 0 0 18h1.2a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h5a4 4 0 0 0 4-4c0-3.3-4-6-9-6Z", send: "m4 5 16 7-16 7 3-7-3-7Zm3 7h13" };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={kind === "note" ? "h-6 w-6" : "h-5 w-5"} aria-hidden="true"><path d={paths[kind]} strokeLinecap="round" strokeLinejoin="round" />{kind === "search" && <circle cx="11" cy="11" r="6.5" />}</svg>;
}

function NoteListItem({ note, selected, onSelect }: { note: NoteRecord; selected: boolean; onSelect: () => void }) {
  return <li><button type="button" onClick={onSelect} aria-current={selected ? "true" : undefined} data-note-theme={note.themeId} className={`note-list-item ${selected ? "is-selected" : ""}`}><span className="flex min-w-0 items-center gap-2"><span className="min-w-0 flex-1 truncate text-sm font-semibold text-heading">{title(note.title)}</span>{note.isPinned && <span className="shrink-0 text-primary" aria-label="Pinned"><Icon kind="pin" /></span>}</span><span className="mt-1 block truncate text-xs leading-5 text-body">{preview(note.searchText)}</span><span className="mt-2 flex items-center justify-between gap-2 text-[11px] font-medium text-muted"><span>{updated(note.updatedAt)}</span><span className="capitalize">{note.themeId}</span></span></button></li>;
}

function NotesWorkspace({ currentUserId, conversations, returnFocusRef, onClose, onSend, onMessageSent }: NotesWorkspaceProps) {
  const reduced = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const voiceDialogRef = useRef<HTMLDivElement>(null);
  const deleteTriggerRef = useRef<HTMLElement | null>(null);
  const scheduledTriggerRef = useRef<HTMLElement | null>(null);
  const richEditorRef = useRef<Editor | null>(null);
  const editorRef = useRef<EditorState | null>(null);
  const lastSavedRef = useRef<EditorState | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const saveInFlightRef = useRef(false);
  const saveAgainRef = useRef(false);
  const persistRef = useRef<() => Promise<NoteRecord | null>>(async () => null);
  const flushEditsRef = useRef<() => Promise<boolean>>(async () => true);
  const requestCloseRef = useRef<() => Promise<void>>(async () => undefined);
  const mountedRef = useRef(true);
  const { notes, isLoading, loadError, refresh, saveNote, createDraft, setPinned, deleteNote } = useNotes(currentUserId);
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [mobileEditor, setMobileEditor] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const [sendError, setSendError] = useState("");
  const [scheduledOpen, setScheduledOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [themeOpen, setThemeOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const recorder = useVoiceRecorder();
  const cancelVoiceRecording = recorder.cancelRecording;
  const attachmentsApi = useNoteAttachments(currentUserId, editor?.noteId ?? null);
  const refreshAttachments = attachmentsApi.refresh;

  useEffect(() => {
    const flushForPageExit = () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      void flushEditsRef.current();
    };
    window.addEventListener("pagehide", flushForPageExit);
    return () => {
      flushForPageExit();
      mountedRef.current = false;
      window.removeEventListener("pagehide", flushForPageExit);
    };
  }, []);
  const filtered = useMemo(() => { const value = query.trim().toLocaleLowerCase(); return value ? notes.filter((note) => note.title.toLocaleLowerCase().includes(value) || note.searchText.toLocaleLowerCase().includes(value)) : notes; }, [notes, query]);
  const pinned = useMemo(() => filtered.filter((note) => note.isPinned), [filtered]);
  const recent = useMemo(() => filtered.filter((note) => !note.isPinned), [filtered]);

  const activate = useCallback((next: EditorState | null, open = true) => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    editorRef.current = next; setEditor(next); setSaveError(""); setSaveState(next?.noteId ? "saved" : "idle"); lastSavedRef.current = next ? structuredClone(next) : null; if (open) setMobileEditor(Boolean(next));
  }, []);
  const persist = useCallback(async () => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current); saveTimerRef.current = null;
    const snapshot = editorRef.current; if (!snapshot) return null;
    if (!snapshot.noteId && !meaningful(snapshot)) { setSaveState("idle"); return null; }
    const documentBytes = new TextEncoder().encode(JSON.stringify(snapshot.document)).byteLength;
    if (snapshot.plainText.length > noteTextMaxLength || documentBytes > noteDocumentMaxBytes) { setSaveState("error"); setSaveError(snapshot.plainText.length > noteTextMaxLength ? "Notes support up to 20,000 visible text characters." : "This structured note is too large. Remove some content and try again."); return null; }
    const previous = lastSavedRef.current;
    if (snapshot.noteId && previous?.noteId === snapshot.noteId && previous.title === snapshot.title && previous.themeId === snapshot.themeId && documentsEqual(previous.document, snapshot.document)) { setSaveState("saved"); return notes.find((note) => note.id === snapshot.noteId) ?? null; }
    if (saveInFlightRef.current) { saveAgainRef.current = true; return null; }
    saveInFlightRef.current = true; setSaveState("saving"); setSaveError("");
    const result = await saveNote(snapshot.noteId, snapshot.title, snapshot.document, snapshot.themeId); saveInFlightRef.current = false;
    if (result.error || !result.note) { if (mountedRef.current && editorRef.current?.sessionKey === snapshot.sessionKey) { setSaveState("error"); setSaveError(result.error ?? "Your note couldn't be saved."); } return null; }
    const current = editorRef.current;
    if (current?.sessionKey === snapshot.sessionKey) {
      const next = current.noteId ? current : { ...current, noteId: result.note.id, isPinned: result.note.isPinned };
      if (!current.noteId) { editorRef.current = next; setEditor(next); }
      lastSavedRef.current = { ...snapshot, noteId: result.note.id };
      const changed = next.title !== snapshot.title || next.themeId !== snapshot.themeId || !documentsEqual(next.document, snapshot.document); setSaveState(changed ? "dirty" : "saved");
      if (changed || saveAgainRef.current) {
        saveAgainRef.current = false;
        if (saveTimerRef.current === null) saveTimerRef.current = window.setTimeout(() => void persistRef.current(), autoSaveDelayMs);
      }
    }
    return result.note;
  }, [notes, saveNote]);
  useEffect(() => { persistRef.current = persist; }, [persist]);
  const schedule = useCallback(() => { if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current); setSaveState((current) => current === "dirty" ? current : "dirty"); setSaveError((current) => current ? "" : current); saveTimerRef.current = window.setTimeout(() => void persistRef.current(), autoSaveDelayMs); }, []);
  const update = useCallback((changes: Partial<EditorState>) => { const current = editorRef.current; if (!current) return; const next = { ...current, ...changes }; editorRef.current = next; setEditor(next); setSendError(""); schedule(); }, [schedule]);

  const flushEdits = useCallback(async () => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;

    // A save that was already in flight may have captured an older draft. Wait
    // for its acknowledgement, then persist the latest local revision. A final
    // navigation boundary never proceeds while a newer local revision remains.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      while (saveInFlightRef.current) await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
      const current = editorRef.current;
      if (!current || !hasUnsavedChanges(current, lastSavedRef.current)) return true;
      const saved = await persistRef.current();
      if (!saved && hasUnsavedChanges(editorRef.current ?? current, lastSavedRef.current)) return false;
    }
    const latest = editorRef.current;
    return !latest || !hasUnsavedChanges(latest, lastSavedRef.current);
  }, []);
  useEffect(() => { flushEditsRef.current = flushEdits; }, [flushEdits]);

  useEffect(() => {
    const current = editorRef.current; if (!current?.noteId || ["dirty", "saving", "error"].includes(saveState)) return;
    const note = notes.find((item) => item.id === current.noteId); if (!note) { activate(null); return; }
    const acknowledged = lastSavedRef.current;
    if (noteMatchesEditor(note, current) || (acknowledged?.noteId === note.id && noteMatchesEditor(note, acknowledged))) return;
    activate(fromNote(note));
    void refreshAttachments();
  }, [activate, notes, refreshAttachments, saveState]);

  const requestClose = useCallback(async () => { if (await flushEdits()) onClose(); }, [flushEdits, onClose]);
  useEffect(() => { requestCloseRef.current = requestClose; }, [requestClose]);
  const openNewNote = useCallback(async () => {
    if (!await flushEdits()) return;
    activate(draft());
    requestAnimationFrame(() => panelRef.current?.querySelector<HTMLInputElement>("[data-note-title]")?.focus());
  }, [activate, flushEdits]);
  const openNote = useCallback(async (note: NoteRecord) => {
    if (editorRef.current?.noteId === note.id) { setMobileEditor(true); return; }
    if (!await flushEdits()) return;
    activate(fromNote(note));
  }, [activate, flushEdits]);
  const closeMobileEditor = useCallback(async () => {
    if (await flushEdits()) setMobileEditor(false);
  }, [flushEdits]);
  const openSendDialog = useCallback(async (trigger: HTMLElement) => {
    setSendError("");
    if (!await flushEdits()) return;
    const current = editorRef.current;
    if (!current) return;
    const snapshot = createNoteMessageSnapshot(current.title, current.document);
    if (!snapshot.body) {
      setSendError("Add a title or some note text before sending.");
      return;
    }
    onSend({ kind: "note", body: snapshot.body, preview: snapshot.body, omittedAttachmentCount: attachmentsApi.attachments.length, wasTruncated: snapshot.wasTruncated }, trigger);
  }, [attachmentsApi.attachments.length, flushEdits, onSend]);
  useEffect(() => {
    const overflow = document.body.style.overflow; const returnTo = returnFocusRef.current; document.body.style.overflow = "hidden";
    function keys(event: KeyboardEvent) {
      const modals = [...document.querySelectorAll<HTMLElement>('[aria-modal="true"]')];
      const activeModal = modals.at(-1);
      if (activeModal !== panelRef.current && activeModal !== voiceDialogRef.current) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (activeModal === voiceDialogRef.current) { cancelVoiceRecording(); setVoiceOpen(false); } else void requestCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !activeModal) return;
      const controls = [...activeModal.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),[contenteditable="true"],[tabindex]:not([tabindex="-1"])')];
      const first = controls[0]; const last = controls.at(-1); if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keys); const frame = requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("[data-notes-close]")?.focus());
    return () => { cancelAnimationFrame(frame); document.body.style.overflow = overflow; document.removeEventListener("keydown", keys); requestAnimationFrame(() => returnTo?.focus()); };
  }, [cancelVoiceRecording, returnFocusRef]);

  useEffect(() => {
    if (!voiceOpen) return;
    const frame = window.requestAnimationFrame(() => voiceDialogRef.current?.querySelector<HTMLElement>("button")?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [voiceOpen]);

  const ensurePersistedNote = useCallback(async () => {
    const current = editorRef.current; if (!current) return null; if (current.noteId) return current.noteId;
    const created = await createDraft(); if (created.error || !created.note) { setSaveState("error"); setSaveError(created.error ?? "A note couldn't be prepared."); return null; }
    const next = { ...current, noteId: created.note.id }; editorRef.current = next; setEditor(next); lastSavedRef.current = fromNote(created.note);
    const saved = await persistRef.current(); return saved?.id ?? next.noteId;
  }, [createDraft]);

  function removeAttachmentNode(attachmentId: string) {
    const richEditor = richEditorRef.current;
    if (!richEditor) return;
    richEditor.chain().command(({ state, tr }) => {
      const ranges: Array<{ from: number; to: number }> = [];
      state.doc.descendants((node, position) => { if (node.type.name === "noteAttachment" && node.attrs.attachmentId === attachmentId) ranges.push({ from: position, to: position + node.nodeSize }); });
      ranges.reverse().forEach((range) => tr.delete(range.from, range.to));
      return ranges.length > 0;
    }).run();
  }

  async function upload(file: File, type: NoteAttachmentType, durationMs: number | null = null) {
    if (busy) return; setBusy(true); setSaveError("");
    const noteId = await ensurePersistedNote(); if (!noteId) { setBusy(false); return; }
    const result = await attachmentsApi.upload(noteId, file, type, durationMs);
    if (result.error || !result.attachment) { setSaveState("error"); setSaveError(result.error ?? "The attachment couldn't be inserted."); setBusy(false); return; }
    richEditorRef.current?.chain().focus().insertContent({ type: "noteAttachment", attrs: { attachmentId: result.attachment.id, attachmentType: result.attachment.attachmentType } }).run();
    const saved = await persistRef.current();
    if (!saved) {
      removeAttachmentNode(result.attachment.id);
      await attachmentsApi.remove(result.attachment);
      setSaveState("error"); setSaveError("The attachment uploaded, but the note reference could not be saved. Nemissive removed the private upload; try again.");
    }
    setBusy(false);
  }

  const removeAttachment = useCallback((attachment: NoteAttachment, deleteNode: () => void) => {
    deleteNode();
    window.setTimeout(async () => { const saved = await persistRef.current(); if (!saved) return; const error = await attachmentsApi.remove(attachment); if (error) { setSaveState("error"); setSaveError(error); } }, 0);
  }, [attachmentsApi]);

  async function togglePin() { const current = editorRef.current; if (!current || busy) return; setBusy(true); let noteId = current.noteId; if (!noteId) noteId = (await persistRef.current())?.id ?? null; if (!noteId) { setSaveError("Add a title or content before pinning this note."); setBusy(false); return; } const result = await setPinned(noteId, !current.isPinned); if (result.error || !result.note) setSaveError(result.error ?? "The pin change couldn't be saved."); else update({ isPinned: result.note.isPinned }); setBusy(false); }
  async function confirmDelete() { const noteId = editorRef.current?.noteId; if (busy) return; if (!noteId) { setDeleteOpen(false); activate(null); return; } setBusy(true); setDeleteError(""); const cleanupError = await attachmentsApi.removeAll(); if (cleanupError) { setDeleteError(cleanupError); setBusy(false); return; } const error = await deleteNote(noteId); if (error) { setDeleteError(error); setBusy(false); return; } setDeleteOpen(false); setBusy(false); const next = notes.find((note) => note.id !== noteId); activate(next ? fromNote(next) : null, false); setMobileEditor(false); }

  const list = <aside className={`${mobileEditor ? "hidden md:flex" : "flex"} notes-list-pane`} aria-label="Notes list"><div className="shrink-0 px-4 pb-3 pt-4 sm:px-5"><button type="button" onClick={() => void openNewNote()} className="notes-primary-button"><span aria-hidden="true">+</span>New note</button><label className="relative mt-3 block"><span className="sr-only">Search notes</span><span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted"><Icon kind="search" /></span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes…" className="notes-search" /></label></div><div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5">{isLoading ? <p role="status" className="notes-state">Loading notes…</p> : loadError ? <div role="alert" className="notes-state"><p>{loadError}</p><button type="button" onClick={refresh}>Try again</button></div> : !filtered.length ? <div className="notes-empty"><span><Icon kind="note" /></span><h2>{query ? "No matching notes" : "Your notes start here"}</h2><p>{query ? "Try another title or phrase." : "Create a private place for thoughts, media, and ideas."}</p></div> : <div className="space-y-5">{pinned.length > 0 && <section><h2 className="notes-group-heading">Pinned</h2><ul className="space-y-2">{pinned.map((note) => <NoteListItem key={note.id} note={note} selected={editor?.noteId === note.id} onSelect={() => void openNote(note)} />)}</ul></section>}{recent.length > 0 && <section><h2 className="notes-group-heading">Recent</h2><ul className="space-y-2">{recent.map((note) => <NoteListItem key={note.id} note={note} selected={editor?.noteId === note.id} onSelect={() => void openNote(note)} />)}</ul></section>}</div>}</div></aside>;

  const editorPane = <section className={`${mobileEditor ? "flex" : "hidden md:flex"} note-editor-pane note-theme-${editor?.themeId ?? "default"}`} aria-label="Note editor">{editor ? <><div className="note-editor-header"><button type="button" onClick={() => void closeMobileEditor()} aria-label="Back to notes list" className="note-icon-button md:hidden"><Icon kind="back" /></button><p role="status" aria-live="polite" className="min-w-0 flex-1 text-xs font-medium text-muted">{busy ? "Working…" : saveState === "saving" ? "Saving…" : saveState === "dirty" ? "Unsaved changes" : saveState === "saved" ? "Saved" : "Private note"}</p><button type="button" onClick={(event) => void openSendDialog(event.currentTarget)} disabled={busy} className="notes-send-button"><Icon kind="send" /><span>Send</span></button><div className="relative"><button type="button" aria-label="Choose note theme" aria-expanded={themeOpen} onClick={() => setThemeOpen((value) => !value)} className="note-icon-button"><Icon kind="theme" /></button>{themeOpen && <div className="note-theme-menu" role="menu" aria-label="Note theme">{noteThemeIds.map((theme) => <button type="button" role="menuitemradio" aria-checked={editor.themeId === theme} key={theme} onClick={() => { update({ themeId: theme }); setThemeOpen(false); }}><span className={`note-theme-swatch note-theme-${theme}`} /> <span className="capitalize">{theme}</span></button>)}</div>}</div><button type="button" onClick={() => void togglePin()} disabled={busy} aria-pressed={editor.isPinned} aria-label={editor.isPinned ? "Unpin note" : "Pin note"} className={`note-icon-button ${editor.isPinned ? "is-active" : ""}`}><Icon kind="pin" /></button><button ref={(node) => { deleteTriggerRef.current = node; }} type="button" onClick={() => { if (!editor.noteId && !meaningful(editor)) { activate(null); return; } setDeleteOpen(true); }} aria-label={editor.noteId ? "Delete note" : "Discard note"} className="note-icon-button"><Icon kind="delete" /></button></div><div className="note-editor-scroll"><div className="mx-auto w-full max-w-4xl"><label className="sr-only" htmlFor="note-title">Note title</label><input data-note-title id="note-title" type="text" value={editor.title} maxLength={noteTitleMaxLength} onChange={(event) => update({ title: event.target.value })} placeholder="Untitled note" autoComplete="off" className="note-title-input" /><div className="note-title-meta"><span>{editor.noteId ? `Updated ${updated(notes.find((note) => note.id === editor.noteId)?.updatedAt ?? new Date().toISOString())}` : "Saved once you start writing"}</span><span>{editor.title.length}/{noteTitleMaxLength}</span></div><NoteRichTextEditor document={editor.document} attachments={attachmentsApi.attachments} onReady={(instance) => { richEditorRef.current = instance; }} onChange={(document, text) => update({ document, plainText: text })} onUploadImage={(file) => void upload(file, "image")} onUploadFile={(file) => void upload(file, "file")} onRecordVoice={() => { recorder.clearReview(); setVoiceOpen(true); }} onRemoveAttachment={removeAttachment} /><div className="note-editor-meta"><span>Private to you · {attachmentsApi.attachments.length} attachment{attachmentsApi.attachments.length === 1 ? "" : "s"}</span><span>{countWords(editor.plainText)} words · {editor.plainText.length.toLocaleString()} characters</span></div>{sendError && <div role="alert" className="note-save-error"><p>{sendError}</p></div>}{(saveError || attachmentsApi.error) && <div role="alert" className="note-save-error"><p>{saveError || attachmentsApi.error}</p><button type="button" onClick={() => void persistRef.current()}>Retry save</button></div>}</div></div></> : <div className="notes-editor-empty"><span><Icon kind="note" /></span><h2>Select a note</h2><p>Choose a note from the list or create a new one.</p></div>}</section>;

  if (typeof document === "undefined") return null;
  return createPortal(
    <motion.div initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-stretch justify-center bg-heading/20 md:items-center md:p-5">
      <motion.div ref={panelRef} initial={reduced ? false : { opacity: 0, y: 12, scale: .99 }} animate={{ opacity: 1, y: 0, scale: 1 }} role="dialog" aria-modal="true" aria-labelledby="notes-workspace-title" className="notes-workspace">
        <header className="notes-workspace-header">
          <div><h1 id="notes-workspace-title">Notes</h1><p>Capture rich thoughts, media, and ideas in a private space.</p></div>
          <div className="flex shrink-0 items-center gap-1">
            <button ref={(node) => { scheduledTriggerRef.current = node; }} type="button" onClick={() => setScheduledOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"><Icon kind="send" /><span className="hidden sm:inline">Scheduled</span><span className="sr-only sm:hidden">Open scheduled messages</span></button>
            <button data-notes-close type="button" onClick={() => void requestClose()} aria-label="Close Notes" className="note-icon-button"><Icon kind="close" /></button>
          </div>
        </header>
        <div className="flex min-h-0 flex-1 overflow-hidden">{list}{editorPane}</div>
        <AnimatePresence>{deleteOpen && <ConfirmationDialog dialogId="delete-note" title="Delete this note?" description="This note and its private attachments will be permanently deleted. This can't be undone." confirmLabel="Delete note" pendingLabel="Deleting note…" pendingAnnouncement="Deleting note." icon={<Icon kind="delete" />} error={deleteError} isPending={busy} returnFocusRef={deleteTriggerRef} onCancel={() => { if (!busy) setDeleteOpen(false); }} onConfirm={() => void confirmDelete()} />}</AnimatePresence>
        {voiceOpen && <div ref={voiceDialogRef} className="note-voice-dialog" role="dialog" aria-modal="true" aria-label="Record voice note"><div><h2>Voice note</h2><p>{recorder.mode === "idle" ? "Record up to five minutes." : `${formatVoiceDuration(recorder.elapsedMs)} of 5:00`}</p>{recorder.mode === "idle" && <button type="button" onClick={() => void recorder.startRecording()}>Start recording</button>}{recorder.mode === "recording" && <><button type="button" onClick={recorder.pauseRecording}>Pause</button><button type="button" onClick={recorder.stopRecording}>Stop and review</button></>}{recorder.mode === "paused" && <><button type="button" onClick={recorder.resumeRecording}>Resume</button><button type="button" onClick={recorder.stopRecording}>Stop and review</button></>}{recorder.mode === "review" && recorder.recording && <><audio controls src={recorder.recording.objectUrl} className="w-full" aria-label="Voice note preview" /><button type="button" disabled={busy} onClick={async () => { const recording = recorder.recording; if (!recording) return; await upload(recording.file, "voice", recording.durationMs); recorder.clearReview(); setVoiceOpen(false); }}>Insert voice</button><button type="button" onClick={() => void recorder.rerecord()}>Re-record</button></>}<button type="button" onClick={() => { recorder.cancelRecording(); setVoiceOpen(false); }}>Cancel</button>{recorder.error && <p role="alert">{recorder.error}</p>}</div></div>}
        <AnimatePresence>{scheduledOpen && <ScheduledMessagesDialog currentUserId={currentUserId} conversations={conversations} returnFocusRef={scheduledTriggerRef} onClose={() => setScheduledOpen(false)} onMessageSent={onMessageSent} />}</AnimatePresence>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

export default NotesWorkspace;
