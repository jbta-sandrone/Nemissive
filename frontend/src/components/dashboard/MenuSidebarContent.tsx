import { useEffect, useRef, useState, type RefObject } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import type { ProfileSearchResult } from "../../types/conversations";
import NotificationSettings from "./NotificationSettings";
import ProfileAvatar from "./ProfileAvatar";
import ProfileDetailsSettings from "./ProfileDetailsSettings";
import QuickReactionSettings from "./QuickReactionSettings";
import { getProfileDisplayName } from "./profileUtils";

type MenuSidebarContentProps = {
  profile: ProfileSearchResult | null;
  isAccountLoading: boolean;
  accountError: string;
  quickReactions: string[];
  onSaveQuickReactions: (reactions: string[]) => Promise<boolean>;
  notificationPermission: NotificationPermission | "unsupported";
  isNotificationSupported: boolean;
  onEnableNotifications: () => Promise<string | null>;
  onSaveNotificationPreferences: (notificationsEnabled: boolean, soundEnabled: boolean) => Promise<string | null>;
  onBeforeSignOut: () => void;
};

type MenuSubsection = "profile" | "notifications" | "quick-reactions";
type MenuView = "landing" | MenuSubsection;
type MenuIconKind = MenuSubsection | "settings" | "signout" | "back" | "chevron";

const subsectionCopy: Record<MenuSubsection, { title: string; description: string }> = {
  profile: { title: "Profile", description: "Manage your profile and personal details." },
  notifications: { title: "Notifications", description: "Manage browser notifications, sounds, and preferences." },
  "quick-reactions": { title: "Quick reactions", description: "Choose your preferred message reactions." },
};

function MenuIcon({ kind }: { kind: MenuIconKind }) {
  const iconClass = "h-5 w-5";

  if (kind === "profile") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClass} aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" strokeLinecap="round" /></svg>;
  if (kind === "notifications") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClass} aria-hidden="true"><path d="M6.5 9a5.5 5.5 0 0 1 11 0c0 5 2 5.5 2 7H4.5c0-1.5 2-2 2-7Z" strokeLinejoin="round" /><path d="M9.5 19a3 3 0 0 0 5 0" strokeLinecap="round" /></svg>;
  if (kind === "quick-reactions") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClass} aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M8.5 10h.01M15.5 10h.01M8.5 14.5c1.9 1.7 5.1 1.7 7 0" strokeLinecap="round" /></svg>;
  if (kind === "settings") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClass} aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M9 4v6M8 14v6" strokeLinecap="round" /></svg>;
  if (kind === "back") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={iconClass} aria-hidden="true"><path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (kind === "chevron") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true"><path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClass} aria-hidden="true"><path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function MenuCategoryButton({
  buttonRef,
  kind,
  title,
  description,
  disabled,
  onClick,
}: {
  buttonRef: RefObject<HTMLButtonElement | null>;
  kind: MenuSubsection;
  title: string;
  description: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3 text-left transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent text-primary"><MenuIcon kind={kind} /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-heading">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-body">{description}</span>
      </span>
      <span className="shrink-0 text-muted"><MenuIcon kind="chevron" /></span>
    </button>
  );
}

function ComingSoonSettingsRow() {
  return (
    <div aria-disabled="true" aria-label="Settings, coming soon" className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3 opacity-70">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent text-muted"><MenuIcon kind="settings" /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-heading">Settings</span>
        <span className="mt-0.5 block text-xs leading-5 text-body">More Nemissive settings</span>
      </span>
      <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-primary">Coming soon</span>
    </div>
  );
}

function SubsectionHeader({ headingRef, title, description, onBack }: { headingRef: RefObject<HTMLHeadingElement | null>; title: string; description: string; onBack: () => void }) {
  return (
    <header className="shrink-0 px-4 pb-1 pt-4 sm:px-5 sm:pt-5">
      <button type="button" onClick={onBack} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold text-primary transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover" aria-label="Back to Menu">
        <MenuIcon kind="back" />
        <span>Menu</span>
      </button>
      <div className="px-1 pb-2 pt-3">
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold tracking-tight text-heading focus:outline-none">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-body">{description}</p>
      </div>
    </header>
  );
}

function MenuSidebarContent({ profile, isAccountLoading, accountError, quickReactions, onSaveQuickReactions, notificationPermission, isNotificationSupported, onEnableNotifications, onSaveNotificationPreferences, onBeforeSignOut }: MenuSidebarContentProps) {
  const navigate = useNavigate();
  const isSigningOutRef = useRef(false);
  const subsectionHeadingRef = useRef<HTMLHeadingElement>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const notificationsButtonRef = useRef<HTMLButtonElement>(null);
  const quickReactionsButtonRef = useRef<HTMLButtonElement>(null);
  const focusOnLandingRef = useRef<MenuSubsection | null>(null);
  const [activeView, setActiveView] = useState<MenuView>("landing");
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (activeView === "landing") {
        const category = focusOnLandingRef.current;
        if (category === "profile") profileButtonRef.current?.focus();
        else if (category === "notifications") notificationsButtonRef.current?.focus();
        else if (category === "quick-reactions") quickReactionsButtonRef.current?.focus();
        focusOnLandingRef.current = null;
        return;
      }
      subsectionHeadingRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeView]);

  function openSubsection(subsection: MenuSubsection) {
    setActiveView(subsection);
  }

  function returnToLanding() {
    if (activeView !== "landing") focusOnLandingRef.current = activeView;
    setActiveView("landing");
  }

  async function handleSignOut() {
    if (isSigningOutRef.current) return;

    isSigningOutRef.current = true;
    setIsSigningOut(true);
    setSignOutError("");
    onBeforeSignOut();

    const { error } = await supabase.auth.signOut();

    if (error) {
      isSigningOutRef.current = false;
      setIsSigningOut(false);
      setSignOutError("We couldn’t sign you out. Please try again.");
      if (import.meta.env.DEV) console.error("Supabase sign out failed", error);
      return;
    }

    navigate("/login", { replace: true });
  }

  if (activeView !== "landing") {
    const copy = subsectionCopy[activeView];
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
        <SubsectionHeader headingRef={subsectionHeadingRef} title={copy.title} description={copy.description} onBack={returnToLanding} />
        <div className="flex-1 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-5">
          {activeView === "profile" && <ProfileDetailsSettings />}
          {activeView === "notifications" && profile && <NotificationSettings isSupported={isNotificationSupported} permission={notificationPermission} notificationsEnabled={profile.browser_notifications_enabled ?? false} soundEnabled={profile.notification_sound_enabled ?? true} onEnable={onEnableNotifications} onSave={onSaveNotificationPreferences} />}
          {activeView === "quick-reactions" && <QuickReactionSettings quickReactions={quickReactions} onSave={onSaveQuickReactions} />}
        </div>
      </div>
    );
  }

  const categoriesDisabled = isAccountLoading || Boolean(accountError) || !profile;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
      <header className="shrink-0 px-5 pb-4 pt-6 sm:px-6 sm:pt-7 md:px-5 lg:px-6"><h1 className="text-2xl font-bold tracking-tight text-heading">Menu</h1><p className="mt-2 text-sm leading-6 text-body">Your account and Nemissive preferences.</p></header>

      <div className="flex-1 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-5">
        {isAccountLoading ? (
          <div role="status" aria-live="polite" aria-label="Loading account" className="rounded-3xl border border-border bg-background p-4"><div className="flex items-center gap-3"><div className="h-14 w-14 animate-pulse rounded-full bg-accent" /><div className="flex-1 space-y-2"><div className="h-4 w-2/5 animate-pulse rounded-full bg-accent" /><div className="h-3 w-1/3 animate-pulse rounded-full bg-accent" /></div></div></div>
        ) : accountError || !profile ? (
          <div role="alert" className="rounded-3xl border border-border bg-background p-5"><h2 className="font-semibold text-heading">Account unavailable</h2><p className="mt-2 text-sm leading-6 text-body">{accountError || "Your profile could not be loaded."}</p></div>
        ) : (
          <div className="rounded-3xl border border-border bg-background p-4 shadow-soft"><div className="flex min-w-0 items-center gap-4"><div className="relative"><ProfileAvatar profile={profile} size="lg" /><span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-background bg-online" aria-hidden="true" /></div><div className="min-w-0 flex-1"><h2 className="truncate text-lg font-bold text-heading">{getProfileDisplayName(profile)}</h2><p className="mt-1 truncate text-sm text-body">{profile.username ? `@${profile.username}` : "Nemissive member"}</p><p className="mt-2 text-xs font-semibold text-online">Signed in</p></div></div></div>
        )}

        <nav aria-label="Menu categories" className="mt-5 space-y-3">
          <MenuCategoryButton buttonRef={profileButtonRef} kind="profile" title="Profile" description="Manage your profile and personal details" disabled={categoriesDisabled} onClick={() => openSubsection("profile")} />
          <MenuCategoryButton buttonRef={notificationsButtonRef} kind="notifications" title="Notifications" description="Browser notifications, sounds and preferences" disabled={categoriesDisabled} onClick={() => openSubsection("notifications")} />
          <MenuCategoryButton buttonRef={quickReactionsButtonRef} kind="quick-reactions" title="Quick reactions" description="Choose your preferred message reactions" disabled={categoriesDisabled} onClick={() => openSubsection("quick-reactions")} />
          <ComingSoonSettingsRow />
        </nav>

        <div className="mt-5">
          <button type="button" onClick={() => void handleSignOut()} disabled={isSigningOut} className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-left transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-60"><span className="text-primary"><MenuIcon kind="signout" /></span><span className="min-w-0 flex-1 font-semibold text-heading">{isSigningOut ? "Signing out..." : "Sign out"}</span></button>
        </div>
        {signOutError && <p role="alert" className="mt-4 rounded-2xl border border-primary/25 bg-accent px-4 py-3 text-sm leading-6 text-body">{signOutError}</p>}
      </div>
    </div>
  );
}

export default MenuSidebarContent;
