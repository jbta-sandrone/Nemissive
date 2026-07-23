import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { CreateConversationRequestResult, PendingOutgoingRequest, ProfileRelationship, ProfileSearchResult, SelectedConversation } from "../../types/conversations";
import ProfileAvatar from "./ProfileAvatar";
import { getProfileDisplayName } from "./profileUtils";

type NewConversationModalProps = {
  isOpen: boolean;
  currentUserId: string | null;
  isAccountResolved: boolean;
  accountError: string;
  relationshipsByProfileId: ReadonlyMap<string, ProfileRelationship>;
  isRelationshipsLoading: boolean;
  relationshipsError: string;
  onClose: () => void;
  onConversationSelected: (conversation: SelectedConversation) => void;
  onPendingRequestSelected: (request: PendingOutgoingRequest) => void;
  onRequestCreated: (request: PendingOutgoingRequest) => void;
  onOpenIncomingRequests: () => void;
  onRefreshRelationships: () => void;
};

type ModalStep = "search" | "compose" | "success";
type RequestOutcome = "sent" | "outgoing_pending" | "incoming_pending" | null;

const searchDebounceMs = 350;
const introductionMaxLength = 500;

function escapePostgrestIlikeValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/%/g, "\\%").replace(/_/g, "\\_").replace(/\*/g, "\\*");
}

function NewConversationModal({ isOpen, currentUserId, isAccountResolved, accountError, relationshipsByProfileId, isRelationshipsLoading, relationshipsError, onClose, onConversationSelected, onPendingRequestSelected, onRequestCreated, onOpenIncomingRequests, onRefreshRelationships }: NewConversationModalProps) {
  const shouldReduceMotion = useReducedMotion();
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
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [hasLoadedProfiles, setHasLoadedProfiles] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [composerError, setComposerError] = useState("");
  const [profileRetryKey, setProfileRetryKey] = useState(0);

  useEffect(() => {
    if (!isOpen || !currentUserId || !isAccountResolved || accountError || isRelationshipsLoading || relationshipsError || step !== "search") return;

    const requestId = ++latestProfileRequestRef.current;
    const normalizedQuery = searchQuery.trim();
    const abortController = new AbortController();
    let isCancelled = false;

    const debounceTimer = window.setTimeout(async () => {
      setIsLoadingProfiles(true);
      setProfileError("");
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
        setHasLoadedProfiles(true);
        setProfileError("We couldn’t load people right now. Please try again.");
        if (import.meta.env.DEV) console.error("Loading profiles for a new conversation failed", error);
        return;
      }

      setProfiles((data ?? []) as ProfileSearchResult[]);
      setHasLoadedProfiles(true);
      setProfileError("");
    }, searchDebounceMs);

    return () => {
      isCancelled = true;
      window.clearTimeout(debounceTimer);
      abortController.abort();
    };
  }, [accountError, currentUserId, isAccountResolved, isOpen, isRelationshipsLoading, profileRetryKey, relationshipsError, searchQuery, step]);

  useEffect(() => {
    if (!isOpen) return;

    const frameId = window.requestAnimationFrame(() => {
      if (step === "compose") introductionRef.current?.focus();
      if (step === "search") searchInputRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [isOpen, step]);

  function resetModalState() {
    latestProfileRequestRef.current += 1;
    isSubmittingRef.current = false;
    setStep("search");
    setSearchQuery("");
    setProfiles([]);
    setSelectedProfile(null);
    setIntroduction("");
    setRequestOutcome(null);
    setIsLoadingProfiles(false);
    setHasLoadedProfiles(false);
    setIsSending(false);
    setProfileError("");
    setComposerError("");
  }

  function closeAndReset() {
    resetModalState();
    onClose();
  }

  function handleClose() {
    if (!isSending) closeAndReset();
  }

  function handleSearchChange(value: string) {
    latestProfileRequestRef.current += 1;
    setSearchQuery(value);
    setProfileError("");
    setIsLoadingProfiles(true);
    setHasLoadedProfiles(false);
  }

  function handleRetrySearch() {
    latestProfileRequestRef.current += 1;
    setProfiles([]);
    setProfileError("");
    setIsLoadingProfiles(false);
    setHasLoadedProfiles(false);
    setProfileRetryKey((key) => key + 1);
    onRefreshRelationships();
  }

  function getRelationship(profileId: string): ProfileRelationship {
    return relationshipsByProfileId.get(profileId) ?? { state: "none" };
  }

  function handleRelationshipAction(profile: ProfileSearchResult, relationship: ProfileRelationship) {
    if (relationship.state === "none") {
      setSelectedProfile(profile);
      setIntroduction("");
      setComposerError("");
      setStep("compose");
      return;
    }

    closeAndReset();

    if (relationship.state === "outgoing_pending") {
      onPendingRequestSelected(relationship.request);
      return;
    }

    if (relationship.state === "incoming_pending") {
      onOpenIncomingRequests();
      return;
    }

    onConversationSelected(relationship.conversation);
  }

  function handleBackToSearch() {
    if (isSending) return;
    setSelectedProfile(null);
    setIntroduction("");
    setComposerError("");
    setStep("search");
    setIsLoadingProfiles(true);
    setHasLoadedProfiles(false);
  }

  async function handleSendRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedProfile || isSubmittingRef.current) return;

    const currentRelationship = getRelationship(selectedProfile.id);
    if (currentRelationship.state !== "none") {
      handleRelationshipAction(selectedProfile, currentRelationship);
      return;
    }

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
      setComposerError("We couldn’t send your request. The relationship may have changed, or you may be offline. Return to search and refresh to check.");
      return;
    }

    const result = data as unknown as CreateConversationRequestResult | null;

    if (!result) {
      setComposerError("We couldn’t confirm your request. Please try again.");
      return;
    }

    if (result.request_direction === "existing_conversation" && result.conversation_id) {
      closeAndReset();
      onRefreshRelationships();
      onConversationSelected({ id: result.conversation_id, otherProfile: selectedProfile });
      return;
    }

    if (result.request_direction === "incoming") {
      onRefreshRelationships();
      setRequestOutcome("incoming_pending");
      setStep("success");
      return;
    }

    if (result.request_direction === "outgoing" && result.request_id) {
      const pendingRequest: PendingOutgoingRequest = {
        kind: "pending",
        requestId: result.request_id,
        otherProfile: selectedProfile,
        introduction: result.introduction ?? trimmedIntroduction,
        createdAt: result.created_at ?? new Date().toISOString(),
        status: "pending",
        conversationId: result.conversation_id,
      };

      onRequestCreated(pendingRequest);
      setRequestOutcome(result.created_new ? "sent" : "outgoing_pending");
      setStep("success");
      return;
    }

    setComposerError("We couldn’t understand the request status. Please refresh and try again.");
  }

  function handleOpenRequests() {
    closeAndReset();
    onOpenIncomingRequests();
  }

  if (!isOpen) return null;

  const effectiveError = accountError || relationshipsError || profileError || (isAccountResolved && !currentUserId ? "Your session has expired. Please sign in again." : "");
  const isSearchBusy = !isAccountResolved || isRelationshipsLoading || isLoadingProfiles || (!effectiveError && !hasLoadedProfiles);
  const transition = shouldReduceMotion ? { duration: 0 } : { duration: 0.24, ease: [0.22, 1, 0.36, 1] as const };
  const title = step === "search" ? "New conversation" : step === "compose" ? "Start a conversation" : requestOutcome === "incoming_pending" ? "Request waiting" : requestOutcome === "outgoing_pending" ? "Request already pending" : "Request sent";
  const subtitle = step === "search" ? "Find another Nemissive user to message." : step === "compose" ? "Send one introduction with your request." : "We’ll keep things calm until they respond.";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-heading/30 p-3 backdrop-blur-sm sm:p-4" onMouseDown={handleClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="new-conversation-title" aria-busy={isSending || isSearchBusy} className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-soft sm:max-h-[min(680px,92dvh)]" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-4 sm:gap-4 sm:px-6 sm:py-5">
          <div className="min-w-0"><h2 id="new-conversation-title" className="text-xl font-bold tracking-tight text-heading">{title}</h2><p className="mt-1 text-sm leading-6 text-body">{subtitle}</p></div>
          <button type="button" aria-label="Close new conversation" onClick={handleClose} disabled={isSending} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-50"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" /></svg></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <AnimatePresence mode="wait" initial={false}>
            {step === "search" && (
              <motion.div key="search" initial={{ opacity: 0, x: shouldReduceMotion ? 0 : -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: shouldReduceMotion ? 0 : -12 }} transition={transition}>
                <div className="shrink-0 px-4 py-4 sm:px-6 sm:py-5"><label htmlFor="user-search" className="sr-only">Search users</label><div className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-background px-4 focus-within:border-primary focus-within:bg-card focus-within:ring-4 focus-within:ring-accent-hover"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 shrink-0 text-muted" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" strokeLinecap="round" /></svg><input ref={searchInputRef} id="user-search" type="search" value={searchQuery} onChange={(event) => handleSearchChange(event.target.value)} placeholder="Search by name or username..." disabled={!currentUserId || Boolean(effectiveError)} className="min-w-0 flex-1 bg-transparent py-3 text-sm text-heading outline-none placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-60" /></div></div>

                <div className="px-2 pb-3 sm:px-3 sm:pb-4">
                  {isSearchBusy ? (
                    <div role="status" aria-live="polite" aria-label="Loading users and relationship status" className="space-y-2 px-1 py-1">{[0, 1, 2].map((item) => <div key={item} className="flex items-center gap-3 rounded-2xl p-3"><div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-accent" /><div className="min-w-0 flex-1 space-y-2"><div className="h-4 w-2/5 animate-pulse rounded-full bg-accent" /><div className="h-3 w-3/5 animate-pulse rounded-full bg-accent" /></div></div>)}</div>
                  ) : effectiveError ? (
                    <div role="alert" className="px-5 py-10 text-center sm:px-6 sm:py-12"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-xl font-bold text-primary" aria-hidden="true">!</div><h3 className="mt-4 font-semibold text-heading">Unable to load users</h3><p className="mt-2 text-sm leading-6 text-body">{effectiveError}</p><button type="button" onClick={handleRetrySearch} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Retry</button></div>
                  ) : profiles.length > 0 ? (
                    <motion.div layout={!shouldReduceMotion} className="space-y-1">{profiles.map((profile) => { const displayName = getProfileDisplayName(profile); const relationship = getRelationship(profile.id); const status = relationship.state === "outgoing_pending" ? "Request pending" : relationship.state === "incoming_pending" ? "Sent you a request" : relationship.state === "accepted" ? "Already in your messages" : null; const action = relationship.state === "outgoing_pending" ? "Open pending request" : relationship.state === "incoming_pending" ? "View request" : relationship.state === "accepted" ? "Open conversation" : null; return <motion.button layout={!shouldReduceMotion} key={profile.id} type="button" onClick={() => handleRelationshipAction(profile, relationship)} aria-label={action ? `${action} for ${displayName}. ${status}.` : `Start a conversation with ${displayName}`} className="flex min-h-16 w-full min-w-0 items-center gap-3 rounded-2xl p-3 text-left transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover"><ProfileAvatar profile={profile} /><div className="min-w-0 flex-1"><p className="truncate font-semibold text-heading">{displayName}</p>{profile.username && <p className="mt-0.5 truncate text-sm text-body">@{profile.username}</p>}{status && <p className="mt-1 text-xs font-semibold text-primary">{status}</p>}</div>{action ? <span className="max-w-24 shrink-0 text-right text-xs font-semibold leading-5 text-primary">{action}</span> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 shrink-0 text-muted" aria-hidden="true"><path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>}</motion.button>; })}</motion.div>
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
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-accent text-primary shadow-soft" aria-hidden="true">{requestOutcome === "incoming_pending" ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7"><path d="M5 7h14v10H8l-3 2V7Z" strokeLinejoin="round" /><path d="m9 10 3 2 3-2" strokeLinecap="round" /></svg> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-7 w-7"><path d="m6 12 4 4 8-9" strokeLinecap="round" strokeLinejoin="round" /></svg>}</div>
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
