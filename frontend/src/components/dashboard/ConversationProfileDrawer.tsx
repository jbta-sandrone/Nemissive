import { lazy, Suspense, useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { supabase } from "../../lib/supabase";
import type { AccountStatus } from "../../types/account";
import type { ConversationProfileDetails, ProfileSearchResult } from "../../types/conversations";
import AccountStatusBadge from "./AccountStatusBadge";
import { getConversationTheme, type ConversationThemeId } from "./conversationThemes";
import InterestIcon from "./InterestIcon";
import { getInterestOption, normalizeInterestKeys } from "./profileInterests";
import { getProfileDisplayName, isDeletedProfile } from "./profileUtils";
import UserIdentityAvatar from "./UserIdentityAvatar";

const PublicGallerySection = lazy(() => import("./PublicGallery"));

type Props = {
  conversationId: string;
  profile: ProfileSearchResult;
  accountStatus: AccountStatus | null;
  conversationNickname: string | null;
  currentTheme: ConversationThemeId;
  presenceText: string | null;
  isOnline: boolean;
  isBlocked: boolean;
  messagingAvailable?: boolean;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onEditNicknames: () => void;
  onChangeTheme: () => void;
  onOpenContent: () => void;
  onBlockChange: () => void;
};

function parseProfile(value: unknown): ConversationProfileDetails | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.joined_month !== "string") return null;
  return {
    id: row.id,
    username: typeof row.username === "string" ? row.username : null,
    display_name: typeof row.display_name === "string" ? row.display_name : null,
    avatar_url: typeof row.avatar_url === "string" ? row.avatar_url : null,
    last_seen_at: typeof row.last_seen_at === "string" ? row.last_seen_at : null,
    bio: typeof row.bio === "string" ? row.bio : null,
    locationText: typeof row.location_text === "string" ? row.location_text : null,
    interests: normalizeInterestKeys(row.interests),
    birthdayDisplay: typeof row.birthday_display === "string" ? row.birthday_display : null,
    age: typeof row.age === "number" ? row.age : null,
    joinedMonth: row.joined_month,
  };
}

function formatBirthday(value: string) {
  const partial = value.startsWith("--");
  const parts = value.replace(/^--/u, "").split("-").map(Number);
  const year = partial ? 2000 : parts[0];
  const month = partial ? parts[0] : parts[1];
  const day = partial ? parts[1] : parts[2];
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day, 12);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, partial ? { month: "long", day: "numeric" } : { year: "numeric", month: "long", day: "numeric" }).format(date);
}

function formatJoinedMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return "Nemissive member";
  return `Joined ${new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long" }).format(new Date(year, month - 1, 1, 12))}`;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="flex min-w-0 items-start justify-between gap-5 py-2"><dt className="shrink-0 text-sm text-muted">{label}</dt><dd className="min-w-0 break-words text-right text-sm font-semibold text-heading">{value}</dd></div>;
}

function ConversationProfileDrawer({ conversationId, profile, accountStatus, conversationNickname, currentTheme, presenceText, isOnline, isBlocked, messagingAvailable = true, returnFocusRef, onClose, onEditNicknames, onChangeTheme, onOpenContent, onBlockChange }: Props) {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const nestedGalleryOpenRef = useRef(false);
  const [details, setDetails] = useState<ConversationProfileDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { if (isDeletedProfile(profile)) onCloseRef.current(); }, [profile]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const returnFocus = returnFocusRef.current;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus());
    function keydown(event: KeyboardEvent) {
      if (nestedGalleryOpenRef.current) return;
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab" || !panelRef.current) return;
      const controls = [...panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]),a[href]")];
      const first = controls[0]; const last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keydown);
    return () => { cancelAnimationFrame(frame); document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", keydown); requestAnimationFrame(() => returnFocus?.focus()); };
  }, [returnFocusRef]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true); setError("");
      const { data, error: loadError } = await supabase.rpc("get_conversation_profile", { target_conversation_id: conversationId, target_profile_id: profile.id });
      if (cancelled) return;
      setIsLoading(false);
      const parsed = parseProfile(data);
      if (loadError || !parsed) {
        setError("We couldn’t load this profile. Please try again.");
        if (loadError && import.meta.env.DEV) console.warn("Loading conversation profile failed", { code: loadError.code, conversationId });
        return;
      }
      setDetails(parsed);
    }
    void load();
    return () => { cancelled = true; };
  }, [conversationId, profile.id, retryKey]);

  const handleGalleryOverlayOpenChange = useCallback((open: boolean) => { nestedGalleryOpenRef.current = open; }, []);

  const visibleProfile = details ? { ...details, username: profile.username, display_name: profile.display_name, avatar_url: profile.avatar_url, avatar_border: profile.avatar_border, account_status: profile.account_status, deleted_at: profile.deleted_at } : profile;
  const displayName = getProfileDisplayName(visibleProfile);
  const isUnavailable = isDeletedProfile(visibleProfile);
  const visibleAccountStatus = isUnavailable ? null : accountStatus;
  const birthday = details?.birthdayDisplay ? formatBirthday(details.birthdayDisplay) : null;
  const hasOptionalDetails = details ? Boolean(details.bio || details.locationText || birthday || details.age !== null || details.interests.length) : false;

  return createPortal(<motion.div initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[96] flex justify-end bg-heading/25" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><motion.aside ref={panelRef} initial={reduceMotion ? false : { x: "100%" }} animate={{ x: 0 }} exit={reduceMotion ? { opacity: 0 } : { x: "100%" }} role="dialog" aria-modal="true" aria-labelledby="conversation-profile-title" className="flex h-[100dvh] w-full max-w-md flex-col overflow-hidden bg-surface shadow-soft sm:border-l sm:border-border"><header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5 sm:py-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Conversation</p><h2 id="conversation-profile-title" className="mt-1 text-lg font-semibold text-heading">View profile</h2></div><button data-autofocus type="button" onClick={onClose} aria-label="Close profile" className="flex h-11 w-11 items-center justify-center rounded-2xl text-muted hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" strokeLinecap="round" /></svg></button></header><div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-6">
    <section className="text-center" aria-labelledby="profile-identity-heading"><div className="flex justify-center overflow-visible px-4 py-1"><UserIdentityAvatar profile={visibleProfile} accountStatus={visibleAccountStatus} size="xl" /></div>{visibleAccountStatus && <div className="mt-3 flex flex-wrap justify-center gap-2"><AccountStatusBadge status={visibleAccountStatus} /></div>}<h3 id="profile-identity-heading" className="mt-2 break-words text-2xl font-bold text-heading">{displayName}</h3><p className="mt-1 break-all text-sm text-body">{visibleProfile.username ? `@${visibleProfile.username}` : "Nemissive member"}</p>{presenceText && <p className={`mt-2 text-sm font-semibold ${isOnline ? "text-online" : "text-muted"}`}>{presenceText}</p>}{details?.bio && <p className="mx-auto mt-5 max-w-sm whitespace-pre-wrap break-words text-sm leading-6 text-body">{details.bio}</p>}</section>
    {isLoading && <div role="status" aria-live="polite" className="mt-6 rounded-2xl bg-background px-4 py-5 text-center text-sm text-body">Loading profile details…</div>}
    {error && <div role="alert" className="mt-6 rounded-2xl border border-border bg-background p-4 text-sm text-body"><p>{error}</p><button type="button" onClick={() => setRetryKey((key) => key + 1)} className="mt-3 min-h-10 rounded-xl px-3 font-semibold text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">Retry</button></div>}
    {details && <><section aria-labelledby="profile-about-heading" className="mt-7 border-t border-border pt-5"><h3 id="profile-about-heading" className="text-xs font-bold uppercase tracking-[0.16em] text-muted">About</h3><dl className="mt-2 divide-y divide-border">{details.locationText && <DetailRow label="Location" value={details.locationText} />}{birthday && <DetailRow label="Birthday" value={birthday} />}{details.age !== null && <DetailRow label="Age" value={`${details.age}`} />}<DetailRow label="Member since" value={formatJoinedMonth(details.joinedMonth).replace(/^Joined /u, "")} /></dl>{!hasOptionalDetails && <p className="mt-4 rounded-2xl bg-background px-4 py-3 text-sm leading-6 text-body">No additional profile details yet.</p>}</section>{details.interests.length > 0 && <section aria-labelledby="profile-interests-heading" className="mt-7 border-t border-border pt-5"><h3 id="profile-interests-heading" className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Interests</h3><ul className="mt-3 flex flex-wrap gap-2">{details.interests.map((interestKey) => { const option = getInterestOption(interestKey); if (!option) return null; return <li key={option.key} className="inline-flex max-w-full items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-heading"><InterestIcon icon={option.icon} className="h-3.5 w-3.5 shrink-0 text-primary" /><span className="break-words">{option.label}</span></li>; })}</ul></section>}<Suspense fallback={<p role="status" className="mt-7 rounded-2xl bg-background p-4 text-center text-sm text-body">Loading Gallery…</p>}><PublicGallerySection profile={visibleProfile} onOverlayOpenChange={handleGalleryOverlayOpenChange} /></Suspense></>}
    <section aria-labelledby="profile-conversation-heading" className="mt-7 border-t border-border pt-5"><h3 id="profile-conversation-heading" className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Your conversation</h3><div className="mt-3 space-y-2"><button type="button" onClick={onEditNicknames} disabled={!messagingAvailable} className="flex min-h-14 w-full items-center justify-between gap-4 rounded-2xl bg-background px-4 py-3 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-50"><span><span className="block text-xs text-muted">Nickname</span><span className="mt-1 block break-words text-sm font-semibold text-heading">{conversationNickname || "None"}</span></span><span className="text-xs font-semibold text-primary">Edit</span></button><button type="button" onClick={onChangeTheme} disabled={!messagingAvailable} className="flex min-h-14 w-full items-center justify-between gap-4 rounded-2xl bg-background px-4 py-3 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-50"><span><span className="block text-xs text-muted">Theme</span><span className="mt-1 block text-sm font-semibold text-heading">{getConversationTheme(currentTheme).name}</span></span><span className="text-xs font-semibold text-primary">Change</span></button><button type="button" onClick={onOpenContent} className="flex min-h-14 w-full items-center justify-between gap-4 rounded-2xl bg-background px-4 py-3 text-left text-sm font-semibold text-heading hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover"><span>Media, files & links</span><span aria-hidden="true" className="text-primary">→</span></button></div></section>
    <section aria-labelledby="profile-safety-heading" className="mt-7 border-t border-border pt-5"><h3 id="profile-safety-heading" className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Privacy &amp; safety</h3><div className="mt-3 space-y-2"><button type="button" onClick={onBlockChange} className={`flex min-h-12 w-full items-center justify-between rounded-2xl px-4 text-left text-sm font-semibold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover ${isBlocked ? "text-heading hover:bg-accent" : "text-primary hover:bg-accent"}`}><span>{isBlocked ? "Unblock" : "Block"} {displayName}</span></button><button type="button" disabled aria-disabled="true" aria-label={`Report ${displayName}, coming soon`} className="flex min-h-12 w-full cursor-not-allowed items-center justify-between rounded-2xl px-4 text-left text-sm text-muted opacity-70"><span>Report {displayName}</span><span className="rounded-lg bg-background px-2 py-1 text-[0.62rem] font-bold uppercase tracking-wide">Coming soon</span></button></div></section>
  </div></motion.aside></motion.div>, document.body);
}

export default ConversationProfileDrawer;
