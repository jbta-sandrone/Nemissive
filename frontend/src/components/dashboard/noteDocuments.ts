import type { JSONContent } from "@tiptap/core";

export const noteTitleMaxLength = 120;
export const noteTextMaxLength = 20_000;
export const noteDocumentMaxBytes = 128 * 1024;

export const noteThemeIds = ["default", "midnight", "ocean", "lavender", "emerald", "rose", "sunset"] as const;
export type NoteThemeId = (typeof noteThemeIds)[number];

export const emptyNoteDocument: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

export function legacyTextToDocument(value: string): JSONContent {
  if (!value) return emptyNoteDocument;
  return {
    type: "doc",
    content: value.split(/\r?\n/u).map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : undefined,
    })),
  };
}

export function isNoteThemeId(value: unknown): value is NoteThemeId {
  return typeof value === "string" && (noteThemeIds as readonly string[]).includes(value);
}

export function getDocumentText(document: JSONContent): string {
  const pieces: string[] = [];
  function visit(node: JSONContent) {
    if (typeof node.text === "string") pieces.push(node.text);
    if (node.type === "paragraph" || node.type === "heading" || node.type === "listItem" || node.type === "taskItem" || node.type === "blockquote") pieces.push("\n");
    node.content?.forEach(visit);
  }
  visit(document);
  return pieces.join("").replace(/\n{3,}/gu, "\n\n").trim();
}

export function getDocumentAttachmentIds(document: JSONContent): string[] {
  const ids = new Set<string>();
  function visit(node: JSONContent) {
    if (node.type === "noteAttachment" && typeof node.attrs?.attachmentId === "string") ids.add(node.attrs.attachmentId);
    node.content?.forEach(visit);
  }
  visit(document);
  return [...ids];
}

export function documentsEqual(first: JSONContent, second: JSONContent) {
  function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey)).map(([key, item]) => [key, canonicalize(item)]));
  }
  return JSON.stringify(canonicalize(first)) === JSON.stringify(canonicalize(second));
}

export function countWords(value: string) {
  const normalized = value.trim();
  return normalized ? normalized.split(/\s+/u).length : 0;
}
