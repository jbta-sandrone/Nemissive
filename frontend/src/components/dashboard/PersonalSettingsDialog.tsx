import { useEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import type { ProfileSearchResult } from "../../types/conversations";
import type { PersonalSurface } from "./AccountMenuPopover";
import NotificationSettings from "./NotificationSettings";
import ProfileDetailsSettings from "./ProfileDetailsSettings";
import QuickReactionSettings from "./QuickReactionSettings";
import SettingsSidebarContent from "./SettingsSidebarContent";

type PersonalSettingsDialogProps = {
  surface: PersonalSurface;
  profile: ProfileSearchResult;
  quickReactions: string[];
  notificationPermission: NotificationPermission | "unsupported";
  isNotificationSupported: boolean;
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onSaveQuickReactions: (reactions: string[]) => Promise<boolean>;
  onEnableNotifications: () => Promise<string | null>;
  onSaveNotificationPreferences: (notificationsEnabled: boolean, soundEnabled: boolean) => Promise<string | null>;
  onProfileIdentityUpdated: (profile: ProfileSearchResult) => void;
  onAccountDeleted: () => void;
};

const surfaceCopy: Record<Exclude<PersonalSurface, "settings">, { title: string; description: string }> = {
  profile: { title: "Profile", description: "Manage your profile and personal details." },
  notifications: { title: "Notifications", description: "Browser notifications, sounds and preferences." },
  "quick-reactions": { title: "Quick reactions", description: "Choose your preferred message reactions." },
};

function CloseIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" strokeLinecap="round" /></svg>;
}

function PersonalSettingsDialog({ surface, profile, quickReactions, notificationPermission, isNotificationSupported, returnFocusRef, onClose, onSaveQuickReactions, onEnableNotifications, onSaveNotificationPreferences, onProfileIdentityUpdated, onAccountDeleted }: PersonalSettingsDialogProps) {
  const shouldReduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const returnFocusElement = returnFocusRef.current;
    document.body.style.overflow = "hidden";
    function handleKeyDown(event: KeyboardEvent) {
      const modalLayers = [...document.querySelectorAll<HTMLElement>('[aria-modal="true"]')];
      if (modalLayers.at(-1) !== panelRef.current) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const controls = [...panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")];
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    const focusFrame = window.requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("[data-personal-dialog-close]")?.focus());
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() => returnFocusElement?.focus());
    };
  }, [returnFocusRef]);

  const standardCopy = surface === "settings" ? null : surfaceCopy[surface];

  return createPortal(
    <motion.div initial={shouldReduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: shouldReduceMotion ? 0 : 0.18 }} className="fixed inset-0 z-[100] flex items-stretch justify-center bg-heading/20 md:items-center md:p-5" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <motion.div ref={panelRef} initial={shouldReduceMotion ? false : { opacity: 0, y: 12, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.99 }} transition={{ duration: shouldReduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }} role="dialog" aria-modal="true" aria-label={surface === "settings" ? "Settings" : standardCopy?.title} className="relative flex h-full w-full min-w-0 flex-col overflow-hidden bg-surface md:h-[min(52rem,calc(100dvh-2.5rem))] md:max-w-3xl md:rounded-3xl md:border md:border-border md:shadow-soft">
        {surface === "settings" ? (
          <button data-personal-dialog-close type="button" onClick={onClose} aria-label="Close Settings" className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex h-11 w-11 items-center justify-center rounded-2xl bg-surface text-muted shadow-sm transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover md:right-4 md:top-4"><CloseIcon /></button>
        ) : (
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 md:pt-5"><div className="min-w-0"><h1 className="text-xl font-bold text-heading">{standardCopy?.title}</h1><p className="mt-1 text-sm leading-6 text-body">{standardCopy?.description}</p></div><button data-personal-dialog-close type="button" onClick={onClose} aria-label={`Close ${standardCopy?.title}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover"><CloseIcon /></button></header>
        )}

        {surface === "settings" ? (
          <SettingsSidebarContent profile={profile} rootBackLabel="Workspace" onBackToMenu={onClose} onAccountDeleted={onAccountDeleted} />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-6">
            {surface === "profile" && <ProfileDetailsSettings profile={profile} onIdentityUpdated={onProfileIdentityUpdated} />}
            {surface === "notifications" && <NotificationSettings isSupported={isNotificationSupported} permission={notificationPermission} notificationsEnabled={profile.browser_notifications_enabled ?? false} soundEnabled={profile.notification_sound_enabled ?? true} onEnable={onEnableNotifications} onSave={onSaveNotificationPreferences} />}
            {surface === "quick-reactions" && <QuickReactionSettings quickReactions={quickReactions} onSave={onSaveQuickReactions} />}
          </div>
        )}
      </motion.div>
    </motion.div>,
    document.body,
  );
}

export default PersonalSettingsDialog;
