export type ProfileSearchResult = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  last_seen_at?: string | null;
  active_status_visible?: boolean;
  quick_reactions?: string[] | null;
  browser_notifications_enabled?: boolean;
  notification_sound_enabled?: boolean;
  request_available?: boolean;
  account_status?: "active" | "deleting" | "deleted";
  deleted_at?: string | null;
};

export type BirthdayVisibility = "hidden" | "month_day" | "full";

export type EditableProfileDetails = {
  bio: string;
  locationText: string;
  birthDate: string;
  birthdayVisibility: BirthdayVisibility;
  showAge: boolean;
  interests: string[];
};

export type ConversationProfileDetails = ProfileSearchResult & {
  bio: string | null;
  locationText: string | null;
  interests: string[];
  birthdayDisplay: string | null;
  age: number | null;
  joinedMonth: string;
};

export type RealtimeNotificationPreferencesEvent = {
  profileId: string;
  browserNotificationsEnabled: boolean;
  notificationSoundEnabled: boolean;
};

export type RealtimeProfileIdentityEvent = Pick<ProfileSearchResult, "id" | "username" | "display_name" | "avatar_url" | "account_status" | "deleted_at">;

export type ConversationRequestRealtimeChange = {
  action: "insert" | "update";
  request: {
    id: string;
    senderId: string;
    recipientId: string;
    status: "pending" | "accepted" | "declined" | "cancelled";
    conversationId: string | null;
  };
};

export type ParticipantMuteState = {
  conversationId: string;
  userId: string;
  mutedUntil: string | null;
};

export type ParticipantConversationPreferencesState = {
  conversationId: string;
  userId: string;
  isPinned: boolean;
  archivedAt: string | null;
  historyClearedAt: string | null;
  conversationDeletedAt: string | null;
  interactionUpdatedAt: string | null;
};

export type ConversationInteractionStatus = {
  conversationId: string;
  targetUserId: string;
  connectionStatus: ConversationConnectionStatus;
  iBlocked: boolean;
  interactionAllowed: boolean;
  messagingAvailable: boolean;
  requestAvailable: boolean;
};

export type ConversationConnectionStatus = "accepted" | "disconnected" | "deleted";

export type SelectedConversation = {
  id: string;
  otherProfile: ProfileSearchResult;
  introductoryMessage?: string;
  introductoryMessageCreatedAt?: string;
  historyClearedAt?: string | null;
  conversationDeletedAt?: string | null;
  otherNickname?: string | null;
  themeKey?: string;
  connectionStatus?: ConversationConnectionStatus;
  iBlocked?: boolean;
  interactionAllowed?: boolean;
  messagingAvailable?: boolean;
  requestAvailable?: boolean;
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
      latestMessageId: string | null;
      latestMessage: string | null;
      latestMessageAt: string | null;
      latestMessageEditedAt: string | null;
      latestMessageIsDeleted: boolean;
      latestMessageDeletedAt: string | null;
      latestMessageSentByCurrentUser: boolean | null;
      updatedAt: string;
      unreadCount: number;
      currentUserLastReadAt: string | null;
      latestUnreadMessageAt: string | null;
      mutedUntil: string | null;
      isPinned: boolean;
      archivedAt: string | null;
      historyClearedAt: string | null;
      conversationDeletedAt: string | null;
      otherNickname: string | null;
      themeKey: string;
      connectionStatus: ConversationConnectionStatus;
      iBlocked: boolean;
      interactionAllowed: boolean;
      messagingAvailable: boolean;
      requestAvailable: boolean;
    };

export type PendingOutgoingRequest = Extract<MessageSidebarItem, { kind: "pending" }>;
export type AcceptedConversationItem = Extract<MessageSidebarItem, { kind: "conversation" }>;

export type MessageReplyPreview = {
  id: string;
  senderId: string;
  senderName: string;
  body: string | null;
  unavailable: boolean;
  isDeleted: boolean;
};

export type MessageSearchResult = {
  messageId: string;
  conversationId: string;
  senderId: string;
  senderProfile: ProfileSearchResult;
  otherProfile: ProfileSearchResult;
  messageType: MessageType;
  snippet: string;
  createdAt: string;
  editedAt: string | null;
  attachmentCount: number;
};

export type MessageSearchTarget = {
  conversationId: string;
  messageId: string;
  token: string;
};

export type MessageType = "text" | "image" | "voice" | "file";

export type MessageAttachmentKind = "image" | "voice" | "file";

export type MessageAttachment = {
  id: string;
  messageId: string;
  storagePath: string;
  originalName: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  position: number;
  attachmentKind: MessageAttachmentKind;
  durationMs: number | null;
};

export type OptimisticMessageAttachment = MessageAttachment & {
  file: File;
  previewUrl: string;
};

export type ComposerImageSelection = {
  localId: string;
  file: File;
  objectUrl: string;
  originalName: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  duplicateKey: string;
};

export type ComposerFileSelection = {
  localId: string;
  file: File;
  originalName: string;
  mimeType: string;
  size: number;
  extension: string;
  duplicateKey: string;
};

export type ConversationContentKind = "media" | "files" | "links";

export type ConversationContentItem = {
  contentId: string;
  messageId: string;
  senderId: string;
  messageBody: string;
  messageCreatedAt: string;
  messageType: MessageType;
  attachmentKind: MessageAttachmentKind | null;
  storagePath: string | null;
  originalName: string | null;
  mimeType: string | null;
  size: number | null;
  width: number | null;
  height: number | null;
  position: number | null;
};

export type ComposerVoiceRecording = {
  localId: string;
  file: File;
  objectUrl: string;
  originalName: string;
  mimeType: string;
  size: number;
  durationMs: number;
};

export type ChatMessage = {
  kind: "confirmed";
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  isDeleted: boolean;
  deletedAt: string | null;
  isIntroduction: boolean;
  messageType: MessageType;
  attachments: MessageAttachment[];
  replyToMessageId: string | null;
  replyPreview: MessageReplyPreview | null;
  isForwarded: boolean;
};

export type OptimisticChatMessage = {
  kind: "optimistic";
  optimisticId: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  deliveryState: "sending" | "failed";
  messageType: MessageType;
  attachments: OptimisticMessageAttachment[];
  replyToMessageId: string | null;
  replyPreview: MessageReplyPreview | null;
};

export type DisplayChatMessage = ChatMessage | OptimisticChatMessage;

export type RealtimeChatMessageEvent = {
  sequence: number;
  message: ChatMessage;
};

export type RealtimeChatMessageUpdateEvent = {
  sequence: number;
  message: ChatMessage;
};

export type MessageReaction = {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: string;
};

export type MessageReactionDeleteIdentity = {
  id: string | null;
  messageId: string | null;
  userId: string | null;
  emoji: string | null;
};

export type MessageReactionRealtimeChange =
  | { action: "insert"; reaction: MessageReaction }
  | { action: "delete"; reaction: MessageReactionDeleteIdentity };

export type RealtimeMessageReactionEvent = MessageReactionRealtimeChange & {
  sequence: number;
};

export type PinnedMessagePreview = {
  messageId: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
  messageType: MessageType;
  pinnedBy: string;
  pinnedAt: string;
  attachmentCount: number;
  voiceDurationMs: number | null;
  firstAttachmentName: string | null;
};

export type PinnedMessageRealtimeChange =
  | {
      action: "insert";
      pin: {
        messageId: string;
        conversationId: string;
        pinnedBy: string;
        pinnedAt: string;
      };
    }
  | {
      action: "delete";
      pin: {
        messageId: string;
        conversationId: string | null;
      };
    };

export type RealtimePinnedMessageEvent = PinnedMessageRealtimeChange & {
  sequence: number;
};

export type ConversationActivityEvent = {
  id: string;
  conversationId: string;
  actorId: string;
  actorName: string;
  eventType: "message_pinned" | "nickname_changed" | "nickname_removed" | "theme_changed" | "reminder_created";
  targetMessageId: string | null;
  targetUserId: string | null;
  targetUserName: string | null;
  nicknameValue: string | null;
  themeKey: string | null;
  targetReminderId: string | null;
  reminderTitle: string | null;
  reminderDueAt: string | null;
  createdAt: string;
  isOptimistic: boolean;
};

export type ConversationActivityRealtimeChange =
  | {
      action: "insert";
      event: Omit<ConversationActivityEvent, "actorName" | "targetUserName" | "isOptimistic">;
    }
  | {
      action: "delete";
      event: {
        id: string;
        conversationId: string | null;
        targetMessageId: string | null;
        targetReminderId: string | null;
      };
    };

export type RealtimeConversationActivityEvent = ConversationActivityRealtimeChange & {
  sequence: number;
};

export type ConversationNickname = {
  conversationId: string;
  userId: string;
  nickname: string;
  updatedBy: string;
  updatedAt: string;
};

export type ConversationNicknameRealtimeChange =
  | { action: "upsert"; nickname: ConversationNickname }
  | { action: "delete"; nickname: { conversationId: string; userId: string } };

export type RealtimeConversationNicknameEvent = ConversationNicknameRealtimeChange & {
  sequence: number;
};

export type ConversationThemeRealtimeChange = {
  conversationId: string;
  themeKey: string;
};

export type ConversationConnectionRealtimeChange = {
  conversationId: string;
  connectionStatus: ConversationConnectionStatus;
};

export type RealtimeConversationThemeEvent = ConversationThemeRealtimeChange & {
  sequence: number;
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
  | { state: "disconnected"; conversation: SelectedConversation }
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
  reconnected?: boolean;
};
