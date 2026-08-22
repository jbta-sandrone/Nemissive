import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { AcceptedConversationItem } from "../../types/conversations";
import ConfirmationDialog from "./ConfirmationDialog";
import { ConversationPickerDialog } from "./ConversationPicker";
import ProfileAvatar from "./ProfileAvatar";
import { getConversationDisplayName, getProfileDisplayName } from "./profileUtils";
import { formatReminderCountdown, formatReminderTime, localInputsToInstant, toLocalDateInput, toLocalTimeInput, validateReminderInstant } from "./reminderTime";
import type { ReminderDraft, ReminderRecord, ReminderScope, RemindersController, ReminderScheduleKind } from "./useReminders";

type RemindersWorkspaceProps = {
  currentUserId: string;
  conversations: AcceptedConversationItem[];
  isConversationsLoading: boolean;
  controller: RemindersController;
  returnFocusRef: RefObject<HTMLElement | null>;
  initialReminderId?: string | null;
  initialConversationId?: string | null;
  onClose: () => void;
};

type View = "list" | "create" | "detail" | "edit";
type Filter = "all" | ReminderScope;
type ConfirmationAction = "cancel" | "delete-personal" | "remove-for-me" | "delete-for-everyone" | "clear-completed";

function Icon({ kind }: { kind: "close" | "back" | "bell" | "plus" | "clock" | "person" | "chat" | "edit" | "trash" | "check" | "chevron" }) {
  const paths = {
    close: "m7 7 10 10M17 7 7 17", back: "m15 6-6 6 6 6M9 12h10", bell: "M6 9a6 6 0 0 1 12 0c0 7 3 7 3 8H3c0-1 3-1 3-8m3 11h6", plus: "M12 5v14M5 12h14", clock: "M12 7v5l3 2", person: "M8 19c.4-3.4 1.8-5 4-5s3.6 1.6 4 5M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", chat: "M4 5h16v11H9l-5 4V5Z", edit: "m5 19 1-4L16 5l3 3L9 18l-4 1Z", trash: "M5 7h14M9 7V4h6v3M8 10v9m4-9v9m4-9v9M6 7l1 14h10l1-14", check: "m5 12 4 4L19 6", chevron: "m9 6 6 6-6 6",
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d={paths[kind]} strokeLinecap="round" strokeLinejoin="round" />{kind === "clock" && <circle cx="12" cy="12" r="9" />}</svg>;
}

function defaultDate() {
  const value = new Date(Date.now() + 60 * 60 * 1000);
  value.setSeconds(0, 0);
  return value;
}

function stateLabel(reminder: ReminderRecord, now: number) {
  if (reminder.removedAt) return "Removed from your reminders";
  if (reminder.personalStatus === "completed") return reminder.scope === "shared" ? "Done for you" : "Done";
  if (reminder.personalStatus === "dismissed") return "Dismissed";
  if (reminder.personalStatus === "snoozed") return `Snoozed until ${formatReminderTime(reminder.snoozedUntil ?? reminder.dueAt)}`;
  if (reminder.personalStatus === "due") return Date.parse(reminder.dueAt) < now ? "Overdue" : "Due now";
  return reminder.scheduleKind === "timer" ? formatReminderCountdown(reminder.dueAt, now) : "Upcoming";
}

function ReminderCard({ reminder, selected, now, onSelect }: { reminder: ReminderRecord; selected: boolean; now: number; onSelect: () => void }) {
  const peer = reminder.conversationPeer;
  return <li><button type="button" onClick={onSelect} aria-current={selected ? "true" : undefined} className={`w-full rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover ${selected ? "border-primary/30 bg-accent shadow-soft" : "border-border bg-background hover:bg-accent"}`}>
    <span className="flex items-start justify-between gap-3"><span className="min-w-0 flex-1 truncate font-semibold text-heading">{reminder.title}</span><span className="shrink-0 rounded-full bg-surface px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted">{reminder.scope === "shared" ? "Shared" : "For you"}</span></span>
    {reminder.details && <span className="mt-1 block truncate text-sm text-body">{reminder.details}</span>}
    <span className="mt-3 flex items-center justify-between gap-2 text-xs font-medium text-muted"><time dateTime={reminder.dueAt}>{formatReminderTime(reminder.snoozedUntil ?? reminder.dueAt)}</time><span>{stateLabel(reminder, now)}</span></span>
    {peer && <span className="mt-2 block truncate text-xs text-body">With {getProfileDisplayName(peer)}</span>}
  </button></li>;
}

function ReminderForm({ initial, defaultConversationId, conversations, isConversationsLoading, busy, error, onCancel, onSubmit }: { initial: ReminderRecord | null; defaultConversationId: string | null; conversations: AcceptedConversationItem[]; isConversationsLoading: boolean; busy: boolean; error: string; onCancel: () => void; onSubmit: (draft: ReminderDraft) => void }) {
  const start = initial ? new Date(initial.dueAt) : defaultDate();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [details, setDetails] = useState(initial?.details ?? "");
  const [scope, setScope] = useState<ReminderScope>(initial?.scope ?? (defaultConversationId ? "shared" : "personal"));
  const [scheduleKind, setScheduleKind] = useState<ReminderScheduleKind>(initial?.scheduleKind ?? "date_time");
  const [dateValue, setDateValue] = useState(toLocalDateInput(start));
  const [timeValue, setTimeValue] = useState(toLocalTimeInput(start));
  const [timerMinutes, setTimerMinutes] = useState(initial?.timerDurationMinutes ?? 30);
  const [conversationId, setConversationId] = useState(initial?.conversationId ?? defaultConversationId ?? "");
  const [isConversationPickerOpen, setIsConversationPickerOpen] = useState(false);
  const conversationTriggerRef = useRef<HTMLElement | null>(null);
  const [localError, setLocalError] = useState("");
  const [timerPreviewBase] = useState(() => Date.now());
  const computedDue = scheduleKind === "timer" ? new Date(timerPreviewBase + timerMinutes * 60_000) : localInputsToInstant(dateValue, timeValue);
  const eligibleConversations = useMemo(() => conversations.filter((conversation) => conversation.connectionStatus === "accepted" && conversation.messagingAvailable && conversation.interactionAllowed && !conversation.iBlocked), [conversations]);
  const selectedConversation = (initial ? conversations : eligibleConversations).find((conversation) => conversation.conversationId === conversationId) ?? null;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const normalizedTitle = title.trim().replace(/\s+/gu, " ");
    if (!normalizedTitle) { setLocalError("Add a title for this reminder."); return; }
    if (scope === "shared" && !conversationId) { setLocalError("Choose a conversation to share this reminder in."); return; }
    const submittedDue = computedDue;
    const instantError = validateReminderInstant(submittedDue);
    if (instantError) { setLocalError(instantError); return; }
    setLocalError("");
    onSubmit({ title: normalizedTitle, details, dueAt: submittedDue!.toISOString(), scope, conversationId: scope === "shared" ? conversationId : null, scheduleKind, timerDurationMinutes: scheduleKind === "timer" ? timerMinutes : null });
  }

  return <form onSubmit={submit} className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-5 sm:p-7">
    <div><h2 className="text-xl font-bold text-heading">{initial ? "Edit reminder" : "New reminder"}</h2><p className="mt-1 text-sm text-body">One time only. It will never repeat automatically.</p></div>
    <label className="block"><span className="text-sm font-semibold text-heading">Title</span><input autoFocus type="text" maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What should Nemissive remember?" className="mt-2 w-full rounded-2xl border border-border bg-background px-4 py-3 text-heading outline-none placeholder:text-muted focus:border-primary focus:ring-4 focus:ring-accent-hover" /><span className="mt-1 block text-right text-xs text-muted">{title.length}/80</span></label>
    <label className="block"><span className="text-sm font-semibold text-heading">Details <span className="font-normal text-muted">Optional</span></span><textarea maxLength={500} rows={4} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Add lightweight context" className="mt-2 w-full resize-y rounded-2xl border border-border bg-background px-4 py-3 text-heading outline-none placeholder:text-muted focus:border-primary focus:ring-4 focus:ring-accent-hover" /><span className="mt-1 block text-right text-xs text-muted">{details.length}/500</span></label>
    {!initial && <fieldset><legend className="text-sm font-semibold text-heading">Scope</legend><div className="mt-2 grid grid-cols-2 gap-2">{(["personal", "shared"] as ReminderScope[]).map((value) => <label key={value} className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 ${scope === value ? "border-primary/35 bg-accent" : "border-border bg-background"}`}><input type="radio" name="scope" checked={scope === value} onChange={() => setScope(value)} /><Icon kind={value === "personal" ? "person" : "chat"} /><span className="text-sm font-semibold text-heading">{value === "personal" ? "For you" : "Share in chat"}</span></label>)}</div></fieldset>}
    {scope === "shared" && <div><span className="text-sm font-semibold text-heading">Conversation</span>{selectedConversation ? <button ref={(node) => { conversationTriggerRef.current = node; }} type="button" disabled={busy || Boolean(initial)} onClick={() => setIsConversationPickerOpen(true)} aria-label={initial ? `Shared in conversation with ${getConversationDisplayName(selectedConversation.otherProfile, selectedConversation.otherNickname)}` : `Change conversation. Currently ${getConversationDisplayName(selectedConversation.otherProfile, selectedConversation.otherNickname)}`} className="mt-2 flex min-h-16 w-full items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-default disabled:opacity-80"><ProfileAvatar profile={selectedConversation.otherProfile} size="sm" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-heading">{getConversationDisplayName(selectedConversation.otherProfile, selectedConversation.otherNickname)}</span>{selectedConversation.otherProfile.username && <span className="block truncate text-xs text-muted">@{selectedConversation.otherProfile.username}</span>}</span>{!initial && <span className="shrink-0 text-muted"><Icon kind="chevron" /></span>}</button> : <button ref={(node) => { conversationTriggerRef.current = node; }} type="button" disabled={busy || Boolean(initial)} onClick={() => setIsConversationPickerOpen(true)} className="mt-2 flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-3 text-left text-sm font-semibold text-heading hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:opacity-60"><span>{isConversationsLoading ? "Loading conversations…" : "Choose a conversation"}</span><span className="shrink-0 text-muted"><Icon kind="chevron" /></span></button>}</div>}
    <fieldset><legend className="text-sm font-semibold text-heading">When</legend><div className="mt-2 flex rounded-2xl border border-border bg-background p-1">{(["date_time", "timer"] as ReminderScheduleKind[]).map((value) => <button key={value} type="button" aria-pressed={scheduleKind === value} onClick={() => setScheduleKind(value)} className={`min-h-10 flex-1 rounded-xl px-3 text-sm font-semibold ${scheduleKind === value ? "bg-accent text-primary" : "text-body hover:text-heading"}`}>{value === "date_time" ? "Date & time" : "Timer"}</button>)}</div></fieldset>
    {scheduleKind === "date_time" ? <div className="grid grid-cols-2 gap-3"><label><span className="text-sm font-semibold text-heading">Date</span><input type="date" value={dateValue} onChange={(event) => setDateValue(event.target.value)} className="mt-2 w-full rounded-2xl border border-border bg-background px-3 py-3 text-heading" /></label><label><span className="text-sm font-semibold text-heading">Time</span><input type="time" value={timeValue} onChange={(event) => setTimeValue(event.target.value)} className="mt-2 w-full rounded-2xl border border-border bg-background px-3 py-3 text-heading" /></label></div> : <div><span className="text-sm font-semibold text-heading">Timer duration</span><div className="mt-2 grid grid-cols-4 gap-2">{[10, 30, 60, 120].map((minutes) => <button key={minutes} type="button" aria-pressed={timerMinutes === minutes} onClick={() => setTimerMinutes(minutes)} className={`min-h-10 rounded-xl border px-2 text-xs font-semibold ${timerMinutes === minutes ? "border-primary/35 bg-accent text-primary" : "border-border bg-background text-heading"}`}>{minutes < 60 ? `${minutes} min` : `${minutes / 60} ${minutes === 60 ? "hour" : "hours"}`}</button>)}</div><label className="mt-3 block"><span className="text-xs font-medium text-body">Custom minutes</span><input type="number" min={1} max={525600} value={timerMinutes} onChange={(event) => setTimerMinutes(Math.max(1, Number(event.target.value) || 1))} className="mt-1 w-full rounded-2xl border border-border bg-background px-4 py-3 text-heading" /></label></div>}
    {computedDue && !Number.isNaN(computedDue.getTime()) && <p role="status" aria-live="polite" className="rounded-2xl bg-accent px-4 py-3 text-sm text-body"><span className="font-semibold text-heading">Due:</span> {formatReminderTime(computedDue.toISOString())}</p>}
    {(localError || error) && <p role="alert" className="rounded-2xl border border-primary/25 bg-accent px-4 py-3 text-sm text-heading">{localError || error}</p>}
    <div className="flex justify-end gap-2"><button type="button" onClick={onCancel} disabled={busy} className="min-h-11 rounded-2xl border border-border px-5 text-sm font-semibold text-heading hover:bg-accent">Cancel</button><button type="submit" disabled={busy} className="min-h-11 rounded-2xl bg-primary px-5 text-sm font-semibold text-white shadow-soft disabled:opacity-60">{busy ? "Saving…" : initial ? "Save changes" : "Create reminder"}</button></div>
    <AnimatePresence>{isConversationPickerOpen && <ConversationPickerDialog conversations={eligibleConversations} isLoading={isConversationsLoading} selectedConversationId={conversationId || null} returnFocusRef={conversationTriggerRef} onSelect={(conversation) => { setConversationId(conversation.conversationId); setLocalError(""); setIsConversationPickerOpen(false); }} onClose={() => setIsConversationPickerOpen(false)} />}</AnimatePresence>
  </form>;
}

function RemindersWorkspace({ currentUserId, conversations, isConversationsLoading, controller, returnFocusRef, initialReminderId = null, initialConversationId = null, onClose }: RemindersWorkspaceProps) {
  const reduced = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmationTriggerRef = useRef<HTMLElement | null>(null);
  const confirmationOpenRef = useRef(false);
  const [filter, setFilter] = useState<Filter>(initialConversationId ? "shared" : "all");
  const [view, setView] = useState<View>(initialReminderId ? "detail" : "list");
  const [selectedId, setSelectedId] = useState<string | null>(initialReminderId);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [confirmationAction, setConfirmationAction] = useState<ConfirmationAction | null>(null);
  const [snoozeMinutes, setSnoozeMinutes] = useState(10);
  const [now, setNow] = useState(() => Date.now());
  const reminder = controller.reminders.find((item) => item.id === selectedId) ?? null;

  useEffect(() => { confirmationOpenRef.current = confirmationAction !== null; }, [confirmationAction]);

  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const returnTo = returnFocusRef.current;
    document.body.style.overflow = "hidden";
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !confirmationOpenRef.current) { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || confirmationOpenRef.current || !panelRef.current) return;
      const controls = [...panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')];
      const first = controls[0]; const last = controls.at(-1); if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    const frame = window.requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("[data-reminders-close]")?.focus());
    document.addEventListener("keydown", handleKey);
    return () => { window.cancelAnimationFrame(frame); document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", handleKey); window.requestAnimationFrame(() => returnTo?.focus()); };
  }, [onClose, returnFocusRef]);

  const visible = useMemo(() => controller.reminders.filter((item) => !item.removedAt && (filter === "all" || item.scope === filter) && (!initialConversationId || item.conversationId === initialConversationId)), [controller.reminders, filter, initialConversationId]);
  const completedCount = useMemo(() => controller.reminders.filter((item) => !item.removedAt && item.personalStatus === "completed").length, [controller.reminders]);
  const groups = useMemo(() => {
    const start = new Date(now); start.setHours(0, 0, 0, 0); const tomorrow = new Date(start); tomorrow.setDate(tomorrow.getDate() + 1);
    const result = { due: [] as ReminderRecord[], today: [] as ReminderRecord[], upcoming: [] as ReminderRecord[], completed: [] as ReminderRecord[] };
    for (const item of visible) {
      if (item.personalStatus === "completed" || item.personalStatus === "dismissed") result.completed.push(item);
      else if (item.personalStatus === "due") result.due.push(item);
      else if (Date.parse(item.snoozedUntil ?? item.dueAt) < tomorrow.getTime()) result.today.push(item);
      else result.upcoming.push(item);
    }
    return result;
  }, [now, visible]);

  async function run(action: () => Promise<string | null>) {
    if (busy) return; setBusy(true); setActionError(""); const error = await action(); setBusy(false); if (error) setActionError(error);
  }
  async function submit(draft: ReminderDraft) {
    await run(async () => {
      const error = reminder && view === "edit" ? await controller.update(reminder.id, draft) : await controller.create(draft);
      if (!error) { setView("list"); setSelectedId(null); }
      return error;
    });
  }
  function requestConfirmation(action: ConfirmationAction, trigger: HTMLElement) {
    confirmationTriggerRef.current = trigger;
    setActionError("");
    setConfirmationAction(action);
  }
  async function confirmCleanup() {
    if (!confirmationAction) return;
    await run(async () => {
      let error: string | null;
      if (confirmationAction === "clear-completed") error = await controller.clearCompleted();
      else if (!reminder) return "This reminder is no longer available.";
      else if (confirmationAction === "remove-for-me") error = await controller.removeForMe(reminder.id);
      else if (confirmationAction === "delete-for-everyone") error = await controller.deleteForEveryone(reminder.id);
      else error = await controller.remove(reminder.id);
      if (!error) {
        setConfirmationAction(null);
        if (confirmationAction !== "clear-completed" || (reminder && reminder.personalStatus === "completed" && !reminder.removedAt)) { setSelectedId(null); setView("list"); }
      }
      return error;
    });
  }

  const confirmationCopy = confirmationAction === "clear-completed" ? {
    id: "clear-completed-reminders", title: "Clear completed reminders?", description: "Completed personal reminders will be permanently deleted. Completed shared reminders will only be removed from your list.", confirm: "Clear completed", pending: "Clearing…",
  } : confirmationAction === "remove-for-me" ? {
    id: "remove-shared-reminder", title: "Remove from your reminders?", description: "This only removes your completed copy. Other participants keep this shared reminder and their own state.", confirm: "Remove from my reminders", pending: "Removing…",
  } : confirmationAction === "delete-for-everyone" ? {
    id: "delete-shared-reminder", title: "Delete reminder for everyone?", description: "This shared reminder will be permanently deleted for every participant. This can't be undone.", confirm: "Delete for everyone", pending: "Deleting…",
  } : confirmationAction === "cancel" ? {
    id: "cancel-shared-reminder", title: "Cancel shared reminder?", description: "This active reminder will be cancelled for everyone in this conversation.", confirm: "Cancel reminder", pending: "Cancelling…",
  } : {
    id: "delete-personal-reminder", title: "Delete reminder?", description: "This personal reminder will be permanently deleted. This can't be undone.", confirm: "Delete reminder", pending: "Deleting…",
  };

  const listPane = <aside className={`${view !== "list" ? "hidden md:flex" : "flex"} w-full min-w-0 flex-col border-r border-border bg-surface md:w-[20rem] lg:w-[22rem]`} aria-label="Reminders list">
    <div className="shrink-0 p-4 sm:p-5"><button type="button" onClick={() => { setActionError(""); setView("create"); }} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-semibold text-white shadow-soft"><Icon kind="plus" />New reminder</button><div className="mt-3 grid grid-cols-3 gap-1 rounded-2xl bg-background p-1" aria-label="Filter reminders">{(["all", "personal", "shared"] as Filter[]).map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`min-h-9 rounded-xl px-2 text-xs font-semibold ${filter === value ? "bg-accent text-primary" : "text-body"}`}>{value === "all" ? "All" : value === "personal" ? "For you" : "Shared"}</button>)}</div>{completedCount > 0 && <button type="button" onClick={(event) => requestConfirmation("clear-completed", event.currentTarget)} className="mt-3 min-h-9 w-full rounded-xl px-3 text-xs font-semibold text-muted hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Clear completed ({completedCount})</button>}</div>
    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-4">{controller.isLoading ? <p role="status" className="p-6 text-center text-sm text-body">Loading reminders…</p> : controller.loadError ? <div role="alert" className="p-6 text-center text-sm text-body"><p>{controller.loadError}</p><button type="button" onClick={controller.refresh} className="mt-4 font-semibold text-primary">Try again</button></div> : !visible.length ? <div className="p-8 text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-primary"><Icon kind="bell" /></span><h2 className="mt-4 font-semibold text-heading">Nothing to remember yet</h2><p className="mt-2 text-sm leading-6 text-body">Create a private reminder or share one in a conversation.</p></div> : <div className="space-y-5">{(["due", "today", "upcoming", "completed"] as const).map((key) => groups[key].length > 0 && <section key={key}><h2 className="px-2 pb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted">{key === "due" ? "Due / Overdue" : key}</h2><ul className="space-y-2">{groups[key].map((item) => <ReminderCard key={item.id} reminder={item} selected={selectedId === item.id} now={now} onSelect={() => { setSelectedId(item.id); setView("detail"); setActionError(""); }} />)}</ul></section>)}</div>}</div>
  </aside>;

  const detailPane = <section className={`${view === "list" ? "hidden md:flex" : "flex"} min-w-0 flex-1 flex-col overflow-hidden bg-background`}>
    {view === "create" || view === "edit" ? <div className="min-h-0 flex-1 overflow-y-auto"><div className="sticky top-0 z-10 flex items-center border-b border-border bg-surface px-3 py-2 md:hidden"><button type="button" onClick={() => setView("list")} aria-label="Back to reminders" className="flex h-10 w-10 items-center justify-center rounded-xl text-heading"><Icon kind="back" /></button></div><ReminderForm key={`${view}:${reminder?.id ?? "new"}`} initial={view === "edit" ? reminder : null} defaultConversationId={view === "create" ? initialConversationId : null} conversations={conversations} isConversationsLoading={isConversationsLoading} busy={busy} error={actionError} onCancel={() => setView(reminder ? "detail" : "list")} onSubmit={(draft) => void submit(draft)} /></div> : reminder ? <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7"><div className="mx-auto max-w-3xl"><button type="button" onClick={() => setView("list")} className="mb-4 inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-primary md:hidden"><Icon kind="back" />Back</button><div className="rounded-3xl border border-border bg-surface p-5 shadow-soft sm:p-7"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{reminder.scope === "shared" ? "Shared reminder" : "For you"}</p><h2 className="mt-2 break-words text-2xl font-bold text-heading">{reminder.title}</h2></div><span className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-heading">{stateLabel(reminder, now)}</span></div>{reminder.details && <p className="mt-5 whitespace-pre-wrap break-words text-sm leading-7 text-body">{reminder.details}</p>}<div className="mt-6 grid gap-3 rounded-2xl bg-background p-4 text-sm text-body"><p className="flex items-center gap-2"><Icon kind="clock" /><time dateTime={reminder.dueAt}>{formatReminderTime(reminder.dueAt)}</time></p>{reminder.scope === "shared" && reminder.conversationPeer && <div className="flex items-center gap-3"><ProfileAvatar profile={reminder.conversationPeer} size="sm" /><span>Shared with <strong className="text-heading">{getProfileDisplayName(reminder.conversationPeer)}</strong></span></div>}<div className="flex items-center gap-3"><ProfileAvatar profile={reminder.creatorProfile} size="sm" /><span>Created by <strong className="text-heading">{reminder.creatorId === currentUserId ? "you" : getProfileDisplayName(reminder.creatorProfile)}</strong></span></div>{reminder.scope === "shared" && <p>{reminder.completedCount === reminder.participantCount ? "Completed by everyone" : `${reminder.completedCount} of ${reminder.participantCount} done`}</p>}</div>
      {actionError && <p role="alert" className="mt-4 rounded-2xl border border-primary/25 bg-accent px-4 py-3 text-sm text-heading">{actionError}</p>}
      {!reminder.removedAt && <div className="mt-5 flex flex-wrap gap-2">{reminder.personalStatus === "due" && <><button type="button" disabled={busy} onClick={() => void run(() => controller.snooze(reminder.id, snoozeMinutes))} className="min-h-11 rounded-2xl border border-border px-4 text-sm font-semibold text-heading hover:bg-accent">Snooze {snoozeMinutes < 60 ? `${snoozeMinutes} min` : `${Math.round(snoozeMinutes / 60 * 10) / 10} hr`}</button><label className="flex items-center gap-2 rounded-2xl border border-border bg-background px-3"><span className="text-xs font-medium text-body">Minutes</span><input aria-label="Custom snooze minutes" type="number" min={1} max={10080} value={snoozeMinutes} onChange={(event) => setSnoozeMinutes(Math.min(10080, Math.max(1, Number(event.target.value) || 1)))} className="h-10 w-16 bg-transparent text-sm text-heading outline-none" /></label><button type="button" disabled={busy} onClick={() => void run(() => controller.dismiss(reminder.id))} className="min-h-11 rounded-2xl border border-border px-4 text-sm font-semibold text-heading hover:bg-accent">Dismiss</button></>} {reminder.personalStatus !== "completed" && reminder.personalStatus !== "dismissed" && <button type="button" disabled={busy} onClick={() => void run(() => controller.complete(reminder.id))} className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-semibold text-white"><Icon kind="check" />{reminder.scope === "shared" ? "Done for me" : "Done"}</button>}</div>}
      {((!reminder.removedAt && reminder.creatorId === currentUserId && reminder.personalStatus === "pending") || (!reminder.removedAt && reminder.scope === "personal" && reminder.personalStatus === "completed") || (!reminder.removedAt && reminder.scope === "shared" && (reminder.personalStatus === "completed" || reminder.personalStatus === "dismissed")) || (reminder.scope === "shared" && reminder.creatorId === currentUserId && (reminder.personalStatus === "completed" || reminder.personalStatus === "dismissed" || Boolean(reminder.removedAt)))) && <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-5">
        {!reminder.removedAt && reminder.creatorId === currentUserId && reminder.personalStatus === "pending" && <button type="button" onClick={() => { setActionError(""); setView("edit"); }} className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-border px-4 text-sm font-semibold text-heading hover:bg-accent"><Icon kind="edit" />Edit</button>}
        {!reminder.removedAt && reminder.creatorId === currentUserId && reminder.personalStatus === "pending" && <button type="button" onClick={(event) => requestConfirmation(reminder.scope === "shared" ? "cancel" : "delete-personal", event.currentTarget)} className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-primary/25 px-4 text-sm font-semibold text-primary hover:bg-accent"><Icon kind="trash" />{reminder.scope === "shared" ? "Cancel reminder" : "Delete reminder"}</button>}
        {!reminder.removedAt && reminder.scope === "personal" && reminder.personalStatus === "completed" && <button type="button" onClick={(event) => requestConfirmation("delete-personal", event.currentTarget)} className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-primary/25 px-4 text-sm font-semibold text-primary hover:bg-accent"><Icon kind="trash" />Delete reminder</button>}
        {!reminder.removedAt && reminder.scope === "shared" && (reminder.personalStatus === "completed" || reminder.personalStatus === "dismissed") && <button type="button" onClick={(event) => requestConfirmation("remove-for-me", event.currentTarget)} className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-border px-4 text-sm font-semibold text-heading hover:bg-accent"><Icon kind="trash" />Remove from my reminders</button>}
        {reminder.scope === "shared" && reminder.creatorId === currentUserId && (reminder.personalStatus === "completed" || reminder.personalStatus === "dismissed" || reminder.removedAt) && <button type="button" onClick={(event) => requestConfirmation("delete-for-everyone", event.currentTarget)} className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-primary/25 px-4 text-sm font-semibold text-primary hover:bg-accent"><Icon kind="trash" />Delete reminder for everyone</button>}
      </div>}
    </div></div></div> : <div className="m-auto max-w-sm p-8 text-center"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-accent text-primary"><Icon kind="bell" /></span><h2 className="mt-5 text-xl font-bold text-heading">Choose a reminder</h2><p className="mt-2 text-sm leading-6 text-body">Open a reminder to see its timing and personal actions.</p></div>}
  </section>;

  if (typeof document === "undefined") return null;
  return createPortal(<motion.div initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-stretch justify-center bg-heading/20 md:items-center md:p-5"><motion.div ref={panelRef} initial={reduced ? false : { opacity: 0, y: 12, scale: .99 }} animate={{ opacity: 1, y: 0, scale: 1 }} role="dialog" aria-modal="true" aria-labelledby="reminders-workspace-title" className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-surface md:h-[min(88dvh,56rem)] md:max-w-6xl md:rounded-[2rem] md:border md:border-border md:shadow-soft"><header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-4 sm:px-6"><div className="min-w-0"><h1 id="reminders-workspace-title" className="text-xl font-bold text-heading">Reminders</h1><p className="truncate text-sm text-body">Remember what matters, once.</p></div><button data-reminders-close type="button" onClick={onClose} aria-label="Close Reminders" className="flex h-11 w-11 items-center justify-center rounded-2xl text-heading hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover"><Icon kind="close" /></button></header><div className="flex min-h-0 flex-1 overflow-hidden">{listPane}{detailPane}</div><AnimatePresence>{confirmationAction && <ConfirmationDialog dialogId={confirmationCopy.id} title={confirmationCopy.title} description={confirmationCopy.description} confirmLabel={confirmationCopy.confirm} pendingLabel={confirmationCopy.pending} pendingAnnouncement="Updating reminders." icon={<Icon kind="trash" />} error={actionError} isPending={busy} returnFocusRef={confirmationTriggerRef} onCancel={() => { if (!busy) setConfirmationAction(null); }} onConfirm={() => void confirmCleanup()} />}</AnimatePresence></motion.div></motion.div>, document.body);
}

export default RemindersWorkspace;
