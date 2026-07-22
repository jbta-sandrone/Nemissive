export type ProfileSearchResult = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export type SelectedConversation = {
  id: string;
  otherProfile: ProfileSearchResult;
  introductoryMessage?: string;
  introductoryMessageCreatedAt?: string;
};

export type PendingOutgoingRequest = {
  requestId: string;
  otherProfile: ProfileSearchResult;
  introduction: string;
  createdAt?: string;
};

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
