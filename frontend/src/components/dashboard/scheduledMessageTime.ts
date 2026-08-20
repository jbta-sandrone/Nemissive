export const scheduledMessageMinimumLeadMs = 2 * 60 * 1000;
export const scheduledMessageMaximumHorizonMs = 365 * 24 * 60 * 60 * 1000;

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

export function getDefaultScheduledLocalTime(now = new Date()) {
  const value = new Date(now.getTime() + 10 * 60 * 1000);
  value.setSeconds(0, 0);
  value.setMinutes(Math.ceil(value.getMinutes() / 5) * 5);
  return {
    date: `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`,
    time: `${pad(value.getHours())}:${pad(value.getMinutes())}`,
  };
}

export function localInputsFromInstant(instant: string) {
  const value = new Date(instant);
  if (Number.isNaN(value.getTime())) return getDefaultScheduledLocalTime();
  return {
    date: `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`,
    time: `${pad(value.getHours())}:${pad(value.getMinutes())}`,
  };
}

export function parseLocalScheduledTime(dateValue: string, timeValue: string, now = new Date()) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(dateValue);
  const timeMatch = /^(\d{2}):(\d{2})$/u.exec(timeValue);
  if (!dateMatch || !timeMatch) return { instant: null, error: "Choose a date and time." };

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const local = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (Number.isNaN(local.getTime())
    || local.getFullYear() !== year
    || local.getMonth() !== month - 1
    || local.getDate() !== day
    || local.getHours() !== hour
    || local.getMinutes() !== minute) {
    return { instant: null, error: "That local date or time doesn't exist. Choose another time." };
  }

  const difference = local.getTime() - now.getTime();
  if (difference < scheduledMessageMinimumLeadMs) return { instant: null, error: "Choose a time at least two minutes from now." };
  if (difference > scheduledMessageMaximumHorizonMs) return { instant: null, error: "Scheduled messages can be planned up to one year ahead." };
  return { instant: local, error: "" };
}

export function formatScheduledInstant(instant: string, now = new Date()) {
  const value = new Date(instant);
  if (Number.isNaN(value.getTime())) return "Unknown time";
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const dayDifference = Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(value);
  if (dayDifference === 0) return `Today, ${time}`;
  if (dayDifference === 1) return `Tomorrow, ${time}`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(value);
}

export function formatScheduledInstantAccessible(instant: string) {
  const value = new Date(instant);
  if (Number.isNaN(value.getTime())) return "Unknown scheduled time";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "long" }).format(value);
}
