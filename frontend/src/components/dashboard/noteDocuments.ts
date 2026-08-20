import type { JSONContent } from "@tiptap/core";

export const noteTitleMaxLength = 120;
export const noteTextMaxLength = 20_000;
export const noteDocumentMaxBytes = 128 * 1024;
export const noteMessageMaxLength = 2000;

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

function inlineText(node: JSONContent): string {
  if (node.type === "hardBreak") return "\n";
  return `${typeof node.text === "string" ? node.text : ""}${node.content?.map(inlineText).join("") ?? ""}`;
}

function renderNoteBlock(node: JSONContent, depth = 0, ordinal = 1, parentListType: string | null = null): string {
  const content = node.content ?? [];
  if (node.type === "noteAttachment") return "";
  if (node.type === "paragraph" || node.type === "heading") return inlineText(node).trimEnd();
  if (node.type === "horizontalRule") return "---";
  if (node.type === "blockquote") return content.map((child) => renderNoteBlock(child, depth)).filter(Boolean).join("\n").split("\n").map((line) => `> ${line}`).join("\n");
  if (node.type === "bulletList" || node.type === "orderedList" || node.type === "taskList") {
    return content.map((child, index) => renderNoteBlock(child, depth, index + 1, node.type ?? null)).filter(Boolean).join("\n");
  }
  if (node.type === "listItem" || node.type === "taskItem") {
    const [first, ...nested] = content;
    const marker = node.type === "taskItem" ? `[${node.attrs?.checked === true ? "x" : " "}]` : parentListType === "orderedList" ? `${ordinal}.` : "-";
    const firstText = first ? renderNoteBlock(first, depth + 1) : "";
    const nestedText = nested.map((child) => renderNoteBlock(child, depth + 1)).filter(Boolean).join("\n");
    const indent = "  ".repeat(depth);
    return `${indent}${marker} ${firstText}${nestedText ? `\n${nestedText}` : ""}`.trimEnd();
  }
  return content.map((child) => renderNoteBlock(child, depth)).filter(Boolean).join("\n");
}

export function createNoteMessageSnapshot(title: string, document: JSONContent, maximumLength = noteMessageMaxLength) {
  const normalizedTitle = title.trim();
  const body = (document.content ?? []).map((node) => renderNoteBlock(node)).filter(Boolean).join("\n\n").replace(/\n{3,}/gu, "\n\n").trim();
  const complete = [normalizedTitle, body].filter(Boolean).join("\n\n");
  if (complete.length <= maximumLength) return { body: complete, wasTruncated: false };
  return { body: complete.slice(0, Math.max(0, maximumLength - 1)).trimEnd() + "…", wasTruncated: true };
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
