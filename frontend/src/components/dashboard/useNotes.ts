import type { JSONContent } from "@tiptap/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { emptyNoteDocument, isNoteThemeId, legacyTextToDocument, type NoteThemeId } from "./noteDocuments";

export type NoteRecord = { id: string; userId: string; title: string; content: string; document: JSONContent; searchText: string; themeId: NoteThemeId; isPinned: boolean; createdAt: string; updatedAt: string };
type NoteMutationResult = { note: NoteRecord | null; error: string | null };
const notesLoadLimit = 500;

function parseNote(value: unknown): NoteRecord | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.user_id !== "string" || typeof row.title !== "string" || typeof row.content !== "string" || typeof row.is_pinned !== "boolean" || typeof row.created_at !== "string" || typeof row.updated_at !== "string") return null;
  const document = row.document && typeof row.document === "object" ? row.document as JSONContent : legacyTextToDocument(row.content);
  return { id: row.id, userId: row.user_id, title: row.title, content: row.content, document: document.type === "doc" ? document : emptyNoteDocument, searchText: typeof row.search_text === "string" ? row.search_text : row.content, themeId: isNoteThemeId(row.theme_id) ? row.theme_id : "default", isPinned: row.is_pinned, createdAt: row.created_at, updatedAt: row.updated_at };
}

export function normalizeNotesError(error: { code?: string; message?: string } | null, fallback: string) {
  if (!error) return fallback;
  if (error.code === "42501" || error.code === "PGRST301") return "Your session has expired. Please sign in again.";
  if (error.code === "22001" || error.code === "22023") return "This note exceeds a Notes limit or contains unsupported content.";
  if (error.code === "P0002") return "This note is no longer available.";
  if (typeof navigator !== "undefined" && !navigator.onLine) return "You're offline. Your changes remain in this editor and will be retried after your next edit.";
  return fallback;
}

function sortNotes(notes: NoteRecord[]) { return [...notes].sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || b.id.localeCompare(a.id)); }

function useNotes(currentUserId: string | null) {
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  const mergeNote = useCallback((note: NoteRecord) => setNotes((current) => sortNotes([...current.filter((item) => item.id !== note.id), note])), []);

  const loadNotes = useCallback(async (showLoading = false) => {
    if (!currentUserId) { setNotes([]); setIsLoading(false); setLoadError(""); return; }
    if (showLoading) setIsLoading(true);
    const { data, error } = await supabase.from("notes").select("id, user_id, title, content, document, search_text, theme_id, is_pinned, created_at, updated_at").eq("user_id", currentUserId).order("is_pinned", { ascending: false }).order("updated_at", { ascending: false }).order("id", { ascending: false }).limit(notesLoadLimit);
    if (!mountedRef.current) return;
    setIsLoading(false);
    if (error) { setLoadError(normalizeNotesError(error, "Notes couldn't be loaded right now.")); return; }
    setNotes(sortNotes((data ?? []).map(parseNote).filter((note): note is NoteRecord => Boolean(note)))); setLoadError("");
  }, [currentUserId]);

  useEffect(() => { const timer = window.setTimeout(() => void loadNotes(true), 0); return () => window.clearTimeout(timer); }, [loadNotes]);
  useEffect(() => {
    if (!currentUserId) return;
    let subscribed = false;
    const channel = supabase.channel(`nemissive-notes:${currentUserId}`).on("postgres_changes", { event: "*", schema: "public", table: "notes", filter: `user_id=eq.${currentUserId}` }, (payload) => {
      if (payload.eventType === "DELETE") { const id = payload.old && typeof payload.old === "object" && typeof (payload.old as Record<string, unknown>).id === "string" ? (payload.old as Record<string, unknown>).id as string : null; if (id) setNotes((current) => current.filter((note) => note.id !== id)); return; }
      const note = parseNote(payload.new); if (note?.userId === currentUserId) mergeNote(note);
    }).subscribe((status) => { if (status === "SUBSCRIBED") { if (subscribed) void loadNotes(false); subscribed = true; } });
    const refresh = () => { if (document.visibilityState === "visible") void loadNotes(false); };
    window.addEventListener("online", refresh); document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("online", refresh); document.removeEventListener("visibilitychange", refresh); void supabase.removeChannel(channel); };
  }, [currentUserId, loadNotes, mergeNote]);

  const saveNote = useCallback(async (targetNoteId: string | null, title: string, document: JSONContent, themeId: NoteThemeId): Promise<NoteMutationResult> => {
    const { data, error } = await supabase.rpc("save_note", { target_note_id: targetNoteId, candidate_title: title, candidate_document: document, candidate_theme_id: themeId });
    if (error) return { note: null, error: normalizeNotesError(error, "Your note couldn't be saved. Your changes remain in the editor.") };
    const note = parseNote(Array.isArray(data) ? data[0] : data); if (!note) return { note: null, error: "Nemissive couldn't confirm that your note was saved. Your changes remain in the editor." };
    mergeNote(note); return { note, error: null };
  }, [mergeNote]);

  const createDraft = useCallback(async (): Promise<NoteMutationResult> => {
    const { data, error } = await supabase.rpc("create_note_draft");
    if (error) return { note: null, error: normalizeNotesError(error, "A private note couldn't be prepared for this attachment.") };
    const note = parseNote(Array.isArray(data) ? data[0] : data); if (!note) return { note: null, error: "Nemissive couldn't confirm the new note." };
    mergeNote(note); return { note, error: null };
  }, [mergeNote]);

  const setPinned = useCallback(async (noteId: string, pinned: boolean): Promise<NoteMutationResult> => {
    const { data, error } = await supabase.rpc("set_note_pinned", { target_note_id: noteId, pinned });
    if (error) return { note: null, error: normalizeNotesError(error, `This note couldn't be ${pinned ? "pinned" : "unpinned"}.`) };
    const note = parseNote(Array.isArray(data) ? data[0] : data); if (!note) return { note: null, error: "Nemissive couldn't confirm the pin change." };
    mergeNote(note); return { note, error: null };
  }, [mergeNote]);

  const deleteNote = useCallback(async (noteId: string) => { const { error } = await supabase.rpc("delete_note", { target_note_id: noteId }); if (error) return normalizeNotesError(error, "This note couldn't be deleted. Remove its attachments and try again."); setNotes((current) => current.filter((note) => note.id !== noteId)); return null; }, []);
  return { notes, isLoading, loadError, refresh: () => loadNotes(true), saveNote, createDraft, setPinned, deleteNote };
}

export default useNotes;
