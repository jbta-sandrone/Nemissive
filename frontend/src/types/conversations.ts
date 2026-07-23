export type ProfileSearchResult = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  last_seen_at?: string | null;
};

export type RealtimeProfileLastSeenEvent = {
  profileId: string;
  lastSeenAt: string;
};

export type SelectedConversation = {
  id: string;
  otherProfile: ProfileSearchResult;
  introductoryMessage?: string;
  introductoryMessageCreatedAt?: string;
};

export type MessageSidebarItem =
  | {
      kind: "pending";
      requestId: string;
      otherProfile: ProfileSearchResult;
      introduction: string;
      createdAt: string;
      status: "pending";
      conversationId: string | null;
    }
  | {
      kind: "conversation";
      conversationId: string;
      otherProfile: ProfileSearchResult;
      latestMessage: string | null;
      latestMessageAt: string | null;
      latestMessageSentByCurrentUser: boolean | null;
      updatedAt: string;
      unreadCount: number;
      currentUserLastReadAt: string | null;
      latestUnreadMessageAt: string | null;
    };

export type PendingOutgoingRequest = Extract<MessageSidebarItem, { kind: "pending" }>;
export type AcceptedConversationItem = Extract<MessageSidebarItem, { kind: "conversation" }>;

export type ChatMessage = {
  kind: "confirmed";
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  isIntroduction: boolean;
};

export type OptimisticChatMessage = {
  kind: "optimistic";
  optimisticId: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  deliveryState: "sending" | "failed";
};

export type DisplayChatMessage = ChatMessage | OptimisticChatMessage;

export type RealtimeChatMessageEvent = {
  sequence: number;
  message: ChatMessage;
};

export type ParticipantReceiptCursor = {
  conversationId: string;
  userId: string;
  lastDeliveredAt: string | null;
  lastReadAt: string | null;
};

export type RealtimeParticipantReceiptEvent = {
  sequence: number;
  receipt: ParticipantReceiptCursor;
};

export type ConfirmedMessageStatus = "sent" | "delivered" | "seen";

export type ProfileRelationship =
  | { state: "none" }
  | { state: "outgoing_pending"; request: PendingOutgoingRequest }
  | { state: "incoming_pending"; requestId: string }
  | { state: "accepted"; conversation: SelectedConversation };

export type DashboardChatState =
  | { kind: "accepted"; conversation: SelectedConversation }
  | { kind: "pending"; request: PendingOutgoingRequest };

export type CreateConversationRequestResult = {
  request_id: string | null;
  request_status: "pending" | "accepted";
  request_direction: "outgoing" | "incoming" | "existing_conversation";
  conversation_id: string | null;
  created_new: boolean;
  introduction: string | null;
  created_at: string | null;
};

export type RespondToConversationRequestResult = {
  request_id: string;
  request_status: "accepted" | "declined";
  conversation_id: string | null;
};
