import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import type { ProfileSearchResult } from "../../types/conversations";
import ProfileAvatar from "./ProfileAvatar";
import { getProfileDisplayName } from "./profileUtils";

type MenuSidebarContentProps = {
  profile: ProfileSearchResult | null;
  isAccountLoading: boolean;
  accountError: string;
};

function MenuIcon({ kind }: { kind: "profile" | "settings" | "signout" }) {
  if (kind === "profile") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5.5 19c.7-4 2.9-6 6.5-6s5.8 2 6.5 6" strokeLinecap="round" /></svg>;
  if (kind === "settings") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M9 4v6M8 14v6" strokeLinecap="round" /></svg>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ComingSoonRow({ kind, label }: { kind: "profile" | "settings"; label: string }) {
  return <div aria-disabled="true" className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3 opacity-70"><span className="text-muted"><MenuIcon kind={kind} /></span><span className="min-w-0 flex-1 font-semibold text-heading">{label}</span><span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-primary">Coming soon</span></div>;
}

function MenuSidebarContent({ profile, isAccountLoading, accountError }: MenuSidebarContentProps) {
  const navigate = useNavigate();
  const isSigningOutRef = useRef(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  async function handleSignOut() {
    if (isSigningOutRef.current) return;

    isSigningOutRef.current = true;
    setIsSigningOut(true);
    setSignOutError("");

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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
      <header className="shrink-0 px-5 pb-4 pt-6 sm:px-6 sm:pt-7 md:px-5 lg:px-6"><h1 className="text-2xl font-bold tracking-tight text-heading">Menu</h1><p className="mt-2 text-sm leading-6 text-body">Your account and Nemissive preferences.</p></header>

      <div className="flex-1 px-4 pb-5 sm:px-5">
        {isAccountLoading ? (
          <div role="status" aria-live="polite" aria-label="Loading account" className="rounded-3xl border border-border bg-background p-4"><div className="flex items-center gap-3"><div className="h-14 w-14 animate-pulse rounded-full bg-accent" /><div className="flex-1 space-y-2"><div className="h-4 w-2/5 animate-pulse rounded-full bg-accent" /><div className="h-3 w-1/3 animate-pulse rounded-full bg-accent" /></div></div></div>
        ) : accountError || !profile ? (
          <div role="alert" className="rounded-3xl border border-border bg-background p-5"><h2 className="font-semibold text-heading">Account unavailable</h2><p className="mt-2 text-sm leading-6 text-body">{accountError || "Your profile could not be loaded."}</p></div>
        ) : (
          <div className="rounded-3xl border border-border bg-background p-4 shadow-soft"><div className="flex min-w-0 items-center gap-4"><div className="relative"><ProfileAvatar profile={profile} size="lg" /><span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-background bg-online" aria-hidden="true" /></div><div className="min-w-0 flex-1"><h2 className="truncate text-lg font-bold text-heading">{getProfileDisplayName(profile)}</h2><p className="mt-1 truncate text-sm text-body">{profile.username ? `@${profile.username}` : "Nemissive member"}</p><p className="mt-2 text-xs font-semibold text-online">Signed in</p></div></div></div>
        )}

        <div className="mt-5 space-y-3"><ComingSoonRow kind="profile" label="Profile" /><ComingSoonRow kind="settings" label="Settings" /><button type="button" onClick={() => void handleSignOut()} disabled={isSigningOut} className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-left transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-60"><span className="text-primary"><MenuIcon kind="signout" /></span><span className="min-w-0 flex-1 font-semibold text-heading">{isSigningOut ? "Signing out..." : "Sign out"}</span></button></div>
        {signOutError && <p role="alert" className="mt-4 rounded-2xl border border-primary/25 bg-accent px-4 py-3 text-sm leading-6 text-body">{signOutError}</p>}
      </div>
    </div>
  );
}

export default MenuSidebarContent;
