import type { DashboardSection } from "../../types/dashboard";

export const workspaceDestinations: ReadonlyArray<{ section: Exclude<DashboardSection, "menu">; label: string }> = [
  { section: "messages", label: "Messages" },
  { section: "people", label: "People" },
  { section: "requests", label: "Requests" },
  { section: "archived", label: "Archive" },
];

export const mobileDashboardDestinations: ReadonlyArray<{ section: DashboardSection; label: string }> = [
  ...workspaceDestinations,
  { section: "menu", label: "Menu" },
];

export function getDestinationCount(section: DashboardSection, pendingRequestCount: number, unreadMessageCount: number, archivedConversationCount: number) {
  if (section === "requests") return pendingRequestCount;
  if (section === "messages") return unreadMessageCount;
  if (section === "archived") return archivedConversationCount;
  return 0;
}

export function getDestinationCountDescription(section: DashboardSection, count: number) {
  if (section === "requests") return `${count} pending message ${count === 1 ? "request" : "requests"}`;
  if (section === "archived") return `${count} archived ${count === 1 ? "conversation" : "conversations"}`;
  return `${count} unread ${count === 1 ? "message" : "messages"}`;
}
