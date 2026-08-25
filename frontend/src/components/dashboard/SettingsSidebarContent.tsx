import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { appearanceChangeEvent, getAppearancePreference, setAppearancePreference, type AppearancePreference } from "../../lib/appearance";
import { announcePrivacyPreferencesChanged, parsePrivacyPreferences, privacyPreferencesChangeEvent, type PrivacyPreferences } from "../../lib/privacyPreferences";
import { profileIdentityChangeEvent } from "../../lib/profileIdentity";
import { supabase } from "../../lib/supabase";
import type { ProfileSearchResult } from "../../types/conversations";
import ChangePasswordSettings from "./ChangePasswordSettings";
import DeleteAccountSettings from "./DeleteAccountSettings";
import ProfileAvatar from "./ProfileAvatar";
import UserBlockDialog from "./UserBlockDialog";
import { getProfileDisplayName } from "./profileUtils";

type SettingsScreen = "landing" | "appearance" | "privacy" | "message-requests" | "blocked-accounts" | "account" | "change-password" | "delete-account" | "data-storage";
type SettingsIconKind = "appearance" | "privacy" | "blocked" | "account" | "storage" | "premium" | "back" | "chevron";

type BlockedAccount = {
  profile: ProfileSearchResult;
  blockedAt: string;
};

type Props = {
  profile: ProfileSearchResult;
  onBackToMenu: () => void;
  rootBackLabel?: string;
  onAccountDeleted: () => void;
};

const screenCopy: Record<Exclude<SettingsScreen, "landing">, { title: string; description: string; parent: "Settings" | "Privacy & Safety" | "Account" }> = {
  appearance: { title: "Appearance", description: "Customize how Nemissive looks on this device.", parent: "Settings" },
  privacy: { title: "Privacy & Safety", description: "Manage blocked accounts and privacy controls.", parent: "Settings" },
  "message-requests": { title: "Message requests", description: "Choose who can send you new conversation requests.", parent: "Privacy & Safety" },
  "blocked-accounts": { title: "Blocked accounts", description: "Review and manage people you have blocked.", parent: "Privacy & Safety" },
  account: { title: "Account", description: "Your sign-in identity and account controls.", parent: "Settings" },
  "change-password": { title: "Change password", description: "Verify your current password and choose a stronger one.", parent: "Account" },
  "delete-account": { title: "Delete account", description: "Permanently remove your active Nemissive account.", parent: "Account" },
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
  return null;
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
  return <Card labelledBy="appearance-theme-heading"><fieldset><legend id="appearance-theme-heading" className="font-semibold text-heading">Theme</legend><p className="mt-1 text-xs leading-5 text-body">This changes Nemissive globally on this device. Conversation themes adapt to the selected appearance.</p><div className="mt-4 space-y-2">{options.map((option) => <label key={option.value} className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition focus-within:ring-4 focus-within:ring-accent-hover ${preference === option.value ? "border-primary bg-accent" : "border-border bg-surface hover:bg-accent"}`}><input type="radio" name="appearance" value={option.value} checked={preference === option.value} onChange={() => { setPreference(option.value); setAppearancePreference(option.value); }} className="h-4 w-4 shrink-0 accent-[var(--color-primary)]" /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-heading">{option.title}</span><span className="mt-0.5 block text-xs leading-5 text-body">{option.description}</span></span>{preference === option.value && <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 shrink-0 text-primary" aria-hidden="true"><path d="m4 10 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" /></svg>}</label>)}</div></fieldset></Card>;
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
  useEffect(() => {
    const refreshIdentityRows = () => setReloadKey((key) => key + 1);
    window.addEventListener(profileIdentityChangeEvent, refreshIdentityRows);
    return () => window.removeEventListener(profileIdentityChangeEvent, refreshIdentityRows);
  }, []);

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

type PrivacyPreferenceKey = Exclude<keyof PrivacyPreferences, "messageRequestPermission">;

function PrivacySwitch({ id, label, description, checked, disabled, onChange }: { id: string; label: string; description: string; checked: boolean; disabled: boolean; onChange: () => void }) {
  const descriptionId = `${id}-description`;
  return <div className="flex min-w-0 items-start gap-4 py-3 first:pt-0 last:pb-0"><div className="min-w-0 flex-1"><label htmlFor={id} className="text-sm font-semibold text-heading">{label}</label><p id={descriptionId} className="mt-1 text-xs leading-5 text-body">{description}</p></div><button id={id} type="button" role="switch" aria-checked={checked} aria-describedby={descriptionId} disabled={disabled} onClick={onChange} className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-wait disabled:opacity-60 ${checked ? "border-primary bg-primary" : "border-border bg-surface"}`}><span className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none ${checked ? "translate-x-6" : "translate-x-1"}`} aria-hidden="true" /><span className="sr-only">{checked ? "On" : "Off"}</span></button></div>;
}

function PrivacySettings({ onOpenBlocked, onOpenMessageRequests }: { onOpenBlocked: () => void; onOpenMessageRequests: () => void }) {
  const [preferences, setPreferences] = useState<PrivacyPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [savingKey, setSavingKey] = useState<PrivacyPreferenceKey | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setLoadError("");
      const { data, error } = await supabase.rpc("get_my_privacy_preferences");
      if (cancelled) return;
      setIsLoading(false);
      const parsed = parsePrivacyPreferences(data);
      if (error || !parsed) {
        setLoadError("We couldn’t load your privacy preferences. Please try again.");
        if (error && import.meta.env.DEV) console.warn("Loading privacy preferences failed", { code: error.code });
        return;
      }
      setPreferences(parsed);
    }
    void load();
    return () => { cancelled = true; };
  }, [reloadKey]);

  useEffect(() => {
    const refresh = () => setReloadKey((key) => key + 1);
    window.addEventListener(privacyPreferencesChangeEvent, refresh);
    return () => window.removeEventListener(privacyPreferencesChangeEvent, refresh);
  }, []);

  async function togglePreference(key: PrivacyPreferenceKey) {
    if (!preferences || savingKey) return;
    const previous = preferences;
    const next = { ...previous, [key]: !previous[key] };
    setPreferences(next);
    setSavingKey(key);
    setStatusMessage("Saving privacy preference…");
    const { data, error } = await supabase.rpc("set_privacy_preferences", {
      active_status_enabled: next.activeStatusEnabled,
      last_active_enabled: next.lastActiveEnabled,
      read_receipts_enabled: next.readReceiptsEnabled,
    });
    const saved = parsePrivacyPreferences(data);
    setSavingKey(null);
    if (error || !saved) {
      setPreferences(previous);
      setStatusMessage("We couldn’t save that privacy preference. Your previous setting was restored.");
      if (error && import.meta.env.DEV) console.warn("Saving privacy preferences failed", { code: error.code });
      return;
    }
    setPreferences(saved);
    setStatusMessage("Privacy preference saved.");
    announcePrivacyPreferencesChanged();
  }

  if (isLoading && !preferences) return <div role="status" aria-live="polite" className="rounded-3xl border border-border bg-background px-4 py-6 text-sm text-body shadow-soft">Loading privacy preferences…</div>;
  if (loadError && !preferences) return <div role="alert" className="rounded-3xl border border-border bg-background p-4 text-sm text-body shadow-soft"><p>{loadError}</p><button type="button" onClick={() => setReloadKey((key) => key + 1)} className="mt-3 min-h-10 rounded-xl px-3 font-semibold text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Retry</button></div>;
  if (!preferences) return null;

  return <div className="space-y-5">
    <section aria-labelledby="privacy-activity-heading"><h2 id="privacy-activity-heading" className="px-1 text-xs font-bold uppercase tracking-[0.16em] text-muted">Activity</h2><div className="mt-2 rounded-3xl border border-border bg-background px-4 py-3 shadow-soft"><PrivacySwitch id="active-status-privacy" label="Active status" description="Let people you chat with see when you’re currently active." checked={preferences.activeStatusEnabled} disabled={Boolean(savingKey)} onChange={() => void togglePreference("activeStatusEnabled")} /><div className="border-t border-border"><PrivacySwitch id="last-active-privacy" label="Last active" description="Let people you chat with see when you were last active." checked={preferences.lastActiveEnabled} disabled={Boolean(savingKey)} onChange={() => void togglePreference("lastActiveEnabled")} /></div></div></section>
    <section aria-labelledby="privacy-messaging-heading"><h2 id="privacy-messaging-heading" className="px-1 text-xs font-bold uppercase tracking-[0.16em] text-muted">Messaging</h2><div className="mt-2 space-y-3"><div className="rounded-3xl border border-border bg-background px-4 py-3 shadow-soft"><PrivacySwitch id="read-receipts-privacy" label="Read receipts" description="Let people know when you’ve seen their messages. If you turn this off, you won’t see their read receipts either." checked={preferences.readReceiptsEnabled} disabled={Boolean(savingKey)} onChange={() => void togglePreference("readReceiptsEnabled")} /></div><NavigationRow icon="privacy" title="Message requests" description="Who can send you conversation requests" onClick={onOpenMessageRequests} /></div></section>
    <section aria-labelledby="privacy-safety-heading"><h2 id="privacy-safety-heading" className="px-1 text-xs font-bold uppercase tracking-[0.16em] text-muted">Safety</h2><div className="mt-2 space-y-3"><NavigationRow icon="blocked" title="Blocked accounts" description="Manage people you’ve blocked" onClick={onOpenBlocked} /><ComingSoonRow icon="privacy" title="Report & moderation" description="More safety controls" /></div></section>
    <p role={statusMessage.startsWith("We couldn’t") ? "alert" : "status"} aria-live="polite" aria-atomic="true" className="min-h-5 px-1 text-xs leading-5 text-body">{statusMessage}</p>
  </div>;
}

function MessageRequestSettings() {
  const [permission, setPermission] = useState<PrivacyPreferences["messageRequestPermission"] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setStatusMessage("");
      const { data, error } = await supabase.rpc("get_my_privacy_preferences");
      if (cancelled) return;
      setIsLoading(false);
      const parsed = parsePrivacyPreferences(data);
      if (error || !parsed) {
        setPermission(null);
        setStatusMessage("We couldn’t load your message request preference. Please try again.");
        if (error && import.meta.env.DEV) console.warn("Loading message request privacy failed", { code: error.code });
        return;
      }
      setPermission(parsed.messageRequestPermission);
    }
    void load();
    return () => { cancelled = true; };
  }, [reloadKey]);

  useEffect(() => {
    const refresh = () => setReloadKey((key) => key + 1);
    window.addEventListener(privacyPreferencesChangeEvent, refresh);
    return () => window.removeEventListener(privacyPreferencesChangeEvent, refresh);
  }, []);

  async function savePermission(nextPermission: PrivacyPreferences["messageRequestPermission"]) {
    if (!permission || isSaving || nextPermission === permission) return;
    const previous = permission;
    setPermission(nextPermission);
    setIsSaving(true);
    setStatusMessage("Saving message request preference…");
    const { data, error } = await supabase.rpc("set_message_request_permission", { message_request_permission: nextPermission });
    const saved = parsePrivacyPreferences(data);
    setIsSaving(false);
    if (error || !saved) {
      setPermission(previous);
      setStatusMessage("We couldn’t save that preference. Your previous setting was restored.");
      if (error && import.meta.env.DEV) console.warn("Saving message request privacy failed", { code: error.code });
      return;
    }
    setPermission(saved.messageRequestPermission);
    setStatusMessage("Message request preference saved.");
    announcePrivacyPreferencesChanged();
  }

  const options: Array<{ value: PrivacyPreferences["messageRequestPermission"]; title: string; description: string }> = [
    { value: "everyone", title: "Everyone", description: "Anyone you can discover on Nemissive may send you a request, subject to existing safety rules." },
    { value: "no_one", title: "No one", description: "New conversation requests to you will be disabled." },
  ];

  if (isLoading && permission === null) return <div role="status" aria-live="polite" className="rounded-3xl border border-border bg-background px-4 py-6 text-sm text-body shadow-soft">Loading message request preference…</div>;
  if (permission === null) return <div role="alert" className="rounded-3xl border border-border bg-background p-4 text-sm text-body shadow-soft"><p>{statusMessage}</p><button type="button" onClick={() => setReloadKey((key) => key + 1)} className="mt-3 min-h-10 rounded-xl px-3 font-semibold text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Retry</button></div>;

  return <div className="space-y-4"><Card labelledBy="message-request-permission-heading"><fieldset disabled={isSaving}><legend id="message-request-permission-heading" className="sr-only">Who can send you new conversation requests</legend><div className="space-y-2">{options.map((option) => <label key={option.value} className={`flex min-h-20 cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition focus-within:ring-4 focus-within:ring-accent-hover ${permission === option.value ? "border-primary bg-accent" : "border-border bg-surface hover:bg-accent"} ${isSaving ? "cursor-wait opacity-60" : ""}`}><input type="radio" name="message-request-permission" value={option.value} checked={permission === option.value} onChange={() => void savePermission(option.value)} aria-describedby={`message-request-${option.value}-description`} className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-primary)]" /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-heading">{option.title}</span><span id={`message-request-${option.value}-description`} className="mt-1 block text-xs leading-5 text-body">{option.description}</span></span>{permission === option.value && <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true"><path d="m4 10 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" /></svg>}</label>)}</div></fieldset></Card><p role={statusMessage.startsWith("We couldn’t") ? "alert" : "status"} aria-live="polite" aria-atomic="true" className="min-h-5 px-1 text-xs leading-5 text-body">{statusMessage}</p></div>;
}

function AccountSettings({ profile, onChangePassword, onDeleteAccount }: { profile: ProfileSearchResult; onChangePassword: () => void; onDeleteAccount: () => void }) {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => { if (!cancelled) setEmail(data.user?.email ?? null); });
    return () => { cancelled = true; };
  }, []);
  return <div className="space-y-3"><Card labelledBy="account-identity-heading"><h2 id="account-identity-heading" className="font-semibold text-heading">Account identity</h2><div className="mt-4 flex min-w-0 items-center gap-3"><ProfileAvatar profile={profile} size="md" /><div className="min-w-0"><p className="truncate text-sm font-semibold text-heading">{getProfileDisplayName(profile)}</p><p className="truncate text-xs text-body">{profile.username ? `@${profile.username}` : "Nemissive member"}</p></div></div>{email && <div className="mt-4 border-t border-border pt-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted">Email</p><p className="mt-1 break-all text-sm text-heading">{email}</p></div>}</Card><NavigationRow icon="account" title="Change password" description="Update your account password securely" onClick={onChangePassword} /><NavigationRow icon="account" title="Delete account" description="Permanently remove your account" onClick={onDeleteAccount} /></div>;
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

function SettingsSidebarContent({ profile, onBackToMenu, rootBackLabel = "Menu", onAccountDeleted }: Props) {
  const [screen, setScreen] = useState<SettingsScreen>("landing");
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { const frame = requestAnimationFrame(() => headingRef.current?.focus()); return () => cancelAnimationFrame(frame); }, [screen]);
  const copy = screen === "landing" ? { title: "Settings", description: "Appearance, privacy, account and storage.", parent: rootBackLabel } : screenCopy[screen];
  function goBack() {
    if (screen === "landing") onBackToMenu();
    else if (screen === "blocked-accounts" || screen === "message-requests") setScreen("privacy");
    else if (screen === "change-password" || screen === "delete-account") setScreen("account");
    else setScreen("landing");
  }
  return <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden"><SettingsHeader title={copy.title} description={copy.description} backLabel={copy.parent} headingRef={headingRef} onBack={goBack} /><div className="flex-1 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 sm:px-5">{screen === "landing" && <SettingsLanding onOpen={setScreen} />}{screen === "appearance" && <AppearanceSettings />}{screen === "privacy" && <PrivacySettings onOpenBlocked={() => setScreen("blocked-accounts")} onOpenMessageRequests={() => setScreen("message-requests")} />}{screen === "message-requests" && <MessageRequestSettings />}{screen === "blocked-accounts" && <BlockedAccountsSettings headingRef={headingRef} />}{screen === "account" && <AccountSettings profile={profile} onChangePassword={() => setScreen("change-password")} onDeleteAccount={() => setScreen("delete-account")} />}{screen === "change-password" && <ChangePasswordSettings />}{screen === "delete-account" && <DeleteAccountSettings onDeleted={onAccountDeleted} />}{screen === "data-storage" && <DataStorageSettings />}</div></div>;
}

export default SettingsSidebarContent;
