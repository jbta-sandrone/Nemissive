import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { supabase } from "../../lib/supabase";
import type { ChatMessage, ComposerFileSelection, ComposerImageSelection, ComposerVoiceRecording, ConfirmedMessageStatus, ConversationActivityEvent, DashboardChatState, DisplayChatMessage, MessageAttachment, MessageReaction, MessageReactionDeleteIdentity, MessageReplyPreview, MessageSearchTarget, OptimisticChatMessage, OptimisticMessageAttachment, ParticipantReceiptCursor, PinnedMessagePreview, ProfileSearchResult, RealtimeChatMessageEvent, RealtimeChatMessageUpdateEvent, RealtimeConversationActivityEvent, RealtimeConversationNicknameEvent, RealtimeMessageReactionEvent, RealtimeParticipantReceiptEvent, RealtimePinnedMessageEvent, SelectedConversation } from "../../types/conversations";
import AnchoredPopover from "./AnchoredPopover";
import AttachmentMenu from "./AttachmentMenu";
import ComposerFilePreview from "./ComposerFilePreview";
import ComposerMediaPreview from "./ComposerMediaPreview";
import ConversationActivityRow from "./ConversationActivityRow";
import ConversationMuteMenu from "./ConversationMuteMenu";
import ConversationOptionsMenu from "./ConversationOptionsMenu";
import EmojiPicker from "./EmojiPicker";
import FileMessageCard from "./FileMessageCard";
import ImageViewer from "./ImageViewer";
import MessageActionSheet from "./MessageActionSheet";
import MessageActionsToolbar from "./MessageActionsToolbar";
import MessageDeleteDialog from "./MessageDeleteDialog";
import MessageMediaGallery, { type GalleryMediaItem } from "./MessageMediaGallery";
import MessageMediaSaveDialog, { type SaveableMessageImage } from "./MessageMediaSaveDialog";
import MessageMoreMenu from "./MessageMoreMenu";
import MessageText from "./MessageText";
import PinnedMessagesMenu from "./PinnedMessagesMenu";
import PresenceAvatar from "./PresenceAvatar";
import ProfileAvatar from "./ProfileAvatar";
import ReactionDetails from "./ReactionDetails";
import { getEmojiLabel } from "./emojiData";
import { formatLastSeen } from "./presenceUtils";
import { getConversationDisplayName, getProfileDisplayName, isDeletedProfile } from "./profileUtils";
import useConversationTyping from "./useConversationTyping";
import useSignedMessageMedia from "./useSignedMessageMedia";
import useVoiceRecorder, { voiceMaximumFileSize, voiceMinimumDurationMs } from "./useVoiceRecorder";
import VoiceMessagePlayer from "./VoiceMessagePlayer";
import VoiceRecordingComposer from "./VoiceRecordingComposer";
import UserBlockDialog from "./UserBlockDialog";
import { formatVoiceDuration } from "./voiceUtils";
import { canUseConversationTheme, getConversationTheme, getConversationThemeStyle, resolveConversationTheme, type ConversationThemeId } from "./conversationThemes";
import type { PremiumAccessState } from "./premiumAccess";
import { acceptedFileInputTypes, fileAttachmentMaxCount, fileAttachmentMaxSize, normalizeAllowedFile, sanitizeAttachmentFilename } from "./fileAttachments";
import type { WorkspaceLayoutMode } from "../../types/dashboard";
import { ConversationReminderStatus } from "./ReminderAwareness";
import type { ReminderRecord } from "./useReminders";

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  source_request_id: string | null;
  message_type: "text" | "image" | "voice" | "file";
  reply_to_message_id: string | null;
  is_forwarded: boolean;
};

type AttachmentRow = {
  id: string;
  message_id: string;
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  position: number;
  attachment_kind: "image" | "voice" | "file";
  duration_ms: number | null;
};

type CreateImageMessageResult = {
  message: MessageRow;
  attachments: AttachmentRow[];
};

type CreateVoiceMessageResult = CreateImageMessageResult;
type CreateFileMessageResult = CreateImageMessageResult;

type ParticipantRow = {
  user_id: string;
  last_delivered_at: string | null;
  last_read_at: string | null;
};

type ReactionRow = {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

type PinnedMessageRow = {
  message_id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  message_type: "text" | "image" | "voice" | "file";
  pinned_by: string;
  pinned_at: string;
  attachment_count: number;
  voice_duration_ms: number | null;
  first_attachment_name: string | null;
};

type ConversationEventRow = {
  event_id: string;
  conversation_id: string;
  actor_id: string;
  event_type: "message_pinned" | "nickname_changed" | "nickname_removed" | "theme_changed" | "reminder_created";
  target_message_id: string | null;
  target_user_id: string | null;
  nickname_value: string | null;
  theme_key: string | null;
  target_reminder_id: string | null;
  reminder_title: string | null;
  reminder_due_at: string | null;
  created_at: string;
};

type ConversationTimelineItem =
  | { kind: "message"; id: string; createdAt: string; message: DisplayChatMessage }
  | { kind: "event"; id: string; createdAt: string; event: ConversationActivityEvent };

type MessageEditState = {
  messageId: string;
  draft: string;
  isSaving: boolean;
  error: string;
};

type PendingMessageEdit = {
  messageId: string;
  attemptedBody: string;
  previousMessage: ChatMessage;
  confirmedMessage: ChatMessage | null;
  deferredMessage: ChatMessage | null;
};

type MessageDeleteState = {
  messageId: string;
  isDeleting: boolean;
  error: string;
};

type PendingMessageDelete = {
  messageId: string;
  previousMessage: ChatMessage;
  previousReactions: MessageReaction[];
  previousPin: PinnedMessagePreview | null;
  previousEvents: ConversationActivityEvent[];
  confirmedMessage: ChatMessage | null;
  deferredMessage: ChatMessage | null;
};

type MobileLongPressState = {
  messageId: string;
  pointerId: number;
  startX: number;
  startY: number;
  returnFocusElement: HTMLElement;
};

type ChatPanelProps = {
  chatState: DashboardChatState | null;
  currentProfile: ProfileSearchResult | null;
  currentUserId: string | null;
  premiumAccess: PremiumAccessState;
  isMobileVisible: boolean;
  layoutMode: WorkspaceLayoutMode;
  messageSearchTarget: MessageSearchTarget | null;
  realtimeRefreshKey: number;
  realtimeMessageEvents: RealtimeChatMessageEvent[];
  realtimeMessageUpdateEvents: RealtimeChatMessageUpdateEvent[];
  realtimeReactionEvents: RealtimeMessageReactionEvent[];
  realtimePinnedMessageEvents: RealtimePinnedMessageEvent[];
  realtimeConversationActivityEvents: RealtimeConversationActivityEvent[];
  realtimeConversationNicknameEvents: RealtimeConversationNicknameEvent[];
  realtimeReceiptEvents: RealtimeParticipantReceiptEvent[];
  onlineUserIds: ReadonlySet<string>;
  quickReactions: string[];
  conversationMutedUntil: string | null;
  conversationArchivedAt: string | null;
  onConversationMuteChange: (conversationId: string, mutedUntil: string | null) => Promise<string | null>;
  onConversationThemeChange: (conversationId: string, themeKey: string) => Promise<string | null>;
  onConversationArchiveChange: (conversationId: string, archived: boolean) => Promise<string | null>;
  onConversationDelete: (conversationId: string) => Promise<string | null>;
  onConversationDisconnect: (conversationId: string) => Promise<string | null>;
  onReconnectRequested: (profile: ProfileSearchResult) => void;
  onIncomingMessagesSynchronized: (conversationId: string, messageCreatedAt: string) => void;
  onConversationRead: (conversationId: string, messageCreatedAt: string) => void;
  onMessageConfirmed: () => void;
  onMessageUpdated: (message: ChatMessage) => void;
  onMessageDeletionRolledBack: (message: ChatMessage) => void;
  onForwardMessage: (message: ChatMessage, trigger: HTMLElement) => void;
  onStartConversation: () => void;
  onMobileBack: () => void;
  onEnterFocusMode: () => void;
  sharedReminders: ReminderRecord[];
  onReminderOpen: (reminder: ReminderRecord, trigger: HTMLElement) => void;
  onReminderEventOpen: (reminderId: string, trigger: HTMLElement) => void;
};

const initialMessageLimit = 50;
const messageMaxLength = 2000;
const characterCountThreshold = 200;
const nearBottomThreshold = 140;
const comingSoonMessageDurationMs = 3000;
const readAcknowledgementDebounceMs = 280;
const replyPreviewMaxLength = 120;
const replyHighlightDurationMs = 1700;
const pinToastDurationMs = 3200;
const conversationEventLimit = 50;
const conversationEventDedupeLimit = 250;
const mobileLongPressDurationMs = 450;
const mobileLongPressMovementThreshold = 12;
const imageMaxFileSize = 10 * 1024 * 1024;
const imageMaxCount = 10;
const messageMediaBucket = "message-media";
const acceptedImageMimeTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const acceptedImageInputTypes = "image/png,image/jpeg,image/webp,image/gif,.jpg,.jpeg";

function createUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

function getImageExtension(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "gif";
}

function getVoiceExtension(mimeType: string) {
  const baseMimeType = mimeType.toLowerCase().split(";", 1)[0];
  if (baseMimeType === "audio/ogg") return "ogg";
  if (baseMimeType === "audio/mp4") return "m4a";
  return "webm";
}

function getBaseMimeType(mimeType: string) {
  return mimeType.toLowerCase().split(";", 1)[0];
}

function getImageDimensions(objectUrl: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("The selected image could not be read."));
    image.src = objectUrl;
  });
}

function hasControlCharacters(value: string) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function mapAttachmentRow(row: AttachmentRow): MessageAttachment {
  return { id: row.id, messageId: row.message_id, storagePath: row.storage_path, originalName: row.original_name, mimeType: row.mime_type, size: row.size_bytes, width: row.width, height: row.height, position: row.position, attachmentKind: row.attachment_kind, durationMs: row.duration_ms };
}

function mapMessageRow(row: MessageRow, replyPreview: MessageReplyPreview | null = null, attachments: MessageAttachment[] = []): ChatMessage {
  return {
    kind: "confirmed",
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    isDeleted: row.is_deleted,
    deletedAt: row.deleted_at,
    isIntroduction: Boolean(row.source_request_id),
    messageType: row.message_type === "image" || row.message_type === "voice" || row.message_type === "file" ? row.message_type : "text",
    attachments,
    replyToMessageId: row.reply_to_message_id,
    replyPreview,
    isForwarded: row.is_forwarded === true,
  };
}

function mapPinnedMessageRow(row: PinnedMessageRow, currentUserId: string | null, otherName: string): PinnedMessagePreview {
  return {
    messageId: row.message_id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    senderName: row.sender_id === currentUserId ? "You" : otherName,
    body: row.body,
    createdAt: row.created_at,
    messageType: row.message_type,
    pinnedBy: row.pinned_by,
    pinnedAt: row.pinned_at,
    attachmentCount: row.attachment_count,
    voiceDurationMs: row.voice_duration_ms,
    firstAttachmentName: row.first_attachment_name,
  };
}

function createPinnedMessagePreview(message: ChatMessage, currentUserId: string | null, otherName: string): PinnedMessagePreview {
  return {
    messageId: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    senderName: message.senderId === currentUserId ? "You" : otherName,
    body: message.body,
    createdAt: message.createdAt,
    messageType: message.messageType,
    pinnedBy: currentUserId ?? "",
    pinnedAt: new Date().toISOString(),
    attachmentCount: message.attachments.length,
    voiceDurationMs: message.attachments.find((attachment) => attachment.attachmentKind === "voice")?.durationMs ?? null,
    firstAttachmentName: message.attachments[0]?.originalName ?? null,
  };
}

function mapConversationEventRow(row: ConversationEventRow, currentUserId: string | null, currentName: string, otherName: string, otherAccountName: string): ConversationActivityEvent {
  return {
    id: row.event_id,
    conversationId: row.conversation_id,
    actorId: row.actor_id,
    actorName: row.actor_id === currentUserId ? "You" : row.event_type === "message_pinned" || row.event_type === "theme_changed" ? otherName : otherAccountName,
    eventType: row.event_type,
    targetMessageId: row.target_message_id,
    targetUserId: row.target_user_id,
    targetUserName: row.target_user_id === currentUserId ? currentName : row.target_user_id ? otherAccountName : null,
    nicknameValue: row.nickname_value,
    themeKey: row.theme_key,
    targetReminderId: row.target_reminder_id,
    reminderTitle: row.reminder_title,
    reminderDueAt: row.reminder_due_at,
    createdAt: row.created_at,
    isOptimistic: false,
  };
}

function mergeConversationEvent(events: ConversationActivityEvent[], incoming: ConversationActivityEvent) {
  return [...events.filter((event) => event.id !== incoming.id && !(event.isOptimistic && event.actorId === incoming.actorId && ((event.targetMessageId && event.targetMessageId === incoming.targetMessageId) || (event.targetReminderId && event.targetReminderId === incoming.targetReminderId)))), incoming]
    .sort((first, second) => {
      const timestampDifference = Date.parse(first.createdAt) - Date.parse(second.createdAt);
      return timestampDifference || first.id.localeCompare(second.id);
    })
    .slice(-conversationEventLimit);
}

function normalizeReplyPreviewBody(body: string) {
  const normalizedBody = body.replace(/\s+/g, " ").trim();
  if (normalizedBody.length <= replyPreviewMaxLength) return normalizedBody;
  return `${normalizedBody.slice(0, replyPreviewMaxLength - 1).trimEnd()}…`;
}

function createReplyPreview(message: Pick<ChatMessage, "id" | "senderId" | "body" | "isDeleted" | "messageType" | "attachments">, currentUserId: string | null, otherName: string): MessageReplyPreview {
  const voiceDuration = message.attachments.find((attachment) => attachment.attachmentKind === "voice")?.durationMs;
  const fileAttachments = message.attachments.filter((attachment) => attachment.attachmentKind === "file");
  const fileSummary = fileAttachments.length === 1 ? `File · ${fileAttachments[0]?.originalName ?? "Attachment"}` : `${fileAttachments.length} files`;
  return {
    id: message.id,
    senderId: message.senderId,
    senderName: message.senderId === currentUserId ? "You" : otherName,
    body: message.isDeleted ? null : message.messageType === "voice" ? `Voice message${voiceDuration ? ` · ${formatVoiceDuration(voiceDuration)}` : ""}` : message.messageType === "image" && !message.body ? "Photo" : message.messageType === "file" && !message.body ? fileSummary : normalizeReplyPreviewBody(message.body),
    unavailable: false,
    isDeleted: message.isDeleted,
  };
}

function createUnavailableReplyPreview(replyToMessageId: string): MessageReplyPreview {
  return { id: replyToMessageId, senderId: "", senderName: "Original message", body: null, unavailable: true, isDeleted: false };
}

function attachReplyPreview(message: ChatMessage, target: ChatMessage | undefined, currentUserId: string | null, otherName: string) {
  if (!message.replyToMessageId) return message;
  return { ...message, replyPreview: target ? createReplyPreview(target, currentUserId, otherName) : message.replyPreview ?? createUnavailableReplyPreview(message.replyToMessageId) };
}

function getEditedTimestamp(message: Pick<ChatMessage, "editedAt">) {
  if (!message.editedAt) return null;
  const timestamp = Date.parse(message.editedAt);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function shouldApplyAuthoritativeMessage(currentMessage: ChatMessage | undefined, incomingMessage: ChatMessage) {
  if (!currentMessage) return true;
  if (currentMessage.isDeleted && !incomingMessage.isDeleted) return false;
  if (incomingMessage.isDeleted) {
    if (!currentMessage.isDeleted) return true;
    const currentDeletedTimestamp = getNormalizedTimestamp(currentMessage.deletedAt);
    const incomingDeletedTimestamp = getNormalizedTimestamp(incomingMessage.deletedAt);
    if (currentDeletedTimestamp === null) return true;
    if (incomingDeletedTimestamp === null) return false;
    return incomingDeletedTimestamp >= currentDeletedTimestamp;
  }
  const currentTimestamp = getEditedTimestamp(currentMessage);
  const incomingTimestamp = getEditedTimestamp(incomingMessage);
  if (incomingTimestamp === null) return currentTimestamp === null && currentMessage.body === incomingMessage.body;
  if (currentTimestamp === null) return true;
  if (incomingTimestamp !== currentTimestamp) return incomingTimestamp > currentTimestamp;
  return currentMessage.body === incomingMessage.body;
}

function patchMessageAndReplies(messages: DisplayChatMessage[], updatedMessage: ChatMessage, currentUserId: string | null, otherName: string) {
  const replyPreview = createReplyPreview(updatedMessage, currentUserId, otherName);
  return messages.map((message) => {
    if (message.kind === "confirmed" && message.id === updatedMessage.id) return { ...message, ...updatedMessage, replyPreview: message.replyPreview };
    if (message.replyToMessageId === updatedMessage.id) return { ...message, replyPreview };
    return message;
  });
}

function getMessageKey(message: DisplayChatMessage) {
  return message.kind === "confirmed" ? `confirmed:${message.id}` : `optimistic:${message.optimisticId}`;
}

function sortMessages(messages: DisplayChatMessage[]) {
  return [...messages].sort((first, second) => {
    const timestampDifference = Date.parse(first.createdAt) - Date.parse(second.createdAt);
    if (timestampDifference !== 0) return timestampDifference;
    return getMessageKey(first).localeCompare(getMessageKey(second));
  });
}

function mapReactionRow(row: ReactionRow): MessageReaction {
  return { id: row.id, messageId: row.message_id, userId: row.user_id, emoji: row.emoji, createdAt: row.created_at };
}

function getReactionTupleKey(reaction: Pick<MessageReaction, "messageId" | "userId" | "emoji">) {
  return `${reaction.messageId}\u0000${reaction.userId}\u0000${reaction.emoji}`;
}

function getDeletedReactionTupleKey(reaction: MessageReactionDeleteIdentity) {
  return reaction.messageId && reaction.userId && reaction.emoji ? getReactionTupleKey({ messageId: reaction.messageId, userId: reaction.userId, emoji: reaction.emoji }) : null;
}

function matchesDeletedReaction(reaction: MessageReaction, deletedReaction: MessageReactionDeleteIdentity) {
  const matchesId = Boolean(deletedReaction.id && reaction.id === deletedReaction.id);
  const deletedTupleKey = getDeletedReactionTupleKey(deletedReaction);
  return matchesId || Boolean(deletedTupleKey && getReactionTupleKey(reaction) === deletedTupleKey);
}

function mergeReaction(reactions: MessageReaction[], incoming: MessageReaction) {
  return [...reactions.filter((reaction) => reaction.id !== incoming.id && getReactionTupleKey(reaction) !== getReactionTupleKey(incoming)), incoming];
}

function groupMessageReactions(reactions: MessageReaction[], messageId: string, currentUserId: string | null) {
  const groups = new Map<string, { emoji: string; count: number; reactedByCurrentUser: boolean }>();
  reactions.filter((reaction) => reaction.messageId === messageId).forEach((reaction) => {
    const currentGroup = groups.get(reaction.emoji);
    groups.set(reaction.emoji, { emoji: reaction.emoji, count: (currentGroup?.count ?? 0) + 1, reactedByCurrentUser: Boolean(currentGroup?.reactedByCurrentUser || reaction.userId === currentUserId) });
  });
  return [...groups.values()];
}

function getNormalizedTimestamp(value: string | null) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function getConfirmedMessageStatus(message: ChatMessage, otherReceipt: ParticipantReceiptCursor | null): ConfirmedMessageStatus {
  const messageTimestamp = getNormalizedTimestamp(message.createdAt);
  const readTimestamp = getNormalizedTimestamp(otherReceipt?.lastReadAt ?? null);
  const deliveredTimestamp = getNormalizedTimestamp(otherReceipt?.lastDeliveredAt ?? null);
  if (messageTimestamp !== null && readTimestamp !== null && messageTimestamp <= readTimestamp) return "seen";
  if (messageTimestamp !== null && deliveredTimestamp !== null && messageTimestamp <= deliveredTimestamp) return "delivered";
  return "sent";
}

function reconcileConfirmedMessage(messages: DisplayChatMessage[], confirmedMessage: ChatMessage, optimisticId?: string) {
  const nextMessages = messages.filter((message) => {
    if (message.kind === "confirmed") return message.id !== confirmedMessage.id;
    return message.optimisticId !== optimisticId;
  });
  return sortMessages([...nextMessages, confirmedMessage]);
}

function createOptimisticId() {
  return createUuid();
}

function formatMessageTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
  if (date.toDateString() === now.toDateString()) return time;
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function MobileBackButton({ onClick, isFocusMode = false }: { onClick: () => void; isFocusMode?: boolean }) {
  return <button type="button" onClick={onClick} aria-label="Back to Messages" className={`chat-accent-control flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover ${isFocusMode ? "lg:hidden" : "xl:hidden"}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true"><path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg></button>;
}

function FocusModeButton({ onClick }: { onClick: () => void }) {
  return <button type="button" data-focus-mode-control="enter" onClick={onClick} aria-label="Enter focus mode" title="Enter focus mode" className="chat-header-control hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover lg:flex"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" strokeLinecap="round" strokeLinejoin="round" /></svg></button>;
}

function EmojiIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M9 10h.01M15 10h.01M8.5 14.5c1 1.2 2.1 1.8 3.5 1.8s2.5-.6 3.5-1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function MicrophoneIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><rect x="8" y="3" width="8" height="12" rx="4" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" strokeLinecap="round" /></svg>;
}

function SendIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-5 w-5" aria-hidden="true"><path d="m4 4 16 8-16 8 3-8-3-8Z" strokeLinejoin="round" /><path d="M7 12h13" strokeLinecap="round" /></svg>;
}

function QuickReactionMenu({ anchorRef, quickReactions, messageLabel, onClose, onOpenPicker, onSelect }: { anchorRef: RefObject<HTMLElement | null>; quickReactions: string[]; messageLabel: string; onClose: () => void; onOpenPicker: () => void; onSelect: (emoji: string) => void }) {
  return (
    <AnchoredPopover anchorRef={anchorRef} ariaLabel={`Quick reactions for ${messageLabel}`} onClose={onClose} placement="top" panelClassName="max-w-[calc(100vw-1rem)] rounded-2xl border border-border bg-surface p-1.5 shadow-soft">
      <div className="flex max-w-full items-center gap-0.5 overflow-x-auto">{quickReactions.map((emoji) => <button key={emoji} type="button" onClick={() => { onSelect(emoji); onClose(); }} aria-label={`React with ${getEmojiLabel(emoji)}`} title={getEmojiLabel(emoji)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">{emoji}</button>)}<button type="button" onClick={() => { onClose(); onOpenPicker(); }} aria-label="Open full emoji picker" title="More reactions" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg font-semibold text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">+</button></div>
    </AnchoredPopover>
  );
}

function TypingIndicator({ isVisible, name, shouldReduceMotion }: { isVisible: boolean; name: string; shouldReduceMotion: boolean | null }) {
  return (
    <div className="mb-1 flex min-h-7 items-center px-2 sm:mb-1.5">
      <AnimatePresence initial={false}>
        {isVisible && (
          <motion.div role="status" aria-live="polite" aria-atomic="true" initial={shouldReduceMotion ? false : { opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 3 }} transition={{ duration: shouldReduceMotion ? 0 : 0.16 }} className="flex min-w-0 items-center gap-2 text-xs font-medium text-body">
            <span className="truncate">{name} is typing…</span>
            <span aria-hidden="true" className="flex shrink-0 items-center gap-0.5">{[0, 1, 2].map((dot) => <motion.span key={dot} animate={shouldReduceMotion ? { opacity: 0.65 } : { opacity: [0.35, 1, 0.35], y: [0, -2, 0] }} transition={shouldReduceMotion ? { duration: 0 } : { duration: 1.1, repeat: Number.POSITIVE_INFINITY, delay: dot * 0.14 }} className="h-1.5 w-1.5 rounded-full bg-primary" />)}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ReplyQuote({ preview, isStrongOutgoing, canJump, onJump }: { preview: MessageReplyPreview; isStrongOutgoing: boolean; canJump: boolean; onJump: () => void }) {
  const previewText = preview.isDeleted ? "Original message was deleted." : preview.unavailable ? "Earlier message unavailable" : preview.body;
  const content = <><span className={`block truncate text-xs font-semibold ${isStrongOutgoing ? "text-white" : "text-heading"}`}>{preview.senderName}</span><span className={`mt-0.5 block break-words text-xs leading-5 ${isStrongOutgoing ? "text-white/80" : "text-body"}`}>{previewText}</span></>;
  const className = `chat-reply-quote mb-2 block w-full min-w-0 rounded-xl border-l-2 px-3 py-2 text-left ${isStrongOutgoing ? "border-white/60 bg-background/10" : "border-primary/40 bg-background"}`;

  if (canJump) return <button type="button" onClick={onJump} aria-label={`Jump to original message from ${preview.senderName}`} className={`${className} transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30`}>{content}</button>;
  return <div aria-label={`Reply to ${preview.senderName}: ${previewText ?? ""}`} className={className}>{content}</div>;
}

function AcceptedConversationPanel({ conversation, currentProfile, currentUserId, premiumAccess, activeTheme, compactVisibilitySignal, layoutMode, messageSearchTarget, realtimeRefreshKey, realtimeMessageEvents, realtimeMessageUpdateEvents, realtimeReactionEvents, realtimePinnedMessageEvents, realtimeConversationActivityEvents, realtimeConversationNicknameEvents, realtimeReceiptEvents, isOtherUserOnline, quickReactions, conversationMutedUntil, conversationArchivedAt, onConversationMuteChange, onConversationThemeChange, onConversationArchiveChange, onConversationDelete, onConversationDisconnect, onReconnectRequested, onIncomingMessagesSynchronized, onConversationRead, onMessageConfirmed, onMessageUpdated, onMessageDeletionRolledBack, onForwardMessage, onMobileBack, onEnterFocusMode, sharedReminders, onReminderOpen, onReminderEventOpen }: { conversation: SelectedConversation; currentProfile: ProfileSearchResult | null; currentUserId: string | null; premiumAccess: PremiumAccessState; activeTheme: ConversationThemeId; compactVisibilitySignal: boolean; layoutMode: WorkspaceLayoutMode; messageSearchTarget: MessageSearchTarget | null; realtimeRefreshKey: number; realtimeMessageEvents: RealtimeChatMessageEvent[]; realtimeMessageUpdateEvents: RealtimeChatMessageUpdateEvent[]; realtimeReactionEvents: RealtimeMessageReactionEvent[]; realtimePinnedMessageEvents: RealtimePinnedMessageEvent[]; realtimeConversationActivityEvents: RealtimeConversationActivityEvent[]; realtimeConversationNicknameEvents: RealtimeConversationNicknameEvent[]; realtimeReceiptEvents: RealtimeParticipantReceiptEvent[]; isOtherUserOnline: boolean; quickReactions: string[]; conversationMutedUntil: string | null; conversationArchivedAt: string | null; onConversationMuteChange: (conversationId: string, mutedUntil: string | null) => Promise<string | null>; onConversationThemeChange: (conversationId: string, themeKey: string) => Promise<string | null>; onConversationArchiveChange: (conversationId: string, archived: boolean) => Promise<string | null>; onConversationDelete: (conversationId: string) => Promise<string | null>; onConversationDisconnect: (conversationId: string) => Promise<string | null>; onReconnectRequested: (profile: ProfileSearchResult) => void; onIncomingMessagesSynchronized: (conversationId: string, messageCreatedAt: string) => void; onConversationRead: (conversationId: string, messageCreatedAt: string) => void; onMessageConfirmed: () => void; onMessageUpdated: (message: ChatMessage) => void; onMessageDeletionRolledBack: (message: ChatMessage) => void; onForwardMessage: (message: ChatMessage, trigger: HTMLElement) => void; onMobileBack: () => void; onEnterFocusMode: () => void; sharedReminders: ReminderRecord[]; onReminderOpen: (reminder: ReminderRecord, trigger: HTMLElement) => void; onReminderEventOpen: (reminderId: string, trigger: HTMLElement) => void }) {
  const shouldReduceMotion = useReducedMotion();
  const latestLoadRef = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const editTriggerRef = useRef<HTMLElement | null>(null);
  const deleteTriggerRef = useRef<HTMLElement | null>(null);
  const comingSoonTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const readAcknowledgementTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const reactionErrorTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const replyHighlightTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const mobileLongPressTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const mobileLongPressStateRef = useRef<MobileLongPressState | null>(null);
  const mobileActionReturnFocusRef = useRef<HTMLElement | null>(null);
  const mediaSaveReturnFocusRef = useRef<HTMLElement | null>(null);
  const hasLoadedMessagesRef = useRef(false);
  const isMountedRef = useRef(true);
  const isSubmittingRef = useRef(false);
  const pendingEditRef = useRef<PendingMessageEdit | null>(null);
  const pendingDeleteRef = useRef<PendingMessageDelete | null>(null);
  const inFlightMessageRef = useRef<{ optimisticId: string; conversationId: string; body: string; replyToMessageId: string | null } | null>(null);
  const processedRealtimeSequenceRef = useRef(realtimeMessageEvents.at(-1)?.sequence ?? 0);
  const processedMessageUpdateSequenceRef = useRef(realtimeMessageUpdateEvents.at(-1)?.sequence ?? 0);
  const processedReactionSequenceRef = useRef(realtimeReactionEvents.at(-1)?.sequence ?? 0);
  const processedPinnedMessageSequenceRef = useRef(realtimePinnedMessageEvents.at(-1)?.sequence ?? 0);
  const processedConversationActivitySequenceRef = useRef(realtimeConversationActivityEvents.at(-1)?.sequence ?? 0);
  const processedConversationNicknameSequenceRef = useRef(realtimeConversationNicknameEvents.at(-1)?.sequence ?? 0);
  const processedReceiptSequenceRef = useRef(realtimeReceiptEvents.at(-1)?.sequence ?? 0);
  const realtimeSequenceByMessageIdRef = useRef(new Map<string, number>());
  const messageUpdateSequenceByIdRef = useRef(new Map<string, number>());
  const reactionInsertSequenceByIdRef = useRef(new Map<string, number>());
  const reactionDeleteSequenceByIdRef = useRef(new Map<string, number>());
  const reactionDeleteSequenceByTupleRef = useRef(new Map<string, number>());
  const locallyConfirmedMessageIdsRef = useRef(new Set<string>());
  const pendingReactionKeysRef = useRef(new Set<string>());
  const pendingPinnedMessageIdsRef = useRef(new Set<string>());
  const pinnedMessagesLoadIdRef = useRef(0);
  const conversationEventsLoadIdRef = useRef(0);
  const seenConversationEventIdsRef = useRef(new Set<string>());
  const seenConversationEventOrderRef = useRef<string[]>([]);
  const deletedConversationEventIdsRef = useRef(new Set<string>());
  const deletedConversationEventOrderRef = useRef<string[]>([]);
  const pinToastTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const replyTargetCacheRef = useRef(new Map<string, ChatMessage>());
  const replyTargetFetchesRef = useRef(new Map<string, Promise<void>>());
  const attachmentCacheRef = useRef(new Map<string, MessageAttachment[]>());
  const attachmentFetchesRef = useRef(new Map<string, Promise<void>>());
  const messageElementsRef = useRef(new Map<string, HTMLElement>());
  const selectedImagesRef = useRef<ComposerImageSelection[]>([]);
  const selectedFilesRef = useRef<ComposerFileSelection[]>([]);
  const optimisticPreviewUrlsRef = useRef(new Set<string>());
  const imageViewerReturnFocusRef = useRef<HTMLElement | null>(null);
  const deletedMessageIdsRef = useRef(new Set<string>());
  const processedSearchTargetTokenRef = useRef<string | null>(null);
  const reactionAnchorRef = useRef<HTMLElement | null>(null);
  const moreActionAnchorRef = useRef<HTMLElement | null>(null);
  const reactionDetailsAnchorRef = useRef<HTMLElement | null>(null);
  const lastReactionDetailsMessageIdRef = useRef<string | null>(null);
  const resolvedReactionProfileIdsRef = useRef(new Set<string>());
  const composerEmojiButtonRef = useRef<HTMLButtonElement | null>(null);
  const blockedComposerActionRef = useRef<HTMLButtonElement | null>(null);
  const composerSelectionRef = useRef({ start: 0, end: 0 });
  const [messages, setMessages] = useState<DisplayChatMessage[]>([]);
  const [reactions, setReactions] = useState<MessageReaction[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessagePreview[]>([]);
  const [isLoadingPinnedMessages, setIsLoadingPinnedMessages] = useState(true);
  const [pinnedMessagesError, setPinnedMessagesError] = useState("");
  const [pinMutationError, setPinMutationError] = useState("");
  const [pendingPinnedMessageIds, setPendingPinnedMessageIds] = useState<Set<string>>(() => new Set());
  const [pinnedJumpTarget, setPinnedJumpTarget] = useState<MessageSearchTarget | null>(null);
  const [conversationEvents, setConversationEvents] = useState<ConversationActivityEvent[]>([]);
  const [nicknamesByUserId, setNicknamesByUserId] = useState<Map<string, string>>(() => {
    const initial = new Map<string, string>();
    if (conversation.otherNickname) initial.set(conversation.otherProfile.id, conversation.otherNickname);
    return initial;
  });
  const [conversationEventsError, setConversationEventsError] = useState("");
  const [pinToast, setPinToast] = useState<{ id: number; message: string } | null>(null);
  const [interactionOverride, setInteractionOverride] = useState<{ baseIBlocked: boolean; baseMessagingAvailable: boolean; iBlocked: boolean; messagingAvailable: boolean } | null>(null);
  const [unblockDialogOpen, setUnblockDialogOpen] = useState(false);
  const [unblockSaving, setUnblockSaving] = useState(false);
  const [unblockError, setUnblockError] = useState("");
  const [draft, setDraft] = useState("");
  const [selectedImages, setSelectedImages] = useState<ComposerImageSelection[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<ComposerFileSelection[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [isViewingSearchContext, setIsViewingSearchContext] = useState(false);
  const [isLoadingSearchContext, setIsLoadingSearchContext] = useState(false);
  const [searchContextError, setSearchContextError] = useState("");
  const [searchContextRetryKey, setSearchContextRetryKey] = useState(0);
  const [newMessageAnnouncement, setNewMessageAnnouncement] = useState("");
  const [comingSoonMessage, setComingSoonMessage] = useState("");
  const [reactionError, setReactionError] = useState("");
  const [pendingReactionKeys, setPendingReactionKeys] = useState<Set<string>>(() => new Set());
  const [reactionDetailsMessageId, setReactionDetailsMessageId] = useState<string | null>(null);
  const [reactionDetailsMutationError, setReactionDetailsMutationError] = useState("");
  const [reactionProfilesById, setReactionProfilesById] = useState<Map<string, ProfileSearchResult>>(() => new Map());
  const [isReactionProfilesLoading, setIsReactionProfilesLoading] = useState(false);
  const [reactionProfilesError, setReactionProfilesError] = useState("");
  const [reactionProfilesRetryKey, setReactionProfilesRetryKey] = useState(0);
  const [quickReactionMessageId, setQuickReactionMessageId] = useState<string | null>(null);
  const [fullReactionPickerMessageId, setFullReactionPickerMessageId] = useState<string | null>(null);
  const [isComposerEmojiPickerOpen, setIsComposerEmojiPickerOpen] = useState(false);
  const [mobileActionMessageId, setMobileActionMessageId] = useState<string | null>(null);
  const [moreActionMessageId, setMoreActionMessageId] = useState<string | null>(null);
  const [mediaSaveMessageId, setMediaSaveMessageId] = useState<string | null>(null);
  const [mobileEmphasizedMessageId, setMobileEmphasizedMessageId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<MessageReplyPreview | null>(null);
  const [messageEditState, setMessageEditState] = useState<MessageEditState | null>(null);
  const [messageDeleteState, setMessageDeleteState] = useState<MessageDeleteState | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [imageViewerState, setImageViewerState] = useState<{ messageId: string; initialIndex: number } | null>(null);
  const [otherReceipt, setOtherReceipt] = useState<ParticipantReceiptCursor | null>(null);
  const [relativeTimeNow, setRelativeTimeNow] = useState(() => Date.now());
  const currentName = currentProfile ? getProfileDisplayName(currentProfile) : "You";
  const otherAccountName = getProfileDisplayName(conversation.otherProfile);
  const otherName = getConversationDisplayName(conversation.otherProfile, nicknamesByUserId.get(conversation.otherProfile.id) ?? conversation.otherNickname);
  const isDeletedAccount = isDeletedProfile(conversation.otherProfile) || conversation.connectionStatus === "deleted";
  const isConnected = (conversation.connectionStatus ?? "accepted") === "accepted";
  const interactionFromConversation = { iBlocked: conversation.iBlocked ?? false, messagingAvailable: conversation.messagingAvailable ?? true };
  const interactionStatus = interactionOverride && interactionOverride.baseIBlocked === interactionFromConversation.iBlocked && interactionOverride.baseMessagingAvailable === interactionFromConversation.messagingAvailable ? interactionOverride : interactionFromConversation;
  const effectiveIsOtherUserOnline = interactionStatus.messagingAvailable && Boolean(conversation.otherProfile.active_status_visible) && isOtherUserOnline;
  const presenceText = interactionStatus.messagingAvailable ? (effectiveIsOtherUserOnline ? "Active now" : formatLastSeen(conversation.otherProfile.last_seen_at, relativeTimeNow)) : null;
  const { isOtherUserTyping, notifyTyping, stopTyping } = useConversationTyping({ conversationId: conversation.id, currentUserId, otherUserId: conversation.otherProfile.id, enabled: interactionStatus.messagingAvailable });
  const signedMediaPaths = messages.flatMap((message) => message.kind === "confirmed" && !message.isDeleted ? message.attachments.filter((attachment) => attachment.attachmentKind !== "file").map((attachment) => attachment.storagePath) : []);
  const signedMedia = useSignedMessageMedia(signedMediaPaths);
  const voiceRecorder = useVoiceRecorder();
  const previousVoiceModeRef = useRef(voiceRecorder.mode);

  useEffect(() => {
    if (interactionStatus.messagingAvailable) return;
    stopTyping();
    if (voiceRecorder.mode !== "idle") voiceRecorder.cancelRecording();
  }, [interactionStatus.messagingAvailable, stopTyping, voiceRecorder]);

  useEffect(() => {
    const previousMode = previousVoiceModeRef.current;
    previousVoiceModeRef.current = voiceRecorder.mode;
    if (previousMode !== "idle" && voiceRecorder.mode === "idle") window.requestAnimationFrame(() => textareaRef.current?.focus());
  }, [voiceRecorder.mode]);

  useEffect(() => {
    isMountedRef.current = true;
    const optimisticPreviewUrls = optimisticPreviewUrlsRef.current;
    return () => {
      isMountedRef.current = false;
      if (comingSoonTimerRef.current !== null) window.clearTimeout(comingSoonTimerRef.current);
      if (readAcknowledgementTimerRef.current !== null) window.clearTimeout(readAcknowledgementTimerRef.current);
      if (reactionErrorTimerRef.current !== null) window.clearTimeout(reactionErrorTimerRef.current);
      if (replyHighlightTimerRef.current !== null) window.clearTimeout(replyHighlightTimerRef.current);
      if (mobileLongPressTimerRef.current !== null) window.clearTimeout(mobileLongPressTimerRef.current);
      if (pinToastTimerRef.current !== null) window.clearTimeout(pinToastTimerRef.current);
      selectedImagesRef.current.forEach((image) => URL.revokeObjectURL(image.objectUrl));
      optimisticPreviewUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
      optimisticPreviewUrls.clear();
    };
  }, []);

  useEffect(() => {
    selectedImagesRef.current = selectedImages;
  }, [selectedImages]);

  useEffect(() => {
    selectedFilesRef.current = selectedFiles;
  }, [selectedFiles]);

  useEffect(() => {
    function handleSelectionChange() {
      if (!window.getSelection()?.toString()) return;
      if (mobileLongPressTimerRef.current !== null) window.clearTimeout(mobileLongPressTimerRef.current);
      mobileLongPressTimerRef.current = null;
      mobileLongPressStateRef.current = null;
    }
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

  useEffect(() => {
    if (isOtherUserOnline) return;
    const timer = window.setInterval(() => setRelativeTimeNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [conversation.otherProfile.last_seen_at, isOtherUserOnline]);

  useEffect(() => {
    if (!reactionDetailsMessageId) return;
    const messageReactions = reactions.filter((reaction) => reaction.messageId === reactionDetailsMessageId);
    const hasPendingReactionMutation = [...pendingReactionKeys].some((mutationKey) => mutationKey.startsWith(`${reactionDetailsMessageId}\u0000`));
    if (messageReactions.length === 0 && !hasPendingReactionMutation) {
      const closeTimer = window.setTimeout(() => setReactionDetailsMessageId(null), 0);
      return () => window.clearTimeout(closeTimer);
    }

    const knownProfileIds = new Set([currentProfile?.id, conversation.otherProfile.id].filter((userId): userId is string => Boolean(userId)));
    const missingProfileIds = [...new Set(messageReactions.map((reaction) => reaction.userId))].filter((userId) => !knownProfileIds.has(userId) && !resolvedReactionProfileIdsRef.current.has(userId)).slice(0, 100);
    if (missingProfileIds.length === 0) {
      const settleTimer = window.setTimeout(() => {
        setIsReactionProfilesLoading(false);
        setReactionProfilesError("");
      }, 0);
      return () => window.clearTimeout(settleTimer);
    }

    let isCancelled = false;
    let abortController: AbortController | null = null;
    const loadTimer = window.setTimeout(() => {
      abortController = new AbortController();
      setIsReactionProfilesLoading(true);
      setReactionProfilesError("");

      void supabase.from("profiles").select("id, username, display_name, avatar_url, account_status, deleted_at").in("id", missingProfileIds).abortSignal(abortController.signal).then(({ data, error }) => {
        if (isCancelled) return;
        if (error) {
          setIsReactionProfilesLoading(false);
          setReactionProfilesError("Some reaction profiles couldn’t be loaded.");
          if (import.meta.env.DEV) console.warn("Loading reaction profiles failed", { conversationId: conversation.id, code: error.code });
          return;
        }

        const loadedProfiles = (data ?? []) as ProfileSearchResult[];
        missingProfileIds.forEach((userId) => resolvedReactionProfileIdsRef.current.add(userId));
        setReactionProfilesById((currentProfiles) => {
          const nextProfiles = new Map(currentProfiles);
          loadedProfiles.forEach((profile) => nextProfiles.set(profile.id, profile));
          return nextProfiles;
        });
        setIsReactionProfilesLoading(false);
        setReactionProfilesError("");
      });
    }, 0);

    return () => {
      isCancelled = true;
      window.clearTimeout(loadTimer);
      abortController?.abort();
    };
  }, [conversation.id, conversation.otherProfile.id, currentProfile?.id, pendingReactionKeys, reactionDetailsMessageId, reactionProfilesRetryKey, reactions]);

  useEffect(() => {
    if (!messageEditState?.messageId || messageEditState.isSaving) return;
    const frame = window.requestAnimationFrame(() => {
      const textarea = editTextareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      resizeTextarea(textarea);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messageEditState?.isSaving, messageEditState?.messageId]);

  const isNearBottom = useCallback(() => {
    const viewport = scrollViewportRef.current;
    return Boolean(viewport && viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < nearBottomThreshold);
  }, []);

  const scrollToLatest = useCallback((behavior: ScrollBehavior = "auto") => {
    window.requestAnimationFrame(() => {
      const viewport = scrollViewportRef.current;
      if (!viewport) return;
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: shouldReduceMotion ? "auto" : behavior });
      setShowJumpToLatest(false);
    });
  }, [shouldReduceMotion]);

  const showPinToast = useCallback((message: string) => {
    if (pinToastTimerRef.current !== null) window.clearTimeout(pinToastTimerRef.current);
    setPinToast({ id: Date.now(), message });
    pinToastTimerRef.current = window.setTimeout(() => {
      setPinToast(null);
      pinToastTimerRef.current = null;
    }, pinToastDurationMs);
  }, []);

  async function saveUserBlock(blocked: boolean) {
    const { data, error } = await supabase.rpc("set_user_blocked", { target_user_id: conversation.otherProfile.id, blocked });
    if (error) {
      if (import.meta.env.DEV) console.warn("Saving user block failed", { code: error.code, conversationId: conversation.id });
      return "We couldn’t update this block right now. Please try again.";
    }
    const result = data && typeof data === "object" ? data as Record<string, unknown> : null;
    const nextStatus = {
      iBlocked: typeof result?.i_blocked === "boolean" ? result.i_blocked : blocked,
      messagingAvailable: typeof result?.messaging_available === "boolean" ? result.messaging_available : isConnected && !blocked,
    };
    setInteractionOverride({ baseIBlocked: interactionFromConversation.iBlocked, baseMessagingAvailable: interactionFromConversation.messagingAvailable, ...nextStatus });
    showPinToast(`${otherName} ${nextStatus.iBlocked ? "blocked" : "unblocked"}`);
    onMessageConfirmed();
    return null;
  }

  async function disconnectConversation() {
    const error = await onConversationDisconnect(conversation.id);
    if (error) return error;
    showPinToast(`Disconnected from ${otherName}`);
    onMessageConfirmed();
    return null;
  }

  async function confirmComposerUnblock() {
    if (unblockSaving) return;
    setUnblockSaving(true);
    setUnblockError("");
    const error = await saveUserBlock(false);
    setUnblockSaving(false);
    if (error) setUnblockError(error);
    else setUnblockDialogOpen(false);
  }

  const rememberConversationEvent = useCallback((eventId: string) => {
    if (seenConversationEventIdsRef.current.has(eventId)) return false;
    seenConversationEventIdsRef.current.add(eventId);
    seenConversationEventOrderRef.current.push(eventId);
    while (seenConversationEventOrderRef.current.length > conversationEventDedupeLimit) {
      const expiredId = seenConversationEventOrderRef.current.shift();
      if (expiredId) seenConversationEventIdsRef.current.delete(expiredId);
    }
    return true;
  }, []);

  const rememberDeletedConversationEvent = useCallback((eventId: string) => {
    deletedConversationEventIdsRef.current.add(eventId);
    deletedConversationEventOrderRef.current.push(eventId);
    while (deletedConversationEventOrderRef.current.length > conversationEventDedupeLimit) {
      const expiredId = deletedConversationEventOrderRef.current.shift();
      if (expiredId) deletedConversationEventIdsRef.current.delete(expiredId);
    }
  }, []);

  const loadReplyTarget = useCallback((replyToMessageId: string) => {
    if (replyTargetCacheRef.current.has(replyToMessageId) || replyTargetFetchesRef.current.has(replyToMessageId)) return;

    const request = (async () => {
      const { data, error } = await supabase.from("messages").select("id, conversation_id, sender_id, body, created_at, edited_at, is_deleted, deleted_at, source_request_id, message_type, reply_to_message_id, is_forwarded").eq("id", replyToMessageId).eq("conversation_id", conversation.id).maybeSingle();
      if (!isMountedRef.current) return;
      if (error || !data) {
        if (error && import.meta.env.DEV) console.warn("Loading a realtime reply target failed", { conversationId: conversation.id, code: error.code });
        return;
      }

      const attachmentResult = data.message_type === "image" || data.message_type === "voice" || data.message_type === "file" ? await supabase.from("message_attachments").select("id, message_id, storage_path, original_name, mime_type, size_bytes, width, height, position, attachment_kind, duration_ms").eq("message_id", replyToMessageId).order("position", { ascending: true }) : { data: [], error: null };
      if (!isMountedRef.current) return;
      const targetAttachments = attachmentResult.error ? [] : ((attachmentResult.data ?? []) as AttachmentRow[]).map(mapAttachmentRow);
      const target = mapMessageRow(data as MessageRow, null, targetAttachments);
      if (targetAttachments.length > 0) attachmentCacheRef.current.set(target.id, targetAttachments);
      if (target.isDeleted) deletedMessageIdsRef.current.add(target.id);
      replyTargetCacheRef.current.set(target.id, target);
      setMessages((currentMessages) => currentMessages.map((message) => {
        if (message.replyToMessageId !== target.id) return message;
        return { ...message, replyPreview: createReplyPreview(target, currentUserId, otherName) };
      }));
    })().finally(() => {
      replyTargetFetchesRef.current.delete(replyToMessageId);
    });

    replyTargetFetchesRef.current.set(replyToMessageId, request);
  }, [conversation.id, currentUserId, otherName]);

  const loadMessageAttachments = useCallback((messageId: string) => {
    if (attachmentCacheRef.current.has(messageId) || attachmentFetchesRef.current.has(messageId)) return;

    const request = (async () => {
      const { data, error } = await supabase.from("message_attachments").select("id, message_id, storage_path, original_name, mime_type, size_bytes, width, height, position, attachment_kind, duration_ms").eq("message_id", messageId).order("position", { ascending: true });
      if (!isMountedRef.current) return;
      if (error) {
        if (import.meta.env.DEV) console.warn("Loading realtime message attachments failed", { conversationId: conversation.id, messageId, code: error.code });
        return;
      }

      const attachments = ((data ?? []) as AttachmentRow[]).map(mapAttachmentRow);
      attachmentCacheRef.current.set(messageId, attachments);
      setMessages((currentMessages) => {
        const loadedMessage = currentMessages.find((message): message is ChatMessage => message.kind === "confirmed" && message.id === messageId);
        if (!loadedMessage) return currentMessages;
        const updatedMessage = { ...loadedMessage, attachments };
        replyTargetCacheRef.current.set(messageId, updatedMessage);
        return patchMessageAndReplies(currentMessages, updatedMessage, currentUserId, otherName);
      });
    })().finally(() => {
      attachmentFetchesRef.current.delete(messageId);
    });

    attachmentFetchesRef.current.set(messageId, request);
  }, [conversation.id, currentUserId, otherName]);

  const loadPinnedMessages = useCallback(async () => {
    const loadId = ++pinnedMessagesLoadIdRef.current;
    setIsLoadingPinnedMessages(true);
    setPinnedMessagesError("");
    const { data, error } = await supabase.rpc("list_pinned_messages", { target_conversation_id: conversation.id, page_size: 50 });
    if (!isMountedRef.current || loadId !== pinnedMessagesLoadIdRef.current) return;
    setIsLoadingPinnedMessages(false);
    if (error) {
      setPinnedMessagesError("Pinned messages couldn’t be loaded. Please try again.");
      if (import.meta.env.DEV) console.warn("Loading pinned messages failed", { conversationId: conversation.id, code: error.code });
      return;
    }
    const nextPins = ((data ?? []) as PinnedMessageRow[]).map((row) => mapPinnedMessageRow(row, currentUserId, otherName));
    setPinnedMessages(nextPins);
  }, [conversation.id, currentUserId, otherName]);

  const loadConversationNicknames = useCallback(async () => {
    const { data, error } = await supabase.from("conversation_nicknames").select("conversation_id, user_id, nickname").eq("conversation_id", conversation.id);
    if (!isMountedRef.current) return;
    if (error) {
      if (import.meta.env.DEV) console.warn("Loading conversation nicknames failed", { conversationId: conversation.id, code: error.code });
      return;
    }
    setNicknamesByUserId(new Map((data ?? []).map((row) => [String(row.user_id), String(row.nickname)])));
  }, [conversation.id]);

  const loadConversationEvents = useCallback(async () => {
    const loadId = ++conversationEventsLoadIdRef.current;
    setConversationEventsError("");
    const { data, error } = await supabase.rpc("list_conversation_events", { target_conversation_id: conversation.id, page_size: conversationEventLimit });
    if (!isMountedRef.current || loadId !== conversationEventsLoadIdRef.current) return;
    if (error) {
      setConversationEventsError("Conversation activity couldn’t be loaded. Please try again.");
      if (import.meta.env.DEV) console.warn("Loading conversation activity failed", { conversationId: conversation.id, code: error.code });
      return;
    }

    const loadedEvents = ((data ?? []) as ConversationEventRow[]).map((row) => mapConversationEventRow(row, currentUserId, currentName, otherName, otherAccountName)).filter((event) => !deletedConversationEventIdsRef.current.has(event.id));
    loadedEvents.forEach((event) => rememberConversationEvent(event.id));
    setConversationEvents((currentEvents) => {
      const currentVisibleEvents = currentEvents.filter((event) => !deletedConversationEventIdsRef.current.has(event.id));
      return loadedEvents.reduce((nextEvents, event) => mergeConversationEvent(nextEvents, event), currentVisibleEvents).slice(-conversationEventLimit);
    });
  }, [conversation.id, currentName, currentUserId, otherAccountName, otherName, rememberConversationEvent]);
  const sharedReminderActivityKey = useMemo(() => sharedReminders.map((item) => `${item.id}:${item.personalStatus}:${item.updatedAt}`).join("|"), [sharedReminders]);
  const previousSharedReminderActivityKeyRef = useRef(sharedReminderActivityKey);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void loadPinnedMessages();
      void loadConversationEvents();
      void loadConversationNicknames();
    }, 0);
    return () => window.clearTimeout(loadTimer);
  }, [loadConversationEvents, loadConversationNicknames, loadPinnedMessages, realtimeRefreshKey]);

  useEffect(() => {
    if (previousSharedReminderActivityKeyRef.current === sharedReminderActivityKey) return;
    previousSharedReminderActivityKeyRef.current = sharedReminderActivityKey;
    void loadConversationEvents();
  }, [loadConversationEvents, sharedReminderActivityKey]);

  useEffect(() => {
    const loadId = ++latestLoadRef.current;
    const loadStartRealtimeSequence = processedRealtimeSequenceRef.current;
    const loadStartMessageUpdateSequence = processedMessageUpdateSequenceRef.current;
    const loadStartReactionSequence = processedReactionSequenceRef.current;
    const abortController = new AbortController();
    let isCancelled = false;

    async function loadMessages() {
      const shouldScrollAfterLoad = !hasLoadedMessagesRef.current || isNearBottom();
      const [historyResult, introductionResult, participantResult] = await Promise.all([
        supabase.from("messages").select("id, conversation_id, sender_id, body, created_at, edited_at, is_deleted, deleted_at, source_request_id, message_type, reply_to_message_id, is_forwarded").eq("conversation_id", conversation.id).order("created_at", { ascending: false }).limit(initialMessageLimit).abortSignal(abortController.signal),
        supabase.from("messages").select("id, conversation_id, sender_id, body, created_at, edited_at, is_deleted, deleted_at, source_request_id, message_type, reply_to_message_id, is_forwarded").eq("conversation_id", conversation.id).not("source_request_id", "is", null).order("created_at", { ascending: true }).limit(1).abortSignal(abortController.signal),
        supabase.rpc("get_conversation_receipts", { target_conversation_id: conversation.id }).abortSignal(abortController.signal),
      ]);

      if (isCancelled || loadId !== latestLoadRef.current) return;

      if (historyResult.error || introductionResult.error || participantResult.error) {
        setIsLoading(false);
        if (!hasLoadedMessagesRef.current) setHistoryError("We couldn’t load this conversation. Please try again.");
        if (import.meta.env.DEV) console.error("Loading conversation messages failed", { conversationId: conversation.id, historyError: historyResult.error, introductionError: introductionResult.error, participantError: participantResult.error });
        return;
      }

      const serverRowsById = new Map([...(historyResult.data ?? []), ...(introductionResult.data ?? [])].map((row) => [row.id, row as MessageRow]));
      const messageIds = [...serverRowsById.keys()];
      const attachmentsByMessageId = new Map<string, MessageAttachment[]>();
      if (messageIds.length > 0) {
        const attachmentResult = await supabase.from("message_attachments").select("id, message_id, storage_path, original_name, mime_type, size_bytes, width, height, position, attachment_kind, duration_ms").in("message_id", messageIds).order("position", { ascending: true }).abortSignal(abortController.signal);
        if (isCancelled || loadId !== latestLoadRef.current) return;
        if (attachmentResult.error) {
          if (import.meta.env.DEV) console.warn("Loading message attachments failed", { conversationId: conversation.id, code: attachmentResult.error.code });
        } else {
          ((attachmentResult.data ?? []) as AttachmentRow[]).map(mapAttachmentRow).forEach((attachment) => {
            const currentAttachments = attachmentsByMessageId.get(attachment.messageId) ?? [];
            attachmentsByMessageId.set(attachment.messageId, [...currentAttachments, attachment]);
          });
        }
      }
      attachmentsByMessageId.forEach((attachments, messageId) => attachmentCacheRef.current.set(messageId, attachments));
      const baseServerMessages = [...serverRowsById.values()].map((row) => mapMessageRow(row, null, attachmentsByMessageId.get(row.id) ?? []));
      const loadedDeletedMessageIds = new Set(baseServerMessages.filter((message) => message.isDeleted).map((message) => message.id));
      loadedDeletedMessageIds.forEach((messageId) => deletedMessageIdsRef.current.add(messageId));
      const replyTargetById = new Map(baseServerMessages.map((message) => [message.id, message]));
      const replyTargetIds = [...new Set(baseServerMessages.flatMap((message) => message.replyToMessageId ? [message.replyToMessageId] : []))];
      const missingReplyTargetIds = replyTargetIds.filter((messageId) => !replyTargetById.has(messageId));

      if (missingReplyTargetIds.length > 0) {
        const replyTargetsResult = await supabase.from("messages").select("id, conversation_id, sender_id, body, created_at, edited_at, is_deleted, deleted_at, source_request_id, message_type, reply_to_message_id, is_forwarded").eq("conversation_id", conversation.id).in("id", missingReplyTargetIds).abortSignal(abortController.signal);
        if (isCancelled || loadId !== latestLoadRef.current) return;
        if (replyTargetsResult.error) {
          if (import.meta.env.DEV) console.warn("Loading reply targets failed", { conversationId: conversation.id, code: replyTargetsResult.error.code });
        } else {
          const replyRows = (replyTargetsResult.data ?? []) as MessageRow[];
          const replyAttachmentResult = await supabase.from("message_attachments").select("id, message_id, storage_path, original_name, mime_type, size_bytes, width, height, position, attachment_kind, duration_ms").in("message_id", missingReplyTargetIds).order("position", { ascending: true }).abortSignal(abortController.signal);
          if (isCancelled || loadId !== latestLoadRef.current) return;
          const replyAttachmentsById = new Map<string, MessageAttachment[]>();
          if (!replyAttachmentResult.error) ((replyAttachmentResult.data ?? []) as AttachmentRow[]).map(mapAttachmentRow).forEach((attachment) => replyAttachmentsById.set(attachment.messageId, [...(replyAttachmentsById.get(attachment.messageId) ?? []), attachment]));
          replyRows.map((row) => mapMessageRow(row, null, replyAttachmentsById.get(row.id) ?? [])).forEach((message) => replyTargetById.set(message.id, message));
        }
      }

      replyTargetById.forEach((message, messageId) => {
        if (message.isDeleted) deletedMessageIdsRef.current.add(messageId);
        replyTargetCacheRef.current.set(messageId, message);
      });
      const serverMessages = baseServerMessages.map((message) => attachReplyPreview(message, message.replyToMessageId ? replyTargetById.get(message.replyToMessageId) : undefined, currentUserId, otherName)).sort((first, second) => Date.parse(first.createdAt) - Date.parse(second.createdAt));
      let serverReactions: MessageReaction[] = [];
      if (messageIds.length > 0) {
        const reactionResult = await supabase.from("message_reactions").select("id, message_id, user_id, emoji, created_at").in("message_id", messageIds).order("created_at", { ascending: true }).abortSignal(abortController.signal);
        if (isCancelled || loadId !== latestLoadRef.current) return;
        if (reactionResult.error) {
          setReactionError("Reactions couldn’t be loaded. Messaging is still available.");
          if (import.meta.env.DEV) console.warn("Loading message reactions failed", { conversationId: conversation.id, code: reactionResult.error.code });
        } else {
          serverReactions = ((reactionResult.data ?? []) as ReactionRow[]).map(mapReactionRow).filter((reaction) => !loadedDeletedMessageIds.has(reaction.messageId));
        }
      }
      setIsLoading(false);
      const otherParticipant = ((participantResult.data ?? []) as ParticipantRow[]).find((participant) => participant.user_id !== currentUserId);
      if (otherParticipant) {
        const loadedReceipt: ParticipantReceiptCursor = { conversationId: conversation.id, userId: otherParticipant.user_id, lastDeliveredAt: otherParticipant.last_delivered_at, lastReadAt: otherParticipant.last_read_at };
        setOtherReceipt(loadedReceipt);
      }
      const newestIncomingMessage = [...serverMessages].reverse().find((message) => message.senderId !== currentUserId);
      if (newestIncomingMessage) onIncomingMessagesSynchronized(conversation.id, newestIncomingMessage.createdAt);
      const serverMessageIds = new Set(serverMessages.map((message) => message.id));
      serverMessageIds.forEach((messageId) => locallyConfirmedMessageIdsRef.current.delete(messageId));
      setMessages((currentMessages) => {
        const optimisticMessages = currentMessages.filter((message): message is OptimisticChatMessage => message.kind === "optimistic");
        const confirmedDuringLoad = currentMessages.filter((message): message is ChatMessage => {
          if (message.kind !== "confirmed" || serverMessageIds.has(message.id)) return false;
          const realtimeSequence = realtimeSequenceByMessageIdRef.current.get(message.id) ?? 0;
          return realtimeSequence > loadStartRealtimeSequence || locallyConfirmedMessageIdsRef.current.has(message.id);
        });
        const confirmedById = new Map([...serverMessages, ...confirmedDuringLoad].map((message) => [message.id, message]));
        currentMessages.forEach((message) => {
          if (message.kind !== "confirmed" || !confirmedById.has(message.id)) return;
          const serverMessage = confirmedById.get(message.id);
          const updatedDuringLoad = (messageUpdateSequenceByIdRef.current.get(message.id) ?? 0) > loadStartMessageUpdateSequence;
          const hasPendingEdit = pendingEditRef.current?.messageId === message.id;
          const hasPendingDelete = pendingDeleteRef.current?.messageId === message.id;
          if (updatedDuringLoad || hasPendingEdit || hasPendingDelete || (serverMessage && shouldApplyAuthoritativeMessage(serverMessage, message))) confirmedById.set(message.id, message);
        });
        confirmedById.forEach((message, messageId) => replyTargetCacheRef.current.set(messageId, message));
        const hydratedMessages = [...confirmedById.values(), ...optimisticMessages].map((message) => {
          if (!message.replyToMessageId) return message;
          const target = confirmedById.get(message.replyToMessageId) ?? replyTargetCacheRef.current.get(message.replyToMessageId);
          return target ? { ...message, replyPreview: createReplyPreview(target, currentUserId, otherName) } : message;
        });
        return sortMessages(hydratedMessages);
      });
      setReactions((currentReactions) => {
        const optimisticReactions = currentReactions.filter((reaction) => reaction.id.startsWith("optimistic:"));
        const recentRealtimeReactions = currentReactions.filter((reaction) => (reactionInsertSequenceByIdRef.current.get(reaction.id) ?? 0) > loadStartReactionSequence);
        const loadedReactions = serverReactions.filter((reaction) => {
          const deletedByIdSequence = reactionDeleteSequenceByIdRef.current.get(reaction.id) ?? 0;
          const deletedByTupleSequence = reactionDeleteSequenceByTupleRef.current.get(getReactionTupleKey(reaction)) ?? 0;
          return Math.max(deletedByIdSequence, deletedByTupleSequence) <= loadStartReactionSequence;
        });
        return [...loadedReactions, ...recentRealtimeReactions, ...optimisticReactions].reduce((merged, reaction) => mergeReaction(merged, reaction), [] as MessageReaction[]);
      });
      setHistoryError("");
      hasLoadedMessagesRef.current = true;
      if (shouldScrollAfterLoad) scrollToLatest("auto");
    }

    void loadMessages();

    return () => {
      isCancelled = true;
      abortController.abort();
    };
  }, [conversation.id, currentUserId, isNearBottom, onIncomingMessagesSynchronized, otherName, realtimeRefreshKey, retryKey, scrollToLatest]);

  const activeMessageTarget = pinnedJumpTarget ?? messageSearchTarget;

  useEffect(() => {
    const clearTimer = window.setTimeout(() => setPinnedJumpTarget(null), 0);
    return () => window.clearTimeout(clearTimer);
  }, [messageSearchTarget?.token]);

  useEffect(() => {
    if (isLoading || !activeMessageTarget || activeMessageTarget.conversationId !== conversation.id || processedSearchTargetTokenRef.current === activeMessageTarget.token) return;
    const searchTarget = activeMessageTarget;
    processedSearchTargetTokenRef.current = searchTarget.token;
    const abortController = new AbortController();
    let isCancelled = false;

    function revealTarget() {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        if (isCancelled) return;
        const element = messageElementsRef.current.get(searchTarget.messageId);
        if (!element) {
          setSearchContextError("That message is no longer available in this context.");
          return;
        }
        element.scrollIntoView({ behavior: shouldReduceMotion ? "auto" : "smooth", block: "center" });
        element.focus({ preventScroll: true });
        setHighlightedMessageId(searchTarget.messageId);
        if (replyHighlightTimerRef.current !== null) window.clearTimeout(replyHighlightTimerRef.current);
        replyHighlightTimerRef.current = window.setTimeout(() => {
          setHighlightedMessageId((currentMessageId) => currentMessageId === searchTarget.messageId ? null : currentMessageId);
          replyHighlightTimerRef.current = null;
        }, replyHighlightDurationMs);
      }));
    }

    const targetWasAlreadyLoaded = messageElementsRef.current.has(searchTarget.messageId);

    async function loadSearchContext() {
      setIsLoadingSearchContext(true);
      setSearchContextError("");
      const { data, error } = await supabase.rpc("load_message_context", { target_message_id: searchTarget.messageId, before_count: 20, after_count: 20 }).abortSignal(abortController.signal);
      if (isCancelled || abortController.signal.aborted) return;
      if (error || !data) {
        setIsLoadingSearchContext(false);
        setSearchContextError(navigator.onLine ? "That message context couldn’t be loaded. Please try again." : "You appear to be offline. Reconnect and try again.");
        if (searchTarget.token.startsWith("pin:")) void loadPinnedMessages();
        if (searchTarget.token.startsWith("event:")) void loadConversationEvents();
        if (error && import.meta.env.DEV) console.warn("Loading searched message context failed", { code: error.code, conversationId: conversation.id });
        return;
      }

      const rawContextRows = (data as MessageRow[]).filter((row) => row.conversation_id === conversation.id);
      const contextIds = rawContextRows.map((row) => row.id);
      const forwardingResult = contextIds.length > 0
        ? await supabase.from("messages").select("id, is_forwarded").eq("conversation_id", conversation.id).in("id", contextIds).abortSignal(abortController.signal)
        : { data: [], error: null };
      if (isCancelled || abortController.signal.aborted) return;
      if (forwardingResult.error && import.meta.env.DEV) console.warn("Loading forwarded-message context metadata failed", { code: forwardingResult.error.code, conversationId: conversation.id });
      const forwardingByMessageId = new Map((forwardingResult.data ?? []).map((row) => [row.id, row.is_forwarded === true]));
      const contextRows = rawContextRows.map((row) => ({ ...row, is_forwarded: forwardingByMessageId.get(row.id) ?? false }));
      if (!contextIds.includes(searchTarget.messageId)) {
        setIsLoadingSearchContext(false);
        setSearchContextError("That message is no longer available.");
        if (searchTarget.token.startsWith("pin:")) void loadPinnedMessages();
        if (searchTarget.token.startsWith("event:")) void loadConversationEvents();
        return;
      }

      if (targetWasAlreadyLoaded) {
        const targetRow = contextRows.find((row) => row.id === searchTarget.messageId) as MessageRow;
        const authoritativeTarget = attachReplyPreview(mapMessageRow(targetRow, null, attachmentCacheRef.current.get(targetRow.id) ?? []), targetRow.reply_to_message_id ? replyTargetCacheRef.current.get(targetRow.reply_to_message_id) : undefined, currentUserId, otherName);
        replyTargetCacheRef.current.set(authoritativeTarget.id, authoritativeTarget);
        if (authoritativeTarget.isDeleted) deletedMessageIdsRef.current.add(authoritativeTarget.id);
        setMessages((currentMessages) => patchMessageAndReplies(currentMessages, authoritativeTarget, currentUserId, otherName));
        if (authoritativeTarget.isDeleted) setReactions((currentReactions) => currentReactions.filter((reaction) => reaction.messageId !== authoritativeTarget.id));
        onMessageUpdated(authoritativeTarget);
        setIsLoadingSearchContext(false);
        setSearchContextError("");
        revealTarget();
        return;
      }

      const [attachmentResult, reactionResult] = await Promise.all([
        contextIds.length > 0 ? supabase.from("message_attachments").select("id, message_id, storage_path, original_name, mime_type, size_bytes, width, height, position, attachment_kind, duration_ms").in("message_id", contextIds).order("position", { ascending: true }).abortSignal(abortController.signal) : Promise.resolve({ data: [], error: null }),
        contextIds.length > 0 ? supabase.from("message_reactions").select("id, message_id, user_id, emoji, created_at").in("message_id", contextIds).order("created_at", { ascending: true }).abortSignal(abortController.signal) : Promise.resolve({ data: [], error: null }),
      ]);
      if (isCancelled || abortController.signal.aborted) return;
      if (attachmentResult.error || reactionResult.error) {
        setIsLoadingSearchContext(false);
        setSearchContextError("The message context couldn’t be fully hydrated. Please retry.");
        if (import.meta.env.DEV) console.warn("Hydrating searched message context failed", { attachmentCode: attachmentResult.error?.code, reactionCode: reactionResult.error?.code });
        return;
      }

      const attachmentsByMessageId = new Map<string, MessageAttachment[]>();
      ((attachmentResult.data ?? []) as AttachmentRow[]).map(mapAttachmentRow).forEach((attachment) => {
        attachmentsByMessageId.set(attachment.messageId, [...(attachmentsByMessageId.get(attachment.messageId) ?? []), attachment]);
      });
      attachmentsByMessageId.forEach((attachments, messageId) => attachmentCacheRef.current.set(messageId, attachments));
      const baseMessages = contextRows.map((row) => mapMessageRow(row, null, attachmentsByMessageId.get(row.id) ?? []));
      const targetById = new Map(baseMessages.map((message) => [message.id, message]));
      const missingReplyIds = [...new Set(baseMessages.flatMap((message) => message.replyToMessageId && !targetById.has(message.replyToMessageId) ? [message.replyToMessageId] : []))];

      if (missingReplyIds.length > 0) {
        const replyResult = await supabase.from("messages").select("id, conversation_id, sender_id, body, created_at, edited_at, is_deleted, deleted_at, source_request_id, message_type, reply_to_message_id, is_forwarded").eq("conversation_id", conversation.id).in("id", missingReplyIds).abortSignal(abortController.signal);
        if (isCancelled || abortController.signal.aborted) return;
        if (replyResult.error) {
          if (import.meta.env.DEV) console.warn("Hydrating searched reply targets failed", { code: replyResult.error.code, conversationId: conversation.id });
        } else {
          const replyRows = (replyResult.data ?? []) as MessageRow[];
          const replyAttachmentResult = await supabase.from("message_attachments").select("id, message_id, storage_path, original_name, mime_type, size_bytes, width, height, position, attachment_kind, duration_ms").in("message_id", missingReplyIds).order("position", { ascending: true }).abortSignal(abortController.signal);
          if (isCancelled || abortController.signal.aborted) return;
          const replyAttachmentsById = new Map<string, MessageAttachment[]>();
          if (!replyAttachmentResult.error) ((replyAttachmentResult.data ?? []) as AttachmentRow[]).map(mapAttachmentRow).forEach((attachment) => replyAttachmentsById.set(attachment.messageId, [...(replyAttachmentsById.get(attachment.messageId) ?? []), attachment]));
          replyRows.map((row) => mapMessageRow(row, null, replyAttachmentsById.get(row.id) ?? [])).forEach((message) => targetById.set(message.id, message));
        }
      }

      targetById.forEach((message) => {
        replyTargetCacheRef.current.set(message.id, message);
        if (message.isDeleted) deletedMessageIdsRef.current.add(message.id);
      });
      const hydratedMessages = baseMessages.map((message) => attachReplyPreview(message, message.replyToMessageId ? targetById.get(message.replyToMessageId) : undefined, currentUserId, otherName));
      const contextIdSet = new Set(contextIds);
      setMessages((currentMessages) => sortMessages([...hydratedMessages, ...currentMessages.filter((message) => message.kind === "optimistic")]));
      setReactions((currentReactions) => {
        const authoritative = ((reactionResult.data ?? []) as ReactionRow[]).map(mapReactionRow).filter((reaction) => !deletedMessageIdsRef.current.has(reaction.messageId));
        const pending = currentReactions.filter((reaction) => reaction.id.startsWith("optimistic:") && contextIdSet.has(reaction.messageId));
        return [...authoritative, ...pending].reduce((merged, reaction) => mergeReaction(merged, reaction), [] as MessageReaction[]);
      });
      setIsViewingSearchContext(true);
      setShowJumpToLatest(true);
      setIsLoadingSearchContext(false);
      revealTarget();
    }

    void loadSearchContext();
    return () => {
      isCancelled = true;
      abortController.abort();
    };
  }, [activeMessageTarget, conversation.id, currentUserId, isLoading, loadConversationEvents, loadPinnedMessages, onMessageUpdated, otherName, searchContextRetryKey, shouldReduceMotion]);

  useEffect(() => {
    const newEvents = realtimeMessageEvents.filter((event) => event.sequence > processedRealtimeSequenceRef.current);
    if (newEvents.length === 0) return;

    processedRealtimeSequenceRef.current = newEvents[newEvents.length - 1]?.sequence ?? processedRealtimeSequenceRef.current;
    const relevantEvents = newEvents.filter((event) => event.message.conversationId === conversation.id);
    if (relevantEvents.length === 0) return;

    const shouldAutoScroll = !isViewingSearchContext && isNearBottom();
    const receivedIncomingMessage = relevantEvents.some((event) => event.message.senderId !== currentUserId);
    relevantEvents.forEach((event) => replyTargetCacheRef.current.set(event.message.id, event.message));

    setMessages((currentMessages) => {
      let nextMessages = currentMessages;

      relevantEvents.forEach((event) => {
        const incomingMessage = { ...event.message, attachments: attachmentCacheRef.current.get(event.message.id) ?? event.message.attachments };
        const message = attachReplyPreview(incomingMessage, incomingMessage.replyToMessageId ? replyTargetCacheRef.current.get(incomingMessage.replyToMessageId) : undefined, currentUserId, otherName);
        realtimeSequenceByMessageIdRef.current.set(message.id, event.sequence);
        const inFlightMessage = inFlightMessageRef.current;
        const matchingOptimisticMessage = nextMessages.find((item): item is OptimisticChatMessage => item.kind === "optimistic" && (item.optimisticId === message.id || (item.senderId === message.senderId && item.body === message.body && item.messageType === message.messageType && item.replyToMessageId === message.replyToMessageId)) && (item.deliveryState === "sending" || item.deliveryState === "failed"));
        const optimisticId = message.senderId === currentUserId && inFlightMessage?.conversationId === message.conversationId && inFlightMessage.body === message.body && inFlightMessage.replyToMessageId === message.replyToMessageId ? inFlightMessage.optimisticId : message.senderId === currentUserId ? matchingOptimisticMessage?.optimisticId : undefined;
        nextMessages = reconcileConfirmedMessage(nextMessages, message, optimisticId);
        const newTargetPreview = createReplyPreview(message, currentUserId, otherName);
        nextMessages = nextMessages.map((item) => item.replyToMessageId === message.id ? { ...item, replyPreview: newTargetPreview } : item);
      });

      return nextMessages;
    });

    relevantEvents.forEach((event) => {
      const replyToMessageId = event.message.replyToMessageId;
      if (replyToMessageId && !replyTargetCacheRef.current.has(replyToMessageId)) loadReplyTarget(replyToMessageId);
      if ((event.message.messageType === "image" || event.message.messageType === "voice" || event.message.messageType === "file") && !attachmentCacheRef.current.has(event.message.id)) loadMessageAttachments(event.message.id);
    });

    if (receivedIncomingMessage) {
      setNewMessageAnnouncement(`New message from ${otherName}.`);
      if (shouldAutoScroll) scrollToLatest("auto");
      else setShowJumpToLatest(true);
    }
  }, [conversation.id, currentUserId, isNearBottom, isViewingSearchContext, loadMessageAttachments, loadReplyTarget, otherName, realtimeMessageEvents, scrollToLatest]);

  useEffect(() => {
    const newEvents = realtimeMessageUpdateEvents.filter((event) => event.sequence > processedMessageUpdateSequenceRef.current).sort((first, second) => first.sequence - second.sequence);
    if (newEvents.length === 0) return;
    processedMessageUpdateSequenceRef.current = newEvents[newEvents.length - 1]?.sequence ?? processedMessageUpdateSequenceRef.current;
    const relevantEvents = newEvents.filter((event) => event.message.conversationId === conversation.id);
    if (relevantEvents.length === 0) return;

    const deletedMessageIds = new Set(relevantEvents.filter((event) => event.message.isDeleted).map((event) => event.message.id));
    deletedMessageIds.forEach((messageId) => deletedMessageIdsRef.current.add(messageId));
    if (deletedMessageIds.size > 0) {
      setReactions((currentReactions) => currentReactions.filter((reaction) => !deletedMessageIds.has(reaction.messageId)));
      setPinnedMessages((currentPins) => currentPins.filter((pin) => !deletedMessageIds.has(pin.messageId)));
      setConversationEvents((currentEvents) => currentEvents.filter((event) => !event.targetMessageId || !deletedMessageIds.has(event.targetMessageId)));
      setMessageEditState((currentState) => currentState && deletedMessageIds.has(currentState.messageId) ? null : currentState);
      setReplyingTo((currentTarget) => currentTarget && deletedMessageIds.has(currentTarget.id) ? null : currentTarget);
      setQuickReactionMessageId((messageId) => messageId && deletedMessageIds.has(messageId) ? null : messageId);
      setFullReactionPickerMessageId((messageId) => messageId && deletedMessageIds.has(messageId) ? null : messageId);
      setReactionDetailsMessageId((messageId) => messageId && deletedMessageIds.has(messageId) ? null : messageId);
      setMobileActionMessageId((messageId) => messageId && deletedMessageIds.has(messageId) ? null : messageId);
      setImageViewerState((currentState) => currentState && deletedMessageIds.has(currentState.messageId) ? null : currentState);
      setMessageDeleteState((currentState) => currentState && deletedMessageIds.has(currentState.messageId) && pendingDeleteRef.current?.messageId !== currentState.messageId ? null : currentState);
      if (pendingEditRef.current && deletedMessageIds.has(pendingEditRef.current.messageId)) pendingEditRef.current = null;
    }

    setPinnedMessages((currentPins) => currentPins.flatMap((pin) => {
      const update = relevantEvents.find((event) => event.message.id === pin.messageId)?.message;
      if (!update) return [pin];
      if (update.isDeleted) return [];
      return [{ ...pin, body: update.body, createdAt: update.createdAt, messageType: update.messageType }];
    }));

    setMessages((currentMessages) => {
      let nextMessages = currentMessages;
      relevantEvents.forEach((event) => {
        const incomingMessage = event.message;
        const pendingDelete = pendingDeleteRef.current;
        if (pendingDelete?.messageId === incomingMessage.id) {
          if (incomingMessage.isDeleted) pendingDelete.confirmedMessage = incomingMessage;
          else if (shouldApplyAuthoritativeMessage(pendingDelete.deferredMessage ?? pendingDelete.previousMessage, incomingMessage)) pendingDelete.deferredMessage = incomingMessage;
          if (!incomingMessage.isDeleted) return;
        }
        const pendingEdit = pendingEditRef.current;
        if (pendingEdit?.messageId === incomingMessage.id && !incomingMessage.isDeleted && incomingMessage.body !== pendingEdit.attemptedBody) {
          const deferredMessage = pendingEdit.deferredMessage;
          if (shouldApplyAuthoritativeMessage(deferredMessage ?? pendingEdit.previousMessage, incomingMessage)) pendingEdit.deferredMessage = incomingMessage;
          return;
        }
        const currentMessage = nextMessages.find((message): message is ChatMessage => message.kind === "confirmed" && message.id === incomingMessage.id) ?? replyTargetCacheRef.current.get(incomingMessage.id);
        if (!shouldApplyAuthoritativeMessage(currentMessage, incomingMessage) && incomingMessage.body !== pendingEdit?.attemptedBody) return;
        const normalizedMessage = { ...incomingMessage, attachments: currentMessage?.attachments ?? incomingMessage.attachments, replyPreview: currentMessage?.replyPreview ?? incomingMessage.replyPreview };
        if (pendingEdit?.messageId === incomingMessage.id && incomingMessage.body === pendingEdit.attemptedBody) pendingEdit.confirmedMessage = normalizedMessage;
        messageUpdateSequenceByIdRef.current.set(incomingMessage.id, event.sequence);
        replyTargetCacheRef.current.set(incomingMessage.id, normalizedMessage);
        nextMessages = patchMessageAndReplies(nextMessages, normalizedMessage, currentUserId, otherName);
      });
      return nextMessages;
    });
  }, [conversation.id, currentUserId, otherName, realtimeMessageUpdateEvents]);

  useEffect(() => {
    const newEvents = realtimeReactionEvents.filter((event) => event.sequence > processedReactionSequenceRef.current).sort((first, second) => first.sequence - second.sequence);
    if (newEvents.length === 0) return;
    processedReactionSequenceRef.current = Math.max(processedReactionSequenceRef.current, ...newEvents.map((event) => event.sequence));

    setReactions((currentReactions) => newEvents.reduce((nextReactions, event) => {
      if (event.action === "insert") {
        if (deletedMessageIdsRef.current.has(event.reaction.messageId)) return nextReactions;
        const tupleKey = getReactionTupleKey(event.reaction);
        const latestDeleteSequence = Math.max(reactionDeleteSequenceByIdRef.current.get(event.reaction.id) ?? 0, reactionDeleteSequenceByTupleRef.current.get(tupleKey) ?? 0);
        if (latestDeleteSequence >= event.sequence) return nextReactions;
        reactionInsertSequenceByIdRef.current.set(event.reaction.id, event.sequence);
        reactionDeleteSequenceByIdRef.current.delete(event.reaction.id);
        reactionDeleteSequenceByTupleRef.current.delete(tupleKey);
        return mergeReaction(nextReactions, event.reaction);
      }

      if (event.reaction.id) reactionDeleteSequenceByIdRef.current.set(event.reaction.id, event.sequence);
      const deletedTupleKey = getDeletedReactionTupleKey(event.reaction);
      if (deletedTupleKey) reactionDeleteSequenceByTupleRef.current.set(deletedTupleKey, event.sequence);
      return nextReactions.filter((reaction) => !matchesDeletedReaction(reaction, event.reaction));
    }, currentReactions));
  }, [realtimeReactionEvents]);

  useEffect(() => {
    const newEvents = realtimePinnedMessageEvents.filter((event) => event.sequence > processedPinnedMessageSequenceRef.current).sort((first, second) => first.sequence - second.sequence);
    if (newEvents.length === 0) return;
    processedPinnedMessageSequenceRef.current = newEvents[newEvents.length - 1]?.sequence ?? processedPinnedMessageSequenceRef.current;
    const relevantEvents = newEvents.filter((event) => event.action === "insert" ? event.pin.conversationId === conversation.id : event.pin.conversationId === null || event.pin.conversationId === conversation.id);
    if (relevantEvents.length === 0) return;

    const deletedMessageIds = new Set(relevantEvents.filter((event) => event.action === "delete").map((event) => event.pin.messageId));
    if (deletedMessageIds.size > 0) setPinnedMessages((currentPins) => currentPins.filter((pin) => !deletedMessageIds.has(pin.messageId)));
    if (relevantEvents.some((event) => event.action === "insert")) void loadPinnedMessages();
  }, [conversation.id, loadPinnedMessages, realtimePinnedMessageEvents]);

  useEffect(() => {
    const newEvents = realtimeConversationNicknameEvents.filter((event) => event.sequence > processedConversationNicknameSequenceRef.current).sort((first, second) => first.sequence - second.sequence);
    if (newEvents.length === 0) return;
    processedConversationNicknameSequenceRef.current = newEvents[newEvents.length - 1]?.sequence ?? processedConversationNicknameSequenceRef.current;
    const relevantEvents = newEvents.filter((event) => event.nickname.conversationId === conversation.id);
    if (relevantEvents.length === 0) return;
    setNicknamesByUserId((currentNicknames) => {
      const nextNicknames = new Map(currentNicknames);
      relevantEvents.forEach((event) => {
        if (event.action === "delete") nextNicknames.delete(event.nickname.userId);
        else nextNicknames.set(event.nickname.userId, event.nickname.nickname);
      });
      return nextNicknames;
    });
    const otherParticipantChange = [...relevantEvents].reverse().find((event) => event.nickname.userId === conversation.otherProfile.id);
    if (otherParticipantChange) {
      const nextOtherName = otherParticipantChange.action === "delete" ? otherAccountName : otherParticipantChange.nickname.nickname;
      setPinnedMessages((currentPins) => currentPins.map((pin) => pin.senderId === currentUserId ? pin : { ...pin, senderName: nextOtherName }));
      setMessages((currentMessages) => currentMessages.map((message) => message.replyPreview && message.replyPreview.senderId !== currentUserId ? { ...message, replyPreview: { ...message.replyPreview, senderName: nextOtherName } } : message));
    }
  }, [conversation.id, conversation.otherProfile.id, currentUserId, otherAccountName, realtimeConversationNicknameEvents]);

  useEffect(() => {
    const newEvents = realtimeConversationActivityEvents.filter((event) => event.sequence > processedConversationActivitySequenceRef.current).sort((first, second) => first.sequence - second.sequence);
    if (newEvents.length === 0) return;
    processedConversationActivitySequenceRef.current = newEvents[newEvents.length - 1]?.sequence ?? processedConversationActivitySequenceRef.current;

    const relevantEvents = newEvents.filter((change) => change.action === "insert" ? change.event.conversationId === conversation.id : change.event.conversationId === null || change.event.conversationId === conversation.id);
    if (relevantEvents.length === 0) return;

    relevantEvents.forEach((change) => {
      if (change.action === "delete") {
        rememberDeletedConversationEvent(change.event.id);
        setConversationEvents((currentEvents) => currentEvents.filter((event) => event.id !== change.event.id && (!change.event.targetMessageId || event.targetMessageId !== change.event.targetMessageId) && (!change.event.targetReminderId || event.targetReminderId !== change.event.targetReminderId)));
        return;
      }

      if (deletedConversationEventIdsRef.current.has(change.event.id)) return;
      if (change.event.eventType === "reminder_created") {
        void loadConversationEvents();
        return;
      }
      if (!rememberConversationEvent(change.event.id)) return;
      const event: ConversationActivityEvent = {
        ...change.event,
        actorName: change.event.actorId === currentUserId ? "You" : change.event.eventType === "message_pinned" || change.event.eventType === "theme_changed" ? otherName : otherAccountName,
        targetUserName: change.event.targetUserId === currentUserId ? currentName : change.event.targetUserId ? otherAccountName : null,
        isOptimistic: false,
      };
      setConversationEvents((currentEvents) => mergeConversationEvent(currentEvents, event));
      if (change.event.eventType === "message_pinned" && change.event.actorId !== currentUserId) showPinToast(`${otherName} pinned a message`);
      if (change.event.eventType === "theme_changed" && change.event.actorId !== currentUserId) showPinToast(`${otherName} changed the theme to ${getConversationTheme(change.event.themeKey).name}`);
    });
  }, [conversation.id, currentName, currentUserId, loadConversationEvents, otherAccountName, otherName, realtimeConversationActivityEvents, rememberConversationEvent, rememberDeletedConversationEvent, showPinToast]);

  useEffect(() => {
    const newEvents = realtimeReceiptEvents.filter((event) => event.sequence > processedReceiptSequenceRef.current);
    if (newEvents.length === 0) return;
    processedReceiptSequenceRef.current = newEvents[newEvents.length - 1]?.sequence ?? processedReceiptSequenceRef.current;
    const otherParticipantEvents = newEvents.filter((event) => event.receipt.conversationId === conversation.id && event.receipt.userId === conversation.otherProfile.id);
    if (otherParticipantEvents.length === 0) return;
    setOtherReceipt(otherParticipantEvents.at(-1)?.receipt ?? null);
  }, [conversation.id, conversation.otherProfile.id, realtimeReceiptEvents]);

  const newestIncomingMessage = [...messages].reverse().find((message): message is ChatMessage => message.kind === "confirmed" && message.senderId !== currentUserId);
  const newestIncomingMessageCreatedAt = newestIncomingMessage?.createdAt ?? null;

  useEffect(() => {
    if (!newestIncomingMessageCreatedAt || !hasLoadedMessagesRef.current) return;
    onIncomingMessagesSynchronized(conversation.id, newestIncomingMessageCreatedAt);
  }, [conversation.id, newestIncomingMessageCreatedAt, onIncomingMessagesSynchronized]);

  useEffect(() => {
    if (!newestIncomingMessageCreatedAt || isLoading || !hasLoadedMessagesRef.current) return;
    const messageCreatedAt = newestIncomingMessageCreatedAt;

    function isConversationVisiblyActive() {
      const panel = panelRef.current;
      if (!panel || document.visibilityState !== "visible" || !document.hasFocus()) return false;
      const bounds = panel.getBoundingClientRect();
      return panel.getClientRects().length > 0 && bounds.width > 0 && bounds.height > 0;
    }

    function clearReadTimer() {
      if (readAcknowledgementTimerRef.current === null) return;
      window.clearTimeout(readAcknowledgementTimerRef.current);
      readAcknowledgementTimerRef.current = null;
    }

    function scheduleReadAcknowledgement() {
      clearReadTimer();
      if (!isConversationVisiblyActive()) return;
      readAcknowledgementTimerRef.current = window.setTimeout(() => {
        readAcknowledgementTimerRef.current = null;
        if (isConversationVisiblyActive()) onConversationRead(conversation.id, messageCreatedAt);
      }, readAcknowledgementDebounceMs);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") scheduleReadAcknowledgement();
      else clearReadTimer();
    }

    scheduleReadAcknowledgement();
    window.addEventListener("focus", scheduleReadAcknowledgement);
    window.addEventListener("blur", clearReadTimer);
    window.addEventListener("resize", scheduleReadAcknowledgement);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearReadTimer();
      window.removeEventListener("focus", scheduleReadAcknowledgement);
      window.removeEventListener("blur", clearReadTimer);
      window.removeEventListener("resize", scheduleReadAcknowledgement);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [compactVisibilitySignal, conversation.id, isLoading, newestIncomingMessageCreatedAt, onConversationRead]);

  function handleHistoryRetry() {
    latestLoadRef.current += 1;
    setMessages((currentMessages) => currentMessages.filter((message) => message.kind === "optimistic"));
    setReactions((currentReactions) => currentReactions.filter((reaction) => reaction.id.startsWith("optimistic:")));
    setIsLoading(true);
    setHistoryError("");
    hasLoadedMessagesRef.current = false;
    setRetryKey((key) => key + 1);
  }

  function handleJumpToLatest() {
    if (!isViewingSearchContext) {
      scrollToLatest("smooth");
      return;
    }
    latestLoadRef.current += 1;
    setIsViewingSearchContext(false);
    setIsLoading(true);
    setSearchContextError("");
    hasLoadedMessagesRef.current = false;
    setRetryKey((key) => key + 1);
  }

  function resetTextareaHeight() {
    if (textareaRef.current) textareaRef.current.style.height = "";
  }

  function resizeTextarea(textarea: HTMLTextAreaElement) {
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`;
  }

  async function submitMessage(body: string, existingOptimisticId?: string, retryReplyTarget?: MessageReplyPreview | null, retryReplyToMessageId?: string | null) {
    if (!currentUserId || isSubmittingRef.current) return;

    const trimmedBody = body.trim();
    if (!trimmedBody || trimmedBody.length > messageMaxLength) return;
    stopTyping();

    const optimisticId = existingOptimisticId ?? createOptimisticId();
    const replyTarget = existingOptimisticId ? retryReplyTarget ?? null : replyingTo;
    const replyToMessageId = existingOptimisticId ? retryReplyToMessageId ?? replyTarget?.id ?? null : replyTarget?.id ?? null;
    const optimisticMessage: OptimisticChatMessage = {
      kind: "optimistic",
      optimisticId,
      conversationId: conversation.id,
      senderId: currentUserId,
      body: trimmedBody,
      createdAt: new Date().toISOString(),
      deliveryState: "sending",
      messageType: "text",
      attachments: [],
      replyToMessageId,
      replyPreview: replyTarget,
    };

    isSubmittingRef.current = true;
    inFlightMessageRef.current = { optimisticId, conversationId: conversation.id, body: trimmedBody, replyToMessageId };
    setIsSubmitting(true);
    setMessages((currentMessages) => {
      const withoutExistingOptimistic = currentMessages.filter((message) => message.kind === "confirmed" || message.optimisticId !== optimisticId);
      return sortMessages([...withoutExistingOptimistic, optimisticMessage]);
    });

    if (!existingOptimisticId) {
      setDraft("");
      resetTextareaHeight();
    }
    setShowJumpToLatest(false);
    scrollToLatest("smooth");

    const { data, error } = await supabase.from("messages").insert({ conversation_id: conversation.id, sender_id: currentUserId, body: trimmedBody, reply_to_message_id: replyToMessageId }).select("id, conversation_id, sender_id, body, created_at, edited_at, is_deleted, deleted_at, source_request_id, message_type, reply_to_message_id, is_forwarded").single();

    if (error || !data) {
      if (isMountedRef.current) {
        setMessages((currentMessages) => currentMessages.map((message) => message.kind === "optimistic" && message.optimisticId === optimisticId ? { ...message, deliveryState: "failed" } : message));
        setIsSubmitting(false);
      }
      if (import.meta.env.DEV) console.error("Sending conversation message failed", { conversationId: conversation.id, error });
      isSubmittingRef.current = false;
      if (inFlightMessageRef.current?.optimisticId === optimisticId) inFlightMessageRef.current = null;
      return;
    }

    const confirmedMessage = mapMessageRow(data as MessageRow, replyTarget ?? (replyToMessageId ? createUnavailableReplyPreview(replyToMessageId) : null));
    locallyConfirmedMessageIdsRef.current.add(confirmedMessage.id);
    if (isMountedRef.current) {
      setMessages((currentMessages) => reconcileConfirmedMessage(currentMessages, confirmedMessage, optimisticId));
      setIsSubmitting(false);
      if (replyTarget) setReplyingTo((currentTarget) => currentTarget?.id === replyTarget.id ? null : currentTarget);
      window.requestAnimationFrame(() => textareaRef.current?.focus());
    }
    isSubmittingRef.current = false;
    if (inFlightMessageRef.current?.optimisticId === optimisticId) inFlightMessageRef.current = null;
    onMessageConfirmed();
  }

  async function submitImageMessage(caption: string, sourceImages: ComposerImageSelection[] | OptimisticMessageAttachment[], existingOptimisticId?: string, retryReplyTarget?: MessageReplyPreview | null, retryReplyToMessageId?: string | null) {
    if (!interactionStatus.messagingAvailable) { setMediaError("Messaging is unavailable for this conversation."); return; }
    if (!currentUserId || isSubmittingRef.current || sourceImages.length === 0 || sourceImages.length > imageMaxCount) return;

    const trimmedCaption = caption.trim();
    if (trimmedCaption.length > messageMaxLength) return;
    const optimisticId = existingOptimisticId ?? createUuid();
    const replyTarget = existingOptimisticId ? retryReplyTarget ?? null : replyingTo;
    const replyToMessageId = existingOptimisticId ? retryReplyToMessageId ?? replyTarget?.id ?? null : replyTarget?.id ?? null;
    const optimisticAttachments: OptimisticMessageAttachment[] = sourceImages.map((image, position) => {
      if ("previewUrl" in image) return { ...image, position };
      const previewUrl = URL.createObjectURL(image.file);
      optimisticPreviewUrlsRef.current.add(previewUrl);
      return { id: image.localId, messageId: optimisticId, storagePath: `${conversation.id}/${currentUserId}/${optimisticId}/${createUuid()}.${getImageExtension(image.mimeType)}`, originalName: image.originalName, mimeType: image.mimeType, size: image.size, width: image.width, height: image.height, position, attachmentKind: "image", durationMs: null, file: image.file, previewUrl };
    });
    const optimisticMessage: OptimisticChatMessage = { kind: "optimistic", optimisticId, conversationId: conversation.id, senderId: currentUserId, body: trimmedCaption, createdAt: new Date().toISOString(), deliveryState: "sending", messageType: "image", attachments: optimisticAttachments, replyToMessageId, replyPreview: replyTarget };

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setIsComposerEmojiPickerOpen(false);
    setMediaError("");
    stopTyping();
    setMessages((currentMessages) => sortMessages([...currentMessages.filter((message) => message.kind === "confirmed" || message.optimisticId !== optimisticId), optimisticMessage]));
    setShowJumpToLatest(false);
    scrollToLatest("smooth");

    async function cleanupUploadedObjects(paths: string[]) {
      if (paths.length === 0) return;
      const { error } = await supabase.storage.from(messageMediaBucket).remove(paths);
      if (error && import.meta.env.DEV) console.warn("Cleaning up message-media uploads failed", { conversationId: conversation.id, count: paths.length, code: error.message });
    }

    async function reconcileExistingMessage() {
      const { data: existingMessage } = await supabase.from("messages").select("id, conversation_id, sender_id, body, created_at, edited_at, is_deleted, deleted_at, source_request_id, message_type, reply_to_message_id, is_forwarded").eq("id", optimisticId).eq("conversation_id", conversation.id).eq("sender_id", currentUserId).maybeSingle();
      if (!existingMessage) return null;
      const { data: existingAttachments, error: attachmentError } = await supabase.from("message_attachments").select("id, message_id, storage_path, original_name, mime_type, size_bytes, width, height, position, attachment_kind, duration_ms").eq("message_id", optimisticId).order("position", { ascending: true });
      if (attachmentError) return null;
      return { message: existingMessage as MessageRow, attachments: (existingAttachments ?? []) as AttachmentRow[] };
    }

    let result: CreateImageMessageResult | null = existingOptimisticId ? await reconcileExistingMessage() : null;
    const uploadedPaths: string[] = [];

    if (!result) {
      if (existingOptimisticId) await cleanupUploadedObjects(optimisticAttachments.map((attachment) => attachment.storagePath));
      for (const attachment of optimisticAttachments) {
        const { error } = await supabase.storage.from(messageMediaBucket).upload(attachment.storagePath, attachment.file, { cacheControl: "3600", contentType: attachment.mimeType, upsert: false });
        if (error) {
          await cleanupUploadedObjects(optimisticAttachments.map((item) => item.storagePath));
          if (isMountedRef.current) {
            setMessages((currentMessages) => currentMessages.map((message) => message.kind === "optimistic" && message.optimisticId === optimisticId ? { ...message, deliveryState: "failed" } : message));
            setMediaError("One or more images couldn’t be uploaded. Your selection is still available to retry.");
          }
          if (import.meta.env.DEV) console.error("Uploading message image failed", { conversationId: conversation.id, path: attachment.storagePath, code: error.message });
          isSubmittingRef.current = false;
          setIsSubmitting(false);
          return;
        }
        uploadedPaths.push(attachment.storagePath);
      }

      const attachmentRecords = optimisticAttachments.map((attachment) => ({ storage_path: attachment.storagePath, original_name: attachment.originalName, mime_type: attachment.mimeType, size_bytes: attachment.size, width: attachment.width, height: attachment.height, position: attachment.position }));
      const { data, error } = await supabase.rpc("create_image_message", { target_message_id: optimisticId, target_conversation_id: conversation.id, caption_text: trimmedCaption, target_reply_to_message_id: replyToMessageId, attachment_records: attachmentRecords });
      if (!error && data && typeof data === "object" && "message" in data && "attachments" in data) result = data as unknown as CreateImageMessageResult;
      if (!result) result = await reconcileExistingMessage();
      if (!result) {
        await cleanupUploadedObjects(uploadedPaths);
        if (isMountedRef.current) {
          setMessages((currentMessages) => currentMessages.map((message) => message.kind === "optimistic" && message.optimisticId === optimisticId ? { ...message, deliveryState: "failed" } : message));
          setMediaError("The image message couldn’t be created. Your caption and images are still available.");
        }
        if (import.meta.env.DEV) console.error("Creating image message failed", { conversationId: conversation.id, code: error?.code });
        isSubmittingRef.current = false;
        setIsSubmitting(false);
        return;
      }
    }

    const attachments = result.attachments.map(mapAttachmentRow);
    const confirmedMessage = mapMessageRow(result.message, replyTarget ?? (replyToMessageId ? createUnavailableReplyPreview(replyToMessageId) : null), attachments);
    attachmentCacheRef.current.set(confirmedMessage.id, attachments);
    locallyConfirmedMessageIdsRef.current.add(confirmedMessage.id);
    if (isMountedRef.current) {
      setMessages((currentMessages) => reconcileConfirmedMessage(currentMessages, confirmedMessage, optimisticId));
      const sentFiles = new Set(sourceImages.map((image) => image.file));
      const sentSelectedImages = selectedImagesRef.current.filter((image) => sentFiles.has(image.file));
      const remainingSelectedImages = selectedImagesRef.current.filter((image) => !sentFiles.has(image.file));
      selectedImagesRef.current = remainingSelectedImages;
      setSelectedImages(remainingSelectedImages);
      if (draft.trim() === trimmedCaption && remainingSelectedImages.length === 0) {
        setDraft("");
        resetTextareaHeight();
      }
      setMediaError("");
      if (mediaInputRef.current) mediaInputRef.current.value = "";
      if (replyTarget) setReplyingTo((currentTarget) => currentTarget?.id === replyTarget.id ? null : currentTarget);
      window.requestAnimationFrame(() => {
        sentSelectedImages.forEach((image) => URL.revokeObjectURL(image.objectUrl));
        optimisticAttachments.forEach((attachment) => {
          optimisticPreviewUrlsRef.current.delete(attachment.previewUrl);
          URL.revokeObjectURL(attachment.previewUrl);
        });
        textareaRef.current?.focus();
      });
    }
    isSubmittingRef.current = false;
    setIsSubmitting(false);
    onMessageConfirmed();
  }

  async function submitFileMessage(caption: string, sourceFiles: ComposerFileSelection[] | OptimisticMessageAttachment[], existingOptimisticId?: string, retryReplyTarget?: MessageReplyPreview | null, retryReplyToMessageId?: string | null) {
    if (!interactionStatus.messagingAvailable) { setMediaError("Messaging is unavailable for this conversation."); return; }
    if (!currentUserId || isSubmittingRef.current || sourceFiles.length < 1 || sourceFiles.length > fileAttachmentMaxCount) return;
    const trimmedCaption = caption.trim();
    if (trimmedCaption.length > messageMaxLength) return;
    const validated = sourceFiles.every((item) => item.size > 0 && item.size <= fileAttachmentMaxSize && normalizeAllowedFile(item.file));
    if (!validated) { setMediaError("One or more files are no longer valid. Remove them and choose the files again."); return; }

    const optimisticId = existingOptimisticId ?? createUuid();
    const replyTarget = existingOptimisticId ? retryReplyTarget ?? null : replyingTo;
    const replyToMessageId = existingOptimisticId ? retryReplyToMessageId ?? replyTarget?.id ?? null : replyTarget?.id ?? null;
    const optimisticAttachments: OptimisticMessageAttachment[] = sourceFiles.map((item, position) => {
      if ("previewUrl" in item) return { ...item, position };
      const previewUrl = URL.createObjectURL(item.file);
      optimisticPreviewUrlsRef.current.add(previewUrl);
      return { id: item.localId, messageId: optimisticId, storagePath: `${conversation.id}/${currentUserId}/${optimisticId}/${createUuid()}.${item.extension}`, originalName: item.originalName, mimeType: item.mimeType, size: item.size, width: null, height: null, position, attachmentKind: "file", durationMs: null, file: item.file, previewUrl };
    });
    const optimisticMessage: OptimisticChatMessage = { kind: "optimistic", optimisticId, conversationId: conversation.id, senderId: currentUserId, body: trimmedCaption, createdAt: new Date().toISOString(), deliveryState: "sending", messageType: "file", attachments: optimisticAttachments, replyToMessageId, replyPreview: replyTarget };
    isSubmittingRef.current = true; setIsSubmitting(true); setMediaError(""); setUploadStatus(sourceFiles.length > 1 ? `Uploading 1 of ${sourceFiles.length}…` : "Uploading…"); setIsComposerEmojiPickerOpen(false); stopTyping();
    inFlightMessageRef.current = { optimisticId, conversationId: conversation.id, body: trimmedCaption, replyToMessageId };
    setMessages((current) => sortMessages([...current.filter((message) => message.kind === "confirmed" || message.optimisticId !== optimisticId), optimisticMessage]));
    setShowJumpToLatest(false); scrollToLatest("smooth");

    async function cleanup(paths: string[]) { if (paths.length) await supabase.storage.from(messageMediaBucket).remove(paths); }
    async function reconcileExisting() {
      const { data: existingMessage } = await supabase.from("messages").select("id, conversation_id, sender_id, body, created_at, edited_at, is_deleted, deleted_at, source_request_id, message_type, reply_to_message_id, is_forwarded").eq("id", optimisticId).eq("conversation_id", conversation.id).eq("sender_id", currentUserId).maybeSingle();
      if (!existingMessage || existingMessage.message_type !== "file") return null;
      const { data: existingAttachments, error } = await supabase.from("message_attachments").select("id, message_id, storage_path, original_name, mime_type, size_bytes, width, height, position, attachment_kind, duration_ms").eq("message_id", optimisticId).order("position", { ascending: true });
      return error || !existingAttachments?.length ? null : { message: existingMessage as MessageRow, attachments: existingAttachments as AttachmentRow[] };
    }

    let result: CreateFileMessageResult | null = existingOptimisticId ? await reconcileExisting() : null;
    const uploadedPaths: string[] = [];
    if (!result) {
      if (existingOptimisticId) await cleanup(optimisticAttachments.map((attachment) => attachment.storagePath));
      for (let index = 0; index < optimisticAttachments.length; index += 1) {
        const attachment = optimisticAttachments[index];
        const upload = await supabase.storage.from(messageMediaBucket).upload(attachment.storagePath, attachment.file, { cacheControl: "3600", contentType: attachment.mimeType, upsert: false });
        if (upload.error) {
          await cleanup(uploadedPaths);
          setMessages((current) => current.map((message) => message.kind === "optimistic" && message.optimisticId === optimisticId ? { ...message, deliveryState: "failed" } : message));
          setMediaError(`File ${index + 1} of ${optimisticAttachments.length} couldn’t be uploaded. Your files are available to retry.`);
          setUploadStatus(""); isSubmittingRef.current = false; setIsSubmitting(false); inFlightMessageRef.current = null; return;
        }
        uploadedPaths.push(attachment.storagePath);
        setUploadStatus(optimisticAttachments.length > 1 ? `Uploading ${index + 1} of ${optimisticAttachments.length}…` : "Uploading…");
      }
      const attachmentRecords = optimisticAttachments.map((attachment) => ({ storage_path: attachment.storagePath, original_name: attachment.originalName, mime_type: attachment.mimeType, size_bytes: attachment.size, position: attachment.position, attachment_kind: "file" }));
      const rpc = await supabase.rpc("create_file_message", { target_message_id: optimisticId, target_conversation_id: conversation.id, caption_text: trimmedCaption, target_reply_to_message_id: replyToMessageId, attachment_records: attachmentRecords });
      if (!rpc.error && rpc.data && typeof rpc.data === "object" && "message" in rpc.data && "attachments" in rpc.data) result = rpc.data as unknown as CreateFileMessageResult;
      if (!result) result = await reconcileExisting();
      if (!result) {
        await cleanup(uploadedPaths);
        setMessages((current) => current.map((message) => message.kind === "optimistic" && message.optimisticId === optimisticId ? { ...message, deliveryState: "failed" } : message));
        setMediaError("The file message couldn’t be created. Your caption and files are available to retry.");
        setUploadStatus(""); isSubmittingRef.current = false; setIsSubmitting(false); inFlightMessageRef.current = null; return;
      }
    }

    const attachments = result.attachments.map(mapAttachmentRow);
    const confirmed = mapMessageRow(result.message, replyTarget ?? (replyToMessageId ? createUnavailableReplyPreview(replyToMessageId) : null), attachments);
    attachmentCacheRef.current.set(confirmed.id, attachments); locallyConfirmedMessageIdsRef.current.add(confirmed.id);
    setMessages((current) => reconcileConfirmedMessage(current, confirmed, optimisticId));
    const sentFileObjects = new Set(sourceFiles.map((item) => item.file));
    const remaining = selectedFilesRef.current.filter((item) => !sentFileObjects.has(item.file));
    selectedFilesRef.current = remaining; setSelectedFiles(remaining);
    if (draft.trim() === trimmedCaption && remaining.length === 0) { setDraft(""); resetTextareaHeight(); }
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (replyTarget) setReplyingTo((current) => current?.id === replyTarget.id ? null : current);
    setMediaError(""); setUploadStatus("");
    requestAnimationFrame(() => { optimisticAttachments.forEach((attachment) => { optimisticPreviewUrlsRef.current.delete(attachment.previewUrl); URL.revokeObjectURL(attachment.previewUrl); }); textareaRef.current?.focus(); });
    isSubmittingRef.current = false; setIsSubmitting(false); inFlightMessageRef.current = null; onMessageConfirmed();
  }

  async function submitVoiceMessage(sourceRecording: ComposerVoiceRecording | OptimisticMessageAttachment, existingOptimisticId?: string, retryReplyTarget?: MessageReplyPreview | null, retryReplyToMessageId?: string | null) {
    if (!interactionStatus.messagingAvailable) { setMediaError("Messaging is unavailable for this conversation."); return; }
    if (!currentUserId || isSubmittingRef.current) return;
    const baseMimeType = getBaseMimeType(sourceRecording.mimeType);
    const durationMs = "durationMs" in sourceRecording ? sourceRecording.durationMs : null;
    if (!new Set(["audio/webm", "audio/ogg", "audio/mp4"]).has(baseMimeType) || !durationMs || durationMs < voiceMinimumDurationMs || durationMs > 5 * 60 * 1000 || sourceRecording.size < 1 || sourceRecording.size > voiceMaximumFileSize) {
      setMediaError("That voice recording is not valid. Please record it again.");
      return;
    }

    const optimisticId = existingOptimisticId ?? createUuid();
    const replyTarget = existingOptimisticId ? retryReplyTarget ?? null : replyingTo;
    const replyToMessageId = existingOptimisticId ? retryReplyToMessageId ?? replyTarget?.id ?? null : replyTarget?.id ?? null;
    const optimisticAttachment: OptimisticMessageAttachment = "previewUrl" in sourceRecording ? sourceRecording : (() => {
      const previewUrl = URL.createObjectURL(sourceRecording.file);
      optimisticPreviewUrlsRef.current.add(previewUrl);
      return { id: sourceRecording.localId, messageId: optimisticId, storagePath: `${conversation.id}/${currentUserId}/${optimisticId}/${createUuid()}.${getVoiceExtension(sourceRecording.mimeType)}`, originalName: sourceRecording.originalName, mimeType: sourceRecording.mimeType, size: sourceRecording.size, width: null, height: null, position: 0, attachmentKind: "voice", durationMs: sourceRecording.durationMs, file: sourceRecording.file, previewUrl };
    })();
    const optimisticMessage: OptimisticChatMessage = { kind: "optimistic", optimisticId, conversationId: conversation.id, senderId: currentUserId, body: "", createdAt: new Date().toISOString(), deliveryState: "sending", messageType: "voice", attachments: [optimisticAttachment], replyToMessageId, replyPreview: replyTarget };

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setIsComposerEmojiPickerOpen(false);
    setMediaError("");
    stopTyping();
    inFlightMessageRef.current = { optimisticId, conversationId: conversation.id, body: "", replyToMessageId };
    setMessages((currentMessages) => sortMessages([...currentMessages.filter((message) => message.kind === "confirmed" || message.optimisticId !== optimisticId), optimisticMessage]));
    setShowJumpToLatest(false);
    scrollToLatest("smooth");

    async function reconcileExistingVoiceMessage() {
      const { data: existingMessage } = await supabase.from("messages").select("id, conversation_id, sender_id, body, created_at, edited_at, is_deleted, deleted_at, source_request_id, message_type, reply_to_message_id, is_forwarded").eq("id", optimisticId).eq("conversation_id", conversation.id).eq("sender_id", currentUserId).maybeSingle();
      if (!existingMessage) return null;
      const { data: existingAttachments, error: attachmentError } = await supabase.from("message_attachments").select("id, message_id, storage_path, original_name, mime_type, size_bytes, width, height, position, attachment_kind, duration_ms").eq("message_id", optimisticId).order("position", { ascending: true });
      if (attachmentError || existingMessage.message_type !== "voice" || existingAttachments?.length !== 1) return null;
      return { message: existingMessage as MessageRow, attachments: existingAttachments as AttachmentRow[] };
    }

    let result: CreateVoiceMessageResult | null = existingOptimisticId ? await reconcileExistingVoiceMessage() : null;
    let uploadedPath: string | null = null;
    if (!result) {
      if (existingOptimisticId) await supabase.storage.from(messageMediaBucket).remove([optimisticAttachment.storagePath]);
      const uploadResult = await supabase.storage.from(messageMediaBucket).upload(optimisticAttachment.storagePath, optimisticAttachment.file, { cacheControl: "3600", contentType: baseMimeType, upsert: false });
      if (!uploadResult.error) uploadedPath = optimisticAttachment.storagePath;
      if (uploadResult.error) {
        setMessages((currentMessages) => currentMessages.map((message) => message.kind === "optimistic" && message.optimisticId === optimisticId ? { ...message, deliveryState: "failed" } : message));
        setMediaError("The voice message couldn’t be uploaded. Your recording is still available to retry.");
        if (import.meta.env.DEV) console.warn("Uploading voice message failed", { conversationId: conversation.id, code: uploadResult.error.message });
        isSubmittingRef.current = false;
        setIsSubmitting(false);
        if (inFlightMessageRef.current?.optimisticId === optimisticId) inFlightMessageRef.current = null;
        return;
      }

      const attachmentRecord = { storage_path: optimisticAttachment.storagePath, original_name: optimisticAttachment.originalName, mime_type: optimisticAttachment.mimeType, size_bytes: optimisticAttachment.size, duration_ms: durationMs, position: 0 };
      const { data, error } = await supabase.rpc("create_voice_message", { target_message_id: optimisticId, target_conversation_id: conversation.id, target_reply_to_message_id: replyToMessageId, attachment_record: attachmentRecord });
      if (!error && data && typeof data === "object" && "message" in data && "attachments" in data) result = data as unknown as CreateVoiceMessageResult;
      if (!result) result = await reconcileExistingVoiceMessage();
      if (!result) {
        if (uploadedPath) await supabase.storage.from(messageMediaBucket).remove([uploadedPath]);
        setMessages((currentMessages) => currentMessages.map((message) => message.kind === "optimistic" && message.optimisticId === optimisticId ? { ...message, deliveryState: "failed" } : message));
        setMediaError("The voice message couldn’t be created. Your recording is still available to retry.");
        if (import.meta.env.DEV) console.warn("Creating voice message failed", { conversationId: conversation.id, code: error?.code });
        isSubmittingRef.current = false;
        setIsSubmitting(false);
        if (inFlightMessageRef.current?.optimisticId === optimisticId) inFlightMessageRef.current = null;
        return;
      }
    }

    const attachments = result.attachments.map(mapAttachmentRow);
    const confirmedMessage = mapMessageRow(result.message, replyTarget ?? (replyToMessageId ? createUnavailableReplyPreview(replyToMessageId) : null), attachments);
    attachmentCacheRef.current.set(confirmedMessage.id, attachments);
    locallyConfirmedMessageIdsRef.current.add(confirmedMessage.id);
    setMessages((currentMessages) => reconcileConfirmedMessage(currentMessages, confirmedMessage, optimisticId));
    setMediaError("");
    if (replyTarget) setReplyingTo((currentTarget) => currentTarget?.id === replyTarget.id ? null : currentTarget);
    window.requestAnimationFrame(() => {
      optimisticPreviewUrlsRef.current.delete(optimisticAttachment.previewUrl);
      URL.revokeObjectURL(optimisticAttachment.previewUrl);
    });
    if (!existingOptimisticId || voiceRecorder.recording?.file === optimisticAttachment.file) voiceRecorder.clearReview();
    isSubmittingRef.current = false;
    setIsSubmitting(false);
    if (inFlightMessageRef.current?.optimisticId === optimisticId) inFlightMessageRef.current = null;
    onMessageConfirmed();
  }

  async function startVoiceRecording() {
    if (!interactionStatus.messagingAvailable) return;
    if (isSubmittingRef.current || messageEditState) return;
    if (selectedImagesRef.current.length > 0 || selectedFilesRef.current.length > 0) {
      setMediaError("Remove the selected attachments before recording a voice message.");
      return;
    }
    setIsComposerEmojiPickerOpen(false);
    setMediaError("");
    stopTyping();
    await voiceRecorder.startRecording();
  }

  function sendVoiceRecordingForReview() {
    const recording = voiceRecorder.recording;
    if (!recording) return;
    const failedAttempt = [...messages].reverse().find((message): message is OptimisticChatMessage => message.kind === "optimistic" && message.messageType === "voice" && message.deliveryState === "failed" && message.attachments.some((attachment) => attachment.file === recording.file));
    if (failedAttempt) {
      const attachment = failedAttempt.attachments.find((item) => item.attachmentKind === "voice");
      if (attachment) void submitVoiceMessage(attachment, failedAttempt.optimisticId, failedAttempt.replyPreview, failedAttempt.replyToMessageId);
      return;
    }
    void submitVoiceMessage(recording);
  }

  function handleSend(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!interactionStatus.messagingAvailable) return;
    if (messageEditState) return;
    if (selectedFiles.length > 0) {
      const failedAttempt = [...messages].reverse().find((message): message is OptimisticChatMessage => message.kind === "optimistic" && message.messageType === "file" && message.deliveryState === "failed" && message.body === draft.trim() && message.attachments.length === selectedFiles.length && message.attachments.every((attachment, index) => attachment.file === selectedFiles[index]?.file));
      if (failedAttempt) void submitFileMessage(failedAttempt.body, failedAttempt.attachments, failedAttempt.optimisticId, failedAttempt.replyPreview, failedAttempt.replyToMessageId);
      else void submitFileMessage(draft, selectedFiles);
      return;
    }
    if (selectedImages.length > 0) {
      const failedAttempt = [...messages].reverse().find((message): message is OptimisticChatMessage => message.kind === "optimistic" && message.messageType === "image" && message.deliveryState === "failed" && message.body === draft.trim() && message.attachments.length === selectedImages.length && message.attachments.every((attachment, index) => attachment.file === selectedImages[index]?.file));
      if (failedAttempt) {
        void submitImageMessage(failedAttempt.body, failedAttempt.attachments, failedAttempt.optimisticId, failedAttempt.replyPreview, failedAttempt.replyToMessageId);
        return;
      }
      void submitImageMessage(draft, selectedImages);
      return;
    }
    void submitMessage(draft);
  }

  function openImagePicker() {
    if (!interactionStatus.messagingAvailable) return;
    if (selectedFilesRef.current.length > 0) { setMediaError("Remove the selected files before adding photos."); return; }
    const input = mediaInputRef.current;
    if (!input) return;
    setIsComposerEmojiPickerOpen(false);
    input.value = "";
    input.click();
  }

  function openFilePicker() {
    if (!interactionStatus.messagingAvailable) return;
    if (selectedImagesRef.current.length > 0) { setMediaError("Remove the selected photos before adding files."); return; }
    const input = fileInputRef.current;
    if (!input) return;
    setIsComposerEmojiPickerOpen(false);
    input.value = "";
    input.click();
  }

  async function addSelectedImages(files: File[]) {
    if (files.length === 0) return;
    if (selectedFilesRef.current.length > 0) { setMediaError("Photos and files can’t be combined in one message. Remove the selected files first."); return; }

    const existingImages = selectedImagesRef.current;
    const duplicateKeys = new Set(existingImages.map((image) => image.duplicateKey));
    const availableSlots = imageMaxCount - existingImages.length;
    const acceptedImages: ComposerImageSelection[] = [];
    const rejectedReasons: string[] = [];

    for (const file of files) {
      const mimeType = file.type.toLowerCase();
      const duplicateKey = `${file.name.toLowerCase()}:${file.size}:${file.lastModified}:${mimeType}`;
      if (acceptedImages.length >= availableSlots) {
        rejectedReasons.push(`${file.name}: the 10-image limit was reached`);
        continue;
      }
      if (!acceptedImageMimeTypes.has(mimeType)) {
        rejectedReasons.push(`${file.name}: unsupported file type`);
        continue;
      }
      if (!file.name.trim() || file.name.length > 255 || hasControlCharacters(file.name)) {
        rejectedReasons.push("An image filename is invalid");
        continue;
      }
      if (file.size < 1 || file.size > imageMaxFileSize) {
        rejectedReasons.push(`${file.name}: images must be 10 MB or smaller`);
        continue;
      }
      if (duplicateKeys.has(duplicateKey)) {
        rejectedReasons.push(`${file.name}: duplicate image`);
        continue;
      }

      const objectUrl = URL.createObjectURL(file);
      try {
        const dimensions = await getImageDimensions(objectUrl);
        if (dimensions.width < 1 || dimensions.height < 1 || dimensions.width > 20000 || dimensions.height > 20000) {
          URL.revokeObjectURL(objectUrl);
          rejectedReasons.push(`${file.name}: image dimensions are too large`);
          continue;
        }
        acceptedImages.push({ localId: createUuid(), file, objectUrl, originalName: file.name, mimeType, size: file.size, width: dimensions.width, height: dimensions.height, duplicateKey });
        duplicateKeys.add(duplicateKey);
      } catch {
        URL.revokeObjectURL(objectUrl);
        rejectedReasons.push(`${file.name}: the image could not be read`);
      }
    }

    if (!isMountedRef.current) {
      acceptedImages.forEach((image) => URL.revokeObjectURL(image.objectUrl));
      return;
    }
    if (acceptedImages.length > 0) {
      const nextImages = [...existingImages, ...acceptedImages];
      selectedImagesRef.current = nextImages;
      setSelectedImages(nextImages);
    }
    setMediaError(rejectedReasons.length > 0 ? rejectedReasons.join(" · ") : "");
  }

  async function handleImageSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(event.currentTarget.files ?? [])];
    event.currentTarget.value = "";
    await addSelectedImages(files);
  }

  function addSelectedFiles(files: File[]) {
    if (files.length === 0) return;
    if (selectedImagesRef.current.length > 0) { setMediaError("Photos and files can’t be combined in one message. Remove the selected photos first."); return; }
    const existing = selectedFilesRef.current;
    const duplicateKeys = new Set(existing.map((file) => file.duplicateKey));
    const accepted: ComposerFileSelection[] = [];
    const rejected: string[] = [];
    for (const file of files) {
      const normalized = normalizeAllowedFile(file);
      const safeName = sanitizeAttachmentFilename(file.name);
      const duplicateKey = `${file.name.toLowerCase()}:${file.size}:${file.lastModified}`;
      if (existing.length + accepted.length >= fileAttachmentMaxCount) { rejected.push(`${file.name}: the 10-file limit was reached`); continue; }
      if (!normalized) { rejected.push(`${file.name}: unsupported or mismatched file type`); continue; }
      if (!safeName) { rejected.push("A file has an invalid filename"); continue; }
      if (file.size < 1 || file.size > fileAttachmentMaxSize) { rejected.push(`${file.name}: files must be 25 MB or smaller`); continue; }
      if (duplicateKeys.has(duplicateKey)) { rejected.push(`${file.name}: duplicate file`); continue; }
      accepted.push({ localId: createUuid(), file, originalName: safeName, mimeType: normalized.mimeType, size: file.size, extension: normalized.extension, duplicateKey });
      duplicateKeys.add(duplicateKey);
    }
    if (accepted.length) { const next = [...existing, ...accepted]; selectedFilesRef.current = next; setSelectedFiles(next); }
    setMediaError(rejected.length ? rejected.join(" · ") : "");
  }

  function handleFileSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(event.currentTarget.files ?? [])];
    event.currentTarget.value = "";
    addSelectedFiles(files);
  }

  function removeSelectedFile(localId: string) {
    const next = selectedFilesRef.current.filter((file) => file.localId !== localId);
    selectedFilesRef.current = next; setSelectedFiles(next); setMediaError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function removeAllSelectedFiles() {
    selectedFilesRef.current = []; setSelectedFiles([]); setMediaError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function handleComposerPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (event.clipboardData.getData("text/plain")) return;
    const imageFiles = [...event.clipboardData.items].filter((item) => item.kind === "file" && acceptedImageMimeTypes.has(item.type.toLowerCase())).map((item) => item.getAsFile()).filter((file): file is File => Boolean(file));
    if (imageFiles.length === 0) return;
    event.preventDefault();
    if (selectedFilesRef.current.length > 0) { setMediaError("Remove the selected files before pasting a photo."); return; }
    void addSelectedImages(imageFiles);
  }

  function handleAttachmentDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault(); setIsDragActive(false);
    if (!interactionStatus.messagingAvailable) return;
    const files = [...event.dataTransfer.files];
    if (!files.length) return;
    const imageFiles = files.filter((file) => acceptedImageMimeTypes.has(file.type.toLowerCase()));
    const generalFiles = files.filter((file) => normalizeAllowedFile(file));
    if (imageFiles.length + generalFiles.length !== files.length) { setMediaError("One or more dropped files are unsupported."); return; }
    if (imageFiles.length && generalFiles.length) { setMediaError("Photos and files can’t be combined in one message. Drop one type at a time."); return; }
    if (imageFiles.length) void addSelectedImages(imageFiles); else addSelectedFiles(generalFiles);
  }

  function removeSelectedImage(localId: string) {
    const image = selectedImagesRef.current.find((item) => item.localId === localId);
    const nextImages = selectedImagesRef.current.filter((item) => item.localId !== localId);
    selectedImagesRef.current = nextImages;
    setSelectedImages(nextImages);
    setMediaError("");
    if (mediaInputRef.current) mediaInputRef.current.value = "";
    window.requestAnimationFrame(() => {
      if (image) URL.revokeObjectURL(image.objectUrl);
      textareaRef.current?.focus();
    });
  }

  function removeAllSelectedImages() {
    const images = selectedImagesRef.current;
    selectedImagesRef.current = [];
    setSelectedImages([]);
    setMediaError("");
    if (mediaInputRef.current) mediaInputRef.current.value = "";
    window.requestAnimationFrame(() => {
      images.forEach((image) => URL.revokeObjectURL(image.objectUrl));
      textareaRef.current?.focus();
    });
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape" && replyingTo && !isComposerEmojiPickerOpen && !quickReactionMessageId && !fullReactionPickerMessageId) {
      event.preventDefault();
      setReplyingTo(null);
      return;
    }
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (!isSubmittingRef.current) handleSend();
  }

  function handleRetryMessage(message: OptimisticChatMessage) {
    if (message.messageType === "voice") {
      const attachment = message.attachments.find((item) => item.attachmentKind === "voice");
      if (attachment) void submitVoiceMessage(attachment, message.optimisticId, message.replyPreview, message.replyToMessageId);
      return;
    }
    if (message.messageType === "image") {
      void submitImageMessage(message.body, message.attachments, message.optimisticId, message.replyPreview, message.replyToMessageId);
      return;
    }
    if (message.messageType === "file") {
      void submitFileMessage(message.body, message.attachments, message.optimisticId, message.replyPreview, message.replyToMessageId);
      return;
    }
    void submitMessage(message.body, message.optimisticId, message.replyPreview, message.replyToMessageId);
  }

  function handleRemoveFailedMessage(optimisticId: string) {
    const removedMessage = messages.find((message): message is OptimisticChatMessage => message.kind === "optimistic" && message.optimisticId === optimisticId);
    setMessages((currentMessages) => currentMessages.filter((message) => message.kind === "confirmed" || message.optimisticId !== optimisticId));
    if (removedMessage?.messageType === "image" || removedMessage?.messageType === "voice" || removedMessage?.messageType === "file") {
      window.requestAnimationFrame(() => removedMessage.attachments.forEach((attachment) => {
          optimisticPreviewUrlsRef.current.delete(attachment.previewUrl);
          URL.revokeObjectURL(attachment.previewUrl);
      }));
    }
  }

  function cancelMobileLongPress() {
    if (mobileLongPressTimerRef.current !== null) window.clearTimeout(mobileLongPressTimerRef.current);
    mobileLongPressTimerRef.current = null;
    mobileLongPressStateRef.current = null;
  }

  function openMobileActionSheet(messageId: string, returnFocusElement: HTMLElement) {
    cancelMobileLongPress();
    mobileActionReturnFocusRef.current = returnFocusElement;
    reactionAnchorRef.current = returnFocusElement;
    setQuickReactionMessageId(null);
    setFullReactionPickerMessageId(null);
    setReactionDetailsMessageId(null);
    setMobileEmphasizedMessageId(messageId);
    setMobileActionMessageId(messageId);
  }

  function openMoreActions(messageId: string, trigger: HTMLButtonElement) {
    moreActionAnchorRef.current = trigger;
    setQuickReactionMessageId(null);
    setFullReactionPickerMessageId(null);
    setReactionDetailsMessageId(null);
    setMoreActionMessageId((currentId) => currentId === messageId ? null : messageId);
  }

  async function copyMessage(message: ChatMessage) {
    if (!message.body) return;
    try {
      await navigator.clipboard.writeText(message.body);
      showPinToast("Message copied");
    } catch {
      showPinToast("Message couldn't be copied");
    }
  }

  function forwardMessage(message: ChatMessage, trigger: HTMLElement) {
    setMoreActionMessageId(null);
    setMobileActionMessageId(null);
    onForwardMessage(message, trigger);
  }

  function saveMessageMedia(message: ChatMessage, trigger: HTMLElement) {
    setMoreActionMessageId(null);
    setMobileActionMessageId(null);
    mediaSaveReturnFocusRef.current = trigger;
    setMediaSaveMessageId(message.id);
  }

  function handleMessagePointerDown(message: ChatMessage, event: React.PointerEvent<HTMLElement>) {
    if (event.pointerType !== "touch" || !event.isPrimary || event.button !== 0 || window.matchMedia("(min-width: 768px)").matches) return;
    const target = event.target;
    if (target instanceof Element && target.closest("button, a, input, textarea, select, [role='button']")) return;
    if (window.getSelection()?.toString()) return;

    cancelMobileLongPress();
    const pointerId = event.pointerId;
    const returnFocusElement = event.currentTarget;
    mobileLongPressStateRef.current = { messageId: message.id, pointerId, startX: event.clientX, startY: event.clientY, returnFocusElement };
    mobileLongPressTimerRef.current = window.setTimeout(() => {
      const pressState = mobileLongPressStateRef.current;
      if (!pressState || pressState.pointerId !== pointerId || window.getSelection()?.toString()) {
        cancelMobileLongPress();
        return;
      }
      openMobileActionSheet(pressState.messageId, pressState.returnFocusElement);
    }, mobileLongPressDurationMs);
  }

  function handleMessagePointerMove(event: React.PointerEvent<HTMLElement>) {
    const pressState = mobileLongPressStateRef.current;
    if (!pressState || pressState.pointerId !== event.pointerId) return;
    const movedX = Math.abs(event.clientX - pressState.startX);
    const movedY = Math.abs(event.clientY - pressState.startY);
    if (movedX > mobileLongPressMovementThreshold || movedY > mobileLongPressMovementThreshold) cancelMobileLongPress();
  }

  function handleMessagePointerEnd(event: React.PointerEvent<HTMLElement>) {
    if (mobileLongPressStateRef.current?.pointerId === event.pointerId) cancelMobileLongPress();
  }

  function handleScroll() {
    cancelMobileLongPress();
    if (!isViewingSearchContext && isNearBottom()) setShowJumpToLatest(false);
  }

  function showReactionError(message: string) {
    if (reactionErrorTimerRef.current !== null) window.clearTimeout(reactionErrorTimerRef.current);
    setReactionError(message);
    reactionErrorTimerRef.current = window.setTimeout(() => {
      setReactionError("");
      reactionErrorTimerRef.current = null;
    }, 4000);
  }

  function openQuickReactions(messageId: string, trigger: HTMLButtonElement) {
    reactionAnchorRef.current = trigger;
    setReactionDetailsMessageId(null);
    setFullReactionPickerMessageId(null);
    setQuickReactionMessageId((currentId) => currentId === messageId ? null : messageId);
  }

  function openReactionDetails(messageId: string, trigger: HTMLButtonElement) {
    reactionDetailsAnchorRef.current = trigger;
    lastReactionDetailsMessageIdRef.current = messageId;
    setQuickReactionMessageId(null);
    setFullReactionPickerMessageId(null);
    setMobileActionMessageId(null);
    setIsComposerEmojiPickerOpen(false);
    setReactionProfilesError("");
    setReactionDetailsMutationError("");
    setReactionDetailsMessageId(messageId);
  }

  function closeReactionDetails() {
    setReactionDetailsMessageId(null);
  }

  function retryReactionProfiles() {
    setReactionProfilesError("");
    setReactionProfilesRetryKey((key) => key + 1);
  }

  async function toggleReaction(messageId: string, emoji: string, options: { suppressGlobalError?: boolean } = {}) {
    if (!currentUserId) return false;
    const targetMessage = messages.find((message): message is ChatMessage => message.kind === "confirmed" && message.id === messageId);
    if (!targetMessage || targetMessage.isDeleted) return false;
    const tuple = { messageId, userId: currentUserId, emoji };
    const mutationKey = getReactionTupleKey(tuple);
    if (pendingReactionKeysRef.current.has(mutationKey)) return false;
    pendingReactionKeysRef.current.add(mutationKey);
    setPendingReactionKeys((currentKeys) => new Set(currentKeys).add(mutationKey));
    setReactionError("");

    const existingReaction = reactions.find((reaction) => getReactionTupleKey(reaction) === mutationKey);
    if (existingReaction) {
      const mutationStartSequence = processedReactionSequenceRef.current;
      setReactions((currentReactions) => currentReactions.filter((reaction) => getReactionTupleKey(reaction) !== mutationKey));
      const { error } = await supabase.from("message_reactions").delete().eq("message_id", messageId).eq("user_id", currentUserId).eq("emoji", emoji);
      pendingReactionKeysRef.current.delete(mutationKey);
      setPendingReactionKeys((currentKeys) => { const nextKeys = new Set(currentKeys); nextKeys.delete(mutationKey); return nextKeys; });
      const confirmedDeleteSequence = Math.max(reactionDeleteSequenceByIdRef.current.get(existingReaction.id) ?? 0, reactionDeleteSequenceByTupleRef.current.get(mutationKey) ?? 0);
      const deletionWasConfirmed = confirmedDeleteSequence > mutationStartSequence;
      if (error && !deletionWasConfirmed && !deletedMessageIdsRef.current.has(messageId)) {
        setReactions((currentReactions) => mergeReaction(currentReactions, existingReaction));
        if (!options.suppressGlobalError) showReactionError("We couldn’t remove that reaction. Please try again.");
        if (import.meta.env.DEV) console.warn("Removing message reaction failed", { messageId, code: error.code });
        return false;
      }
      return true;
    }

    if (!interactionStatus.messagingAvailable) {
      pendingReactionKeysRef.current.delete(mutationKey);
      setPendingReactionKeys((currentKeys) => { const nextKeys = new Set(currentKeys); nextKeys.delete(mutationKey); return nextKeys; });
      if (!options.suppressGlobalError) showReactionError("Messaging is unavailable for this conversation.");
      return false;
    }

    const optimisticReaction: MessageReaction = { id: `optimistic:${mutationKey}`, messageId, userId: currentUserId, emoji, createdAt: new Date().toISOString() };
    setReactions((currentReactions) => mergeReaction(currentReactions, optimisticReaction));
    const { data, error } = await supabase.from("message_reactions").insert({ message_id: messageId, user_id: currentUserId, emoji }).select("id, message_id, user_id, emoji, created_at").single();
    pendingReactionKeysRef.current.delete(mutationKey);
    setPendingReactionKeys((currentKeys) => { const nextKeys = new Set(currentKeys); nextKeys.delete(mutationKey); return nextKeys; });

    if (error || !data) {
      setReactions((currentReactions) => currentReactions.filter((reaction) => reaction.id !== optimisticReaction.id));
      if (!options.suppressGlobalError) showReactionError("We couldn’t add that reaction. Please try again.");
      if (import.meta.env.DEV) console.warn("Adding message reaction failed", { messageId, code: error?.code });
      return false;
    }

    const confirmedReaction = mapReactionRow(data as ReactionRow);
    setReactions((currentReactions) => mergeReaction(currentReactions, confirmedReaction));
    return true;
  }

  async function removeOwnReactionFromDetails(reaction: MessageReaction) {
    if (!currentUserId || !interactionStatus.messagingAvailable || reaction.userId !== currentUserId || reaction.messageId !== reactionDetailsMessageId) return;
    setReactionDetailsMutationError("");
    const wasRemoved = await toggleReaction(reaction.messageId, reaction.emoji, { suppressGlobalError: true });
    if (!wasRemoved && !deletedMessageIdsRef.current.has(reaction.messageId)) setReactionDetailsMutationError("We couldn’t remove that reaction. Select it to try again.");
  }

  function openComposerEmojiPicker() {
    const textarea = textareaRef.current;
    composerSelectionRef.current = { start: textarea?.selectionStart ?? draft.length, end: textarea?.selectionEnd ?? draft.length };
    setReactionDetailsMessageId(null);
    setIsComposerEmojiPickerOpen((isOpen) => !isOpen);
  }

  function insertComposerEmoji(emoji: string) {
    const { start, end } = composerSelectionRef.current;
    const nextDraft = `${draft.slice(0, start)}${emoji}${draft.slice(end)}`;
    if (nextDraft.length > messageMaxLength) {
      showComingSoon("That emoji would exceed the 2,000-character limit.");
      return;
    }

    const nextCaret = start + emoji.length;
    setDraft(nextDraft);
    notifyTyping(nextDraft.trim().length > 0);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.focus();
        textarea.setSelectionRange(nextCaret, nextCaret);
        resizeTextarea(textarea);
      });
    });
  }

  function showComingSoon(message: string) {
    if (comingSoonTimerRef.current !== null) window.clearTimeout(comingSoonTimerRef.current);
    setComingSoonMessage(message);
    comingSoonTimerRef.current = window.setTimeout(() => {
      setComingSoonMessage("");
      comingSoonTimerRef.current = null;
    }, comingSoonMessageDurationMs);
  }

  function finishMessageEditing() {
    setMessageEditState(null);
    window.requestAnimationFrame(() => editTriggerRef.current?.focus());
  }

  function startEditingMessage(message: ChatMessage, trigger: HTMLElement) {
    if (message.senderId !== currentUserId || message.isIntroduction || message.isDeleted || pendingEditRef.current || pendingDeleteRef.current) return;
    editTriggerRef.current = trigger;
    setQuickReactionMessageId(null);
    setFullReactionPickerMessageId(null);
    setMessageEditState({ messageId: message.id, draft: message.body, isSaving: false, error: "" });
  }

  function cancelMessageEditing() {
    if (messageEditState?.isSaving) return;
    finishMessageEditing();
  }

  async function saveMessageEdit() {
    if (!currentUserId || !messageEditState || messageEditState.isSaving || pendingEditRef.current) return;
    const message = messages.find((item): item is ChatMessage => item.kind === "confirmed" && item.id === messageEditState.messageId);
    if (!message || message.senderId !== currentUserId || message.isIntroduction || message.isDeleted) {
      setMessageEditState((currentState) => currentState ? { ...currentState, error: "This message is no longer available for editing." } : currentState);
      return;
    }

    const normalizedBody = messageEditState.draft.trim();
    if (!normalizedBody && message.messageType === "text") {
      setMessageEditState((currentState) => currentState ? { ...currentState, error: "A message cannot be empty." } : currentState);
      return;
    }
    if (normalizedBody.length > messageMaxLength) {
      setMessageEditState((currentState) => currentState ? { ...currentState, error: "A message must be 2,000 characters or fewer." } : currentState);
      return;
    }
    if (normalizedBody === message.body) {
      finishMessageEditing();
      return;
    }

    const optimisticMessage = { ...message, body: normalizedBody };
    pendingEditRef.current = { messageId: message.id, attemptedBody: normalizedBody, previousMessage: message, confirmedMessage: null, deferredMessage: null };
    replyTargetCacheRef.current.set(message.id, optimisticMessage);
    setMessages((currentMessages) => patchMessageAndReplies(currentMessages, optimisticMessage, currentUserId, otherName));
    setMessageEditState((currentState) => currentState ? { ...currentState, isSaving: true, error: "" } : currentState);

    const { data, error } = await supabase.rpc("edit_message", { target_message_id: message.id, new_body: normalizedBody }).single();
    const pendingEdit = pendingEditRef.current;
    if (!isMountedRef.current || pendingEdit?.messageId !== message.id) return;

    if (error || !data) {
      const realtimeMessage = pendingEdit.deferredMessage && shouldApplyAuthoritativeMessage(pendingEdit.confirmedMessage ?? pendingEdit.previousMessage, pendingEdit.deferredMessage) ? pendingEdit.deferredMessage : pendingEdit.confirmedMessage;
      if (realtimeMessage) {
        pendingEditRef.current = null;
        replyTargetCacheRef.current.set(message.id, realtimeMessage);
        setMessages((currentMessages) => patchMessageAndReplies(currentMessages, realtimeMessage, currentUserId, otherName));
        onMessageUpdated(realtimeMessage);
        finishMessageEditing();
        return;
      }

      replyTargetCacheRef.current.set(message.id, pendingEdit.previousMessage);
      setMessages((currentMessages) => patchMessageAndReplies(currentMessages, pendingEdit.previousMessage, currentUserId, otherName));
      pendingEditRef.current = null;
      setMessageEditState((currentState) => currentState?.messageId === message.id ? { ...currentState, isSaving: false, error: "We couldn’t save that edit. Please try again." } : currentState);
      if (import.meta.env.DEV) console.warn("Editing message failed", { messageId: message.id, code: error?.code });
      return;
    }

    const rpcMessage = mapMessageRow(data as MessageRow, message.replyPreview, message.attachments);
    const authoritativeMessage = pendingEdit.deferredMessage && shouldApplyAuthoritativeMessage(rpcMessage, pendingEdit.deferredMessage) ? pendingEdit.deferredMessage : rpcMessage;
    pendingEditRef.current = null;
    const cachedMessage = replyTargetCacheRef.current.get(message.id);
    if (shouldApplyAuthoritativeMessage(cachedMessage, authoritativeMessage)) {
      replyTargetCacheRef.current.set(message.id, authoritativeMessage);
      setMessages((currentMessages) => patchMessageAndReplies(currentMessages, authoritativeMessage, currentUserId, otherName));
    }
    onMessageUpdated(authoritativeMessage);
    finishMessageEditing();
  }

  function handleEditKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelMessageEditing();
      return;
    }
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void saveMessageEdit();
  }

  function openDeleteConfirmation(message: ChatMessage, trigger: HTMLElement) {
    if (message.senderId !== currentUserId || message.isIntroduction || message.isDeleted || pendingEditRef.current || pendingDeleteRef.current || pendingPinnedMessageIdsRef.current.has(message.id)) return;
    deleteTriggerRef.current = trigger;
    setQuickReactionMessageId(null);
    setFullReactionPickerMessageId(null);
    setMobileActionMessageId(null);
    setMessageEditState(null);
    setMessageDeleteState({ messageId: message.id, isDeleting: false, error: "" });
  }

  function cancelMessageDeletion() {
    if (messageDeleteState?.isDeleting) return;
    setMessageDeleteState(null);
  }

  async function confirmMessageDeletion() {
    if (!currentUserId || !messageDeleteState || messageDeleteState.isDeleting || pendingDeleteRef.current || pendingEditRef.current) return;
    const message = messages.find((item): item is ChatMessage => item.kind === "confirmed" && item.id === messageDeleteState.messageId);
    if (!message || message.senderId !== currentUserId || message.isIntroduction || message.isDeleted) {
      setMessageDeleteState((currentState) => currentState ? { ...currentState, error: "This message is no longer available for deletion." } : currentState);
      return;
    }

    const previousReactions = reactions.filter((reaction) => reaction.messageId === message.id);
    const previousPin = pinnedMessages.find((pin) => pin.messageId === message.id) ?? null;
    const optimisticMessage: ChatMessage = { ...message, body: "", isDeleted: true, deletedAt: null };
    const previousEvents = conversationEvents.filter((event) => event.targetMessageId === message.id);
    pendingDeleteRef.current = { messageId: message.id, previousMessage: message, previousReactions, previousPin, previousEvents, confirmedMessage: null, deferredMessage: null };
    deletedMessageIdsRef.current.add(message.id);
    replyTargetCacheRef.current.set(message.id, optimisticMessage);
    setMessages((currentMessages) => patchMessageAndReplies(currentMessages, optimisticMessage, currentUserId, otherName));
    setReactions((currentReactions) => currentReactions.filter((reaction) => reaction.messageId !== message.id));
    setPinnedMessages((currentPins) => currentPins.filter((pin) => pin.messageId !== message.id));
    setConversationEvents((currentEvents) => currentEvents.filter((event) => event.targetMessageId !== message.id));
    setReplyingTo((currentTarget) => currentTarget?.id === message.id ? null : currentTarget);
    setMessageDeleteState((currentState) => currentState ? { ...currentState, isDeleting: true, error: "" } : currentState);
    onMessageUpdated(optimisticMessage);

    const { data, error } = await supabase.rpc("delete_message", { target_message_id: message.id }).single();
    const pendingDelete = pendingDeleteRef.current;
    if (!isMountedRef.current || pendingDelete?.messageId !== message.id) return;

    if (error || !data) {
      if (pendingDelete.confirmedMessage?.isDeleted) {
        const confirmedMessage = pendingDelete.confirmedMessage;
        pendingDelete.previousEvents.forEach((event) => rememberDeletedConversationEvent(event.id));
        pendingDeleteRef.current = null;
        replyTargetCacheRef.current.set(message.id, confirmedMessage);
        setMessages((currentMessages) => patchMessageAndReplies(currentMessages, confirmedMessage, currentUserId, otherName));
        setReactions((currentReactions) => currentReactions.filter((reaction) => reaction.messageId !== message.id));
        onMessageUpdated(confirmedMessage);
        setMessageDeleteState(null);
        window.requestAnimationFrame(() => messageElementsRef.current.get(message.id)?.focus());
        return;
      }

      const rollbackMessage = pendingDelete.deferredMessage && shouldApplyAuthoritativeMessage(pendingDelete.previousMessage, pendingDelete.deferredMessage) ? pendingDelete.deferredMessage : pendingDelete.previousMessage;
      pendingDeleteRef.current = null;
      deletedMessageIdsRef.current.delete(message.id);
      replyTargetCacheRef.current.set(message.id, rollbackMessage);
      setMessages((currentMessages) => patchMessageAndReplies(currentMessages, rollbackMessage, currentUserId, otherName));
      setReactions((currentReactions) => pendingDelete.previousReactions.reduce((nextReactions, reaction) => mergeReaction(nextReactions, reaction), currentReactions));
      if (pendingDelete.previousPin) setPinnedMessages((currentPins) => currentPins.some((pin) => pin.messageId === pendingDelete.previousPin?.messageId) ? currentPins : [...currentPins, pendingDelete.previousPin as PinnedMessagePreview].sort((first, second) => Date.parse(second.pinnedAt) - Date.parse(first.pinnedAt)));
      if (pendingDelete.previousEvents.length > 0 && !rollbackMessage.isDeleted) setConversationEvents((currentEvents) => pendingDelete.previousEvents.reduce((nextEvents, event) => mergeConversationEvent(nextEvents, event), currentEvents));
      void loadPinnedMessages();
      onMessageDeletionRolledBack(rollbackMessage);
      setMessageDeleteState((currentState) => currentState?.messageId === message.id ? { ...currentState, isDeleting: false, error: "We couldn’t delete that message. Please try again." } : currentState);
      if (import.meta.env.DEV) console.warn("Deleting message failed", { messageId: message.id, code: error?.code });
      return;
    }

    const rpcMessage = mapMessageRow(data as MessageRow, message.replyPreview, message.attachments);
    const authoritativeMessage = pendingDelete.confirmedMessage && shouldApplyAuthoritativeMessage(rpcMessage, pendingDelete.confirmedMessage) ? pendingDelete.confirmedMessage : rpcMessage;
    pendingDelete.previousEvents.forEach((event) => rememberDeletedConversationEvent(event.id));
    pendingDeleteRef.current = null;
    deletedMessageIdsRef.current.add(message.id);
    replyTargetCacheRef.current.set(message.id, authoritativeMessage);
    setMessages((currentMessages) => patchMessageAndReplies(currentMessages, authoritativeMessage, currentUserId, otherName));
    setReactions((currentReactions) => currentReactions.filter((reaction) => reaction.messageId !== message.id));
    onMessageUpdated(authoritativeMessage);
    setMessageDeleteState(null);
    window.requestAnimationFrame(() => messageElementsRef.current.get(message.id)?.focus());
  }

  async function togglePinnedMessage(message: ChatMessage) {
    if (!currentUserId || !interactionStatus.messagingAvailable || message.isDeleted || message.isIntroduction || pendingPinnedMessageIdsRef.current.has(message.id) || pendingDeleteRef.current?.messageId === message.id) return;
    const wasPinned = pinnedMessages.some((pin) => pin.messageId === message.id);
    const previousPins = pinnedMessages;
    const shouldPin = !wasPinned;
    const optimisticEventId = `optimistic:${createUuid()}`;
    pendingPinnedMessageIdsRef.current.add(message.id);
    setPendingPinnedMessageIds((currentIds) => new Set(currentIds).add(message.id));
    setPinMutationError("");
    setPinnedMessages((currentPins) => shouldPin ? [createPinnedMessagePreview(message, currentUserId, otherName), ...currentPins.filter((pin) => pin.messageId !== message.id)] : currentPins.filter((pin) => pin.messageId !== message.id));
    if (shouldPin) {
      setConversationEvents((currentEvents) => mergeConversationEvent(currentEvents, { id: optimisticEventId, conversationId: conversation.id, actorId: currentUserId, actorName: "You", eventType: "message_pinned", targetMessageId: message.id, targetUserId: null, targetUserName: null, nicknameValue: null, themeKey: null, targetReminderId: null, reminderTitle: null, reminderDueAt: null, createdAt: new Date().toISOString(), isOptimistic: true }));
      showPinToast("Message pinned");
    }

    const { error } = await supabase.rpc("set_message_pinned", { target_message_id: message.id, pinned: shouldPin });
    pendingPinnedMessageIdsRef.current.delete(message.id);
    if (!isMountedRef.current) return;
    setPendingPinnedMessageIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.delete(message.id);
      return nextIds;
    });

    if (error) {
      if (shouldPin) {
        setConversationEvents((currentEvents) => currentEvents.filter((event) => event.id !== optimisticEventId));
        if (pinToastTimerRef.current !== null) window.clearTimeout(pinToastTimerRef.current);
        pinToastTimerRef.current = null;
        setPinToast(null);
      }
      if (deletedMessageIdsRef.current.has(message.id)) setPinnedMessages((currentPins) => currentPins.filter((pin) => pin.messageId !== message.id));
      else setPinnedMessages(previousPins);
      setPinMutationError(error.code === "54000" || error.message.includes("50 pinned") ? "This conversation already has 50 pinned messages. Unpin one before adding another." : `We couldn’t ${shouldPin ? "pin" : "unpin"} that message. Please try again.`);
      if (import.meta.env.DEV) console.warn("Updating pinned message failed", { messageId: message.id, shouldPin, code: error.code });
      return;
    }

    if (!shouldPin) showPinToast("Message unpinned");
    await Promise.all([loadPinnedMessages(), loadConversationEvents()]);
  }

  async function saveConversationNickname(userId: string, nickname: string | null) {
    if (!currentUserId) return "Your session has expired. Please sign in again.";
    if (!interactionStatus.messagingAvailable) return "Messaging is unavailable for this conversation.";
    const { error } = await supabase.rpc("set_conversation_nickname", {
      target_conversation_id: conversation.id,
      target_user_id: userId,
      nickname_text: nickname,
    });
    if (error) {
      if (import.meta.env.DEV) console.warn("Saving conversation nickname failed", { conversationId: conversation.id, targetUserId: userId, code: error.code });
      return error.code === "22023" ? error.message : "We couldn’t update that nickname. Please try again.";
    }
    setNicknamesByUserId((currentNicknames) => {
      const nextNicknames = new Map(currentNicknames);
      if (nickname) nextNicknames.set(userId, nickname);
      else nextNicknames.delete(userId);
      return nextNicknames;
    });
    if (userId === conversation.otherProfile.id) {
      const nextOtherName = nickname ?? otherAccountName;
      setPinnedMessages((currentPins) => currentPins.map((pin) => pin.senderId === currentUserId ? pin : { ...pin, senderName: nextOtherName }));
      setMessages((currentMessages) => currentMessages.map((message) => message.replyPreview && message.replyPreview.senderId !== currentUserId ? { ...message, replyPreview: { ...message.replyPreview, senderName: nextOtherName } } : message));
    }
    showPinToast(nickname ? "Nickname updated" : "Nickname removed");
    void loadConversationEvents();
    return null;
  }

  async function saveConversationTheme(themeId: ConversationThemeId) {
    if (!currentUserId) return "Your session has expired. Please sign in again.";
    if (!interactionStatus.messagingAvailable) return "Messaging is unavailable for this conversation.";
    const error = await onConversationThemeChange(conversation.id, themeId);
    if (error) return error;
    const theme = getConversationTheme(themeId);
    const isDevelopmentPreview = theme.access === "premium"
      && canUseConversationTheme(themeId, premiumAccess)
      && !canUseConversationTheme(themeId, premiumAccess, false);
    showPinToast(isDevelopmentPreview ? `${theme.name} development preview saved — this is not ownership` : `Theme changed to ${theme.name}`);
    return null;
  }

  function handlePinnedMessageSelected(pin: PinnedMessagePreview) {
    setPinMutationError("");
    openMessageTarget(pin.messageId, "pin");
  }

  function openMessageTarget(messageId: string, source: "pin" | "event") {
    setPinMutationError("");
    const loadedMessage = messages.find((message): message is ChatMessage => message.kind === "confirmed" && message.id === messageId);
    if (loadedMessage?.isDeleted) {
      setConversationEvents((currentEvents) => currentEvents.filter((event) => event.targetMessageId !== messageId));
      setPinnedMessages((currentPins) => currentPins.filter((pin) => pin.messageId !== messageId));
      setSearchContextError("That message is no longer available.");
      return;
    }
    if (loadedMessage && messageElementsRef.current.has(messageId)) {
      jumpToOriginalMessage(messageId);
      return;
    }
    setPinnedJumpTarget({ conversationId: conversation.id, messageId, token: `${source}:${messageId}:${Date.now()}` });
  }

  function handleReplyToMessage(message: ChatMessage) {
    if (message.isDeleted) return;
    setQuickReactionMessageId(null);
    setFullReactionPickerMessageId(null);
    setReplyingTo(createReplyPreview(message, currentUserId, otherName));
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function jumpToOriginalMessage(messageId: string) {
    const element = messageElementsRef.current.get(messageId);
    if (!element) return;
    element.scrollIntoView({ behavior: shouldReduceMotion ? "auto" : "smooth", block: "center" });
    setHighlightedMessageId(messageId);
    if (replyHighlightTimerRef.current !== null) window.clearTimeout(replyHighlightTimerRef.current);
    replyHighlightTimerRef.current = window.setTimeout(() => {
      setHighlightedMessageId((currentMessageId) => currentMessageId === messageId ? null : currentMessageId);
      replyHighlightTimerRef.current = null;
    }, replyHighlightDurationMs);
  }

  const remainingCharacters = messageMaxLength - draft.length;
  const showCharacterCount = remainingCharacters <= characterCountThreshold;
  const isSendDisabled = !currentUserId || (!draft.trim() && selectedImages.length === 0 && selectedFiles.length === 0) || isSubmitting || Boolean(messageEditState) || draft.length > messageMaxLength;
  const shouldShowIntroductoryFallback = !conversation.historyClearedAt && Boolean(conversation.introductoryMessage) && !messages.some((message) => message.kind === "confirmed" && message.isIntroduction);
  const shouldShowRestartEmptyState = Boolean(conversation.historyClearedAt) && messages.length === 0;
  const newestDisplayedMessage = messages.at(-1);
  const statusMessageKey = newestDisplayedMessage?.senderId === currentUserId ? getMessageKey(newestDisplayedMessage) : null;
  const composerHelpId = `message-composer-help-${conversation.id}`;
  const characterCountId = `message-character-count-${conversation.id}`;
  const mediaErrorId = `message-media-error-${conversation.id}`;
  const composerDescription = [composerHelpId, showCharacterCount ? characterCountId : "", mediaError ? mediaErrorId : ""].filter(Boolean).join(" ");
  const loadedConfirmedMessageIds = new Set(messages.flatMap((message) => message.kind === "confirmed" ? [message.id] : []));
  const mobileActionMessage = messages.find((message): message is ChatMessage => message.kind === "confirmed" && !message.isDeleted && message.id === mobileActionMessageId) ?? null;
  const moreActionMessage = messages.find((message): message is ChatMessage => message.kind === "confirmed" && !message.isDeleted && message.id === moreActionMessageId) ?? null;
  const mediaSaveMessage = messages.find((message): message is ChatMessage => message.kind === "confirmed" && !message.isDeleted && message.id === mediaSaveMessageId && message.messageType === "image") ?? null;
  const mediaSaveImages: SaveableMessageImage[] = mediaSaveMessage?.attachments
    .filter((attachment) => attachment.attachmentKind === "image" && ["image/jpeg", "image/png", "image/webp"].includes(attachment.mimeType.split(";", 1)[0].toLowerCase()))
    .map((attachment) => ({ ...attachment, url: signedMedia.urls.get(attachment.storagePath) ?? null })) ?? [];
  const reactionDetailsMessage = messages.find((message): message is ChatMessage => message.kind === "confirmed" && !message.isDeleted && message.id === reactionDetailsMessageId) ?? null;
  const reactionDetailsReactions = reactionDetailsMessage ? reactions.filter((reaction) => reaction.messageId === reactionDetailsMessage.id) : [];
  const isReactionDetailsMutationPending = reactionDetailsMessage ? [...pendingReactionKeys].some((mutationKey) => mutationKey.startsWith(`${reactionDetailsMessage.id}\u0000`)) : false;
  const availableReactionProfilesById = new Map(reactionProfilesById);
  availableReactionProfilesById.set(conversation.otherProfile.id, conversation.otherProfile);
  if (currentProfile) availableReactionProfilesById.set(currentProfile.id, currentProfile);
  const imageViewerMessage = imageViewerState ? messages.find((message) => (message.kind === "confirmed" ? message.id : message.optimisticId) === imageViewerState.messageId && message.messageType === "image") ?? null : null;
  const imageViewerImages: GalleryMediaItem[] = imageViewerMessage?.kind === "optimistic" ? imageViewerMessage.attachments.filter((attachment) => attachment.attachmentKind === "image").map((attachment) => ({ ...attachment, width: attachment.width ?? 1, height: attachment.height ?? 1, url: attachment.previewUrl })) : imageViewerMessage?.kind === "confirmed" ? imageViewerMessage.attachments.filter((attachment) => attachment.attachmentKind === "image").map((attachment) => ({ ...attachment, width: attachment.width ?? 1, height: attachment.height ?? 1, url: signedMedia.urls.get(attachment.storagePath) ?? null })) : [];
  const timelineItems: ConversationTimelineItem[] = [
    ...messages.map((message): ConversationTimelineItem => ({ kind: "message", id: getMessageKey(message), createdAt: message.createdAt, message })),
    ...conversationEvents.map((event): ConversationTimelineItem => ({ kind: "event", id: `event:${event.id}`, createdAt: event.createdAt, event })),
  ].sort((first, second) => {
    const timestampDifference = Date.parse(first.createdAt) - Date.parse(second.createdAt);
    if (timestampDifference !== 0) return timestampDifference;
    if (first.kind !== second.kind) return first.kind === "message" ? -1 : 1;
    return first.id.localeCompare(second.id);
  });
  const currentTheme = activeTheme;

  return (
    <div ref={panelRef} onDragEnter={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setIsDragActive(true); } }} onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragActive(false); }} onDrop={handleAttachmentDrop} className="chat-panel-root relative flex min-h-0 flex-1 flex-col">
      <div className="chat-theme-artwork pointer-events-none absolute inset-0" aria-hidden="true" />
      <header className="chat-header flex shrink-0 items-center gap-2 border-b border-border bg-surface px-3 py-4 sm:gap-3 sm:px-6">
        <MobileBackButton onClick={onMobileBack} isFocusMode={layoutMode === "focus"} />
        <PresenceAvatar profile={conversation.otherProfile} size="sm" isOnline={effectiveIsOtherUserOnline} />
        <div className="min-w-0 flex-1"><h1 className="truncate font-semibold text-heading">{otherName}</h1>{isDeletedAccount ? <p className="truncate text-xs font-medium text-muted">Account deleted</p> : (presenceText || conversation.otherProfile.username) && <p className={`truncate text-xs font-medium ${effectiveIsOtherUserOnline ? "text-online" : "text-muted"}`}>{presenceText}{presenceText && conversation.otherProfile.username && <span aria-hidden="true"> · </span>}{conversation.otherProfile.username && <span className="font-normal text-body">@{conversation.otherProfile.username}</span>}</p>}</div>
        {layoutMode === "workspace" && <FocusModeButton onClick={onEnterFocusMode} />}
        <PinnedMessagesMenu error={pinnedMessagesError} isLoading={isLoadingPinnedMessages} pins={pinnedMessages} onRetry={() => void loadPinnedMessages()} onSelect={handlePinnedMessageSelected} />
        {!isDeletedAccount && <ConversationMuteMenu conversationName={otherName} mutedUntil={conversationMutedUntil} onChange={(mutedUntil) => onConversationMuteChange(conversation.id, mutedUntil)} />}
        <ConversationOptionsMenu conversationId={conversation.id} conversationName={otherName} profile={conversation.otherProfile} profilePresenceText={presenceText} isProfileOnline={effectiveIsOtherUserOnline} currentTheme={currentTheme} premiumAccess={premiumAccess} isArchived={Boolean(conversationArchivedAt)} isBlocked={interactionStatus.iBlocked} isDeleted={isDeletedAccount} messagingAvailable={interactionStatus.messagingAvailable} isConnected={isConnected} nicknamesByUserId={nicknamesByUserId} participants={currentProfile ? [currentProfile, conversation.otherProfile] : [conversation.otherProfile]} onArchivedChange={(archived) => onConversationArchiveChange(conversation.id, archived)} onDelete={() => onConversationDelete(conversation.id)} onDisconnect={disconnectConversation} onNicknameSave={saveConversationNickname} onThemeApply={saveConversationTheme} onContentJump={(messageId) => openMessageTarget(messageId, "pin")} onUserBlockChange={saveUserBlock} />
      </header>
      {isDragActive && <div className="pointer-events-none absolute inset-3 z-50 flex items-center justify-center rounded-3xl border-2 border-dashed border-primary bg-accent/95"><div className="text-center"><p className="font-semibold text-heading">Drop to add attachments</p><p className="mt-1 text-sm text-body">Photos or supported files</p></div></div>}

      <p aria-live="polite" className="sr-only">{newMessageAnnouncement}</p>
      <div className="pointer-events-none absolute left-1/2 top-20 z-40 w-[min(calc(100%-2rem),22rem)] -translate-x-1/2"><AnimatePresence initial={false}>{pinToast && <motion.div key={pinToast.id} role="status" aria-live="polite" aria-atomic="true" initial={shouldReduceMotion ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }} transition={{ duration: shouldReduceMotion ? 0 : 0.16 }} className="chat-surface rounded-2xl border border-border bg-surface px-4 py-3 text-center text-sm font-semibold text-heading shadow-soft">{pinToast.message}</motion.div>}</AnimatePresence></div>
      <div className="relative min-h-0 flex-1">
        <ConversationReminderStatus reminders={sharedReminders} onOpen={onReminderOpen} />
        <div ref={scrollViewportRef} role="region" aria-label={`Messages with ${otherName}`} onScroll={handleScroll} className="chat-timeline absolute inset-0 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-6 lg:px-10">
          {isLoading ? (
            <div role="status" aria-live="polite" className="mx-auto max-w-2xl space-y-4"><div className="h-20 w-3/4 animate-pulse rounded-3xl bg-accent" /><div className="ml-auto h-16 w-2/3 animate-pulse rounded-3xl bg-accent" /></div>
          ) : historyError && messages.length === 0 ? (
            <div role="alert" className="mx-auto max-w-md rounded-3xl border border-border bg-surface p-6 text-center shadow-soft"><h2 className="font-semibold text-heading">Unable to load messages</h2><p className="mt-2 text-sm leading-6 text-body">{historyError}</p><button type="button" onClick={handleHistoryRetry} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Retry</button></div>
          ) : messages.length === 0 && !shouldShowIntroductoryFallback ? (
            shouldShowRestartEmptyState ? <div className="chat-empty-state flex min-h-full items-center justify-center py-12"><div className="max-w-md text-center"><div className="chat-accent-control mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-primary" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7"><path d="M5 6.5h14v9H9l-4 3v-12Z" strokeLinejoin="round" /><path d="M9 10h6m-6 3h4" strokeLinecap="round" /></svg></div><h2 className="mt-4 font-semibold text-heading">Start the conversation again</h2><p className="mt-2 text-sm leading-6 text-body">Your previous chat history was cleared. Send {otherName} a message to start fresh.</p></div></div> : <div className="chat-empty-state mx-auto max-w-md py-12 text-center"><h2 className="font-semibold text-heading">No messages yet. Start the conversation.</h2></div>
          ) : (
            <div className="mx-auto max-w-2xl space-y-4">
              {historyError && <div role="alert" className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-body shadow-soft"><p>Earlier messages couldn’t be refreshed.</p><button type="button" onClick={handleHistoryRetry} className="mt-2 min-h-10 rounded-xl px-3 py-1.5 text-sm font-semibold text-primary transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Retry history</button></div>}
              {isLoadingSearchContext && <div role="status" aria-live="polite" className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-body shadow-soft">Loading message context…</div>}
              {searchContextError && <div role="alert" className="rounded-2xl border border-primary/25 bg-accent px-4 py-3 text-sm text-body shadow-soft"><p>{searchContextError}</p><button type="button" onClick={() => { processedSearchTargetTokenRef.current = null; setSearchContextRetryKey((key) => key + 1); }} className="mt-2 min-h-10 rounded-xl px-3 py-1.5 text-sm font-semibold text-primary transition hover:bg-surface focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Retry</button></div>}
              {isViewingSearchContext && <div role="status" className="rounded-2xl border border-border bg-surface px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.14em] text-muted shadow-soft">Viewing search context</div>}
              {shouldShowIntroductoryFallback && <article className="flex justify-start"><div className="max-w-[85%] rounded-3xl rounded-bl-md border border-border bg-surface px-4 py-3 text-body shadow-soft sm:max-w-[75%]"><p className="whitespace-pre-wrap break-words text-sm leading-6">{conversation.introductoryMessage}</p><div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">{conversation.introductoryMessageCreatedAt && <time dateTime={conversation.introductoryMessageCreatedAt}>{formatMessageTimestamp(conversation.introductoryMessageCreatedAt)}</time>}<span>Introduction</span></div></div></article>}
              {conversationEventsError && <div role="alert" className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-body shadow-soft"><p>{conversationEventsError}</p><button type="button" onClick={() => void loadConversationEvents()} className="mt-2 min-h-10 rounded-xl px-3 py-1.5 text-sm font-semibold text-primary transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Retry activity</button></div>}
              {timelineItems.map((item) => {
                if (item.kind === "event") return <ConversationActivityRow key={item.id} event={item.event} currentUserId={currentUserId} onActivate={(event, trigger) => { if (event.targetMessageId) openMessageTarget(event.targetMessageId, "event"); else if (event.targetReminderId) onReminderEventOpen(event.targetReminderId, trigger); }} />;
                const message = item.message;
                const isCurrentUser = message.senderId === currentUserId;
                const isFailed = message.kind === "optimistic" && message.deliveryState === "failed";
                const isSending = message.kind === "optimistic" && message.deliveryState === "sending";
                const shouldShowStatus = isCurrentUser && statusMessageKey === getMessageKey(message);
                const receiptVisibleUnderInteraction = interactionStatus.messagingAvailable ? otherReceipt : otherReceipt ? { ...otherReceipt, lastReadAt: null } : null;
                const confirmedStatus = message.kind === "confirmed" ? getConfirmedMessageStatus(message, receiptVisibleUnderInteraction) : null;
                const statusLabel = isSending ? "Sending…" : isFailed ? "Failed" : confirmedStatus === "seen" ? "Seen" : confirmedStatus === "delivered" ? "Delivered" : "Sent";
                const reactionGroups = message.kind === "confirmed" && !message.isDeleted ? groupMessageReactions(reactions, message.id, currentUserId) : [];
                const replyPreview = message.kind === "confirmed" && message.isDeleted ? null : message.replyPreview;
                const canJumpToReplyTarget = Boolean(message.replyToMessageId && loadedConfirmedMessageIds.has(message.replyToMessageId));
                const replyActionSenderName = isCurrentUser ? "yourself" : otherName;
                const isEditingThisMessage = message.kind === "confirmed" && messageEditState?.messageId === message.id;
                const isSavingThisEdit = Boolean(isEditingThisMessage && messageEditState?.isSaving);
                const galleryAttachments: GalleryMediaItem[] = (message.kind === "optimistic" ? message.attachments.filter((attachment) => attachment.attachmentKind === "image").map((attachment) => ({ ...attachment, width: attachment.width ?? 1, height: attachment.height ?? 1, url: attachment.previewUrl })) : message.attachments.filter((attachment) => attachment.attachmentKind === "image").map((attachment) => ({ ...attachment, width: attachment.width ?? 1, height: attachment.height ?? 1, url: signedMedia.urls.get(attachment.storagePath) ?? null })));
                const isImageMessage = message.messageType === "image" && !("isDeleted" in message && message.isDeleted);
                const isVoiceMessage = message.messageType === "voice" && !("isDeleted" in message && message.isDeleted);
                const isFileMessage = message.messageType === "file" && !("isDeleted" in message && message.isDeleted);
                const fileAttachments = isFileMessage ? message.attachments.filter((attachment) => attachment.attachmentKind === "file") : [];
                const voiceAttachment = isVoiceMessage ? message.attachments.find((attachment) => attachment.attachmentKind === "voice") : undefined;
                const voiceSource = message.kind === "optimistic" ? message.attachments.find((attachment) => attachment.attachmentKind === "voice")?.previewUrl ?? null : voiceAttachment ? signedMedia.urls.get(voiceAttachment.storagePath) ?? null : null;

                return (
                  <article ref={(element) => { if (message.kind !== "confirmed") return; if (element) messageElementsRef.current.set(message.id, element); else messageElementsRef.current.delete(message.id); }} key={getMessageKey(message)} tabIndex={message.kind === "confirmed" ? -1 : undefined} onPointerDown={message.kind === "confirmed" && !message.isDeleted ? (event) => handleMessagePointerDown(message, event) : undefined} onPointerMove={message.kind === "confirmed" && !message.isDeleted ? handleMessagePointerMove : undefined} onPointerUp={message.kind === "confirmed" && !message.isDeleted ? handleMessagePointerEnd : undefined} onPointerCancel={message.kind === "confirmed" && !message.isDeleted ? handleMessagePointerEnd : undefined} onPointerLeave={message.kind === "confirmed" && !message.isDeleted ? handleMessagePointerEnd : undefined} className={`group/message relative flex min-w-0 ${isCurrentUser ? "justify-end" : "justify-start"}`}>
                    <div className={`flex min-w-0 max-w-[92%] flex-col sm:max-w-[80%] md:max-w-[75%] ${isCurrentUser ? "items-end" : "items-start"}`}>
                      <div className="relative max-w-full">
                        <motion.div animate={{ scale: message.kind === "confirmed" && mobileEmphasizedMessageId === message.id && !shouldReduceMotion ? 0.985 : 1 }} transition={{ duration: shouldReduceMotion ? 0 : 0.12, ease: [0.22, 1, 0.36, 1] }} className={`max-w-full min-w-0 rounded-3xl px-4 py-3 shadow-soft transition-shadow ${message.kind === "confirmed" && message.isDeleted ? `${isCurrentUser ? "rounded-br-md" : "rounded-bl-md"} border border-border bg-card text-muted` : isCurrentUser ? isFailed ? "rounded-br-md border border-primary/25 bg-accent text-heading" : "chat-message-outgoing rounded-br-md bg-primary text-white" : "chat-message-incoming rounded-bl-md border border-border bg-surface text-body"} ${message.kind === "confirmed" && (highlightedMessageId === message.id || mobileEmphasizedMessageId === message.id) ? "chat-message-highlight ring-2 ring-primary/30 ring-offset-4 ring-offset-background" : ""}`}>
                          {replyPreview && <ReplyQuote preview={replyPreview} isStrongOutgoing={isCurrentUser && !isFailed} canJump={canJumpToReplyTarget} onJump={() => message.replyToMessageId && jumpToOriginalMessage(message.replyToMessageId)} />}
                          {isImageMessage && <MessageMediaGallery attachments={galleryAttachments} isLoading={message.kind === "confirmed" && signedMedia.isLoading} onOpen={(index, trigger) => { imageViewerReturnFocusRef.current = trigger; setImageViewerState({ messageId: message.kind === "confirmed" ? message.id : message.optimisticId, initialIndex: index }); }} onRetry={galleryAttachments.length > 0 ? signedMedia.retry : handleHistoryRetry} />}
                          {isVoiceMessage && <VoiceMessagePlayer src={voiceSource} durationMs={voiceAttachment?.durationMs ?? 0} isLoading={message.kind === "confirmed" && (!voiceAttachment || signedMedia.isLoading)} isOutgoing={isCurrentUser && !isFailed} label={`voice message from ${replyActionSenderName}`} onRetry={message.kind === "confirmed" ? () => { if (voiceAttachment) signedMedia.retry(); else loadMessageAttachments(message.id); } : () => undefined} />}
                          {isFileMessage && <FileMessageCard attachments={fileAttachments} isOutgoing={isCurrentUser && !isFailed} isOptimistic={message.kind === "optimistic"} />}
                          {message.kind === "confirmed" && message.isDeleted ? <p className="break-words text-sm italic leading-6">This message was deleted.</p> : isEditingThisMessage && messageEditState ? <div className={`min-w-0 ${isImageMessage || isFileMessage ? "mt-3" : ""}`}><label htmlFor={`edit-message-${message.id}`} className="sr-only">{isImageMessage ? "Edit image caption" : isFileMessage ? "Edit file caption" : "Edit your message"}</label><textarea ref={editTextareaRef} id={`edit-message-${message.id}`} value={messageEditState.draft} onChange={(event) => { const draft = event.target.value; setMessageEditState((currentState) => currentState?.messageId === message.id ? { ...currentState, draft, error: "" } : currentState); resizeTextarea(event.target); }} onKeyDown={handleEditKeyDown} rows={2} maxLength={messageMaxLength} disabled={messageEditState.isSaving} placeholder={isImageMessage || isFileMessage ? "Add a caption…" : undefined} aria-describedby={messageEditState.error ? `edit-message-error-${message.id}` : undefined} className="max-h-32 min-h-20 w-full min-w-0 resize-none overflow-y-auto rounded-xl border border-border bg-surface px-3 py-2 text-sm leading-6 text-heading outline-none placeholder:text-muted focus:ring-2 focus-visible:ring-primary/20 disabled:cursor-wait disabled:opacity-70" /><div className="mt-2 flex flex-wrap items-center justify-end gap-2"><button type="button" onClick={() => void saveMessageEdit()} disabled={messageEditState.isSaving} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-surface px-3 py-2 text-xs font-semibold text-heading transition hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-wait disabled:opacity-60">{messageEditState.isSaving ? "Saving…" : "Save"}</button><button type="button" onClick={cancelMessageEditing} disabled={messageEditState.isSaving} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-background/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-background/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-wait disabled:opacity-60">Cancel</button></div>{messageEditState.error && <p id={`edit-message-error-${message.id}`} role="alert" className="mt-2 text-xs leading-5 text-white">{messageEditState.error}</p>}</div> : message.body ? <MessageText text={message.body} className={`whitespace-pre-wrap break-words text-sm leading-6 ${isImageMessage || isFileMessage ? "mt-3" : ""}`} /> : null}
                          <div className={`mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs ${isCurrentUser && !isFailed && !(message.kind === "confirmed" && message.isDeleted) ? "text-white/70" : "text-muted"}`}><time dateTime={message.createdAt}>{formatMessageTimestamp(message.createdAt)}</time>{message.kind === "confirmed" && message.isIntroduction && <span>Introduction</span>}{message.kind === "confirmed" && message.isForwarded && !message.isDeleted && <span>Forwarded</span>}{message.kind === "confirmed" && !message.isDeleted && (message.editedAt || isSavingThisEdit) && <span>Edited</span>}</div>
                          {isFailed && <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => handleRetryMessage(message)} disabled={isSubmitting} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-60">Retry</button><button type="button" onClick={() => handleRemoveFailedMessage(message.optimisticId)} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-heading transition hover:bg-card focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Remove</button><p className="w-full text-xs leading-5 text-body">We couldn’t send this message. Check your connection and try again.</p></div>}
                        </motion.div>
                        {message.kind === "confirmed" && !message.isDeleted && <MessageActionsToolbar canInteract={interactionStatus.messagingAvailable} isMoreOpen={moreActionMessageId === message.id} isOutgoing={isCurrentUser} replyLabel={`Reply to message from ${replyActionSenderName}`} onMore={(button) => openMoreActions(message.id, button)} onReact={(button) => openQuickReactions(message.id, button)} onReply={() => handleReplyToMessage(message)} />}
                      </div>
                      {reactionGroups.length > 0 && <div className={`relative z-10 -mt-1 flex max-w-full flex-wrap gap-1 px-1 ${isCurrentUser ? "justify-end" : "justify-start"}`}>{reactionGroups.map((group) => { const reactionName = getEmojiLabel(group.emoji).toLowerCase(); return <button key={group.emoji} type="button" onClick={(event) => message.kind === "confirmed" && openReactionDetails(message.id, event.currentTarget)} aria-haspopup="dialog" aria-expanded={message.kind === "confirmed" && reactionDetailsMessageId === message.id} aria-label={`View ${group.count} ${reactionName} ${group.count === 1 ? "reaction" : "reactions"}${group.reactedByCurrentUser ? ", including you" : ""}`} className={`chat-reaction-chip inline-flex min-h-8 items-center gap-1 rounded-full border px-2 py-1 text-xs shadow-soft transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 ${group.reactedByCurrentUser ? "chat-reaction-selected border-primary/30 bg-accent text-heading" : "border-border bg-surface text-body hover:bg-accent"}`}><span aria-hidden="true" className="text-sm">{group.emoji}</span><span aria-hidden="true" className="font-semibold">{group.count}</span></button>; })}</div>}
                      {shouldShowStatus && <p role={isFailed ? "alert" : isSending ? "status" : undefined} className={`mt-1.5 px-1 text-right text-xs font-medium ${isFailed ? "text-primary" : "text-muted"}`}>{statusLabel}</p>}
                    </div>
                    {message.kind === "confirmed" && !message.isDeleted && <button type="button" onClick={(event) => openMobileActionSheet(message.id, event.currentTarget)} aria-label={`Open actions for message from ${replyActionSenderName}`} aria-haspopup="dialog" aria-expanded={mobileActionMessageId === message.id} className="pointer-events-none absolute right-0 top-0 z-10 flex h-9 w-9 items-center justify-center rounded-xl bg-surface text-muted opacity-0 shadow-soft transition focus:pointer-events-auto focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 md:hidden"><svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg></button>}
                  </article>
                );
              })}
            </div>
          )}
        </div>

        {showJumpToLatest && <button type="button" onClick={handleJumpToLatest} className="chat-jump-latest absolute bottom-4 left-1/2 inline-flex min-h-11 -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-heading shadow-soft transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true"><path d="m7 10 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>Jump to latest</button>}
      </div>

      {reactionError && <p role="status" aria-live="polite" className="shrink-0 border-t border-border bg-accent px-4 py-2 text-center text-xs leading-5 text-body">{reactionError}</p>}
      {pinMutationError && <p role="alert" className="shrink-0 border-t border-border bg-accent px-4 py-2 text-center text-xs leading-5 text-body">{pinMutationError}</p>}
      {!interactionStatus.messagingAvailable ? <section aria-label="Messaging availability" className="chat-composer-region shrink-0 border-t border-border bg-background px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5 lg:px-6"><div role="status" className="chat-composer-surface flex min-w-0 flex-col gap-3 rounded-2xl bg-surface px-4 py-4 shadow-soft sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="font-semibold text-heading">{isDeletedAccount ? "This account has been deleted." : interactionStatus.iBlocked ? `You blocked ${otherName}.` : !isConnected ? `You’re no longer connected with ${otherName}.` : "Messaging is unavailable for this conversation."}</p>{isDeletedAccount ? <p className="mt-1 text-sm leading-6 text-body">You can still view your conversation history.</p> : interactionStatus.iBlocked ? <p className="mt-1 text-sm leading-6 text-body">Unblock this person before reconnecting or sending messages.</p> : !isConnected && <p className="mt-1 text-sm leading-6 text-body">{conversation.requestAvailable ? "Connect again to send new messages." : "Connection requests are unavailable right now."}</p>}</div>{!isDeletedAccount && (interactionStatus.iBlocked ? <button ref={blockedComposerActionRef} type="button" onClick={() => { setUnblockError(""); setUnblockDialogOpen(true); }} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-heading hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Unblock</button> : !isConnected && conversation.requestAvailable && <button type="button" onClick={() => onReconnectRequested(conversation.otherProfile)} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-soft hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Connect again</button>)}</div></section> : <form onSubmit={handleSend} className="chat-composer-region shrink-0 bg-background px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-5 sm:pt-3 lg:px-6">
        <TypingIndicator isVisible={isOtherUserTyping} name={otherName} shouldReduceMotion={shouldReduceMotion} />
        {replyingTo && <div aria-label={`Replying to ${replyingTo.senderName}`} className="chat-composer-surface mb-2 flex min-w-0 items-start gap-3 rounded-2xl bg-surface px-4 py-3 shadow-soft"><div className="chat-reply-indicator min-w-0 flex-1 border-l-2 border-primary/40 pl-3"><p className="truncate text-xs font-semibold text-heading">Replying to {replyingTo.senderName}</p><p className="mt-0.5 line-clamp-2 break-words text-xs leading-5 text-body">{replyingTo.body ?? "Earlier message unavailable"}</p></div><button type="button" onClick={() => { setReplyingTo(null); window.requestAnimationFrame(() => textareaRef.current?.focus()); }} aria-label={`Cancel reply to ${replyingTo.senderName}`} className="chat-accent-control flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" strokeLinecap="round" /></svg></button></div>}
        {voiceRecorder.mode === "idle" && <ComposerMediaPreview images={selectedImages} disabled={isSubmitting} onRemove={removeSelectedImage} onRemoveAll={removeAllSelectedImages} />}
        {voiceRecorder.mode === "idle" && <ComposerFilePreview files={selectedFiles} disabled={isSubmitting} onRemove={removeSelectedFile} onRemoveAll={removeAllSelectedFiles} />}
        {mediaError && <p id={mediaErrorId} role="alert" className="mb-2 rounded-xl bg-accent px-3 py-2 text-xs leading-5 text-body">{mediaError}</p>}
        {uploadStatus && <p role="status" aria-live="polite" className="mb-2 rounded-xl bg-accent px-3 py-2 text-xs leading-5 text-body">{uploadStatus}</p>}
        {voiceRecorder.mode === "idle" && voiceRecorder.error && <p role="alert" className="mb-2 rounded-xl bg-accent px-3 py-2 text-xs leading-5 text-body">{voiceRecorder.error}</p>}
        <input ref={mediaInputRef} type="file" accept={acceptedImageInputTypes} multiple onChange={(event) => void handleImageSelection(event)} disabled={!currentUserId || isSubmitting} className="hidden" aria-hidden="true" tabIndex={-1} />
        <input ref={fileInputRef} type="file" accept={acceptedFileInputTypes} multiple onChange={handleFileSelection} disabled={!currentUserId || isSubmitting} className="hidden" aria-hidden="true" tabIndex={-1} />
        <label htmlFor={`message-composer-${conversation.id}`} className="sr-only">Message {otherName}</label>
        {voiceRecorder.mode !== "idle" ? <VoiceRecordingComposer controller={voiceRecorder} isSending={isSubmitting} shouldReduceMotion={Boolean(shouldReduceMotion)} onSend={sendVoiceRecordingForReview} /> : <div className="chat-composer-shell grid min-w-0 grid-cols-[auto_auto_auto_minmax(0,1fr)_auto] items-end gap-x-1 rounded-2xl bg-surface px-2 py-3 shadow-soft focus-within:ring-2 focus-within:ring-primary/20 sm:gap-x-2 sm:px-4">
          <AttachmentMenu disabled={!currentUserId || isSubmitting} onPhotos={openImagePicker} onFiles={openFilePicker} />
          <button ref={composerEmojiButtonRef} type="button" onClick={openComposerEmojiPicker} disabled={isSubmitting} aria-label="Choose an emoji" title="Choose an emoji" aria-haspopup="dialog" aria-expanded={isComposerEmojiPickerOpen} className="chat-accent-control inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-wait disabled:opacity-50 sm:h-11 sm:w-11"><EmojiIcon /></button>
          <button type="button" onClick={() => void startVoiceRecording()} disabled={!currentUserId || isSubmitting || Boolean(messageEditState)} aria-label="Record a voice message" title="Record a voice message" className="chat-accent-control inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 sm:h-11 sm:w-11"><MicrophoneIcon /></button>
          <textarea ref={textareaRef} id={`message-composer-${conversation.id}`} value={draft} onChange={(event) => { setDraft(event.target.value); resizeTextarea(event.target); notifyTyping(event.target.value.trim().length > 0); }} onBlur={stopTyping} onKeyDown={handleComposerKeyDown} onPaste={handleComposerPaste} maxLength={messageMaxLength} rows={1} disabled={!currentUserId || isSubmitting} aria-describedby={composerDescription} placeholder="Write a message…" className="chat-composer-input max-h-32 min-h-12 min-w-0 resize-none overflow-y-auto border-0 bg-transparent px-1 py-3 text-sm leading-6 text-heading outline-none ring-0 placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-60 sm:px-2" />
          <button type="submit" disabled={isSendDisabled} aria-label={isSubmitting ? `Sending message to ${otherName}` : `Send message to ${otherName}`} className="chat-primary-action inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-0 bg-primary text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 sm:h-12 sm:w-12"><SendIcon /><span className="sr-only">{isSubmitting ? "Sending…" : "Send"}</span></button>
          <div aria-live="polite" aria-atomic="true" className={`col-start-1 col-end-6 row-start-2 flex min-w-0 items-start justify-between gap-3 px-1 sm:col-start-4 sm:col-end-5 ${comingSoonMessage || showCharacterCount ? "mt-2 min-h-5" : "mt-0 min-h-0 sm:mt-2 sm:min-h-5"}`}>
            {comingSoonMessage ? <p id={composerHelpId} className="min-w-0 text-xs leading-5 text-muted">{comingSoonMessage}</p> : <p id={composerHelpId} className={showCharacterCount ? "sr-only" : "sr-only sm:not-sr-only sm:min-w-0 sm:text-xs sm:leading-5 sm:text-muted"}>Enter to send · Shift+Enter for a new line</p>}
            {showCharacterCount && <p id={characterCountId} className="shrink-0 text-xs font-medium leading-5 text-muted">{remainingCharacters} left</p>}
          </div>
        </div>}
      </form>}
      <AnimatePresence initial={false} onExitComplete={() => setMobileEmphasizedMessageId(null)}>{mobileActionMessage && <MessageActionSheet
        key={mobileActionMessage.id}
        canCopy={Boolean(mobileActionMessage.body)}
        canForward={!mobileActionMessage.isIntroduction && (mobileActionMessage.messageType === "text" ? Boolean(mobileActionMessage.body) : mobileActionMessage.attachments.length > 0)}
        canSave={!mobileActionMessage.isIntroduction && mobileActionMessage.messageType === "image" && mobileActionMessage.attachments.some((attachment) => attachment.attachmentKind === "image" && ["image/jpeg", "image/png", "image/webp"].includes(attachment.mimeType.split(";", 1)[0].toLowerCase()))}
        canDelete={mobileActionMessage.senderId === currentUserId && !mobileActionMessage.isIntroduction}
        canEdit={mobileActionMessage.senderId === currentUserId && !mobileActionMessage.isIntroduction && mobileActionMessage.messageType !== "voice"}
        canPin={!mobileActionMessage.isIntroduction && interactionStatus.messagingAvailable}
        canInteract={interactionStatus.messagingAvailable}
        isPinned={pinnedMessages.some((pin) => pin.messageId === mobileActionMessage.id)}
        isPinPending={isLoadingPinnedMessages || pendingPinnedMessageIds.has(mobileActionMessage.id)}
        messageLabel={`message from ${mobileActionMessage.senderId === currentUserId ? "yourself" : otherName}`}
        quickReactions={quickReactions}
        returnFocusRef={mobileActionReturnFocusRef}
        themeStyle={getConversationThemeStyle(currentTheme)}
        onClose={() => setMobileActionMessageId(null)}
        onCopy={() => void copyMessage(mobileActionMessage)}
        onDelete={() => { const returnFocusElement = mobileActionReturnFocusRef.current; if (returnFocusElement) openDeleteConfirmation(mobileActionMessage, returnFocusElement); }}
        onPin={() => void togglePinnedMessage(mobileActionMessage)}
        onReact={(emoji) => void toggleReaction(mobileActionMessage.id, emoji)}
        onReply={() => handleReplyToMessage(mobileActionMessage)}
        onEdit={() => { const returnFocusElement = mobileActionReturnFocusRef.current; if (returnFocusElement) startEditingMessage(mobileActionMessage, returnFocusElement); }}
        onForward={() => { const trigger = mobileActionReturnFocusRef.current; if (trigger) forwardMessage(mobileActionMessage, trigger); }}
        onSave={() => { const trigger = mobileActionReturnFocusRef.current; if (trigger) saveMessageMedia(mobileActionMessage, trigger); }}
        onOpenEmojiPicker={() => setFullReactionPickerMessageId(mobileActionMessage.id)}
      />}</AnimatePresence>
      <AnimatePresence initial={false} onExitComplete={() => { const anchor = reactionDetailsAnchorRef.current; if (anchor?.isConnected) anchor.focus(); else if (lastReactionDetailsMessageIdRef.current) messageElementsRef.current.get(lastReactionDetailsMessageIdRef.current)?.focus(); }}>{reactionDetailsMessage && (reactionDetailsReactions.length > 0 || isReactionDetailsMutationPending) && <ReactionDetails key={reactionDetailsMessage.id} anchorRef={reactionDetailsAnchorRef} currentUserId={currentUserId} error={reactionProfilesError} isLoading={isReactionProfilesLoading} isMutationPending={isReactionDetailsMutationPending} canMutate={interactionStatus.messagingAvailable} messageLabel={`message from ${reactionDetailsMessage.senderId === currentUserId ? "yourself" : otherName}`} mutationError={reactionDetailsMutationError} pendingReactionKeys={pendingReactionKeys} profilesById={availableReactionProfilesById} reactions={reactionDetailsReactions} onClose={closeReactionDetails} onRemoveOwnReaction={(reaction) => void removeOwnReactionFromDetails(reaction)} onRetry={retryReactionProfiles} />}</AnimatePresence>
      <AnimatePresence initial={false}>{messageDeleteState && <MessageDeleteDialog key={messageDeleteState.messageId} error={messageDeleteState.error} isDeleting={messageDeleteState.isDeleting} returnFocusRef={deleteTriggerRef} onCancel={cancelMessageDeletion} onConfirm={() => void confirmMessageDeletion()} />}</AnimatePresence>
      <AnimatePresence initial={false}>{unblockDialogOpen && <UserBlockDialog blocked={false} displayName={otherName} error={unblockError} isSaving={unblockSaving} returnFocusRef={blockedComposerActionRef} onCancel={() => setUnblockDialogOpen(false)} onConfirm={() => void confirmComposerUnblock()} />}</AnimatePresence>
      <AnimatePresence initial={false}>{imageViewerState && imageViewerImages.length > 0 && <ImageViewer key={imageViewerState.messageId} images={imageViewerImages} initialIndex={imageViewerState.initialIndex} isLoading={signedMedia.isLoading} returnFocusRef={imageViewerReturnFocusRef} onClose={() => setImageViewerState(null)} onRetry={signedMedia.retry} />}</AnimatePresence>
      <AnimatePresence initial={false}>{mediaSaveMessage && mediaSaveImages.length > 0 && <MessageMediaSaveDialog key={mediaSaveMessage.id} messageId={mediaSaveMessage.id} images={mediaSaveImages} returnFocusRef={mediaSaveReturnFocusRef} onClose={() => setMediaSaveMessageId(null)} onSavedToGallery={(count) => showPinToast(count === 1 ? "Saved to Gallery" : `${count} images saved to Gallery`)} onSavedToDevice={(count) => showPinToast(count === 1 ? "Image downloaded" : `${count} images downloaded`)} />}</AnimatePresence>
      {moreActionMessage && <MessageMoreMenu
        anchorRef={moreActionAnchorRef}
        canCopy={Boolean(moreActionMessage.body)}
        canDelete={moreActionMessage.senderId === currentUserId && !moreActionMessage.isIntroduction}
        canEdit={moreActionMessage.senderId === currentUserId && !moreActionMessage.isIntroduction && moreActionMessage.messageType !== "voice"}
        canForward={!moreActionMessage.isIntroduction && (moreActionMessage.messageType === "text" ? Boolean(moreActionMessage.body) : moreActionMessage.attachments.length > 0)}
        canSave={!moreActionMessage.isIntroduction && moreActionMessage.messageType === "image" && moreActionMessage.attachments.some((attachment) => attachment.attachmentKind === "image" && ["image/jpeg", "image/png", "image/webp"].includes(attachment.mimeType.split(";", 1)[0].toLowerCase()))}
        canPin={!moreActionMessage.isIntroduction && interactionStatus.messagingAvailable}
        disabled={Boolean(messageEditState?.isSaving || messageDeleteState?.isDeleting)}
        forwardUnavailableReason="This message can't be forwarded"
        isPinned={pinnedMessages.some((pin) => pin.messageId === moreActionMessage.id)}
        isPinPending={isLoadingPinnedMessages || pendingPinnedMessageIds.has(moreActionMessage.id)}
        messageLabel={`message from ${moreActionMessage.senderId === currentUserId ? "yourself" : otherName}`}
        onClose={() => setMoreActionMessageId(null)}
        onCopy={() => void copyMessage(moreActionMessage)}
        onDelete={() => { const trigger = moreActionAnchorRef.current; if (trigger) openDeleteConfirmation(moreActionMessage, trigger); }}
        onEdit={() => { const trigger = moreActionAnchorRef.current; if (trigger) startEditingMessage(moreActionMessage, trigger); }}
        onForward={() => { const trigger = moreActionAnchorRef.current; if (trigger) forwardMessage(moreActionMessage, trigger); }}
        onSave={() => { const trigger = moreActionAnchorRef.current; if (trigger) saveMessageMedia(moreActionMessage, trigger); }}
        onPin={() => void togglePinnedMessage(moreActionMessage)}
      />}
      {quickReactionMessageId && <QuickReactionMenu anchorRef={reactionAnchorRef} quickReactions={quickReactions} messageLabel="this message" onSelect={(emoji) => void toggleReaction(quickReactionMessageId, emoji)} onClose={() => setQuickReactionMessageId(null)} onOpenPicker={() => setFullReactionPickerMessageId(quickReactionMessageId)} />}
      {fullReactionPickerMessageId && <EmojiPicker anchorRef={reactionAnchorRef} ariaLabel="Choose a message reaction" onSelect={(emoji) => void toggleReaction(fullReactionPickerMessageId, emoji)} onClose={() => setFullReactionPickerMessageId(null)} placement="top" />}
      {isComposerEmojiPickerOpen && <EmojiPicker anchorRef={composerEmojiButtonRef} ariaLabel="Insert an emoji into your message" onSelect={insertComposerEmoji} onClose={() => setIsComposerEmojiPickerOpen(false)} placement="top" />}
    </div>
  );
}

function ChatPanel({ chatState, currentProfile, currentUserId, premiumAccess, isMobileVisible, layoutMode, messageSearchTarget, realtimeRefreshKey, realtimeMessageEvents, realtimeMessageUpdateEvents, realtimeReactionEvents, realtimePinnedMessageEvents, realtimeConversationActivityEvents, realtimeConversationNicknameEvents, realtimeReceiptEvents, onlineUserIds, quickReactions, conversationMutedUntil, conversationArchivedAt, onConversationMuteChange, onConversationThemeChange, onConversationArchiveChange, onConversationDelete, onConversationDisconnect, onReconnectRequested, onIncomingMessagesSynchronized, onConversationRead, onMessageConfirmed, onMessageUpdated, onMessageDeletionRolledBack, onForwardMessage, onStartConversation, onMobileBack, onEnterFocusMode, sharedReminders, onReminderOpen, onReminderEventOpen }: ChatPanelProps) {
  const visibilityClasses = isMobileVisible ? "flex" : "hidden xl:flex";

  if (chatState?.kind === "pending") {
    const recipientName = getProfileDisplayName(chatState.request.otherProfile);

    return (
      <main className={`${visibilityClasses} min-w-0 flex-1 flex-col overflow-hidden bg-background`}>
        <header className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-4 py-4 sm:px-6"><MobileBackButton onClick={onMobileBack} /><ProfileAvatar profile={chatState.request.otherProfile} size="sm" /><div className="min-w-0 flex-1"><h1 className="truncate font-semibold text-heading">{recipientName}</h1>{chatState.request.otherProfile.username && <p className="truncate text-sm text-body">@{chatState.request.otherProfile.username}</p>}</div></header>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-5 sm:p-8"><div className="w-full max-w-xl rounded-3xl border border-border bg-surface p-5 shadow-soft sm:p-7"><div className="flex items-center gap-4"><ProfileAvatar profile={chatState.request.otherProfile} size="lg" /><div className="min-w-0"><p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Request pending</p><h2 className="mt-1 truncate text-xl font-bold text-heading">Waiting for {recipientName}</h2></div></div><p className="mt-5 text-sm leading-6 text-body">You can continue messaging after they accept.</p><div className="mt-5 rounded-2xl border border-border bg-background px-4 py-3"><p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">Your introduction</p><p className="whitespace-pre-wrap break-words text-sm leading-6 text-body">{chatState.request.introduction}</p></div><div className="mt-5 rounded-2xl bg-accent px-4 py-3 text-sm leading-6 text-body">Additional messages are unavailable while this request is pending.</div></div></div>
      </main>
    );
  }

  if (chatState?.kind === "accepted") {
    const activeTheme = resolveConversationTheme(chatState.conversation.themeKey, premiumAccess);
    return <main className={`${visibilityClasses} chat-theme min-w-0 flex-1 flex-col overflow-hidden bg-background`} style={getConversationThemeStyle(activeTheme)} data-chat-theme={activeTheme}><AcceptedConversationPanel key={chatState.conversation.id} conversation={chatState.conversation} currentProfile={currentProfile} currentUserId={currentUserId} premiumAccess={premiumAccess} activeTheme={activeTheme} compactVisibilitySignal={isMobileVisible} layoutMode={layoutMode} messageSearchTarget={messageSearchTarget} realtimeRefreshKey={realtimeRefreshKey} realtimeMessageEvents={realtimeMessageEvents} realtimeMessageUpdateEvents={realtimeMessageUpdateEvents} realtimeReactionEvents={realtimeReactionEvents} realtimePinnedMessageEvents={realtimePinnedMessageEvents} realtimeConversationActivityEvents={realtimeConversationActivityEvents} realtimeConversationNicknameEvents={realtimeConversationNicknameEvents} realtimeReceiptEvents={realtimeReceiptEvents} isOtherUserOnline={onlineUserIds.has(chatState.conversation.otherProfile.id)} quickReactions={quickReactions} conversationMutedUntil={conversationMutedUntil} conversationArchivedAt={conversationArchivedAt} onConversationMuteChange={onConversationMuteChange} onConversationThemeChange={onConversationThemeChange} onConversationArchiveChange={onConversationArchiveChange} onConversationDelete={onConversationDelete} onConversationDisconnect={onConversationDisconnect} onReconnectRequested={onReconnectRequested} onIncomingMessagesSynchronized={onIncomingMessagesSynchronized} onConversationRead={onConversationRead} onMessageConfirmed={onMessageConfirmed} onMessageUpdated={onMessageUpdated} onMessageDeletionRolledBack={onMessageDeletionRolledBack} onForwardMessage={onForwardMessage} onMobileBack={onMobileBack} onEnterFocusMode={onEnterFocusMode} sharedReminders={sharedReminders} onReminderOpen={onReminderOpen} onReminderEventOpen={onReminderEventOpen} /></main>;
  }

  return (
    <main className="hidden min-w-0 flex-1 items-center justify-center overflow-hidden bg-background p-6 xl:flex xl:p-10">
      <div className="w-full max-w-md text-center"><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-accent text-primary shadow-soft lg:h-24 lg:w-24"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-10 w-10 lg:h-12 lg:w-12" aria-hidden="true"><path d="M4 5.5h16v11H8l-4 3v-14Z" strokeLinejoin="round" /><path d="M8 10h8M8 13h5" strokeLinecap="round" /></svg></div><h1 className="mt-6 text-2xl font-bold tracking-tight text-heading lg:mt-8 lg:text-3xl">Welcome to Nemissive</h1><p className="mt-4 text-base leading-7 text-body">Every meaningful conversation starts with a hello.</p><p className="mt-2 text-base leading-7 text-body">Choose someone from the left or start a new conversation.</p><button type="button" onClick={onStartConversation} className="mt-8 inline-flex items-center rounded-2xl bg-primary px-6 py-3 text-sm font-medium text-white shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-lg lg:mt-10">Start Conversation</button></div>
    </main>
  );
}

export default ChatPanel;
