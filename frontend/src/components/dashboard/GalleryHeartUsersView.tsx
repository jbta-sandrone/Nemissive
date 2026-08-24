import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { ProfileSearchResult } from "../../types/conversations";
import { normalizeGalleryError } from "./gallery";
import ProfileAvatar from "./ProfileAvatar";
import { getProfileDisplayName } from "./profileUtils";

type HeartUser = {
  key: string;
  profile: ProfileSearchResult;
  isCurrentUser: boolean;
  available: boolean;
};

type Props = {
  itemId: string;
  refreshKey: number;
  onBack: () => void;
};

const heartUsersPageSize = 30;

function nullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function parseHeartUser(value: unknown, index: number): HeartUser | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const available = row.actor_available === true && typeof row.user_id === "string";
  if (row.actor_available !== true && row.actor_available !== false) return null;
  const id = available ? row.user_id as string : `unavailable-gallery-heart:${index}`;
  return {
    key: id,
    available,
    isCurrentUser: available && row.is_current_user === true,
    profile: available ? {
      id,
      username: nullableString(row.username),
      display_name: nullableString(row.display_name),
      avatar_url: nullableString(row.avatar_url),
      account_status: "active",
    } : {
      id,
      username: null,
      display_name: "Unavailable account",
      avatar_url: null,
      account_status: "deleted",
    },
  };
}

function BackIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="m15 6-6 6 6 6M9 12h10" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function GalleryHeartUsersView({ itemId, refreshKey, onBack }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const requestRef = useRef(0);
  const usersRef = useRef<HeartUser[]>([]);
  const [users, setUsers] = useState<HeartUser[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { usersRef.current = users; }, [users]);
  useEffect(() => { const frame = window.requestAnimationFrame(() => headingRef.current?.focus()); return () => window.cancelAnimationFrame(frame); }, []);

  const load = useCallback(async (append = false) => {
    const requestId = ++requestRef.current;
    const offset = append ? usersRef.current.length : 0;
    if (append) setIsLoadingMore(true); else setIsLoading(true);
    setError("");
    const { data, error: loadError } = await supabase.rpc("list_gallery_heart_users", {
      target_gallery_item_id: itemId,
      page_size: heartUsersPageSize + 1,
      page_offset: offset,
    });
    if (requestId !== requestRef.current) return;
    setIsLoading(false); setIsLoadingMore(false);
    if (loadError) { setError(normalizeGalleryError(loadError, "Reactions couldn't be loaded.")); return; }
    const parsed = (Array.isArray(data) ? data : [])
      .map((row, index) => parseHeartUser(row, offset + index))
      .filter((row): row is HeartUser => Boolean(row));
    const page = parsed.slice(0, heartUsersPageSize);
    setHasMore(parsed.length > heartUsersPageSize);
    setUsers((current) => append
      ? [...current, ...page.filter((row) => !current.some((existing) => existing.key === row.key))]
      : page);
  }, [itemId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(false), 0);
    return () => { window.clearTimeout(timer); requestRef.current += 1; };
  }, [load, refreshKey]);

  useEffect(() => {
    const reconcile = () => { if (document.visibilityState === "visible") void load(false); };
    const privacyRecheck = window.setInterval(reconcile, 30_000);
    window.addEventListener("focus", reconcile);
    document.addEventListener("visibilitychange", reconcile);
    return () => {
      window.clearInterval(privacyRecheck);
      window.removeEventListener("focus", reconcile);
      document.removeEventListener("visibilitychange", reconcile);
    };
  }, [load]);

  return <section aria-labelledby="gallery-heart-users-title" className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface">
    <header className="flex shrink-0 items-center gap-3 border-b border-border px-3 py-3 sm:px-5">
      <button type="button" onClick={onBack} aria-label="Back to Gallery activity" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-heading hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover"><BackIcon /></button>
      <div className="min-w-0"><h2 ref={headingRef} tabIndex={-1} id="gallery-heart-users-title" className="font-bold text-heading outline-none">Liked by</h2><p className="truncate text-xs text-body">People who currently hearted this media</p></div>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:px-5">
      {isLoading ? <p role="status" className="px-4 py-10 text-center text-sm text-body">Loading reactions…</p>
        : error && users.length === 0 ? <div role="alert" className="px-4 py-10 text-center text-sm text-body"><p>{error}</p><button type="button" onClick={() => void load(false)} className="mt-3 min-h-10 rounded-xl px-3 font-semibold text-primary hover:bg-accent">Try again</button></div>
          : users.length === 0 ? <div className="px-4 py-10 text-center"><p className="font-semibold text-heading">No hearts yet</p><p className="mt-1 text-sm text-body">Current hearts will appear here.</p></div>
            : <><ul className="mx-auto max-w-xl space-y-1">{users.map((user) => {
              const name = getProfileDisplayName(user.profile);
              return <li key={user.key} className="flex min-h-16 items-center gap-3 rounded-2xl px-3 py-2"><ProfileAvatar profile={user.profile} size="sm" accessibleLabel={`${name}'s profile photo`} /><div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-2"><p className="truncate text-sm font-semibold text-heading">{name}</p>{user.isCurrentUser && <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">You</span>}</div>{user.available && user.profile.username ? <p className="truncate text-xs text-body">@{user.profile.username}</p> : <p className="truncate text-xs text-muted">Profile unavailable</p>}</div></li>;
            })}</ul>{hasMore && <button type="button" disabled={isLoadingMore} onClick={() => void load(true)} className="mx-auto mt-2 block min-h-11 w-full max-w-xl rounded-2xl border border-border text-sm font-semibold text-heading hover:bg-accent disabled:opacity-60">{isLoadingMore ? "Loading..." : "Load more"}</button>}{error && <p role="alert" className="mx-auto mt-2 max-w-xl rounded-xl bg-accent px-3 py-2 text-xs text-body">{error}</p>}</>}
    </div>
  </section>;
}

export default GalleryHeartUsersView;
