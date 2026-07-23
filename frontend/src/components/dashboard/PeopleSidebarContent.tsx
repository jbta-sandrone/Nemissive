import { useMemo, useState } from "react";
import type { AcceptedConversationItem, SelectedConversation } from "../../types/conversations";
import ProfileAvatar from "./ProfileAvatar";
import { getProfileDisplayName } from "./profileUtils";

type PeopleSidebarContentProps = {
  conversations: AcceptedConversationItem[];
  isLoading: boolean;
  errorMessage: string;
  selectedConversationId: string | null;
  onRefresh: () => void;
  onConversationReady: (conversation: SelectedConversation) => void;
  onStartConversation: () => void;
};

function PeopleSidebarContent({ conversations, isLoading, errorMessage, selectedConversationId, onRefresh, onConversationReady, onStartConversation }: PeopleSidebarContentProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const people = useMemo(() => {
    const peopleByUserId = new Map<string, AcceptedConversationItem>();
    conversations.forEach((conversation) => {
      if (!peopleByUserId.has(conversation.otherProfile.id)) peopleByUserId.set(conversation.otherProfile.id, conversation);
    });
    return [...peopleByUserId.values()].sort((first, second) => getProfileDisplayName(first.otherProfile).localeCompare(getProfileDisplayName(second.otherProfile), undefined, { sensitivity: "base" }));
  }, [conversations]);
  const filteredPeople = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
    if (!normalizedQuery) return people;
    return people.filter(({ otherProfile }) => getProfileDisplayName(otherProfile).toLocaleLowerCase().includes(normalizedQuery) || otherProfile.username?.toLocaleLowerCase().includes(normalizedQuery));
  }, [people, searchQuery]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 px-5 pb-4 pt-6 sm:px-6 sm:pt-7 md:px-5 lg:px-6"><h1 className="text-2xl font-bold tracking-tight text-heading">People</h1><p className="mt-2 text-sm leading-6 text-body">People from your accepted conversations.</p></header>
      <div className="shrink-0 px-4 pb-4 sm:px-5"><label htmlFor="people-search" className="sr-only">Search people in your conversations</label><div className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-background px-4 focus-within:border-primary focus-within:ring-4 focus-within:ring-accent-hover"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 shrink-0 text-muted" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" strokeLinecap="round" /></svg><input id="people-search" type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search your people..." disabled={isLoading || Boolean(errorMessage)} className="min-w-0 flex-1 bg-transparent py-3 text-sm text-heading outline-none placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-60" /></div></div>

      <div aria-busy={isLoading} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-4 sm:px-4">
        {isLoading ? (
          <div role="status" aria-live="polite" aria-label="Loading people" className="space-y-2">{[0, 1, 2].map((item) => <div key={item} className="flex items-center gap-3 rounded-2xl p-3"><div className="h-12 w-12 animate-pulse rounded-full bg-accent" /><div className="min-w-0 flex-1 space-y-2"><div className="h-4 w-2/5 animate-pulse rounded-full bg-accent" /><div className="h-3 w-1/3 animate-pulse rounded-full bg-accent" /></div></div>)}</div>
        ) : errorMessage ? (
          <div role="alert" className="px-4 py-10 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-xl font-bold text-primary" aria-hidden="true">!</div><h2 className="mt-4 font-semibold text-heading">Unable to load people</h2><p className="mt-2 text-sm leading-6 text-body">{errorMessage}</p><button type="button" onClick={onRefresh} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Retry</button></div>
        ) : people.length === 0 ? (
          <div className="px-4 py-10 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-primary" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.25" /><path d="M3.5 18c.5-3.2 2.4-4.8 5.5-4.8s5 1.6 5.5 4.8M14.5 14c2.9-.4 4.8.9 5.7 3.8" strokeLinecap="round" /></svg></div><h2 className="mt-4 font-semibold text-heading">Your people will appear here</h2><p className="mt-2 text-sm leading-6 text-body">Once a conversation request is accepted, you can reopen that conversation from this list.</p><button type="button" onClick={onStartConversation} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Start Conversation</button></div>
        ) : filteredPeople.length === 0 ? (
          <div className="px-4 py-10 text-center"><h2 className="font-semibold text-heading">No matching people</h2><p className="mt-2 text-sm leading-6 text-body">Try another name or username.</p></div>
        ) : (
          <div className="space-y-1">{filteredPeople.map((conversation) => { const profile = conversation.otherProfile; const isSelected = selectedConversationId === conversation.conversationId; return <button key={profile.id} type="button" onClick={() => onConversationReady({ id: conversation.conversationId, otherProfile: profile })} aria-current={isSelected ? "true" : undefined} className={`flex w-full min-w-0 items-center gap-3 rounded-2xl p-3 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover ${isSelected ? "bg-accent shadow-soft" : "hover:bg-accent"}`}><ProfileAvatar profile={profile} /><div className="min-w-0 flex-1"><p className="truncate font-semibold text-heading">{getProfileDisplayName(profile)}</p><p className="mt-0.5 truncate text-sm text-body">{profile.username ? `@${profile.username}` : "Nemissive member"}</p></div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 shrink-0 text-muted" aria-hidden="true"><path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg></button>; })}</div>
        )}
      </div>
    </div>
  );
}

export default PeopleSidebarContent;
