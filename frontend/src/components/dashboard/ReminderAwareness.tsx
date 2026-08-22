import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { formatReminderTime } from "./reminderTime";
import type { ReminderRecord } from "./useReminders";

type ReminderToastViewportProps = {
  reminders: ReminderRecord[];
  onOpen: (reminder: ReminderRecord, trigger: HTMLElement) => void;
  onSnooze: (reminderId: string, minutes: number) => Promise<string | null>;
  onDismiss: (reminderId: string) => Promise<string | null>;
  onComplete: (reminderId: string) => Promise<string | null>;
};

function BellIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 8H3c0-1 3-1 3-8m3 11h6" strokeLinecap="round" strokeLinejoin="round" /></svg>; }

export function ReminderToastViewport({ reminders, onOpen, onSnooze, onDismiss, onComplete }: ReminderToastViewportProps) {
  const reduced = useReducedMotion();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function run(id: string, action: () => Promise<string | null>) { if (busyId) return; setBusyId(id); setError(""); const nextError = await action(); setBusyId(null); if (nextError) setError(nextError); }
  return <section aria-label="Due reminders" aria-live="polite" aria-relevant="additions text" className="pointer-events-none w-full">
    <AnimatePresence initial={false}>{reminders.slice(0, 2).map((reminder) => <motion.article key={`${reminder.id}:${reminder.notificationVersion}`} initial={reduced ? false : { opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: reduced ? 0 : .18 }} className="pointer-events-auto mb-2 overflow-hidden rounded-2xl border border-primary/25 bg-surface/95 p-3 shadow-soft backdrop-blur-md">
      <button type="button" onClick={(event) => onOpen(reminder, event.currentTarget)} className="flex w-full items-start gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary"><BellIcon /></span><span className="min-w-0 flex-1"><span className="block text-xs font-bold uppercase tracking-[0.12em] text-primary">{reminder.scope === "shared" ? "Shared reminder" : "Reminder"}</span><span className="mt-0.5 block truncate text-sm font-semibold text-heading">{reminder.title}</span><span className="mt-0.5 block truncate text-xs text-body">It's time · {formatReminderTime(reminder.dueAt)}</span></span></button>
      <div className="mt-3 flex flex-wrap gap-1.5"><button type="button" disabled={busyId === reminder.id} onClick={() => void run(reminder.id, () => onSnooze(reminder.id, 10))} className="min-h-9 rounded-xl border border-border px-3 text-xs font-semibold text-heading hover:bg-accent disabled:opacity-60">Snooze 10m</button><button type="button" disabled={busyId === reminder.id} onClick={() => void run(reminder.id, () => onComplete(reminder.id))} className="min-h-9 rounded-xl bg-primary px-3 text-xs font-semibold text-white disabled:opacity-60">{reminder.scope === "shared" ? "Done for me" : "Done"}</button><button type="button" disabled={busyId === reminder.id} onClick={() => void run(reminder.id, () => onDismiss(reminder.id))} className="min-h-9 rounded-xl px-3 text-xs font-semibold text-muted hover:bg-accent hover:text-heading disabled:opacity-60">Dismiss</button></div>
      {error && busyId === null && <p role="alert" className="mt-2 text-xs text-primary">{error}</p>}
    </motion.article>)}</AnimatePresence>
  </section>;
}

export function ConversationReminderStatus({ reminders, onOpen }: { reminders: ReminderRecord[]; onOpen: (reminder: ReminderRecord, trigger: HTMLElement) => void }) {
  if (!reminders.length) return null;
  const sorted = [...reminders].sort((left, right) => Number(left.personalStatus !== "due") - Number(right.personalStatus !== "due") || Date.parse(left.snoozedUntil ?? left.dueAt) - Date.parse(right.snoozedUntil ?? right.dueAt) || left.id.localeCompare(right.id));
  const primary = sorted[0];
  return <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex justify-center sm:inset-x-6"><button type="button" onClick={(event) => onOpen(primary, event.currentTarget)} aria-label={`Open shared reminder ${primary.title}${sorted.length > 1 ? ` and ${sorted.length - 1} more` : ""}`} className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-border bg-surface/95 px-3 py-2 text-xs font-semibold text-heading shadow-soft backdrop-blur-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover"><span className="shrink-0 text-primary"><BellIcon /></span><span className="truncate">{primary.title}</span><span className="shrink-0 text-muted">· {formatReminderTime(primary.snoozedUntil ?? primary.dueAt)}</span>{sorted.length > 1 && <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[10px] text-primary">+{sorted.length - 1}</span>}</button></div>;
}
