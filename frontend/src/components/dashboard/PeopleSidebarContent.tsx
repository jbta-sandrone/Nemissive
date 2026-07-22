import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { ProfileSearchResult, SelectedConversation } from "../../types/conversations";
import ProfileAvatar from "./ProfileAvatar";
import { getProfileDisplayName } from "./profileUtils";

type PeopleSidebarContentProps = {
  currentUserId: string | null;
  isAccountResolved: boolean;
  onConversationReady: (conversation: SelectedConversation) => void;
  onStartConversation: () => void;
};

type InteractedPerson = {
  conversationId: string;
  profile: ProfileSearchResult;
};

type ConversationMembershipRow = { conversation_id: string };
type ConversationRow = { id: string };
type ParticipantRow = { conversation_id: string; user_id: string };

function PeopleSidebarContent({ currentUserId, isAccountResolved, onConversationReady, onStartConversation }: PeopleSidebarContentProps) {
  const latestLoadRef = useRef(0);
  const [people, setPeople] = useState<InteractedPerson[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!currentUserId) return;

    const loadId = ++latestLoadRef.current;
    const abortController = new AbortController();
    let isCancelled = false;

    async function loadPeople() {
      setIsLoading(true);
      setErrorMessage("");

      const { data: membershipData, error: membershipError } = await supabase.from("conversation_participants").select("conversation_id").eq("user_id", currentUserId).abortSignal(abortController.signal);

      if (isCancelled || loadId !== latestLoadRef.current) return;
      if (membershipError) {
        setIsLoading(false);
        setErrorMessage("We couldn’t load your conversations. Please try again.");
        if (import.meta.env.DEV) console.error("Loading conversation memberships failed", membershipError);
        return;
      }

      const conversationIds = [...new Set(((membershipData ?? []) as ConversationMembershipRow[]).map((row) => row.conversation_id))];
      if (conversationIds.length === 0) {
        setPeople([]);
        setIsLoading(false);
        return;
      }

      const { data: conversationData, error: conversationError } = await supabase.from("conversations").select("id").in("id", conversationIds).eq("conversation_type", "direct").abortSignal(abortController.signal);

      if (isCancelled || loadId !== latestLoadRef.current) return;
      if (conversationError) {
        setIsLoading(false);
        setErrorMessage("We couldn’t load your accepted conversations. Please retry.");
        if (import.meta.env.DEV) console.error("Loading direct conversations failed", conversationError);
        return;
      }

      const directConversationIds = ((conversationData ?? []) as ConversationRow[]).map((conversation) => conversation.id);
      if (directConversationIds.length === 0) {
        setPeople([]);
        setIsLoading(false);
        return;
      }

      const { data: participantData, error: participantError } = await supabase.from("conversation_participants").select("conversation_id, user_id").in("conversation_id", directConversationIds).neq("user_id", currentUserId).abortSignal(abortController.signal);

      if (isCancelled || loadId !== latestLoadRef.current) return;
      if (participantError) {
        setIsLoading(false);
        setErrorMessage("We couldn’t load the people in your conversations. Please retry.");
        if (import.meta.env.DEV) console.error("Loading conversation participants failed", participantError);
        return;
      }

      const participantRows = (participantData ?? []) as ParticipantRow[];
      const otherUserIds = [...new Set(participantRows.map((participant) => participant.user_id))];
      if (otherUserIds.length === 0) {
        setPeople([]);
        setIsLoading(false);
        return;
      }

      const { data: profileData, error: profileError } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", otherUserIds).abortSignal(abortController.signal);

      if (isCancelled || loadId !== latestLoadRef.current) return;
      if (profileError) {
        setIsLoading(false);
        setErrorMessage("We couldn’t load your conversation profiles. Please retry.");
        if (import.meta.env.DEV) console.error("Loading interacted profiles failed", profileError);
        return;
      }

      const profileById = new Map(((profileData ?? []) as ProfileSearchResult[]).map((profile) => [profile.id, profile]));
      const peopleByUserId = new Map<string, InteractedPerson>();

      participantRows.forEach((participant) => {
        const profile = profileById.get(participant.user_id);
        if (profile && !peopleByUserId.has(participant.user_id)) peopleByUserId.set(participant.user_id, { conversationId: participant.conversation_id, profile });
      });

      const nextPeople = [...peopleByUserId.values()].sort((first, second) => getProfileDisplayName(first.profile).localeCompare(getProfileDisplayName(second.profile), undefined, { sensitivity: "base" }));
      setPeople(nextPeople);
      setIsLoading(false);
      setErrorMessage("");
    }

    void loadPeople();

    return () => {
      isCancelled = true;
      abortController.abort();
    };
  }, [currentUserId, isAccountResolved, retryKey]);

  const filteredPeople = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
    if (!normalizedQuery) return people;
    return people.filter(({ profile }) => getProfileDisplayName(profile).toLocaleLowerCase().includes(normalizedQuery) || profile.username?.toLocaleLowerCase().includes(normalizedQuery));
  }, [people, searchQuery]);

  function handleRetry() {
    latestLoadRef.current += 1;
    setRetryKey((key) => key + 1);
  }

  const effectiveIsLoading = currentUserId ? isLoading : !isAccountResolved;
  const effectiveErrorMessage = currentUserId ? errorMessage : isAccountResolved ? "Your session has expired. Please sign in again." : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 px-5 pb-4 pt-6 sm:px-6 sm:pt-7 md:px-5 lg:px-6"><h1 className="text-2xl font-bold tracking-tight text-heading">People</h1><p className="mt-2 text-sm leading-6 text-body">People from your accepted conversations.</p></header>
      <div className="shrink-0 px-4 pb-4 sm:px-5"><label htmlFor="people-search" className="sr-only">Search people in your conversations</label><div className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-background px-4 focus-within:border-primary focus-within:ring-4 focus-within:ring-accent-hover"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 shrink-0 text-muted" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" strokeLinecap="round" /></svg><input id="people-search" type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search your people..." disabled={effectiveIsLoading || Boolean(effectiveErrorMessage)} className="min-w-0 flex-1 bg-transparent py-3 text-sm text-heading outline-none placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-60" /></div></div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-4 sm:px-4">
        {effectiveIsLoading ? (
          <div role="status" aria-live="polite" aria-label="Loading people" className="space-y-2">{[0, 1, 2].map((item) => <div key={item} className="flex items-center gap-3 rounded-2xl p-3"><div className="h-12 w-12 animate-pulse rounded-full bg-accent" /><div className="min-w-0 flex-1 space-y-2"><div className="h-4 w-2/5 animate-pulse rounded-full bg-accent" /><div className="h-3 w-1/3 animate-pulse rounded-full bg-accent" /></div></div>)}</div>
        ) : effectiveErrorMessage ? (
          <div role="alert" className="px-4 py-10 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-xl font-bold text-primary" aria-hidden="true">!</div><h2 className="mt-4 font-semibold text-heading">Unable to load people</h2><p className="mt-2 text-sm leading-6 text-body">{effectiveErrorMessage}</p><button type="button" onClick={handleRetry} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Retry</button></div>
        ) : people.length === 0 ? (
          <div className="px-4 py-10 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-primary" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.25" /><path d="M3.5 18c.5-3.2 2.4-4.8 5.5-4.8s5 1.6 5.5 4.8M14.5 14c2.9-.4 4.8.9 5.7 3.8" strokeLinecap="round" /></svg></div><h2 className="mt-4 font-semibold text-heading">Your people will appear here</h2><p className="mt-2 text-sm leading-6 text-body">Once a conversation request is accepted, you can reopen that conversation from this list.</p><button type="button" onClick={onStartConversation} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Start Conversation</button></div>
        ) : filteredPeople.length === 0 ? (
          <div className="px-4 py-10 text-center"><h2 className="font-semibold text-heading">No matching people</h2><p className="mt-2 text-sm leading-6 text-body">Try another name or username.</p></div>
        ) : (
          <div className="space-y-1">{filteredPeople.map(({ conversationId, profile }) => <button key={profile.id} type="button" onClick={() => onConversationReady({ id: conversationId, otherProfile: profile })} className="flex w-full min-w-0 items-center gap-3 rounded-2xl p-3 text-left transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover"><ProfileAvatar profile={profile} /><div className="min-w-0 flex-1"><p className="truncate font-semibold text-heading">{getProfileDisplayName(profile)}</p><p className="mt-0.5 truncate text-sm text-body">{profile.username ? `@${profile.username}` : "Nemissive member"}</p></div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 shrink-0 text-muted" aria-hidden="true"><path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg></button>)}</div>
        )}
      </div>
    </div>
  );
}

export default PeopleSidebarContent;
