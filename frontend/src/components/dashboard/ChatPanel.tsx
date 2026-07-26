import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { supabase } from "../../lib/supabase";
import type { ChatMessage, ComposerImageSelection, ConfirmedMessageStatus, DashboardChatState, DisplayChatMessage, MessageAttachment, MessageReaction, MessageReactionDeleteIdentity, MessageReplyPreview, OptimisticChatMessage, OptimisticMessageAttachment, ParticipantReceiptCursor, ProfileSearchResult, RealtimeChatMessageEvent, RealtimeChatMessageUpdateEvent, RealtimeMessageReactionEvent, RealtimeParticipantReceiptEvent, SelectedConversation } from "../../types/conversations";
import AnchoredPopover from "./AnchoredPopover";
import ComposerMediaPreview from "./ComposerMediaPreview";
import EmojiPicker from "./EmojiPicker";
import ImageViewer from "./ImageViewer";
import MessageActionSheet from "./MessageActionSheet";
import MessageActionsToolbar from "./MessageActionsToolbar";
import MessageDeleteDialog from "./MessageDeleteDialog";
import MessageMediaGallery, { type GalleryMediaItem } from "./MessageMediaGallery";
import PresenceAvatar from "./PresenceAvatar";
import ProfileAvatar from "./ProfileAvatar";
import ReactionDetails from "./ReactionDetails";
import { getEmojiLabel } from "./emojiData";
import { formatLastSeen } from "./presenceUtils";
import { getProfileDisplayName } from "./profileUtils";
import useConversationTyping from "./useConversationTyping";
import useSignedMessageMedia from "./useSignedMessageMedia";

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
  message_type: "text" | "image";
  reply_to_message_id: string | null;
};

type AttachmentRow = {
  id: string;
  message_id: string;
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  width: number;
  height: number;
  position: number;
};

type CreateImageMessageResult = {
  message: MessageRow;
  attachments: AttachmentRow[];
};

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
  isMobileVisible: boolean;
  realtimeRefreshKey: number;
  realtimeMessageEvents: RealtimeChatMessageEvent[];
  realtimeMessageUpdateEvents: RealtimeChatMessageUpdateEvent[];
  realtimeReactionEvents: RealtimeMessageReactionEvent[];
  realtimeReceiptEvents: RealtimeParticipantReceiptEvent[];
  onlineUserIds: ReadonlySet<string>;
  quickReactions: string[];
  onIncomingMessagesSynchronized: (conversationId: string, messageCreatedAt: string) => void;
  onConversationRead: (conversationId: string, messageCreatedAt: string) => void;
  onMessageConfirmed: () => void;
  onMessageUpdated: (message: ChatMessage) => void;
  onMessageDeletionRolledBack: (message: ChatMessage) => void;
  onStartConversation: () => void;
  onMobileBack: () => void;
};

const initialMessageLimit = 50;
const messageMaxLength = 2000;
const characterCountThreshold = 200;
const nearBottomThreshold = 140;
const comingSoonMessageDurationMs = 3000;
const readAcknowledgementDebounceMs = 280;
const replyPreviewMaxLength = 120;
const replyHighlightDurationMs = 1400;
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
  return { id: row.id, messageId: row.message_id, storagePath: row.storage_path, originalName: row.original_name, mimeType: row.mime_type, size: row.size_bytes, width: row.width, height: row.height, position: row.position };
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
    messageType: row.message_type === "image" ? "image" : "text",
    attachments,
    replyToMessageId: row.reply_to_message_id,
    replyPreview,
  };
}

function normalizeReplyPreviewBody(body: string) {
  const normalizedBody = body.replace(/\s+/g, " ").trim();
  if (normalizedBody.length <= replyPreviewMaxLength) return normalizedBody;
  return `${normalizedBody.slice(0, replyPreviewMaxLength - 1).trimEnd()}…`;
}

function createReplyPreview(message: Pick<ChatMessage, "id" | "senderId" | "body" | "isDeleted" | "messageType">, currentUserId: string | null, otherName: string): MessageReplyPreview {
  return {
    id: message.id,
    senderId: message.senderId,
    senderName: message.senderId === currentUserId ? "You" : otherName,
    body: message.isDeleted ? null : message.messageType === "image" && !message.body ? "Photo" : normalizeReplyPreviewBody(message.body),
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

function mergeReceiptCursor(current: ParticipantReceiptCursor | null, incoming: ParticipantReceiptCursor) {
  if (!current) return incoming;
  const currentDelivered = getNormalizedTimestamp(current.lastDeliveredAt);
  const incomingDelivered = getNormalizedTimestamp(incoming.lastDeliveredAt);
  const currentRead = getNormalizedTimestamp(current.lastReadAt);
  const incomingRead = getNormalizedTimestamp(incoming.lastReadAt);
  return {
    ...incoming,
    lastDeliveredAt: incomingDelivered !== null && (currentDelivered === null || incomingDelivered > currentDelivered) ? incoming.lastDeliveredAt : current.lastDeliveredAt,
    lastReadAt: incomingRead !== null && (currentRead === null || incomingRead > currentRead) ? incoming.lastReadAt : current.lastReadAt,
  };
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

function MobileBackButton({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-label="Back to Messages" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover lg:hidden"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true"><path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg></button>;
}

function MediaIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><circle cx="9" cy="10" r="1.5" /><path d="m5.5 17 4.2-4.2 3.1 3 2.2-2.1 3.5 3.3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function EmojiIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M9 10h.01M15 10h.01M8.5 14.5c1 1.2 2.1 1.8 3.5 1.8s2.5-.6 3.5-1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
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
  const previewText = preview.isDeleted ? "Original message was deleted." : preview.unavailable ? "Original message unavailable" : preview.body;
  const content = <><span className={`block truncate text-xs font-semibold ${isStrongOutgoing ? "text-white" : "text-heading"}`}>{preview.senderName}</span><span className={`mt-0.5 block break-words text-xs leading-5 ${isStrongOutgoing ? "text-white/80" : "text-body"}`}>{previewText}</span></>;
  const className = `mb-2 block w-full min-w-0 rounded-xl border-l-2 px-3 py-2 text-left ${isStrongOutgoing ? "border-white/60 bg-background/10" : "border-primary/40 bg-background"}`;

  if (canJump) return <button type="button" onClick={onJump} aria-label={`Jump to original message from ${preview.senderName}`} className={`${className} transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30`}>{content}</button>;
  return <div aria-label={`Reply to ${preview.senderName}: ${previewText ?? ""}`} className={className}>{content}</div>;
}

function AcceptedConversationPanel({ conversation, currentProfile, currentUserId, compactVisibilitySignal, realtimeRefreshKey, realtimeMessageEvents, realtimeMessageUpdateEvents, realtimeReactionEvents, realtimeReceiptEvents, isOtherUserOnline, quickReactions, onIncomingMessagesSynchronized, onConversationRead, onMessageConfirmed, onMessageUpdated, onMessageDeletionRolledBack, onMobileBack }: { conversation: SelectedConversation; currentProfile: ProfileSearchResult | null; currentUserId: string | null; compactVisibilitySignal: boolean; realtimeRefreshKey: number; realtimeMessageEvents: RealtimeChatMessageEvent[]; realtimeMessageUpdateEvents: RealtimeChatMessageUpdateEvent[]; realtimeReactionEvents: RealtimeMessageReactionEvent[]; realtimeReceiptEvents: RealtimeParticipantReceiptEvent[]; isOtherUserOnline: boolean; quickReactions: string[]; onIncomingMessagesSynchronized: (conversationId: string, messageCreatedAt: string) => void; onConversationRead: (conversationId: string, messageCreatedAt: string) => void; onMessageConfirmed: () => void; onMessageUpdated: (message: ChatMessage) => void; onMessageDeletionRolledBack: (message: ChatMessage) => void; onMobileBack: () => void }) {
  const shouldReduceMotion = useReducedMotion();
  const latestLoadRef = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
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
  const hasLoadedMessagesRef = useRef(false);
  const isMountedRef = useRef(true);
  const isSubmittingRef = useRef(false);
  const pendingEditRef = useRef<PendingMessageEdit | null>(null);
  const pendingDeleteRef = useRef<PendingMessageDelete | null>(null);
  const inFlightMessageRef = useRef<{ optimisticId: string; conversationId: string; body: string; replyToMessageId: string | null } | null>(null);
  const processedRealtimeSequenceRef = useRef(realtimeMessageEvents.at(-1)?.sequence ?? 0);
  const processedMessageUpdateSequenceRef = useRef(realtimeMessageUpdateEvents.at(-1)?.sequence ?? 0);
  const processedReactionSequenceRef = useRef(realtimeReactionEvents.at(-1)?.sequence ?? 0);
  const processedReceiptSequenceRef = useRef(realtimeReceiptEvents.at(-1)?.sequence ?? 0);
  const realtimeSequenceByMessageIdRef = useRef(new Map<string, number>());
  const messageUpdateSequenceByIdRef = useRef(new Map<string, number>());
  const reactionInsertSequenceByIdRef = useRef(new Map<string, number>());
  const reactionDeleteSequenceByIdRef = useRef(new Map<string, number>());
  const reactionDeleteSequenceByTupleRef = useRef(new Map<string, number>());
  const locallyConfirmedMessageIdsRef = useRef(new Set<string>());
  const pendingReactionKeysRef = useRef(new Set<string>());
  const replyTargetCacheRef = useRef(new Map<string, ChatMessage>());
  const replyTargetFetchesRef = useRef(new Map<string, Promise<void>>());
  const attachmentCacheRef = useRef(new Map<string, MessageAttachment[]>());
  const attachmentFetchesRef = useRef(new Map<string, Promise<void>>());
  const messageElementsRef = useRef(new Map<string, HTMLElement>());
  const selectedImagesRef = useRef<ComposerImageSelection[]>([]);
  const optimisticPreviewUrlsRef = useRef(new Set<string>());
  const imageViewerReturnFocusRef = useRef<HTMLElement | null>(null);
  const deletedMessageIdsRef = useRef(new Set<string>());
  const reactionAnchorRef = useRef<HTMLElement | null>(null);
  const reactionDetailsAnchorRef = useRef<HTMLElement | null>(null);
  const lastReactionDetailsMessageIdRef = useRef<string | null>(null);
  const resolvedReactionProfileIdsRef = useRef(new Set<string>());
  const composerEmojiButtonRef = useRef<HTMLButtonElement | null>(null);
  const composerSelectionRef = useRef({ start: 0, end: 0 });
  const [messages, setMessages] = useState<DisplayChatMessage[]>([]);
  const [reactions, setReactions] = useState<MessageReaction[]>([]);
  const [draft, setDraft] = useState("");
  const [selectedImages, setSelectedImages] = useState<ComposerImageSelection[]>([]);
  const [mediaError, setMediaError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
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
  const [mobileEmphasizedMessageId, setMobileEmphasizedMessageId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<MessageReplyPreview | null>(null);
  const [messageEditState, setMessageEditState] = useState<MessageEditState | null>(null);
  const [messageDeleteState, setMessageDeleteState] = useState<MessageDeleteState | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [imageViewerState, setImageViewerState] = useState<{ messageId: string; initialIndex: number } | null>(null);
  const [otherReceipt, setOtherReceipt] = useState<ParticipantReceiptCursor | null>(null);
  const [relativeTimeNow, setRelativeTimeNow] = useState(() => Date.now());
  const otherName = getProfileDisplayName(conversation.otherProfile);
  const presenceText = isOtherUserOnline ? "Online" : formatLastSeen(conversation.otherProfile.last_seen_at, relativeTimeNow);
  const { isOtherUserTyping, notifyTyping, stopTyping } = useConversationTyping({ conversationId: conversation.id, currentUserId, otherUserId: conversation.otherProfile.id });
  const signedMediaPaths = messages.flatMap((message) => message.kind === "confirmed" && !message.isDeleted ? message.attachments.map((attachment) => attachment.storagePath) : []);
  const signedMedia = useSignedMessageMedia(signedMediaPaths);

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
      selectedImagesRef.current.forEach((image) => URL.revokeObjectURL(image.objectUrl));
      optimisticPreviewUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
      optimisticPreviewUrls.clear();
    };
  }, []);

  useEffect(() => {
    selectedImagesRef.current = selectedImages;
  }, [selectedImages]);

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

      void supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", missingProfileIds).abortSignal(abortController.signal).then(({ data, error }) => {
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

  const loadReplyTarget = useCallback((replyToMessageId: string) => {
    if (replyTargetCacheRef.current.has(replyToMessageId) || replyTargetFetchesRef.current.has(replyToMessageId)) return;

    const request = (async () => {
      const { data, error } = await supabase.from("messages").select("id, conversation_id, sender_id, body, created_at, edited_at, is_deleted, deleted_at, source_request_id, message_type, reply_to_message_id").eq("id", replyToMessageId).eq("conversation_id", conversation.id).maybeSingle();
      if (!isMountedRef.current) return;
      if (error || !data) {
        if (error && import.meta.env.DEV) console.warn("Loading a realtime reply target failed", { conversationId: conversation.id, code: error.code });
        return;
      }

      const target = mapMessageRow(data as MessageRow);
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
      const { data, error } = await supabase.from("message_attachments").select("id, message_id, storage_path, original_name, mime_type, size_bytes, width, height, position").eq("message_id", messageId).order("position", { ascending: true });
      if (!isMountedRef.current) return;
      if (error) {
        if (import.meta.env.DEV) console.warn("Loading realtime image attachments failed", { conversationId: conversation.id, messageId, code: error.code });
        return;
      }

      const attachments = ((data ?? []) as AttachmentRow[]).map(mapAttachmentRow);
      attachmentCacheRef.current.set(messageId, attachments);
      setMessages((currentMessages) => currentMessages.map((message) => message.kind === "confirmed" && message.id === messageId ? { ...message, attachments } : message));
    })().finally(() => {
      attachmentFetchesRef.current.delete(messageId);
    });

    attachmentFetchesRef.current.set(messageId, request);
  }, [conversation.id]);

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
        supabase.from("messages").select("id, conversation_id, sender_id, body, created_at, edited_at, is_deleted, deleted_at, source_request_id, message_type, reply_to_message_id").eq("conversation_id", conversation.id).order("created_at", { ascending: false }).limit(initialMessageLimit).abortSignal(abortController.signal),
        supabase.from("messages").select("id, conversation_id, sender_id, body, created_at, edited_at, is_deleted, deleted_at, source_request_id, message_type, reply_to_message_id").eq("conversation_id", conversation.id).not("source_request_id", "is", null).order("created_at", { ascending: true }).limit(1).abortSignal(abortController.signal),
        supabase.from("conversation_participants").select("user_id, last_delivered_at, last_read_at").eq("conversation_id", conversation.id).abortSignal(abortController.signal),
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
        const attachmentResult = await supabase.from("message_attachments").select("id, message_id, storage_path, original_name, mime_type, size_bytes, width, height, position").in("message_id", messageIds).order("position", { ascending: true }).abortSignal(abortController.signal);
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
        const replyTargetsResult = await supabase.from("messages").select("id, conversation_id, sender_id, body, created_at, edited_at, is_deleted, deleted_at, source_request_id, message_type, reply_to_message_id").eq("conversation_id", conversation.id).in("id", missingReplyTargetIds).abortSignal(abortController.signal);
        if (isCancelled || loadId !== latestLoadRef.current) return;
        if (replyTargetsResult.error) {
          if (import.meta.env.DEV) console.warn("Loading reply targets failed", { conversationId: conversation.id, code: replyTargetsResult.error.code });
        } else {
          ((replyTargetsResult.data ?? []) as MessageRow[]).map((row) => mapMessageRow(row)).forEach((message) => replyTargetById.set(message.id, message));
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
        setOtherReceipt((currentReceipt) => mergeReceiptCursor(currentReceipt, loadedReceipt));
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

  useEffect(() => {
    const newEvents = realtimeMessageEvents.filter((event) => event.sequence > processedRealtimeSequenceRef.current);
    if (newEvents.length === 0) return;

    processedRealtimeSequenceRef.current = newEvents[newEvents.length - 1]?.sequence ?? processedRealtimeSequenceRef.current;
    const relevantEvents = newEvents.filter((event) => event.message.conversationId === conversation.id);
    if (relevantEvents.length === 0) return;

    const shouldAutoScroll = isNearBottom();
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
      if (event.message.messageType === "image" && !attachmentCacheRef.current.has(event.message.id)) loadMessageAttachments(event.message.id);
    });

    if (receivedIncomingMessage) {
      setNewMessageAnnouncement(`New message from ${otherName}.`);
      if (shouldAutoScroll) scrollToLatest("auto");
      else setShowJumpToLatest(true);
    }
  }, [conversation.id, currentUserId, isNearBottom, loadMessageAttachments, loadReplyTarget, otherName, realtimeMessageEvents, scrollToLatest]);

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
    const newEvents = realtimeReceiptEvents.filter((event) => event.sequence > processedReceiptSequenceRef.current);
    if (newEvents.length === 0) return;
    processedReceiptSequenceRef.current = newEvents[newEvents.length - 1]?.sequence ?? processedReceiptSequenceRef.current;
    const otherParticipantEvents = newEvents.filter((event) => event.receipt.conversationId === conversation.id && event.receipt.userId === conversation.otherProfile.id);
    if (otherParticipantEvents.length === 0) return;
    setOtherReceipt((currentReceipt) => otherParticipantEvents.reduce((receipt, event) => mergeReceiptCursor(receipt, event.receipt), currentReceipt));
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

    const { data, error } = await supabase.from("messages").insert({ conversation_id: conversation.id, sender_id: currentUserId, body: trimmedBody, reply_to_message_id: replyToMessageId }).select("id, conversation_id, sender_id, body, created_at, edited_at, is_deleted, deleted_at, source_request_id, message_type, reply_to_message_id").single();

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
      return { id: image.localId, messageId: optimisticId, storagePath: `${conversation.id}/${currentUserId}/${optimisticId}/${createUuid()}.${getImageExtension(image.mimeType)}`, originalName: image.originalName, mimeType: image.mimeType, size: image.size, width: image.width, height: image.height, position, file: image.file, previewUrl };
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
      const { data: existingMessage } = await supabase.from("messages").select("id, conversation_id, sender_id, body, created_at, edited_at, is_deleted, deleted_at, source_request_id, message_type, reply_to_message_id").eq("id", optimisticId).eq("conversation_id", conversation.id).eq("sender_id", currentUserId).maybeSingle();
      if (!existingMessage) return null;
      const { data: existingAttachments, error: attachmentError } = await supabase.from("message_attachments").select("id, message_id, storage_path, original_name, mime_type, size_bytes, width, height, position").eq("message_id", optimisticId).order("position", { ascending: true });
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

  function handleSend(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (messageEditState) return;
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
    const input = mediaInputRef.current;
    if (!input) return;
    setIsComposerEmojiPickerOpen(false);
    input.value = "";
    input.click();
  }

  async function handleImageSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(event.currentTarget.files ?? [])];
    event.currentTarget.value = "";
    if (files.length === 0) return;

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
    if (message.messageType === "image") {
      void submitImageMessage(message.body, message.attachments, message.optimisticId, message.replyPreview, message.replyToMessageId);
      return;
    }
    void submitMessage(message.body, message.optimisticId, message.replyPreview, message.replyToMessageId);
  }

  function handleRemoveFailedMessage(optimisticId: string) {
    const removedMessage = messages.find((message): message is OptimisticChatMessage => message.kind === "optimistic" && message.optimisticId === optimisticId);
    setMessages((currentMessages) => currentMessages.filter((message) => message.kind === "confirmed" || message.optimisticId !== optimisticId));
    if (removedMessage?.messageType === "image") {
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
    if (isNearBottom()) setShowJumpToLatest(false);
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
    if (!currentUserId || reaction.userId !== currentUserId || reaction.messageId !== reactionDetailsMessageId) return;
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
    if (message.senderId !== currentUserId || message.isIntroduction || message.isDeleted || pendingEditRef.current || pendingDeleteRef.current) return;
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
    const optimisticMessage: ChatMessage = { ...message, body: "", isDeleted: true, deletedAt: null };
    pendingDeleteRef.current = { messageId: message.id, previousMessage: message, previousReactions, confirmedMessage: null, deferredMessage: null };
    deletedMessageIdsRef.current.add(message.id);
    replyTargetCacheRef.current.set(message.id, optimisticMessage);
    setMessages((currentMessages) => patchMessageAndReplies(currentMessages, optimisticMessage, currentUserId, otherName));
    setReactions((currentReactions) => currentReactions.filter((reaction) => reaction.messageId !== message.id));
    setReplyingTo((currentTarget) => currentTarget?.id === message.id ? null : currentTarget);
    setMessageDeleteState((currentState) => currentState ? { ...currentState, isDeleting: true, error: "" } : currentState);
    onMessageUpdated(optimisticMessage);

    const { data, error } = await supabase.rpc("delete_message", { target_message_id: message.id }).single();
    const pendingDelete = pendingDeleteRef.current;
    if (!isMountedRef.current || pendingDelete?.messageId !== message.id) return;

    if (error || !data) {
      if (pendingDelete.confirmedMessage?.isDeleted) {
        const confirmedMessage = pendingDelete.confirmedMessage;
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
      onMessageDeletionRolledBack(rollbackMessage);
      setMessageDeleteState((currentState) => currentState?.messageId === message.id ? { ...currentState, isDeleting: false, error: "We couldn’t delete that message. Please try again." } : currentState);
      if (import.meta.env.DEV) console.warn("Deleting message failed", { messageId: message.id, code: error?.code });
      return;
    }

    const rpcMessage = mapMessageRow(data as MessageRow, message.replyPreview, message.attachments);
    const authoritativeMessage = pendingDelete.confirmedMessage && shouldApplyAuthoritativeMessage(rpcMessage, pendingDelete.confirmedMessage) ? pendingDelete.confirmedMessage : rpcMessage;
    pendingDeleteRef.current = null;
    deletedMessageIdsRef.current.add(message.id);
    replyTargetCacheRef.current.set(message.id, authoritativeMessage);
    setMessages((currentMessages) => patchMessageAndReplies(currentMessages, authoritativeMessage, currentUserId, otherName));
    setReactions((currentReactions) => currentReactions.filter((reaction) => reaction.messageId !== message.id));
    onMessageUpdated(authoritativeMessage);
    setMessageDeleteState(null);
    window.requestAnimationFrame(() => messageElementsRef.current.get(message.id)?.focus());
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
  const isSendDisabled = !currentUserId || (!draft.trim() && selectedImages.length === 0) || isSubmitting || Boolean(messageEditState) || draft.length > messageMaxLength;
  const shouldShowIntroductoryFallback = Boolean(conversation.introductoryMessage) && !messages.some((message) => message.kind === "confirmed" && message.isIntroduction);
  const newestDisplayedMessage = messages.at(-1);
  const statusMessageKey = newestDisplayedMessage?.senderId === currentUserId ? getMessageKey(newestDisplayedMessage) : null;
  const composerHelpId = `message-composer-help-${conversation.id}`;
  const characterCountId = `message-character-count-${conversation.id}`;
  const mediaErrorId = `message-media-error-${conversation.id}`;
  const composerDescription = [composerHelpId, showCharacterCount ? characterCountId : "", mediaError ? mediaErrorId : ""].filter(Boolean).join(" ");
  const loadedConfirmedMessageIds = new Set(messages.flatMap((message) => message.kind === "confirmed" ? [message.id] : []));
  const mobileActionMessage = messages.find((message): message is ChatMessage => message.kind === "confirmed" && !message.isDeleted && message.id === mobileActionMessageId) ?? null;
  const reactionDetailsMessage = messages.find((message): message is ChatMessage => message.kind === "confirmed" && !message.isDeleted && message.id === reactionDetailsMessageId) ?? null;
  const reactionDetailsReactions = reactionDetailsMessage ? reactions.filter((reaction) => reaction.messageId === reactionDetailsMessage.id) : [];
  const isReactionDetailsMutationPending = reactionDetailsMessage ? [...pendingReactionKeys].some((mutationKey) => mutationKey.startsWith(`${reactionDetailsMessage.id}\u0000`)) : false;
  const availableReactionProfilesById = new Map(reactionProfilesById);
  availableReactionProfilesById.set(conversation.otherProfile.id, conversation.otherProfile);
  if (currentProfile) availableReactionProfilesById.set(currentProfile.id, currentProfile);
  const imageViewerMessage = imageViewerState ? messages.find((message) => (message.kind === "confirmed" ? message.id : message.optimisticId) === imageViewerState.messageId && message.messageType === "image") ?? null : null;
  const imageViewerImages: GalleryMediaItem[] = imageViewerMessage?.kind === "optimistic" ? imageViewerMessage.attachments.map((attachment) => ({ ...attachment, url: attachment.previewUrl })) : imageViewerMessage?.kind === "confirmed" ? imageViewerMessage.attachments.map((attachment) => ({ ...attachment, url: signedMedia.urls.get(attachment.storagePath) ?? null })) : [];

  return (
    <div ref={panelRef} className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-4 py-4 sm:px-6"><MobileBackButton onClick={onMobileBack} /><PresenceAvatar profile={conversation.otherProfile} size="sm" isOnline={isOtherUserOnline} /><div className="min-w-0 flex-1"><h1 className="truncate font-semibold text-heading">{otherName}</h1><p className={`truncate text-xs font-medium ${isOtherUserOnline ? "text-online" : "text-muted"}`}>{presenceText}{conversation.otherProfile.username && <span className="font-normal text-body"> · @{conversation.otherProfile.username}</span>}</p></div><span className="hidden shrink-0 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-primary sm:inline-flex">Accepted</span></header>

      <p aria-live="polite" className="sr-only">{newMessageAnnouncement}</p>
      <div className="relative min-h-0 flex-1">
        <div ref={scrollViewportRef} role="region" aria-label={`Messages with ${otherName}`} onScroll={handleScroll} className="absolute inset-0 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-6 lg:px-10">
          {isLoading ? (
            <div role="status" aria-live="polite" className="mx-auto max-w-2xl space-y-4"><div className="h-20 w-3/4 animate-pulse rounded-3xl bg-accent" /><div className="ml-auto h-16 w-2/3 animate-pulse rounded-3xl bg-accent" /></div>
          ) : historyError && messages.length === 0 ? (
            <div role="alert" className="mx-auto max-w-md rounded-3xl border border-border bg-surface p-6 text-center shadow-soft"><h2 className="font-semibold text-heading">Unable to load messages</h2><p className="mt-2 text-sm leading-6 text-body">{historyError}</p><button type="button" onClick={handleHistoryRetry} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Retry</button></div>
          ) : messages.length === 0 && !shouldShowIntroductoryFallback ? (
            <div className="mx-auto max-w-md py-12 text-center"><h2 className="font-semibold text-heading">No messages yet. Start the conversation.</h2></div>
          ) : (
            <div className="mx-auto max-w-2xl space-y-4">
              {historyError && <div role="alert" className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-body shadow-soft"><p>Earlier messages couldn’t be refreshed.</p><button type="button" onClick={handleHistoryRetry} className="mt-2 min-h-10 rounded-xl px-3 py-1.5 text-sm font-semibold text-primary transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Retry history</button></div>}
              {shouldShowIntroductoryFallback && <article className="flex justify-start"><div className="max-w-[85%] rounded-3xl rounded-bl-md border border-border bg-surface px-4 py-3 text-body shadow-soft sm:max-w-[75%]"><p className="whitespace-pre-wrap break-words text-sm leading-6">{conversation.introductoryMessage}</p><div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">{conversation.introductoryMessageCreatedAt && <time dateTime={conversation.introductoryMessageCreatedAt}>{formatMessageTimestamp(conversation.introductoryMessageCreatedAt)}</time>}<span>Introduction</span></div></div></article>}
              {messages.map((message) => {
                const isCurrentUser = message.senderId === currentUserId;
                const isFailed = message.kind === "optimistic" && message.deliveryState === "failed";
                const isSending = message.kind === "optimistic" && message.deliveryState === "sending";
                const shouldShowStatus = isCurrentUser && statusMessageKey === getMessageKey(message);
                const confirmedStatus = message.kind === "confirmed" ? getConfirmedMessageStatus(message, otherReceipt) : null;
                const statusLabel = isSending ? "Sending…" : isFailed ? "Failed" : confirmedStatus === "seen" ? "Seen" : confirmedStatus === "delivered" ? "Delivered" : "Sent";
                const reactionGroups = message.kind === "confirmed" && !message.isDeleted ? groupMessageReactions(reactions, message.id, currentUserId) : [];
                const replyPreview = message.kind === "confirmed" && message.isDeleted ? null : message.replyPreview;
                const canJumpToReplyTarget = Boolean(message.replyToMessageId && loadedConfirmedMessageIds.has(message.replyToMessageId));
                const replyActionSenderName = isCurrentUser ? "yourself" : otherName;
                const isEditingThisMessage = message.kind === "confirmed" && messageEditState?.messageId === message.id;
                const isSavingThisEdit = Boolean(isEditingThisMessage && messageEditState?.isSaving);
                const canEditMessage = message.kind === "confirmed" && isCurrentUser && !message.isIntroduction && !message.isDeleted;
                const canDeleteMessage = message.kind === "confirmed" && isCurrentUser && !message.isIntroduction && !message.isDeleted;
                const galleryAttachments: GalleryMediaItem[] = message.kind === "optimistic" ? message.attachments.map((attachment) => ({ ...attachment, url: attachment.previewUrl })) : message.attachments.map((attachment) => ({ ...attachment, url: signedMedia.urls.get(attachment.storagePath) ?? null }));
                const isImageMessage = message.messageType === "image" && !("isDeleted" in message && message.isDeleted);

                return (
                  <article ref={(element) => { if (message.kind !== "confirmed") return; if (element) messageElementsRef.current.set(message.id, element); else messageElementsRef.current.delete(message.id); }} key={getMessageKey(message)} tabIndex={message.kind === "confirmed" ? -1 : undefined} onPointerDown={message.kind === "confirmed" && !message.isDeleted ? (event) => handleMessagePointerDown(message, event) : undefined} onPointerMove={message.kind === "confirmed" && !message.isDeleted ? handleMessagePointerMove : undefined} onPointerUp={message.kind === "confirmed" && !message.isDeleted ? handleMessagePointerEnd : undefined} onPointerCancel={message.kind === "confirmed" && !message.isDeleted ? handleMessagePointerEnd : undefined} onPointerLeave={message.kind === "confirmed" && !message.isDeleted ? handleMessagePointerEnd : undefined} className={`group/message relative flex min-w-0 ${isCurrentUser ? "justify-end" : "justify-start"}`}>
                    <div className={`flex min-w-0 max-w-[92%] flex-col sm:max-w-[80%] md:max-w-[75%] ${isCurrentUser ? "items-end" : "items-start"}`}>
                      <div className="relative max-w-full">
                        <motion.div animate={{ scale: message.kind === "confirmed" && mobileEmphasizedMessageId === message.id && !shouldReduceMotion ? 0.985 : 1 }} transition={{ duration: shouldReduceMotion ? 0 : 0.12, ease: [0.22, 1, 0.36, 1] }} className={`max-w-full min-w-0 rounded-3xl px-4 py-3 shadow-soft transition-shadow ${message.kind === "confirmed" && message.isDeleted ? `${isCurrentUser ? "rounded-br-md" : "rounded-bl-md"} border border-border bg-card text-muted` : isCurrentUser ? isFailed ? "rounded-br-md border border-primary/25 bg-accent text-heading" : "rounded-br-md bg-primary text-white" : "rounded-bl-md border border-border bg-surface text-body"} ${message.kind === "confirmed" && (highlightedMessageId === message.id || mobileEmphasizedMessageId === message.id) ? "ring-2 ring-primary/30 ring-offset-4 ring-offset-background" : ""}`}>
                          {replyPreview && <ReplyQuote preview={replyPreview} isStrongOutgoing={isCurrentUser && !isFailed} canJump={canJumpToReplyTarget} onJump={() => message.replyToMessageId && jumpToOriginalMessage(message.replyToMessageId)} />}
                          {isImageMessage && <MessageMediaGallery attachments={galleryAttachments} isLoading={message.kind === "confirmed" && signedMedia.isLoading} onOpen={(index, trigger) => { imageViewerReturnFocusRef.current = trigger; setImageViewerState({ messageId: message.kind === "confirmed" ? message.id : message.optimisticId, initialIndex: index }); }} onRetry={galleryAttachments.length > 0 ? signedMedia.retry : handleHistoryRetry} />}
                          {message.kind === "confirmed" && message.isDeleted ? <p className="break-words text-sm italic leading-6">This message was deleted.</p> : isEditingThisMessage && messageEditState ? <div className={`min-w-0 ${isImageMessage ? "mt-3" : ""}`}><label htmlFor={`edit-message-${message.id}`} className="sr-only">{isImageMessage ? "Edit image caption" : "Edit your message"}</label><textarea ref={editTextareaRef} id={`edit-message-${message.id}`} value={messageEditState.draft} onChange={(event) => { const draft = event.target.value; setMessageEditState((currentState) => currentState?.messageId === message.id ? { ...currentState, draft, error: "" } : currentState); resizeTextarea(event.target); }} onKeyDown={handleEditKeyDown} rows={2} maxLength={messageMaxLength} disabled={messageEditState.isSaving} placeholder={isImageMessage ? "Add a caption…" : undefined} aria-describedby={messageEditState.error ? `edit-message-error-${message.id}` : undefined} className="max-h-32 min-h-20 w-full min-w-0 resize-none overflow-y-auto rounded-xl border border-border bg-surface px-3 py-2 text-sm leading-6 text-heading outline-none placeholder:text-muted focus:ring-2 focus:ring-primary/20 disabled:cursor-wait disabled:opacity-70" /><div className="mt-2 flex flex-wrap items-center justify-end gap-2"><button type="button" onClick={() => void saveMessageEdit()} disabled={messageEditState.isSaving} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-surface px-3 py-2 text-xs font-semibold text-heading transition hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-wait disabled:opacity-60">{messageEditState.isSaving ? "Saving…" : "Save"}</button><button type="button" onClick={cancelMessageEditing} disabled={messageEditState.isSaving} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-background/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-background/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-wait disabled:opacity-60">Cancel</button></div>{messageEditState.error && <p id={`edit-message-error-${message.id}`} role="alert" className="mt-2 text-xs leading-5 text-white">{messageEditState.error}</p>}</div> : message.body ? <p className={`whitespace-pre-wrap break-words text-sm leading-6 ${isImageMessage ? "mt-3" : ""}`}>{message.body}</p> : null}
                          <div className={`mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs ${isCurrentUser && !isFailed && !(message.kind === "confirmed" && message.isDeleted) ? "text-white/70" : "text-muted"}`}><time dateTime={message.createdAt}>{formatMessageTimestamp(message.createdAt)}</time>{message.kind === "confirmed" && message.isIntroduction && <span>Introduction</span>}{message.kind === "confirmed" && !message.isDeleted && (message.editedAt || isSavingThisEdit) && <span>Edited</span>}</div>
                          {isFailed && <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => handleRetryMessage(message)} disabled={isSubmitting} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-60">Retry</button><button type="button" onClick={() => handleRemoveFailedMessage(message.optimisticId)} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-heading transition hover:bg-card focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Remove</button><p className="w-full text-xs leading-5 text-body">We couldn’t send this message. Check your connection and try again.</p></div>}
                        </motion.div>
                        {message.kind === "confirmed" && !message.isDeleted && <MessageActionsToolbar canDelete={canDeleteMessage} canEdit={canEditMessage} disabled={Boolean(messageEditState?.isSaving || messageDeleteState?.isDeleting)} isOutgoing={isCurrentUser} replyLabel={`Reply to message from ${replyActionSenderName}`} onDelete={(button) => openDeleteConfirmation(message, button)} onEdit={(button) => startEditingMessage(message, button)} onReact={(button) => openQuickReactions(message.id, button)} onReply={() => handleReplyToMessage(message)} />}
                      </div>
                      {reactionGroups.length > 0 && <div className={`relative z-10 -mt-1 flex max-w-full flex-wrap gap-1 px-1 ${isCurrentUser ? "justify-end" : "justify-start"}`}>{reactionGroups.map((group) => { const reactionName = getEmojiLabel(group.emoji).toLowerCase(); return <button key={group.emoji} type="button" onClick={(event) => message.kind === "confirmed" && openReactionDetails(message.id, event.currentTarget)} aria-haspopup="dialog" aria-expanded={message.kind === "confirmed" && reactionDetailsMessageId === message.id} aria-label={`View ${group.count} ${reactionName} ${group.count === 1 ? "reaction" : "reactions"}${group.reactedByCurrentUser ? ", including you" : ""}`} className={`inline-flex min-h-8 items-center gap-1 rounded-full border px-2 py-1 text-xs shadow-soft transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 ${group.reactedByCurrentUser ? "border-primary/30 bg-accent text-heading" : "border-border bg-surface text-body hover:bg-accent"}`}><span aria-hidden="true" className="text-sm">{group.emoji}</span><span aria-hidden="true" className="font-semibold">{group.count}</span></button>; })}</div>}
                      {shouldShowStatus && <p role={isFailed ? "alert" : isSending ? "status" : undefined} className={`mt-1.5 px-1 text-right text-xs font-medium ${isFailed ? "text-primary" : "text-muted"}`}>{statusLabel}</p>}
                    </div>
                    {message.kind === "confirmed" && !message.isDeleted && <button type="button" onClick={(event) => openMobileActionSheet(message.id, event.currentTarget)} aria-label={`Open actions for message from ${replyActionSenderName}`} aria-haspopup="dialog" aria-expanded={mobileActionMessageId === message.id} className="pointer-events-none absolute right-0 top-0 z-10 flex h-9 w-9 items-center justify-center rounded-xl bg-surface text-muted opacity-0 shadow-soft transition focus:pointer-events-auto focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 md:hidden"><svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg></button>}
                  </article>
                );
              })}
            </div>
          )}
        </div>

        {showJumpToLatest && <button type="button" onClick={() => scrollToLatest("smooth")} className="absolute bottom-4 left-1/2 inline-flex min-h-11 -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-heading shadow-soft transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true"><path d="m7 10 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>Jump to latest</button>}
      </div>

      {reactionError && <p role="status" aria-live="polite" className="shrink-0 border-t border-border bg-accent px-4 py-2 text-center text-xs leading-5 text-body">{reactionError}</p>}
      <form onSubmit={handleSend} className="shrink-0 bg-background px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-5 sm:pt-3 lg:px-6">
        <TypingIndicator isVisible={isOtherUserTyping} name={otherName} shouldReduceMotion={shouldReduceMotion} />
        {replyingTo && <div aria-label={`Replying to ${replyingTo.senderName}`} className="mb-2 flex min-w-0 items-start gap-3 rounded-2xl bg-surface px-4 py-3 shadow-soft"><div className="min-w-0 flex-1 border-l-2 border-primary/40 pl-3"><p className="truncate text-xs font-semibold text-heading">Replying to {replyingTo.senderName}</p><p className="mt-0.5 line-clamp-2 break-words text-xs leading-5 text-body">{replyingTo.body ?? "Original message unavailable"}</p></div><button type="button" onClick={() => { setReplyingTo(null); window.requestAnimationFrame(() => textareaRef.current?.focus()); }} aria-label={`Cancel reply to ${replyingTo.senderName}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" strokeLinecap="round" /></svg></button></div>}
        <ComposerMediaPreview images={selectedImages} disabled={isSubmitting} onRemove={removeSelectedImage} onRemoveAll={removeAllSelectedImages} />
        {mediaError && <p id={mediaErrorId} role="alert" className="mb-2 rounded-xl bg-accent px-3 py-2 text-xs leading-5 text-body">{mediaError}</p>}
        <input ref={mediaInputRef} type="file" accept={acceptedImageInputTypes} multiple onChange={(event) => void handleImageSelection(event)} disabled={!currentUserId || isSubmitting} className="hidden" aria-hidden="true" tabIndex={-1} />
        <label htmlFor={`message-composer-${conversation.id}`} className="sr-only">Message {otherName}</label>
        <div className="grid min-w-0 grid-cols-[auto_auto_minmax(0,1fr)_auto] items-end gap-x-2 rounded-2xl bg-surface px-3 py-3 shadow-soft focus-within:ring-2 focus-within:ring-primary/20 sm:gap-x-3 sm:px-4">
          <button type="button" onClick={openImagePicker} disabled={!currentUserId || isSubmitting || selectedImages.length >= imageMaxCount} aria-label={selectedImages.length > 0 ? "Add more images" : "Choose images"} title={selectedImages.length >= imageMaxCount ? "Maximum 10 images selected" : selectedImages.length > 0 ? "Add more images" : "Choose images"} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 sm:h-11 sm:w-11"><MediaIcon /></button>
          <button ref={composerEmojiButtonRef} type="button" onClick={openComposerEmojiPicker} disabled={isSubmitting} aria-label="Choose an emoji" title="Choose an emoji" aria-haspopup="dialog" aria-expanded={isComposerEmojiPickerOpen} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-wait disabled:opacity-50 sm:h-11 sm:w-11"><EmojiIcon /></button>
          <textarea ref={textareaRef} id={`message-composer-${conversation.id}`} value={draft} onChange={(event) => { setDraft(event.target.value); resizeTextarea(event.target); notifyTyping(event.target.value.trim().length > 0); }} onBlur={stopTyping} onKeyDown={handleComposerKeyDown} maxLength={messageMaxLength} rows={1} disabled={!currentUserId || isSubmitting} aria-describedby={composerDescription} placeholder="Write a message…" className="max-h-32 min-h-12 min-w-0 resize-none overflow-y-auto border-0 bg-transparent px-1 py-3 text-sm leading-6 text-heading outline-none ring-0 placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-60 sm:px-2" />
          <button type="submit" disabled={isSendDisabled} aria-label={isSubmitting ? `Sending message to ${otherName}` : `Send message to ${otherName}`} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-0 bg-primary text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 sm:h-12 sm:w-12"><SendIcon /><span className="sr-only">{isSubmitting ? "Sending…" : "Send"}</span></button>
          <div aria-live="polite" aria-atomic="true" className={`col-start-1 col-end-5 row-start-2 flex min-w-0 items-start justify-between gap-3 px-1 sm:col-start-3 sm:col-end-4 ${comingSoonMessage || showCharacterCount ? "mt-2 min-h-5" : "mt-0 min-h-0 sm:mt-2 sm:min-h-5"}`}>
            {comingSoonMessage ? <p id={composerHelpId} className="min-w-0 text-xs leading-5 text-muted">{comingSoonMessage}</p> : <p id={composerHelpId} className={showCharacterCount ? "sr-only" : "sr-only sm:not-sr-only sm:min-w-0 sm:text-xs sm:leading-5 sm:text-muted"}>Enter to send · Shift+Enter for a new line</p>}
            {showCharacterCount && <p id={characterCountId} className="shrink-0 text-xs font-medium leading-5 text-muted">{remainingCharacters} left</p>}
          </div>
        </div>
      </form>
      <AnimatePresence initial={false} onExitComplete={() => setMobileEmphasizedMessageId(null)}>{mobileActionMessage && <MessageActionSheet key={mobileActionMessage.id} canDelete={mobileActionMessage.senderId === currentUserId && !mobileActionMessage.isIntroduction} canEdit={mobileActionMessage.senderId === currentUserId && !mobileActionMessage.isIntroduction} messageLabel={`message from ${mobileActionMessage.senderId === currentUserId ? "yourself" : otherName}`} quickReactions={quickReactions} returnFocusRef={mobileActionReturnFocusRef} onClose={() => setMobileActionMessageId(null)} onDelete={() => { const returnFocusElement = mobileActionReturnFocusRef.current; if (returnFocusElement) openDeleteConfirmation(mobileActionMessage, returnFocusElement); }} onReact={(emoji) => void toggleReaction(mobileActionMessage.id, emoji)} onReply={() => handleReplyToMessage(mobileActionMessage)} onEdit={() => { const returnFocusElement = mobileActionReturnFocusRef.current; if (returnFocusElement) startEditingMessage(mobileActionMessage, returnFocusElement); }} onOpenEmojiPicker={() => setFullReactionPickerMessageId(mobileActionMessage.id)} />}</AnimatePresence>
      <AnimatePresence initial={false} onExitComplete={() => { const anchor = reactionDetailsAnchorRef.current; if (anchor?.isConnected) anchor.focus(); else if (lastReactionDetailsMessageIdRef.current) messageElementsRef.current.get(lastReactionDetailsMessageIdRef.current)?.focus(); }}>{reactionDetailsMessage && (reactionDetailsReactions.length > 0 || isReactionDetailsMutationPending) && <ReactionDetails key={reactionDetailsMessage.id} anchorRef={reactionDetailsAnchorRef} currentUserId={currentUserId} error={reactionProfilesError} isLoading={isReactionProfilesLoading} isMutationPending={isReactionDetailsMutationPending} messageLabel={`message from ${reactionDetailsMessage.senderId === currentUserId ? "yourself" : otherName}`} mutationError={reactionDetailsMutationError} pendingReactionKeys={pendingReactionKeys} profilesById={availableReactionProfilesById} reactions={reactionDetailsReactions} onClose={closeReactionDetails} onRemoveOwnReaction={(reaction) => void removeOwnReactionFromDetails(reaction)} onRetry={retryReactionProfiles} />}</AnimatePresence>
      <AnimatePresence initial={false}>{messageDeleteState && <MessageDeleteDialog key={messageDeleteState.messageId} error={messageDeleteState.error} isDeleting={messageDeleteState.isDeleting} returnFocusRef={deleteTriggerRef} onCancel={cancelMessageDeletion} onConfirm={() => void confirmMessageDeletion()} />}</AnimatePresence>
      <AnimatePresence initial={false}>{imageViewerState && imageViewerImages.length > 0 && <ImageViewer key={imageViewerState.messageId} images={imageViewerImages} initialIndex={imageViewerState.initialIndex} isLoading={signedMedia.isLoading} returnFocusRef={imageViewerReturnFocusRef} onClose={() => setImageViewerState(null)} onRetry={signedMedia.retry} />}</AnimatePresence>
      {quickReactionMessageId && <QuickReactionMenu anchorRef={reactionAnchorRef} quickReactions={quickReactions} messageLabel="this message" onSelect={(emoji) => void toggleReaction(quickReactionMessageId, emoji)} onClose={() => setQuickReactionMessageId(null)} onOpenPicker={() => setFullReactionPickerMessageId(quickReactionMessageId)} />}
      {fullReactionPickerMessageId && <EmojiPicker anchorRef={reactionAnchorRef} ariaLabel="Choose a message reaction" onSelect={(emoji) => void toggleReaction(fullReactionPickerMessageId, emoji)} onClose={() => setFullReactionPickerMessageId(null)} placement="top" />}
      {isComposerEmojiPickerOpen && <EmojiPicker anchorRef={composerEmojiButtonRef} ariaLabel="Insert an emoji into your message" onSelect={insertComposerEmoji} onClose={() => setIsComposerEmojiPickerOpen(false)} placement="top" />}
    </div>
  );
}

function ChatPanel({ chatState, currentProfile, currentUserId, isMobileVisible, realtimeRefreshKey, realtimeMessageEvents, realtimeMessageUpdateEvents, realtimeReactionEvents, realtimeReceiptEvents, onlineUserIds, quickReactions, onIncomingMessagesSynchronized, onConversationRead, onMessageConfirmed, onMessageUpdated, onMessageDeletionRolledBack, onStartConversation, onMobileBack }: ChatPanelProps) {
  const visibilityClasses = isMobileVisible ? "flex" : "hidden lg:flex";

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
    return <main className={`${visibilityClasses} min-w-0 flex-1 flex-col overflow-hidden bg-background`}><AcceptedConversationPanel key={chatState.conversation.id} conversation={chatState.conversation} currentProfile={currentProfile} currentUserId={currentUserId} compactVisibilitySignal={isMobileVisible} realtimeRefreshKey={realtimeRefreshKey} realtimeMessageEvents={realtimeMessageEvents} realtimeMessageUpdateEvents={realtimeMessageUpdateEvents} realtimeReactionEvents={realtimeReactionEvents} realtimeReceiptEvents={realtimeReceiptEvents} isOtherUserOnline={onlineUserIds.has(chatState.conversation.otherProfile.id)} quickReactions={quickReactions} onIncomingMessagesSynchronized={onIncomingMessagesSynchronized} onConversationRead={onConversationRead} onMessageConfirmed={onMessageConfirmed} onMessageUpdated={onMessageUpdated} onMessageDeletionRolledBack={onMessageDeletionRolledBack} onMobileBack={onMobileBack} /></main>;
  }

  return (
    <main className="hidden min-w-0 flex-1 items-center justify-center overflow-hidden bg-background p-6 lg:flex lg:p-10">
      <div className="w-full max-w-md text-center"><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-accent text-primary shadow-soft lg:h-24 lg:w-24"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-10 w-10 lg:h-12 lg:w-12" aria-hidden="true"><path d="M4 5.5h16v11H8l-4 3v-14Z" strokeLinejoin="round" /><path d="M8 10h8M8 13h5" strokeLinecap="round" /></svg></div><h1 className="mt-6 text-2xl font-bold tracking-tight text-heading lg:mt-8 lg:text-3xl">Welcome to Nemissive</h1><p className="mt-4 text-base leading-7 text-body">Every meaningful conversation starts with a hello.</p><p className="mt-2 text-base leading-7 text-body">Choose someone from the left or start a new conversation.</p><button type="button" onClick={onStartConversation} className="mt-8 inline-flex items-center rounded-2xl bg-primary px-6 py-3 text-sm font-medium text-white shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-lg lg:mt-10">Start Conversation</button></div>
    </main>
  );
}

export default ChatPanel;
