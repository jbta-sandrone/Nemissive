import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

type ProfileSearchResult = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type NewConversationModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const searchDebounceMs = 350;

function escapePostgrestIlikeValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/%/g, "\\%").replace(/_/g, "\\_").replace(/\*/g, "\\*");
}

function getProfileDisplayName(profile: ProfileSearchResult) {
  return profile.display_name?.trim() || profile.username?.trim() || "Nemissive user";
}

function NewConversationModal({ isOpen, onClose }: NewConversationModalProps) {
  const latestAuthRequestRef = useRef(0);
  const latestProfileRequestRef = useRef(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [profiles, setProfiles] = useState<ProfileSearchResult[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [authRetryKey, setAuthRetryKey] = useState(0);

  useEffect(() => {
    if (!isOpen) return;

    const requestId = ++latestAuthRequestRef.current;
    let isCancelled = false;

    async function loadCurrentUser() {
      const { data, error } = await supabase.auth.getUser();

      if (isCancelled || requestId !== latestAuthRequestRef.current) return;

      setIsAuthenticating(false);

      if (error || !data.user) {
        setCurrentUserId(null);
        setProfiles([]);
        setErrorMessage("Your session has expired. Please sign in again, then retry.");
        return;
      }

      setCurrentUserId(data.user.id);
      setErrorMessage("");
      setIsLoadingProfiles(true);
    }

    void loadCurrentUser();

    return () => {
      isCancelled = true;
    };
  }, [authRetryKey, isOpen]);

  useEffect(() => {
    if (!isOpen || !currentUserId) return;

    const requestId = ++latestProfileRequestRef.current;
    const normalizedQuery = searchQuery.trim();
    const abortController = new AbortController();
    let isCancelled = false;

    const debounceTimer = window.setTimeout(async () => {
      let profileQuery = supabase.from("profiles").select("id, username, display_name, avatar_url").neq("id", currentUserId).order("display_name", { ascending: true, nullsFirst: false }).order("username", { ascending: true, nullsFirst: false }).limit(10);

      if (normalizedQuery) {
        const escapedQuery = escapePostgrestIlikeValue(normalizedQuery);
        profileQuery = profileQuery.or(`username.ilike."%${escapedQuery}%",display_name.ilike."%${escapedQuery}%"`);
      }

      const { data, error } = await profileQuery.abortSignal(abortController.signal);

      if (isCancelled || requestId !== latestProfileRequestRef.current) return;

      setIsLoadingProfiles(false);

      if (error) {
        setProfiles([]);
        setErrorMessage("We couldn’t load people right now. Please try again.");
        return;
      }

      setProfiles((data ?? []) as ProfileSearchResult[]);
      setErrorMessage("");
    }, searchDebounceMs);

    return () => {
      isCancelled = true;
      window.clearTimeout(debounceTimer);
      abortController.abort();
    };
  }, [currentUserId, isOpen, searchQuery]);

  function handleSearchChange(value: string) {
    latestProfileRequestRef.current += 1;
    setSearchQuery(value);
    setErrorMessage("");
    setIsLoadingProfiles(true);
  }

  function handleRetry() {
    latestProfileRequestRef.current += 1;
    setProfiles([]);
    setCurrentUserId(null);
    setErrorMessage("");
    setIsAuthenticating(true);
    setIsLoadingProfiles(false);
    setAuthRetryKey((key) => key + 1);
  }

  function handleSelectUser(profile: ProfileSearchResult) {
    // TODO: Create or open a conversation with the selected profile.
    console.log("Selected profile for conversation:", profile);
  }

  function handleClose() {
    latestAuthRequestRef.current += 1;
    latestProfileRequestRef.current += 1;
    setSearchQuery("");
    setProfiles([]);
    setCurrentUserId(null);
    setIsAuthenticating(true);
    setIsLoadingProfiles(false);
    setErrorMessage("");
    onClose();
  }

  if (!isOpen) return null;

  const isBusy = isAuthenticating || isLoadingProfiles;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-heading/30 p-3 backdrop-blur-sm sm:p-4" onMouseDown={handleClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="new-conversation-title" className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-soft sm:max-h-[min(620px,90dvh)]" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-4 sm:gap-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <h2 id="new-conversation-title" className="text-xl font-bold tracking-tight text-heading">New conversation</h2>
            <p className="mt-1 text-sm text-body">Find another Nemissive user to message.</p>
          </div>

          <button type="button" aria-label="Close new conversation" onClick={handleClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-xl text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">×</button>
        </header>

        <div className="shrink-0 px-4 py-4 sm:px-6 sm:py-5">
          <label htmlFor="user-search" className="sr-only">Search users</label>
          <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-background px-4 focus-within:border-primary focus-within:bg-card focus-within:ring-4 focus-within:ring-accent-hover">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 shrink-0 text-muted" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-4-4" strokeLinecap="round" />
            </svg>
            <input id="user-search" type="search" value={searchQuery} onChange={(event) => handleSearchChange(event.target.value)} placeholder="Search by name or username..." autoFocus disabled={isAuthenticating || (!currentUserId && Boolean(errorMessage))} className="min-w-0 flex-1 bg-transparent py-3 text-sm text-heading outline-none placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-60" />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-3 sm:px-3 sm:pb-4">
          {isBusy ? (
            <div role="status" aria-live="polite" aria-label="Loading users" className="space-y-2 px-1 py-1">
              {[0, 1, 2].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-2xl p-3">
                  <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-accent" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-4 w-2/5 animate-pulse rounded-full bg-accent" />
                    <div className="h-3 w-3/5 animate-pulse rounded-full bg-accent" />
                  </div>
                </div>
              ))}
            </div>
          ) : errorMessage ? (
            <div role="alert" className="px-5 py-10 text-center sm:px-6 sm:py-12">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-xl font-bold text-primary" aria-hidden="true">!</div>
              <h3 className="mt-4 font-semibold text-heading">Unable to load users</h3>
              <p className="mt-2 text-sm leading-6 text-body">{errorMessage}</p>
              <button type="button" onClick={handleRetry} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Retry</button>
            </div>
          ) : profiles.length > 0 ? (
            <div className="space-y-1">
              {profiles.map((profile) => {
                const displayName = getProfileDisplayName(profile);
                const initial = displayName.charAt(0).toUpperCase();

                return (
                  <button key={profile.id} type="button" onClick={() => handleSelectUser(profile)} disabled={isBusy} className="flex w-full min-w-0 items-center gap-3 rounded-2xl p-3 text-left transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-60">
                    {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="h-12 w-12 shrink-0 rounded-full bg-accent object-cover" /> : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent font-bold text-primary">{initial}</div>}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-heading">{displayName}</p>
                      {profile.username && <p className="mt-0.5 truncate text-sm text-body">@{profile.username}</p>}
                    </div>
                    <span aria-hidden="true" className="shrink-0 text-xl text-muted">›</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="px-5 py-10 text-center sm:px-6 sm:py-12">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-primary" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-4-4" strokeLinecap="round" />
                </svg>
              </div>
              <h3 className="mt-4 font-semibold text-heading">No users found</h3>
              <p className="mt-1 text-sm leading-6 text-body">{searchQuery.trim() ? "Try searching with another name or username." : "No other registered users are available yet."}</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default NewConversationModal;
