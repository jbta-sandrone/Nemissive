export const privacyPreferencesChangeEvent = "nemissive:privacy-preferences-changed";

export type PrivacyPreferences = {
  activeStatusEnabled: boolean;
  lastActiveEnabled: boolean;
  readReceiptsEnabled: boolean;
  messageRequestPermission: "everyone" | "no_one";
};

export function parsePrivacyPreferences(value: unknown): PrivacyPreferences | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.active_status_enabled !== "boolean" || typeof row.last_active_enabled !== "boolean" || typeof row.read_receipts_enabled !== "boolean") return null;
  if (row.message_request_permission !== "everyone" && row.message_request_permission !== "no_one") return null;
  return {
    activeStatusEnabled: row.active_status_enabled,
    lastActiveEnabled: row.last_active_enabled,
    readReceiptsEnabled: row.read_receipts_enabled,
    messageRequestPermission: row.message_request_permission,
  };
}

export function announcePrivacyPreferencesChanged() {
  window.dispatchEvent(new Event(privacyPreferencesChangeEvent));
}
