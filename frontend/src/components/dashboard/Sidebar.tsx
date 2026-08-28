import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import type { DashboardSection } from "../../types/dashboard";
import type { DashboardChatState, PendingOutgoingRequest, ProfileSearchResult, SelectedConversation } from "../../types/conversations";
import ConversationList from "./ConversationList";
import MenuSidebarContent from "./MenuSidebarContent";
import PeopleSidebarContent from "./PeopleSidebarContent";
import RequestsSidebarContent from "./RequestsSidebarContent";
import type { MessageRequestsController } from "./useMessageRequests";
import type { MessagesDataController } from "./useMessagesData";
import { UtilityShelfLauncher } from "./UtilityShelf";
import type { AccountStatus } from "./premiumAccess";

type SidebarProps = {
  activeSection: DashboardSection;
  currentProfile: ProfileSearchResult | null;
  accountStatus: AccountStatus;
  isAccountResolved: boolean;
  accountError: string;
  isCompactChatVisible: boolean;
  isDesktopCollapsed: boolean;
  requestsController: MessageRequestsController;
  messagesController: MessagesDataController;
  chatState: DashboardChatState | null;
  onlineUserIds: ReadonlySet<string>;
  quickReactions: string[];
  onSaveQuickReactions: (reactions: string[]) => Promise<boolean>;
  notificationPermission: NotificationPermission | "unsupported";
  isNotificationSupported: boolean;
  onEnableNotifications: () => Promise<string | null>;
  onSaveNotificationPreferences: (notificationsEnabled: boolean, soundEnabled: boolean) => Promise<string | null>;
  onProfileIdentityUpdated: (profile: ProfileSearchResult) => void;
  onOpenElite: (trigger: HTMLButtonElement) => void;
  onRequestSignOut: (trigger: HTMLButtonElement) => void;
  onAccountDeleted: () => void;
  onNewConversation: () => void;
  onPendingRequestSelected: (request: PendingOutgoingRequest) => void;
  onConversationReady: (conversation: SelectedConversation) => void;
  onPeopleConversationReady: (conversation: SelectedConversation) => void;
  onArchivedConversationReady: (conversation: SelectedConversation) => void;
  onConversationDeleted: (conversationId: string) => Promise<string | null>;
  isUtilityShelfOpen: boolean;
  hasGalleryUnread: boolean;
  isUtilityLauncherHidden: boolean;
  onUtilityShelfToggle: (trigger: HTMLButtonElement) => void;
};

function MessagesSidebarContent({ messagesController, chatState, onlineUserIds, onNewConversation, onPendingRequestSelected, onConversationReady, onConversationDeleted }: { messagesController: MessagesDataController; chatState: DashboardChatState | null; onlineUserIds: ReadonlySet<string>; onNewConversation: () => void; onPendingRequestSelected: (request: PendingOutgoingRequest) => void; onConversationReady: (conversation: SelectedConversation) => void; onConversationDeleted: (conversationId: string) => Promise<string | null> }) {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-start justify-between gap-4 px-5 pb-5 pt-6 sm:px-6 sm:pb-6 sm:pt-7 md:px-5 lg:px-6">
        <div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Nemissive</p><h1 className="mt-2 text-2xl font-bold tracking-tight text-heading">Messages</h1><p className="mt-2 max-w-[250px] text-sm leading-6 text-body">Made for meaningful conversations.</p></div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2"><button type="button" aria-label="Refresh messages" title="Refresh messages" onClick={messagesController.refresh} disabled={messagesController.isLoading} className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-background text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-50"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-5 w-5" aria-hidden="true"><path d="M19 8a7.5 7.5 0 1 0 .2 7.5" strokeLinecap="round" /><path d="M19 4v4h-4" strokeLinecap="round" strokeLinejoin="round" /></svg></button><button type="button" aria-label="Start a new conversation" title="New conversation" onClick={onNewConversation} className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover active:translate-y-0"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg></button></div>
      </header>
      <div className="shrink-0 px-4 pb-5 sm:px-5"><label htmlFor="conversation-search" className="sr-only">Search conversations</label><div className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-background px-4 focus-within:border-primary focus-within:ring-4 focus-within:ring-accent-hover"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 shrink-0 text-muted" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" strokeLinecap="round" /></svg><input id="conversation-search" type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search conversations..." disabled={messagesController.isLoading || Boolean(messagesController.loadError)} className="min-w-0 flex-1 bg-transparent py-3.5 text-sm text-heading outline-none placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-60" /></div></div>
      <ConversationList pendingRequests={messagesController.pendingRequests} conversations={messagesController.inboxConversations} searchQuery={searchQuery} selectedConversationId={chatState?.kind === "accepted" ? chatState.conversation.id : null} isLoading={messagesController.isLoading} loadError={messagesController.loadError} onlineUserIds={onlineUserIds} hasArchivedConversations={messagesController.archivedConversations.length > 0} onRefresh={messagesController.refresh} onStartConversation={onNewConversation} onPendingRequestSelected={onPendingRequestSelected} onConversationSelected={(conversation) => onConversationReady({ id: conversation.conversationId, otherProfile: conversation.otherProfile, otherNickname: conversation.otherNickname, themeKey: conversation.themeKey, historyClearedAt: conversation.historyClearedAt, conversationDeletedAt: conversation.conversationDeletedAt, connectionStatus: conversation.connectionStatus, iBlocked: conversation.iBlocked, interactionAllowed: conversation.interactionAllowed, messagingAvailable: conversation.messagingAvailable, requestAvailable: conversation.requestAvailable })} onConversationPinned={messagesController.setConversationPinned} onConversationArchived={messagesController.setConversationArchived} onConversationDeleted={onConversationDeleted} />
    </div>
  );
}

function ArchivedSidebarContent({ messagesController, chatState, onlineUserIds, onConversationReady, onNewConversation, onPendingRequestSelected, onConversationDeleted }: { messagesController: MessagesDataController; chatState: DashboardChatState | null; onlineUserIds: ReadonlySet<string>; onConversationReady: (conversation: SelectedConversation) => void; onNewConversation: () => void; onPendingRequestSelected: (request: PendingOutgoingRequest) => void; onConversationDeleted: (conversationId: string) => Promise<string | null> }) {
  const [searchQuery, setSearchQuery] = useState("");

  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden"><header className="flex shrink-0 items-start justify-between gap-4 px-5 pb-5 pt-6 sm:px-6 sm:pb-6 sm:pt-7 md:px-5 lg:px-6"><div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Nemissive</p><h1 className="mt-2 text-2xl font-bold tracking-tight text-heading">Archived</h1><p className="mt-2 max-w-[250px] text-sm leading-6 text-body">Conversations kept out of your inbox.</p></div><button type="button" aria-label="Refresh archived conversations" title="Refresh archived conversations" onClick={messagesController.refresh} disabled={messagesController.isLoading} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border bg-background text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-50"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-5 w-5" aria-hidden="true"><path d="M19 8a7.5 7.5 0 1 0 .2 7.5" strokeLinecap="round" /><path d="M19 4v4h-4" strokeLinecap="round" strokeLinejoin="round" /></svg></button></header><div className="shrink-0 px-4 pb-5 sm:px-5"><label htmlFor="archived-conversation-search" className="sr-only">Search archived conversations</label><div className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-background px-4 focus-within:border-primary focus-within:ring-4 focus-within:ring-accent-hover"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 shrink-0 text-muted" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" strokeLinecap="round" /></svg><input id="archived-conversation-search" type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search archived conversations..." disabled={messagesController.isLoading || Boolean(messagesController.loadError)} className="min-w-0 flex-1 bg-transparent py-3.5 text-sm text-heading outline-none placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-60" /></div></div><ConversationList pendingRequests={[]} conversations={messagesController.archivedConversations} searchQuery={searchQuery} selectedConversationId={chatState?.kind === "accepted" ? chatState.conversation.id : null} isLoading={messagesController.isLoading} loadError={messagesController.loadError} onlineUserIds={onlineUserIds} isArchivedView onRefresh={messagesController.refresh} onStartConversation={onNewConversation} onPendingRequestSelected={onPendingRequestSelected} onConversationSelected={(conversation) => onConversationReady({ id: conversation.conversationId, otherProfile: conversation.otherProfile, otherNickname: conversation.otherNickname, themeKey: conversation.themeKey, historyClearedAt: conversation.historyClearedAt, conversationDeletedAt: conversation.conversationDeletedAt, connectionStatus: conversation.connectionStatus, iBlocked: conversation.iBlocked, interactionAllowed: conversation.interactionAllowed, messagingAvailable: conversation.messagingAvailable, requestAvailable: conversation.requestAvailable })} onConversationPinned={messagesController.setConversationPinned} onConversationArchived={messagesController.setConversationArchived} onConversationDeleted={onConversationDeleted} /></div>;
}

function Sidebar({ activeSection, currentProfile, accountStatus, isAccountResolved, accountError, isCompactChatVisible, isDesktopCollapsed, requestsController, messagesController, chatState, onlineUserIds, quickReactions, onSaveQuickReactions, notificationPermission, isNotificationSupported, onEnableNotifications, onSaveNotificationPreferences, onProfileIdentityUpdated, onOpenElite, onRequestSignOut, onAccountDeleted, onNewConversation, onPendingRequestSelected, onConversationReady, onPeopleConversationReady, onArchivedConversationReady, onConversationDeleted, isUtilityShelfOpen, hasGalleryUnread, isUtilityLauncherHidden, onUtilityShelfToggle }: SidebarProps) {
  const shouldReduceMotion = useReducedMotion();
  const visibilityClasses = isCompactChatVisible ? "hidden xl:flex" : "flex";
  const desktopLayoutClasses = isDesktopCollapsed
    ? "lg:pointer-events-none lg:invisible lg:w-0 lg:min-w-0 lg:flex-none lg:border-r-0 lg:opacity-0"
    : "xl:w-80 xl:min-w-80 xl:flex-none xl:opacity-100";
  const transition = shouldReduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };
  const showsWorkspaceUtility = activeSection !== "menu" && !isDesktopCollapsed && !isUtilityLauncherHidden;

  return (
    <aside className={`${visibilityClasses} ${desktopLayoutClasses} relative min-h-0 w-full min-w-0 flex-1 shrink-0 flex-col overflow-hidden border-r border-border bg-surface transition-[width,min-width,opacity] duration-200 motion-reduce:transition-none md:h-full md:w-auto md:flex-1`}>
      {showsWorkspaceUtility && <div className="pointer-events-none absolute bottom-[max(1rem,calc(env(safe-area-inset-bottom)+0.5rem))] right-4 z-20 sm:right-5"><UtilityShelfLauncher isOpen={isUtilityShelfOpen} hasGalleryUnread={hasGalleryUnread} onToggle={onUtilityShelfToggle} className="pointer-events-auto relative" /></div>}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={activeSection} initial={{ opacity: 0, x: shouldReduceMotion ? 0 : 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: shouldReduceMotion ? 0 : -8 }} transition={transition} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {activeSection === "messages" && <MessagesSidebarContent messagesController={messagesController} chatState={chatState} onlineUserIds={onlineUserIds} onNewConversation={onNewConversation} onPendingRequestSelected={onPendingRequestSelected} onConversationReady={onConversationReady} onConversationDeleted={onConversationDeleted} />}
          {activeSection === "archived" && <ArchivedSidebarContent messagesController={messagesController} chatState={chatState} onlineUserIds={onlineUserIds} onConversationReady={onArchivedConversationReady} onNewConversation={onNewConversation} onPendingRequestSelected={onPendingRequestSelected} onConversationDeleted={onConversationDeleted} />}
          {activeSection === "people" && <PeopleSidebarContent conversations={messagesController.connectedConversations} isLoading={messagesController.isLoading} errorMessage={messagesController.loadError} selectedConversationId={chatState?.kind === "accepted" ? chatState.conversation.id : null} onlineUserIds={onlineUserIds} onRefresh={messagesController.refresh} onConversationReady={onPeopleConversationReady} onStartConversation={onNewConversation} />}
          {activeSection === "requests" && <RequestsSidebarContent requests={requestsController.requests} updates={requestsController.updates} pendingCount={requestsController.pendingCount} isLoading={requestsController.isLoading} loadError={requestsController.loadError} responseError={requestsController.responseError} statusMessage={requestsController.statusMessage} respondingRequestId={requestsController.respondingRequestId} respondingAction={requestsController.respondingAction} onRefresh={requestsController.refresh} onRespond={(request, action) => void requestsController.respond(request, action)} onDismissUpdate={requestsController.dismissUpdate} onDismissAllUpdates={requestsController.dismissAllUpdates} onConversationReady={onConversationReady} />}
          {activeSection === "menu" && <MenuSidebarContent profile={currentProfile} accountStatus={accountStatus} isAccountLoading={!isAccountResolved} accountError={accountError} quickReactions={quickReactions} onSaveQuickReactions={onSaveQuickReactions} notificationPermission={notificationPermission} isNotificationSupported={isNotificationSupported} onEnableNotifications={onEnableNotifications} onSaveNotificationPreferences={onSaveNotificationPreferences} onProfileIdentityUpdated={onProfileIdentityUpdated} onOpenElite={onOpenElite} onRequestSignOut={onRequestSignOut} onAccountDeleted={onAccountDeleted} />}
        </motion.div>
      </AnimatePresence>
    </aside>
  );
}

export default Sidebar;
