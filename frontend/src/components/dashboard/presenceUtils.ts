export function formatLastSeen(value: string | null | undefined, nowValue = Date.now()) {
  if (!value) return "Offline";

  const lastSeen = new Date(value);
  if (Number.isNaN(lastSeen.getTime())) return "Offline";

  const elapsedMs = Math.max(0, nowValue - lastSeen.getTime());
  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  if (elapsedMinutes < 1) return "Last seen just now";
  if (elapsedMinutes < 60) return `Last seen ${elapsedMinutes} ${elapsedMinutes === 1 ? "minute" : "minutes"} ago`;

  const now = new Date(nowValue);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(lastSeen);

  if (lastSeen.toDateString() === now.toDateString()) return `Last seen at ${time}`;
  if (lastSeen.toDateString() === yesterday.toDateString()) return `Last seen yesterday at ${time}`;

  const date = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(lastSeen);
  return `Last seen ${date} at ${time}`;
}
