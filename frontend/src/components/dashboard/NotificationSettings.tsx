import { useState } from "react";

type NotificationSettingsProps = {
  isSupported: boolean;
  permission: NotificationPermission | "unsupported";
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  onEnable: () => Promise<string | null>;
  onSave: (notificationsEnabled: boolean, soundEnabled: boolean) => Promise<string | null>;
};

function Toggle({ checked, disabled, label, description, onChange }: { checked: boolean; disabled: boolean; label: string; description: string; onChange: (checked: boolean) => void }) {
  return <div className="flex items-center gap-3 py-3"><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-heading">{label}</p><p className="mt-1 text-xs leading-5 text-body">{description}</p></div><button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} className={`relative h-7 w-12 shrink-0 rounded-full border transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-50 ${checked ? "border-primary bg-primary" : "border-border bg-card"}`}><span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-soft transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} /></button></div>;
}

function NotificationSettings({ isSupported, permission, notificationsEnabled, soundEnabled, onEnable, onSave }: NotificationSettingsProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  async function enableNotifications() {
    if (isSaving || permission === "denied") return;
    setIsSaving(true);
    setError("");
    const nextError = await onEnable();
    setError(nextError ?? "");
    setIsSaving(false);
  }

  async function savePreferences(nextNotificationsEnabled: boolean, nextSoundEnabled: boolean) {
    if (isSaving) return;
    setIsSaving(true);
    setError("");
    const nextError = await onSave(nextNotificationsEnabled, nextSoundEnabled);
    setError(nextError ?? "");
    setIsSaving(false);
  }

  const statusText = !isSupported || permission === "unsupported" ? "Unsupported in this browser" : permission === "granted" ? "Browser permission granted" : permission === "denied" ? "Browser permission blocked" : "Permission not requested";

  return (
    <section aria-labelledby="notification-settings-heading" className="mt-5 rounded-3xl border border-border bg-background p-4 shadow-soft">
      <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent text-primary"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="M6.5 9a5.5 5.5 0 0 1 11 0c0 5 2 5.5 2 7H4.5c0-1.5 2-2 2-7Z" strokeLinejoin="round" /><path d="M9.5 19a3 3 0 0 0 5 0" strokeLinecap="round" /></svg></span><div className="min-w-0 flex-1"><h2 id="notification-settings-heading" className="font-bold text-heading">Notifications</h2><p className="mt-1 text-xs leading-5 text-body">Browser alerts work while Nemissive is open in at least one tab.</p><p className="mt-2 text-xs font-semibold text-muted">{statusText}</p></div></div>

      {!isSupported || permission === "unsupported" ? <p className="mt-4 rounded-2xl bg-surface px-3 py-3 text-xs leading-5 text-body">This browser does not support page-level notifications. In-app unread badges will continue to work.</p> : permission === "denied" ? <p className="mt-4 rounded-2xl bg-surface px-3 py-3 text-xs leading-5 text-body">Notifications are blocked. Allow them in your browser’s site settings, then return to Nemissive.</p> : permission === "default" ? <button type="button" onClick={() => void enableNotifications()} disabled={isSaving} className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-60">{isSaving ? "Requesting permission…" : "Enable browser notifications"}</button> : null}

      <div className="mt-3 divide-y divide-border">
        <Toggle checked={notificationsEnabled} disabled={isSaving || (permission !== "granted" && !notificationsEnabled)} label="Browser notifications" description="Show an alert for eligible incoming messages while the app is hidden or unfocused." onChange={(checked) => void savePreferences(checked, soundEnabled)} />
        <Toggle checked={soundEnabled} disabled={isSaving} label="Notification sound" description="Play one subtle tone with eligible browser alerts after you have interacted with the app." onChange={(checked) => void savePreferences(notificationsEnabled, checked)} />
      </div>
      <p className="mt-3 text-xs leading-5 text-muted">Unread badges work even when alerts are off. Muted conversations still accumulate unread messages.</p>
      {error && <p role="alert" className="mt-3 rounded-2xl border border-primary/25 bg-accent px-3 py-2.5 text-xs leading-5 text-body">{error}</p>}
    </section>
  );
}

export default NotificationSettings;
