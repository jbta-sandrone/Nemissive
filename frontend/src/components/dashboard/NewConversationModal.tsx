import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { supabase } from "../../lib/supabase";
import type { CreateConversationRequestResult, PendingOutgoingRequest, ProfileSearchResult, SelectedConversation } from "../../types/conversations";
import ProfileAvatar from "./ProfileAvatar";
import { getProfileDisplayName } from "./profileUtils";

type NewConversationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConversationReady: (conversation: SelectedConversation) => void;
  onPendingRequest: (request: PendingOutgoingRequest) => void;
  onOpenRequests: () => void;
};

type ModalStep = "search" | "compose" | "success";
type RequestOutcome = "sent" | "outgoing_pending" | "incoming_pending" | null;

const searchDebounceMs = 350;
const introductionMaxLength = 500;

function escapePostgrestIlikeValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/%/g, "\\%").replace(/_/g, "\\_").replace(/\*/g, "\\*");
}

function NewConversationModal({ isOpen, onClose, onConversationReady, onPendingRequest, onOpenRequests }: NewConversationModalProps) {
  const shouldReduceMotion = useReducedMotion();
  const latestAuthRequestRef = useRef(0);
  const latestProfileRequestRef = useRef(0);
  const isSubmittingRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const introductionRef = useRef<HTMLTextAreaElement>(null);
  const [step, setStep] = useState<ModalStep>("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [profiles, setProfiles] = useState<ProfileSearchResult[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<ProfileSearchResult | null>(null);
  const [introduction, setIntroduction] = useState("");
  const [requestOutcome, setRequestOutcome] = useState<RequestOutcome>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [composerError, setComposerError] = useState("");
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
        setSearchError("Your session has expired. Please sign in again, then retry.");
        return;
      }

      setCurrentUserId(data.user.id);
      setSearchError("");
      setIsLoadingProfiles(true);
    }

    void loadCurrentUser();

    return () => {
      isCancelled = true;
    };
  }, [authRetryKey, isOpen]);

  useEffect(() => {
    if (!isOpen || !currentUserId || step !== "search") return;

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
        setSearchError("We couldn’t load people right now. Please try again.");
        return;
      }

      setProfiles((data ?? []) as ProfileSearchResult[]);
      setSearchError("");
    }, searchDebounceMs);

    return () => {
      isCancelled = true;
      window.clearTimeout(debounceTimer);
      abortController.abort();
    };
  }, [currentUserId, isOpen, searchQuery, step]);

  useEffect(() => {
    if (!isOpen) return;

    const frameId = window.requestAnimationFrame(() => {
      if (step === "compose") introductionRef.current?.focus();
      if (step === "search") searchInputRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [isOpen, step]);

  function resetModalState() {
    latestAuthRequestRef.current += 1;
    latestProfileRequestRef.current += 1;
    isSubmittingRef.current = false;
    setStep("search");
    setSearchQuery("");
    setProfiles([]);
    setSelectedProfile(null);
    setIntroduction("");
    setRequestOutcome(null);
    setCurrentUserId(null);
    setIsAuthenticating(true);
    setIsLoadingProfiles(false);
    setIsSending(false);
    setSearchError("");
    setComposerError("");
  }

  function handleClose() {
    if (isSending) return;
    resetModalState();
    onClose();
  }

  function handleSearchChange(value: string) {
    latestProfileRequestRef.current += 1;
    setSearchQuery(value);
    setSearchError("");
    setIsLoadingProfiles(true);
  }

  function handleRetrySearch() {
    latestProfileRequestRef.current += 1;
    setProfiles([]);
    setCurrentUserId(null);
    setSearchError("");
    setIsAuthenticating(true);
    setIsLoadingProfiles(false);
    setAuthRetryKey((key) => key + 1);
  }

  function handleSelectProfile(profile: ProfileSearchResult) {
    setSelectedProfile(profile);
    setIntroduction("");
    setComposerError("");
    setStep("compose");
  }

  function handleBackToSearch() {
    if (isSending) return;
    setSelectedProfile(null);
    setIntroduction("");
    setComposerError("");
    setStep("search");
    setIsLoadingProfiles(true);
  }

  async function handleSendRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedProfile || isSubmittingRef.current) return;

    const trimmedIntroduction = introduction.trim();

    if (!trimmedIntroduction) {
      setComposerError("Write a short introduction before sending your request.");
      introductionRef.current?.focus();
      return;
    }

    if (trimmedIntroduction.length > introductionMaxLength) {
      setComposerError(`Keep your introduction to ${introductionMaxLength} characters or fewer.`);
      introductionRef.current?.focus();
      return;
    }

    isSubmittingRef.current = true;
    setIsSending(true);
    setComposerError("");

    const { data, error } = await supabase.rpc("create_conversation_request", { target_user_id: selectedProfile.id, introduction_text: trimmedIntroduction });

    isSubmittingRef.current = false;
    setIsSending(false);

    if (error) {
      if (import.meta.env.DEV) console.error("create_conversation_request failed", error);
      setComposerError("We couldn’t send your request. Check your connection and try again.");
      return;
    }

    const result = data as unknown as CreateConversationRequestResult | null;

    if (!result) {
      setComposerError("We couldn’t confirm your request. Please try again.");
      return;
    }

    if (result.request_direction === "existing_conversation" && result.conversation_id) {
      const conversation: SelectedConversation = { id: result.conversation_id, otherProfile: selectedProfile };
      resetModalState();
      onClose();
      onConversationReady(conversation);
      return;
    }

    if (result.request_direction === "incoming") {
      setRequestOutcome("incoming_pending");
      setStep("success");
      return;
    }

    if (result.request_direction === "outgoing" && result.request_id) {
      const pendingRequest: PendingOutgoingRequest = {
        requestId: result.request_id,
        otherProfile: selectedProfile,
        introduction: result.introduction ?? trimmedIntroduction,
        createdAt: result.created_at ?? undefined,
      };

      onPendingRequest(pendingRequest);
      setRequestOutcome(result.created_new ? "sent" : "outgoing_pending");
      setStep("success");
      return;
    }

    setComposerError("We couldn’t understand the request status. Please retry.");
  }

  function handleOpenRequests() {
    resetModalState();
    onClose();
    onOpenRequests();
  }

  if (!isOpen) return null;

  const isSearchBusy = isAuthenticating || isLoadingProfiles;
  const transition = shouldReduceMotion ? { duration: 0 } : { duration: 0.24, ease: [0.22, 1, 0.36, 1] as const };
  const title = step === "search" ? "New conversation" : step === "compose" ? "Start a conversation" : requestOutcome === "incoming_pending" ? "Request waiting" : requestOutcome === "outgoing_pending" ? "Request already pending" : "Request sent";
  const subtitle = step === "search" ? "Find another Nemissive user to message." : step === "compose" ? "Send one introduction with your request." : "We’ll keep things calm until they respond.";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-heading/30 p-3 backdrop-blur-sm sm:p-4" onMouseDown={handleClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="new-conversation-title" aria-busy={isSending} className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-soft sm:max-h-[min(680px,92dvh)]" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-4 sm:gap-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <h2 id="new-conversation-title" className="text-xl font-bold tracking-tight text-heading">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-body">{subtitle}</p>
          </div>
          <button type="button" aria-label="Close new conversation" onClick={handleClose} disabled={isSending} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-xl text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-50">×</button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <AnimatePresence mode="wait" initial={false}>
            {step === "search" && (
              <motion.div key="search" initial={{ opacity: 0, x: shouldReduceMotion ? 0 : -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: shouldReduceMotion ? 0 : -12 }} transition={transition}>
                <div className="shrink-0 px-4 py-4 sm:px-6 sm:py-5">
                  <label htmlFor="user-search" className="sr-only">Search users</label>
                  <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-background px-4 focus-within:border-primary focus-within:bg-card focus-within:ring-4 focus-within:ring-accent-hover">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 shrink-0 text-muted" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" strokeLinecap="round" /></svg>
                    <input ref={searchInputRef} id="user-search" type="search" value={searchQuery} onChange={(event) => handleSearchChange(event.target.value)} placeholder="Search by name or username..." disabled={isAuthenticating || (!currentUserId && Boolean(searchError))} className="min-w-0 flex-1 bg-transparent py-3 text-sm text-heading outline-none placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-60" />
                  </div>
                </div>

                <div className="px-2 pb-3 sm:px-3 sm:pb-4">
                  {isSearchBusy ? (
                    <div role="status" aria-live="polite" aria-label="Loading users" className="space-y-2 px-1 py-1">{[0, 1, 2].map((item) => <div key={item} className="flex items-center gap-3 rounded-2xl p-3"><div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-accent" /><div className="min-w-0 flex-1 space-y-2"><div className="h-4 w-2/5 animate-pulse rounded-full bg-accent" /><div className="h-3 w-3/5 animate-pulse rounded-full bg-accent" /></div></div>)}</div>
                  ) : searchError ? (
                    <div role="alert" className="px-5 py-10 text-center sm:px-6 sm:py-12"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-xl font-bold text-primary" aria-hidden="true">!</div><h3 className="mt-4 font-semibold text-heading">Unable to load users</h3><p className="mt-2 text-sm leading-6 text-body">{searchError}</p><button type="button" onClick={handleRetrySearch} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Retry</button></div>
                  ) : profiles.length > 0 ? (
                    <div className="space-y-1">{profiles.map((profile) => { const displayName = getProfileDisplayName(profile); return <button key={profile.id} type="button" onClick={() => handleSelectProfile(profile)} className="flex w-full min-w-0 items-center gap-3 rounded-2xl p-3 text-left transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover"><ProfileAvatar profile={profile} /><div className="min-w-0 flex-1"><p className="truncate font-semibold text-heading">{displayName}</p>{profile.username && <p className="mt-0.5 truncate text-sm text-body">@{profile.username}</p>}</div><span aria-hidden="true" className="shrink-0 text-xl text-muted">›</span></button>; })}</div>
                  ) : (
                    <div className="px-5 py-10 text-center sm:px-6 sm:py-12"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-primary" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" strokeLinecap="round" /></svg></div><h3 className="mt-4 font-semibold text-heading">No users found</h3><p className="mt-1 text-sm leading-6 text-body">{searchQuery.trim() ? "Try searching with another name or username." : "No other registered users are available yet."}</p></div>
                  )}
                </div>
              </motion.div>
            )}

            {step === "compose" && selectedProfile && (
              <motion.div key="compose" initial={{ opacity: 0, x: shouldReduceMotion ? 0 : 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: shouldReduceMotion ? 0 : -12 }} transition={transition} className="p-4 sm:p-6">
                <div className="flex min-w-0 items-center gap-4 rounded-3xl border border-border bg-background p-4"><ProfileAvatar profile={selectedProfile} size="lg" /><div className="min-w-0"><p className="truncate text-lg font-semibold text-heading">{getProfileDisplayName(selectedProfile)}</p>{selectedProfile.username && <p className="mt-1 truncate text-sm text-body">@{selectedProfile.username}</p>}</div></div>
                <p className="mt-5 text-sm leading-6 text-body">Introduce yourself. You can continue messaging after they accept.</p>
                <form onSubmit={handleSendRequest} aria-busy={isSending} className="mt-5">
                  <label htmlFor="conversation-introduction" className="mb-2 block text-sm font-semibold text-heading">Introductory message</label>
                  <textarea ref={introductionRef} id="conversation-introduction" value={introduction} onChange={(event) => { setIntroduction(event.target.value); setComposerError(""); }} maxLength={introductionMaxLength} rows={5} disabled={isSending} aria-invalid={Boolean(composerError)} aria-describedby={composerError ? "conversation-introduction-error" : "conversation-introduction-count"} placeholder="Say hello and share why you’d like to connect..." className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm leading-6 text-heading outline-none transition placeholder:text-muted focus:border-primary focus:bg-card focus:ring-4 focus:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-60" />
                  <div className="mt-2 flex items-start justify-between gap-4"><div className="min-w-0 flex-1">{composerError && <p id="conversation-introduction-error" role="alert" className="text-sm font-medium leading-5 text-primary">{composerError}</p>}</div><p id="conversation-introduction-count" className="shrink-0 text-xs text-muted">{introduction.length}/{introductionMaxLength}</p></div>
                  <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onClick={handleBackToSearch} disabled={isSending} className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-heading transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-50">Back</button><button type="submit" disabled={isSending} className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-60">{isSending ? "Sending request..." : "Send request"}</button></div>
                </form>
              </motion.div>
            )}

            {step === "success" && selectedProfile && (
              <motion.div key="success" initial={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={transition} className="px-5 py-10 text-center sm:px-8 sm:py-12">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-accent text-2xl font-bold text-primary shadow-soft" aria-hidden="true">{requestOutcome === "incoming_pending" ? "↙" : "✓"}</div>
                <h3 className="mt-5 text-xl font-bold tracking-tight text-heading">{title}</h3>
                <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-body">{requestOutcome === "incoming_pending" ? "This person has already sent you a request." : requestOutcome === "outgoing_pending" ? "Your earlier request is still waiting for their response." : "You can continue the conversation after they accept."}</p>
                <div className="mx-auto mt-5 flex max-w-sm items-center justify-center gap-3 rounded-2xl bg-background p-3"><ProfileAvatar profile={selectedProfile} size="sm" /><div className="min-w-0 text-left"><p className="truncate text-sm font-semibold text-heading">{getProfileDisplayName(selectedProfile)}</p>{selectedProfile.username && <p className="truncate text-xs text-muted">@{selectedProfile.username}</p>}</div></div>
                {requestOutcome === "incoming_pending" ? <button type="button" onClick={handleOpenRequests} className="mt-6 inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Open Message Requests</button> : <button type="button" onClick={handleClose} className="mt-6 inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary px-6 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Done</button>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>
    </div>
  );
}

export default NewConversationModal;
