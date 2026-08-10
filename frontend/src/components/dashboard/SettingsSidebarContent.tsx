import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { appearanceChangeEvent, getAppearancePreference, setAppearancePreference, type AppearancePreference } from "../../lib/appearance";
import { supabase } from "../../lib/supabase";
import type { ProfileSearchResult } from "../../types/conversations";
import ProfileAvatar from "./ProfileAvatar";
import UserBlockDialog from "./UserBlockDialog";
import { getProfileDisplayName } from "./profileUtils";

type SettingsScreen = "landing" | "appearance" | "privacy" | "blocked-accounts" | "account" | "data-storage";
type SettingsIconKind = "appearance" | "privacy" | "blocked" | "account" | "storage" | "premium" | "back" | "chevron" | "signout";

type BlockedAccount = {
  profile: ProfileSearchResult;
  blockedAt: string;
};

type Props = {
  profile: ProfileSearchResult;
  isSigningOut: boolean;
  signOutError: string;
  onBackToMenu: () => void;
  onSignOut: () => void;
};

const screenCopy: Record<Exclude<SettingsScreen, "landing">, { title: string; description: string; parent: "Settings" | "Privacy & Safety" }> = {
  appearance: { title: "Appearance", description: "Customize how Nemissive looks on this device.", parent: "Settings" },
  privacy: { title: "Privacy & Safety", description: "Manage blocked accounts and privacy controls.", parent: "Settings" },
  "blocked-accounts": { title: "Blocked accounts", description: "Review and manage people you have blocked.", parent: "Privacy & Safety" },
  account: { title: "Account", description: "Your sign-in identity and account controls.", parent: "Settings" },
  "data-storage": { title: "Data & Storage", description: "Understand attachment limits and data behavior.", parent: "Settings" },
};

function SettingsIcon({ kind, className = "h-5 w-5" }: { kind: SettingsIconKind; className?: string }) {
  if (kind === "appearance") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9c0-1.1-.9-2-2-2h-1.4a2 2 0 0 1-2-2V6.5A3.5 3.5 0 0 0 12 3Z" /><circle cx="7.5" cy="11.5" r="1" fill="currentColor" stroke="none" /><circle cx="10" cy="7.5" r="1" fill="currentColor" stroke="none" /><circle cx="8.8" cy="16" r="1" fill="currentColor" stroke="none" /></svg>;
  if (kind === "privacy" || kind === "blocked") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true"><path d="M12 3 5.5 5.5v5.2c0 4.3 2.6 8.2 6.5 10.3 3.9-2.1 6.5-6 6.5-10.3V5.5L12 3Z" strokeLinejoin="round" />{kind === "blocked" ? <path d="m8.5 8.5 7 7" strokeLinecap="round" /> : <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />}</svg>;
  if (kind === "account") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" strokeLinecap="round" /></svg>;
  if (kind === "storage") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true"><ellipse cx="12" cy="6" rx="7.5" ry="3" /><path d="M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6" /></svg>;
  if (kind === "premium") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true"><path d="m12 3 2.2 5.2L20 9l-4.2 3.8 1.2 5.7-5-2.9-5 2.9 1.2-5.7L4 9l5.8-.8L12 3Z" strokeLinejoin="round" /></svg>;
  if (kind === "back") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true"><path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (kind === "chevron") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true"><path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true"><path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function SettingsHeader({ title, description, backLabel, headingRef, onBack }: { title: string; description: string; backLabel: string; headingRef: RefObject<HTMLHeadingElement | null>; onBack: () => void }) {
  return <header className="shrink-0 px-4 pb-1 pt-4 sm:px-5 sm:pt-5"><button type="button" onClick={onBack} aria-label={`Back to ${backLabel}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold text-primary transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover"><SettingsIcon kind="back" /><span>{backLabel}</span></button><div className="px-1 pb-2 pt-3"><h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold tracking-tight text-heading focus:outline-none">{title}</h1><p className="mt-2 text-sm leading-6 text-body">{description}</p></div></header>;
}

function NavigationRow({ icon, title, description, onClick }: { icon: SettingsIconKind; title: string; description: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3 text-left transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent text-primary"><SettingsIcon kind={icon} /></span><span className="min-w-0 flex-1"><span className="block font-semibold text-heading">{title}</span><span className="mt-0.5 block text-xs leading-5 text-body">{description}</span></span><SettingsIcon kind="chevron" className="h-4 w-4 shrink-0 text-muted" /></button>;
}

function ComingSoonRow({ icon, title, description }: { icon: SettingsIconKind; title: string; description: string }) {
  return <div aria-disabled="true" aria-label={`${title}, coming soon`} className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3 opacity-70"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent text-muted"><SettingsIcon kind={icon} /></span><span className="min-w-0 flex-1"><span className="block font-semibold text-heading">{title}</span><span className="mt-0.5 block text-xs leading-5 text-body">{description}</span></span><span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-primary">Coming soon</span></div>;
}

function Card({ children, labelledBy }: { children: ReactNode; labelledBy?: string }) {
  return <section aria-labelledby={labelledBy} className="rounded-3xl border border-border bg-background p-4 shadow-soft">{children}</section>;
}

function AppearanceSettings() {
  const [preference, setPreference] = useState<AppearancePreference>(() => getAppearancePreference());
  useEffect(() => {
    const sync = (event: Event) => setPreference((event as CustomEvent<AppearancePreference>).detail ?? getAppearancePreference());
    window.addEventListener(appearanceChangeEvent, sync);
    return () => window.removeEventListener(appearanceChangeEvent, sync);
  }, []);
  const options: Array<{ value: AppearancePreference; title: string; description: string }> = [
    { value: "system", title: "System", description: "Use your device preference" },
    { value: "light", title: "Light", description: "Always use light appearance" },
    { value: "dark", title: "Dark", description: "Always use dark appearance" },
  ];
  return <Card labelledBy="appearance-theme-heading"><fieldset><legend id="appearance-theme-heading" className="font-semibold text-heading">Theme</legend><p className="mt-1 text-xs leading-5 text-body">This changes Nemissive globally on this device. Conversation themes remain unchanged.</p><div className="mt-4 space-y-2">{options.map((option) => <label key={option.value} className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition focus-within:ring-4 focus-within:ring-accent-hover ${preference === option.value ? "border-primary bg-accent" : "border-border bg-surface hover:bg-accent"}`}><input type="radio" name="appearance" value={option.value} checked={preference === option.value} onChange={() => { setPreference(option.value); setAppearancePreference(option.value); }} className="h-4 w-4 shrink-0 accent-[var(--color-primary)]" /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-heading">{option.title}</span><span className="mt-0.5 block text-xs leading-5 text-body">{option.description}</span></span>{preference === option.value && <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 shrink-0 text-primary" aria-hidden="true"><path d="m4 10 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" /></svg>}</label>)}</div></fieldset></Card>;
}

function parseBlockedAccounts(value: unknown): BlockedAccount[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.blocked_profile_id !== "string" || typeof row.blocked_at !== "string") return [];
    return [{ profile: { id: row.blocked_profile_id, display_name: typeof row.display_name === "string" ? row.display_name : null, username: typeof row.username === "string" ? row.username : null, avatar_url: typeof row.avatar_url === "string" ? row.avatar_url : null }, blockedAt: row.blocked_at }];
  });
}

function formatBlockedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Blocked recently";
  return `Blocked ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date)}`;
}

function BlockedAccountsSettings({ headingRef }: { headingRef: RefObject<HTMLHeadingElement | null> }) {
  const reduceMotion = useReducedMotion();
  const [accounts, setAccounts] = useState<BlockedAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [target, setTarget] = useState<BlockedAccount | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const [toast, setToast] = useState("");
  const unblockButtonRef = useRef<HTMLElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true); setLoadError("");
      const { data, error } = await supabase.rpc("list_blocked_accounts");
      if (cancelled) return;
      setIsLoading(false);
      if (error) { setLoadError("We couldn’t load your blocked accounts. Please try again."); if (import.meta.env.DEV) console.warn("Loading blocked accounts failed", { code: error.code }); return; }
      setAccounts(parseBlockedAccounts(data));
    }
    void load();
    return () => { cancelled = true; };
  }, [reloadKey]);

  useEffect(() => () => { if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current); }, []);

  function openUnblock(account: BlockedAccount, button: HTMLButtonElement) {
    unblockButtonRef.current = button; setMutationError(""); setTarget(account);
  }

  async function confirmUnblock() {
    if (!target || isSaving) return;
    setIsSaving(true); setMutationError("");
    const { error } = await supabase.rpc("set_user_blocked", { target_user_id: target.profile.id, blocked: false });
    setIsSaving(false);
    if (error) { setMutationError("We couldn’t unblock this person. Please try again."); if (import.meta.env.DEV) console.warn("Unblocking from settings failed", { code: error.code }); return; }
    const name = getProfileDisplayName(target.profile);
    setAccounts((current) => current.filter((account) => account.profile.id !== target.profile.id));
    setTarget(null);
    setToast(`${name} unblocked`);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => { setToast(""); toastTimerRef.current = null; }, 3000);
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  return <>
    <Card labelledBy="blocked-accounts-list-heading"><h2 id="blocked-accounts-list-heading" className="font-semibold text-heading">Blocked accounts</h2><p className="mt-1 text-xs leading-5 text-body">People you’ve blocked cannot message or interact with you.</p>
      {isLoading ? <div role="status" aria-live="polite" className="mt-4 rounded-2xl bg-surface px-4 py-5 text-sm text-body">Loading blocked accounts…</div> : loadError ? <div role="alert" className="mt-4 rounded-2xl border border-border bg-surface p-4 text-sm text-body"><p>{loadError}</p><button type="button" onClick={() => setReloadKey((key) => key + 1)} className="mt-3 min-h-10 rounded-xl px-3 font-semibold text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">Retry</button></div> : accounts.length === 0 ? <div className="mt-5 rounded-2xl bg-surface px-4 py-6 text-center"><p className="font-semibold text-heading">No blocked accounts</p><p className="mt-1 text-xs leading-5 text-body">People you block will appear here.</p></div> : <ul className="mt-4 divide-y divide-border">{accounts.map((account) => { const name = getProfileDisplayName(account.profile); return <li key={account.profile.id} className="flex min-w-0 flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"><ProfileAvatar profile={account.profile} size="sm" accessibleLabel={`${name} profile photo`} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-heading">{name}</span><span className="block truncate text-xs text-body">{account.profile.username ? `@${account.profile.username}` : "Nemissive member"}</span><span className="mt-1 block text-[11px] text-muted">{formatBlockedDate(account.blockedAt)}</span></span><button type="button" aria-label={`Unblock ${name}`} onClick={(event) => openUnblock(account, event.currentTarget)} className="min-h-10 shrink-0 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-heading transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Unblock</button></li>; })}</ul>}
    </Card>
    <AnimatePresence initial={false}>{target && <UserBlockDialog blocked={false} displayName={getProfileDisplayName(target.profile)} error={mutationError} isSaving={isSaving} returnFocusRef={unblockButtonRef} onCancel={() => { if (!isSaving) { setTarget(null); setMutationError(""); } }} onConfirm={() => void confirmUnblock()} />}</AnimatePresence>
    <div className="pointer-events-none fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-[120] w-[min(calc(100%-2rem),22rem)] -translate-x-1/2"><AnimatePresence initial={false}>{toast && <motion.div role="status" aria-live="polite" aria-atomic="true" initial={reduceMotion ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-2xl border border-border bg-surface px-4 py-3 text-center text-sm font-semibold text-heading shadow-soft">{toast}</motion.div>}</AnimatePresence></div>
  </>;
}

function PrivacySettings({ onOpenBlocked }: { onOpenBlocked: () => void }) {
  return <div className="space-y-3"><NavigationRow icon="blocked" title="Blocked accounts" description="Manage people you’ve blocked" onClick={onOpenBlocked} /><ComingSoonRow icon="privacy" title="Report & moderation" description="More safety controls" /></div>;
}

function AccountSettings({ profile, isSigningOut, signOutError, onSignOut }: { profile: ProfileSearchResult; isSigningOut: boolean; signOutError: string; onSignOut: () => void }) {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => { if (!cancelled) setEmail(data.user?.email ?? null); });
    return () => { cancelled = true; };
  }, []);
  return <div className="space-y-3"><Card labelledBy="account-identity-heading"><h2 id="account-identity-heading" className="font-semibold text-heading">Account identity</h2><div className="mt-4 flex min-w-0 items-center gap-3"><ProfileAvatar profile={profile} size="md" /><div className="min-w-0"><p className="truncate text-sm font-semibold text-heading">{getProfileDisplayName(profile)}</p><p className="truncate text-xs text-body">{profile.username ? `@${profile.username}` : "Nemissive member"}</p></div></div>{email && <div className="mt-4 border-t border-border pt-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted">Email</p><p className="mt-1 break-all text-sm text-heading">{email}</p></div>}</Card><Card><button type="button" onClick={onSignOut} disabled={isSigningOut} className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-left transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:opacity-60"><SettingsIcon kind="signout" className="h-5 w-5 shrink-0 text-primary" /><span className="font-semibold text-heading">{isSigningOut ? "Signing out…" : "Sign out"}</span></button>{signOutError && <p role="alert" className="mt-3 rounded-2xl border border-primary/25 bg-accent px-3 py-2.5 text-xs leading-5 text-body">{signOutError}</p>}</Card><ComingSoonRow icon="account" title="Change password" description="Account credential controls" /><ComingSoonRow icon="account" title="Delete account" description="Account deletion controls" /></div>;
}

function DataStorageSettings() {
  const limits = [
    { title: "Photos", detail: "Up to 10 MB each · up to 10 per message" },
    { title: "Voice messages", detail: "Up to 5 minutes · up to 15 MB" },
    { title: "Files", detail: "Up to 25 MB each · up to 10 per message" },
  ];
  return <div className="space-y-3"><Card labelledBy="media-files-heading"><h2 id="media-files-heading" className="font-semibold text-heading">Media & files</h2><p className="mt-1 text-xs leading-5 text-body">Nemissive stores conversation attachments privately and loads them when needed.</p><dl className="mt-4 divide-y divide-border">{limits.map((limit) => <div key={limit.title} className="py-3 first:pt-0 last:pb-0"><dt className="text-sm font-semibold text-heading">{limit.title}</dt><dd className="mt-1 text-xs leading-5 text-body">{limit.detail}</dd></div>)}</dl></Card><ComingSoonRow icon="storage" title="Storage usage" description="See how much storage you use" /><ComingSoonRow icon="storage" title="Clear local cached data" description="Manage downloaded local data" /></div>;
}

function SettingsLanding({ onOpen }: { onOpen: (screen: SettingsScreen) => void }) {
  return <nav aria-label="Settings categories" className="space-y-3"><NavigationRow icon="appearance" title="Appearance" description="Customize how Nemissive looks" onClick={() => onOpen("appearance")} /><NavigationRow icon="privacy" title="Privacy & Safety" description="Blocked accounts and privacy controls" onClick={() => onOpen("privacy")} /><NavigationRow icon="account" title="Account" description="Manage account-related preferences" onClick={() => onOpen("account")} /><NavigationRow icon="storage" title="Data & Storage" description="Storage and data preferences" onClick={() => onOpen("data-storage")} /><ComingSoonRow icon="premium" title="Nemissive Premium" description="Premium live themes and more customization" /></nav>;
}

function SettingsSidebarContent({ profile, isSigningOut, signOutError, onBackToMenu, onSignOut }: Props) {
  const [screen, setScreen] = useState<SettingsScreen>("landing");
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { const frame = requestAnimationFrame(() => headingRef.current?.focus()); return () => cancelAnimationFrame(frame); }, [screen]);
  const copy = screen === "landing" ? { title: "Settings", description: "Appearance, privacy, account and storage.", parent: "Menu" } : screenCopy[screen];
  function goBack() {
    if (screen === "landing") onBackToMenu();
    else if (screen === "blocked-accounts") setScreen("privacy");
    else setScreen("landing");
  }
  return <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden"><SettingsHeader title={copy.title} description={copy.description} backLabel={copy.parent} headingRef={headingRef} onBack={goBack} /><div className="flex-1 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 sm:px-5">{screen === "landing" && <SettingsLanding onOpen={setScreen} />}{screen === "appearance" && <AppearanceSettings />}{screen === "privacy" && <PrivacySettings onOpenBlocked={() => setScreen("blocked-accounts")} />}{screen === "blocked-accounts" && <BlockedAccountsSettings headingRef={headingRef} />}{screen === "account" && <AccountSettings profile={profile} isSigningOut={isSigningOut} signOutError={signOutError} onSignOut={onSignOut} />}{screen === "data-storage" && <DataStorageSettings />}</div></div>;
}

export default SettingsSidebarContent;
