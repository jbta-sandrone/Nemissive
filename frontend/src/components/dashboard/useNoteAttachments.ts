import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { fileAttachmentMaxSize, normalizeAllowedFile, sanitizeAttachmentFilename } from "./fileAttachments";
import { normalizeNotesError } from "./useNotes";
import { voiceMaximumDurationMs, voiceMaximumFileSize } from "./useVoiceRecorder";

export const notesBucket = "notes-private";
export const noteImageMaxSize = 10 * 1024 * 1024;
const allowedImages = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);

export type NoteAttachmentType = "image" | "voice" | "file";
export type NoteAttachment = { id: string; noteId: string; userId: string; storagePath: string; attachmentType: NoteAttachmentType; mimeType: string; fileName: string; fileSize: number; durationMs: number | null; createdAt: string; signedUrl: string | null };

function parseAttachment(value: unknown): Omit<NoteAttachment, "signedUrl"> | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.note_id !== "string" || typeof row.user_id !== "string" || typeof row.storage_path !== "string" || !["image", "voice", "file"].includes(String(row.attachment_type)) || typeof row.mime_type !== "string" || typeof row.file_name !== "string" || typeof row.file_size !== "number" || typeof row.created_at !== "string") return null;
  return { id: row.id, noteId: row.note_id, userId: row.user_id, storagePath: row.storage_path, attachmentType: row.attachment_type as NoteAttachmentType, mimeType: row.mime_type, fileName: row.file_name, fileSize: row.file_size, durationMs: typeof row.duration_ms === "number" ? row.duration_ms : null, createdAt: row.created_at };
}

function validateAttachment(file: File, type: NoteAttachmentType, durationMs: number | null) {
  const baseMime = file.type.toLowerCase().split(";", 1)[0];
  if (type === "image") {
    const extension = allowedImages.get(baseMime);
    if (!extension) return { error: "Choose a JPEG, PNG, or WebP image.", extension: "", mimeType: "" };
    if (file.size > noteImageMaxSize) return { error: "Images must be 10 MB or smaller.", extension: "", mimeType: "" };
    return { error: "", extension, mimeType: baseMime };
  }
  if (type === "voice") {
    if (!["audio/webm", "audio/ogg", "audio/mp4"].includes(baseMime)) return { error: "This voice format isn't supported.", extension: "", mimeType: "" };
    if (file.size > voiceMaximumFileSize || !durationMs || durationMs > voiceMaximumDurationMs) return { error: "Voice notes must be no longer than 5 minutes and no larger than 15 MB.", extension: "", mimeType: "" };
    return { error: "", extension: baseMime === "audio/ogg" ? "ogg" : baseMime === "audio/mp4" ? "m4a" : "webm", mimeType: baseMime };
  }
  const allowed = normalizeAllowedFile(file);
  if (!allowed) return { error: "Choose a supported PDF, Office, text, CSV, or ZIP file.", extension: "", mimeType: "" };
  if (file.size > fileAttachmentMaxSize) return { error: "Files must be 25 MB or smaller.", extension: "", mimeType: "" };
  return { error: "", extension: allowed.extension, mimeType: allowed.mimeType };
}

function useNoteAttachments(currentUserId: string | null, noteId: string | null) {
  const [attachments, setAttachments] = useState<NoteAttachment[]>([]);
  const [error, setError] = useState("");
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    if (!currentUserId || !noteId) { setAttachments([]); setError(""); return; }
    const { data, error: queryError } = await supabase.from("note_attachments").select("id, note_id, user_id, storage_path, attachment_type, mime_type, file_name, file_size, duration_ms, created_at").eq("user_id", currentUserId).eq("note_id", noteId).order("created_at", { ascending: true }).limit(100);
    if (request !== requestRef.current) return;
    if (queryError) { setError(normalizeNotesError(queryError, "Note attachments couldn't be loaded.")); return; }
    const rows = (data ?? []).map(parseAttachment).filter((item): item is NonNullable<typeof item> => Boolean(item));
    const paths = rows.map((item) => item.storagePath);
    const signed = paths.length ? await supabase.storage.from(notesBucket).createSignedUrls(paths, 60 * 60) : { data: [], error: null };
    if (request !== requestRef.current) return;
    const urls = new Map((signed.data ?? []).map((item) => [item.path, item.signedUrl]));
    setAttachments(rows.map((item) => ({ ...item, signedUrl: urls.get(item.storagePath) ?? null })));
    setError(signed.error ? "Some private attachments couldn't be opened. Try again." : "");
  }, [currentUserId, noteId]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const upload = useCallback(async (targetNoteId: string, file: File, type: NoteAttachmentType, durationMs: number | null = null) => {
    if (!currentUserId) return { attachment: null, error: "Your session has expired. Please sign in again." };
    const validation = validateAttachment(file, type, durationMs);
    if (validation.error) return { attachment: null, error: validation.error };
    const id = crypto.randomUUID();
    const storagePath = `${currentUserId}/${targetNoteId}/${id}.${validation.extension}`;
    const safeName = sanitizeAttachmentFilename(file.name || `${type}.${validation.extension}`);
    const { error: uploadError } = await supabase.storage.from(notesBucket).upload(storagePath, file, { contentType: validation.mimeType, upsert: false });
    if (uploadError) return { attachment: null, error: normalizeNotesError(uploadError, "This attachment couldn't be uploaded.") };
    const { data, error: metadataError } = await supabase.rpc("create_note_attachment", { target_attachment_id: id, target_note_id: targetNoteId, candidate_storage_path: storagePath, candidate_attachment_type: type, candidate_mime_type: validation.mimeType, candidate_file_name: safeName, candidate_file_size: file.size, candidate_duration_ms: durationMs });
    if (metadataError) { await supabase.storage.from(notesBucket).remove([storagePath]); return { attachment: null, error: normalizeNotesError(metadataError, "This attachment couldn't be secured for the note.") }; }
    const parsed = parseAttachment(Array.isArray(data) ? data[0] : data);
    if (!parsed) { await supabase.storage.from(notesBucket).remove([storagePath]); return { attachment: null, error: "Nemissive couldn't confirm this attachment." }; }
    const signed = await supabase.storage.from(notesBucket).createSignedUrl(storagePath, 60 * 60);
    const attachment: NoteAttachment = { ...parsed, signedUrl: signed.data?.signedUrl ?? null };
    setAttachments((current) => [...current.filter((item) => item.id !== attachment.id), attachment]);
    return { attachment, error: null };
  }, [currentUserId]);

  const remove = useCallback(async (attachment: NoteAttachment) => {
    const { error: storageError } = await supabase.storage.from(notesBucket).remove([attachment.storagePath]);
    if (storageError) return normalizeNotesError(storageError, "The private attachment couldn't be removed.");
    const { error: metadataError } = await supabase.rpc("delete_note_attachment", { target_attachment_id: attachment.id });
    if (metadataError) return normalizeNotesError(metadataError, "The attachment was removed from Storage, but its metadata needs cleanup. Refresh and try again.");
    setAttachments((current) => current.filter((item) => item.id !== attachment.id)); return null;
  }, []);

  const removeAll = useCallback(async () => {
    const current = [...attachments];
    if (current.length) {
      const { error: storageError } = await supabase.storage.from(notesBucket).remove(current.map((item) => item.storagePath));
      if (storageError) return normalizeNotesError(storageError, "Note media couldn't be removed, so the note was kept safely.");
    }
    return null;
  }, [attachments]);

  return { attachments, error, refresh: load, upload, remove, removeAll };
}

export default useNoteAttachments;
