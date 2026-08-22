export const REMINDER_MIN_LEAD_MS = 60_000;
export const REMINDER_MAX_LEAD_MS = 365 * 24 * 60 * 60 * 1000;

export function toLocalDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toLocalTimeInput(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function localInputsToInstant(dateValue: string, timeValue: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue) || !/^\d{2}:\d{2}$/.test(timeValue)) return null;
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hours, minutes] = timeValue.split(":").map(Number);
  const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || date.getHours() !== hours || date.getMinutes() !== minutes) return null;
  return date;
}

export function validateReminderInstant(date: Date | null) {
  if (!date || Number.isNaN(date.getTime())) return "Choose a valid date and time.";
  const delta = date.getTime() - Date.now();
  if (delta < REMINDER_MIN_LEAD_MS) return "Choose a time at least one minute from now.";
  if (delta > REMINDER_MAX_LEAD_MS) return "Choose a time within the next year.";
  return null;
}

export function formatReminderTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

export function formatReminderCountdown(value: string, now: number) {
  const minutes = Math.max(0, Math.ceil((Date.parse(value) - now) / 60_000));
  if (minutes < 60) return `${minutes}m remaining`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m remaining` : `${hours}h remaining`;
}
