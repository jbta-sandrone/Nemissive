import { useCallback, useEffect, useState } from "react";
import ChatPanel from "../components/dashboard/ChatPanel";
import NavigationRail from "../components/dashboard/NavigationRail";
import NewConversationModal from "../components/dashboard/NewConversationModal";
import Sidebar from "../components/dashboard/Sidebar";
import useMessageRequests from "../components/dashboard/useMessageRequests";
import { supabase } from "../lib/supabase";
import type { DashboardSection } from "../types/dashboard";
import type { DashboardChatState, PendingOutgoingRequest, ProfileSearchResult, SelectedConversation } from "../types/conversations";

function DashboardPage() {
  const [activeSection, setActiveSection] = useState<DashboardSection>("messages");
  const [isNewConversationOpen, setIsNewConversationOpen] = useState(false);
  const [chatState, setChatState] = useState<DashboardChatState | null>(null);
  const [isCompactChatVisible, setIsCompactChatVisible] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentProfile, setCurrentProfile] = useState<ProfileSearchResult | null>(null);
  const [isAccountResolved, setIsAccountResolved] = useState(false);
  const [accountError, setAccountError] = useState("");

  useEffect(() => {
    const abortController = new AbortController();
    let isCancelled = false;

    async function loadAccount() {
      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (isCancelled) return;
      if (userError || !userData.user) {
        setAccountError("Your session has expired. Please sign in again.");
        setIsAccountResolved(true);
        return;
      }

      setCurrentUserId(userData.user.id);

      const { data: profileData, error: profileError } = await supabase.from("profiles").select("id, username, display_name, avatar_url").eq("id", userData.user.id).abortSignal(abortController.signal).maybeSingle();

      if (isCancelled) return;
      if (profileError || !profileData) {
        setAccountError("Your Nemissive profile could not be loaded.");
        if (profileError && import.meta.env.DEV) console.error("Loading dashboard profile failed", profileError);
      } else {
        setCurrentProfile(profileData as ProfileSearchResult);
        setAccountError("");
      }

      setIsAccountResolved(true);
    }

    void loadAccount();

    return () => {
      isCancelled = true;
      abortController.abort();
    };
  }, []);

  const handleConversationReady = useCallback((conversation: SelectedConversation) => {
    setChatState({ kind: "accepted", conversation });
    setActiveSection("messages");
    setIsNewConversationOpen(false);
    setIsCompactChatVisible(true);
  }, []);

  const requestsController = useMessageRequests({ currentUserId, isAccountResolved, onConversationReady: handleConversationReady });

  const handlePendingRequest = useCallback((request: PendingOutgoingRequest) => {
    setChatState({ kind: "pending", request });
    setActiveSection("messages");
    setIsCompactChatVisible(true);
  }, []);

  function handleSectionChange(section: DashboardSection) {
    setActiveSection(section);
    setIsCompactChatVisible(false);
  }

  function openNewConversation() {
    setIsNewConversationOpen(true);
  }

  function openMessageRequestsSection() {
    setIsNewConversationOpen(false);
    handleSectionChange("requests");
  }

  return (
    <>
      <div className="flex h-screen w-full min-w-0 flex-col overflow-hidden bg-background md:flex-row">
        <NavigationRail activeSection={activeSection} pendingRequestCount={requestsController.pendingCount} isCompactChatVisible={isCompactChatVisible} onSectionChange={handleSectionChange} />
        <Sidebar activeSection={activeSection} currentUserId={currentUserId} currentProfile={currentProfile} isAccountResolved={isAccountResolved} accountError={accountError} isCompactChatVisible={isCompactChatVisible} requestsController={requestsController} onSectionChange={handleSectionChange} onNewConversation={openNewConversation} onConversationReady={handleConversationReady} />
        <ChatPanel chatState={chatState} isMobileVisible={isCompactChatVisible} onStartConversation={openNewConversation} onMobileBack={() => setIsCompactChatVisible(false)} />
      </div>

      <NewConversationModal isOpen={isNewConversationOpen} onClose={() => setIsNewConversationOpen(false)} onConversationReady={handleConversationReady} onPendingRequest={handlePendingRequest} onOpenRequests={openMessageRequestsSection} />
    </>
  );
}

export default DashboardPage;
