import { useState } from "react";
import Sidebar from "../components/dashboard/Sidebar";
import ChatPanel from "../components/dashboard/ChatPanel";
import NewConversationModal from "../components/dashboard/NewConversationModal";

function DashboardPage() {
  const [isNewConversationOpen, setIsNewConversationOpen] = useState(false);

  return (
    <>
      <div className="flex h-screen w-full min-w-0 overflow-hidden bg-background">
        <Sidebar onNewConversation={() => setIsNewConversationOpen(true)} />

        <ChatPanel onStartConversation={() => setIsNewConversationOpen(true)} />
      </div>

      <NewConversationModal
        isOpen={isNewConversationOpen}
        onClose={() => setIsNewConversationOpen(false)}
      />
    </>
  );
}

export default DashboardPage;
