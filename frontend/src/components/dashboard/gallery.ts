import { supabase } from "../../lib/supabase";
import type { ProfileSearchResult } from "../../types/conversations";

export type GalleryMediaType = "image" | "video";
export type GalleryVisibility = "private" | "public";

export type GalleryItem = {
  id: string;
  ownerId: string;
  mediaType: GalleryMediaType;
  mimeType: string;
  fileSize: number;
  width: number;
  height: number;
  durationMs: number | null;
  visibility: GalleryVisibility;
  description: string;
  originalPath: string;
  previewPath: string;
  addedAt: string;
  updatedAt: string;
  heartCount: number;
  commentCount: number;
  viewerHasHearted: boolean;
};

export type GalleryComment = {
  id: string;
  itemId: string;
  authorId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: ProfileSearchResult;
};

export type GalleryFilters = {
  visibility: "all" | GalleryVisibility;
  mediaType: "all" | GalleryMediaType;
  datePreset: "any" | "today" | "week" | "month" | "custom";
  dateFrom: string;
  dateTo: string;
  sort: "newest" | "oldest";
};

export const galleryBucket = "gallery-media";
export const galleryPageSize = 30;
export const galleryCommentPageSize = 40;
export const galleryDescriptionMaxLength = 500;

const imageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const videoMimeTypes = new Set(["video/mp4", "video/webm"]);
const imageMaxBytes = 10 * 1024 * 1024;
const videoMaxBytes = 50 * 1024 * 1024;
const videoMaxDurationMs = 5 * 60 * 1000;

function nullableString(value: unknown) { return typeof value === "string" ? value : null; }

export function parseGalleryItem(value: unknown): GalleryItem | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.owner_id !== "string"
    || (row.media_type !== "image" && row.media_type !== "video")
    || typeof row.mime_type !== "string" || typeof row.file_size !== "number"
    || typeof row.width !== "number" || typeof row.height !== "number"
    || (row.visibility !== "private" && row.visibility !== "public")
    || typeof row.description !== "string" || typeof row.original_path !== "string"
    || typeof row.preview_path !== "string" || typeof row.added_at !== "string"
    || typeof row.updated_at !== "string") return null;
  return {
    id: row.id,
    ownerId: row.owner_id,
    mediaType: row.media_type,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    width: row.width,
    height: row.height,
    durationMs: typeof row.duration_ms === "number" ? row.duration_ms : null,
    visibility: row.visibility,
    description: row.description,
    originalPath: row.original_path,
    previewPath: row.preview_path,
    addedAt: row.added_at,
    updatedAt: row.updated_at,
    heartCount: typeof row.heart_count === "number" ? row.heart_count : 0,
    commentCount: typeof row.comment_count === "number" ? row.comment_count : 0,
    viewerHasHearted: row.viewer_has_hearted === true,
  };
}

export function parseGalleryComment(value: unknown): GalleryComment | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.item_id !== "string" || typeof row.author_id !== "string"
    || typeof row.body !== "string" || typeof row.created_at !== "string" || typeof row.updated_at !== "string") return null;
  return {
    id: row.id,
    itemId: row.item_id,
    authorId: row.author_id,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    author: {
      id: row.author_id,
      username: nullableString(row.author_username),
      display_name: nullableString(row.author_display_name),
      avatar_url: nullableString(row.author_avatar_url),
    },
  };
}

export function normalizeGalleryError(error: unknown, fallback: string) {
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : undefined;
  if (typeof navigator !== "undefined" && !navigator.onLine) return "You're offline. Reconnect and try again.";
  if (code === "42501" || code === "PGRST301") return "This Gallery is no longer available to you.";
  if (code === "P0002") return "This Gallery item is no longer available.";
  if (code === "22023" || code === "23514") return "Check the media details and try again.";
  if (code === "55000") return "Nemissive couldn't verify the private media upload.";
  return fallback;
}

export function formatGalleryDate(value: string, includeTime = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently added";
  return new Intl.DateTimeFormat(undefined, includeTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { month: "short", day: "numeric", year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric" }).format(date);
}

export function formatGalleryFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function galleryDateGroup(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const itemDay = new Date(date); itemDay.setHours(0, 0, 0, 0);
  const differenceDays = Math.round((today.getTime() - itemDay.getTime()) / 86_400_000);
  if (differenceDays === 0) return "Today";
  if (differenceDays === 1) return "Yesterday";
  if (differenceDays > 1 && differenceDays < 7) return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" }).format(date);
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date);
}

export function validateGalleryFile(file: File) {
  if (imageMimeTypes.has(file.type)) {
    if (file.size <= 0 || file.size > imageMaxBytes) return "Images must be 10 MB or smaller.";
    return null;
  }
  if (videoMimeTypes.has(file.type)) {
    if (file.size <= 0 || file.size > videoMaxBytes) return "Videos must be 50 MB or smaller.";
    return null;
  }
  return "Choose a JPEG, PNG, WebP, MP4, or WebM file.";
}

function canvasPreview(source: CanvasImageSource, width: number, height: number) {
  const scale = Math.min(1, 720 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) return Promise.reject(new Error("Canvas is unavailable."));
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Preview generation failed.")), "image/webp", 0.82));
}

function loadImage(file: File) {
  return new Promise<{ image: HTMLImageElement; url: string }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image decoding failed.")); };
    image.src = url;
  });
}

function loadVideo(file: File) {
  return new Promise<{ video: HTMLVideoElement; url: string }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    const fail = () => { URL.revokeObjectURL(url); reject(new Error("Video decoding failed.")); };
    video.addEventListener("error", fail, { once: true });
    video.addEventListener("loadedmetadata", () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) { fail(); return; }
      const target = Math.min(Math.max(video.duration * 0.08, 0.01), 1);
      const ready = () => resolve({ video, url });
      video.addEventListener("seeked", ready, { once: true });
      video.currentTime = target;
    }, { once: true });
    video.src = url;
  });
}

export async function prepareGalleryFile(file: File) {
  const validationError = validateGalleryFile(file);
  if (validationError) throw new Error(validationError);
  if (imageMimeTypes.has(file.type)) {
    const loaded = await loadImage(file);
    try {
      return { mediaType: "image" as const, width: loaded.image.naturalWidth, height: loaded.image.naturalHeight, durationMs: null, preview: await canvasPreview(loaded.image, loaded.image.naturalWidth, loaded.image.naturalHeight) };
    } finally { URL.revokeObjectURL(loaded.url); }
  }
  const loaded = await loadVideo(file);
  try {
    const durationMs = Math.round(loaded.video.duration * 1000);
    if (durationMs > videoMaxDurationMs) throw new Error("Videos must be 5 minutes or shorter.");
    return { mediaType: "video" as const, width: loaded.video.videoWidth, height: loaded.video.videoHeight, durationMs, preview: await canvasPreview(loaded.video, loaded.video.videoWidth, loaded.video.videoHeight) };
  } finally { URL.revokeObjectURL(loaded.url); }
}

export function galleryExtension(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "video/mp4") return "mp4";
  return "webm";
}

export async function signGalleryPaths(paths: string[], expiresIn = 180) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return { urls: new Map<string, string>(), error: "" };
  const { data, error } = await supabase.storage.from(galleryBucket).createSignedUrls(unique, expiresIn);
  if (error) return { urls: new Map<string, string>(), error: normalizeGalleryError(error, "Gallery media couldn't be loaded.") };
  const urls = new Map<string, string>();
  for (let index = 0; index < unique.length; index += 1) {
    const url = data?.[index]?.signedUrl;
    if (url) urls.set(unique[index], url);
  }
  return { urls, error: "" };
}

export function galleryFilterDates(filters: GalleryFilters) {
  const now = new Date();
  if (filters.datePreset === "today") {
    const from = new Date(now); from.setHours(0, 0, 0, 0);
    const before = new Date(from); before.setDate(before.getDate() + 1);
    return { from: from.toISOString(), before: before.toISOString() };
  }
  if (filters.datePreset === "week") {
    const from = new Date(now); from.setHours(0, 0, 0, 0);
    const mondayOffset = (from.getDay() + 6) % 7; from.setDate(from.getDate() - mondayOffset);
    const before = new Date(from); before.setDate(before.getDate() + 7);
    return { from: from.toISOString(), before: before.toISOString() };
  }
  if (filters.datePreset === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const before = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { from: from.toISOString(), before: before.toISOString() };
  }
  if (filters.datePreset !== "custom") return { from: null, before: null };
  const from = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`).toISOString() : null;
  const beforeDate = filters.dateTo ? new Date(`${filters.dateTo}T00:00:00`) : null;
  if (beforeDate) beforeDate.setDate(beforeDate.getDate() + 1);
  return { from, before: beforeDate?.toISOString() ?? null };
}
