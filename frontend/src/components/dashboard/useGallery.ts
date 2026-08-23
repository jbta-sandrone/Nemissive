import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  galleryBucket,
  galleryExtension,
  galleryFilterDates,
  galleryPageSize,
  normalizeGalleryError,
  parseGalleryItem,
  prepareGalleryFile,
  signGalleryPaths,
  type GalleryFilters,
  type GalleryItem,
  type GalleryVisibility,
} from "./gallery";

function useGallery(currentUserId: string | null, filters: GalleryFilters) {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [uploadState, setUploadState] = useState("");
  const mountedRef = useRef(true);
  const refreshTimerRef = useRef<number | null>(null);
  const itemsRef = useRef<GalleryItem[]>([]);

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const load = useCallback(async (append = false) => {
    if (!currentUserId) { setItems([]); setPreviewUrls(new Map()); setIsLoading(false); return; }
    if (append) setIsLoadingMore(true); else setIsLoading(true);
    const offset = append ? itemsRef.current.length : 0;
    const dates = galleryFilterDates(filters);
    const { data, error } = await supabase.rpc("list_my_gallery", {
      target_visibility: filters.visibility === "all" ? null : filters.visibility,
      target_media_type: filters.mediaType === "all" ? null : filters.mediaType,
      target_added_from: dates.from,
      target_added_before: dates.before,
      sort_direction: filters.sort,
      page_size: galleryPageSize + 1,
      page_offset: offset,
    });
    if (!mountedRef.current) return;
    setIsLoading(false); setIsLoadingMore(false);
    if (error) { setLoadError(normalizeGalleryError(error, "Your Gallery couldn't be loaded.")); return; }
    const parsed = (Array.isArray(data) ? data : []).map(parseGalleryItem).filter((item): item is GalleryItem => Boolean(item));
    const page = parsed.slice(0, galleryPageSize);
    setHasMore(parsed.length > galleryPageSize);
    setItems((current) => append ? [...current, ...page.filter((item) => !current.some((existing) => existing.id === item.id))] : page);
    setLoadError("");
    const signed = await signGalleryPaths(page.map((item) => item.previewPath));
    if (!mountedRef.current) return;
    setPreviewUrls((current) => append ? new Map([...current, ...signed.urls]) : signed.urls);
    if (signed.error) setLoadError(signed.error);
  }, [currentUserId, filters]);

  useEffect(() => { const timer = window.setTimeout(() => void load(false), 0); return () => window.clearTimeout(timer); }, [load]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => { refreshTimerRef.current = null; void load(false); }, 120);
  }, [load]);

  useEffect(() => {
    if (!currentUserId) return;
    let subscribed = false;
    const channel = supabase.channel(`nemissive-gallery-owner:${currentUserId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gallery_items", filter: `owner_id=eq.${currentUserId}` }, scheduleRefresh)
      .subscribe((status) => { if (status === "SUBSCRIBED") { if (subscribed) scheduleRefresh(); subscribed = true; } });
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") scheduleRefresh(); };
    window.addEventListener("online", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
      window.removeEventListener("online", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, scheduleRefresh]);

  const upload = useCallback(async (file: File, visibility: GalleryVisibility, description: string) => {
    if (!currentUserId) return "Your session has expired.";
    setUploadState("Preparing…");
    let prepared: Awaited<ReturnType<typeof prepareGalleryFile>>;
    try { prepared = await prepareGalleryFile(file); }
    catch (error) { setUploadState(""); return error instanceof Error ? error.message : "This media couldn't be prepared."; }
    const itemId = crypto.randomUUID();
    const prefix = `${currentUserId}/${itemId}`;
    const originalPath = `${prefix}/original.${galleryExtension(file.type)}`;
    const previewPath = `${prefix}/preview.webp`;
    const uploaded: string[] = [];
    setUploadState("Uploading original…");
    const original = await supabase.storage.from(galleryBucket).upload(originalPath, file, { contentType: file.type, upsert: false, cacheControl: "3600" });
    if (original.error) { setUploadState(""); return normalizeGalleryError(original.error, "The media couldn't be uploaded."); }
    uploaded.push(originalPath);
    setUploadState("Creating preview…");
    const preview = await supabase.storage.from(galleryBucket).upload(previewPath, prepared.preview, { contentType: "image/webp", upsert: false, cacheControl: "3600" });
    if (preview.error) {
      await supabase.storage.from(galleryBucket).remove(uploaded);
      setUploadState(""); return normalizeGalleryError(preview.error, "The media preview couldn't be uploaded.");
    }
    uploaded.push(previewPath);
    setUploadState("Securing media…");
    const { error } = await supabase.rpc("create_gallery_item", {
      target_item_id: itemId,
      candidate_media_type: prepared.mediaType,
      candidate_mime_type: file.type,
      candidate_file_size: file.size,
      candidate_width: prepared.width,
      candidate_height: prepared.height,
      candidate_duration_ms: prepared.durationMs,
      candidate_visibility: visibility,
      candidate_description: description,
      candidate_original_path: originalPath,
      candidate_preview_path: previewPath,
    });
    if (error) {
      await supabase.storage.from(galleryBucket).remove(uploaded);
      setUploadState(""); return normalizeGalleryError(error, "The media couldn't be added to your Gallery.");
    }
    setUploadState("");
    await load(false);
    return null;
  }, [currentUserId, load]);

  const update = useCallback(async (itemId: string, visibility: GalleryVisibility, description: string) => {
    const { error } = await supabase.rpc("update_gallery_item", { target_item_id: itemId, candidate_visibility: visibility, candidate_description: description });
    if (error) return normalizeGalleryError(error, "This Gallery item couldn't be updated.");
    await load(false);
    return null;
  }, [load]);

  const remove = useCallback(async (item: GalleryItem) => {
    const { error: storageError } = await supabase.storage.from(galleryBucket).remove([item.originalPath, item.previewPath]);
    if (storageError) return normalizeGalleryError(storageError, "The private media couldn't be removed.");
    const { error } = await supabase.rpc("delete_gallery_item", { target_item_id: item.id });
    if (error) return normalizeGalleryError(error, "The Gallery item couldn't be deleted.");
    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    return null;
  }, []);

  const refresh = useCallback(() => load(false), [load]);
  const loadMore = useCallback(() => load(true), [load]);

  return { items, previewUrls, isLoading, isLoadingMore, loadError, hasMore, uploadState, refresh, loadMore, upload, update, remove };
}

export default useGallery;
