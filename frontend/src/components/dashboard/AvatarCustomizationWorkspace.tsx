import { useRef, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import type { AccountStatus } from "../../types/account";
import type { AvatarBorderKey } from "../../types/avatarBorders";
import type { ProfileSearchResult } from "../../types/conversations";
import AvatarBorderPicker from "./AvatarBorderPicker";
import type { PremiumAccessState } from "./premiumAccess";
import UserIdentityAvatar from "./UserIdentityAvatar";

export type AvatarCustomizationTab = "photo" | "border";

type AvatarCustomizationWorkspaceProps = {
  profile: ProfileSearchResult;
  accountStatus: AccountStatus;
  premiumAccess: PremiumAccessState;
  activeTab: AvatarCustomizationTab;
  savedBorder: AvatarBorderKey;
  borderSelection: AvatarBorderKey;
  borderError: string;
  isBorderSaving: boolean;
  avatarInputRef: RefObject<HTMLInputElement | null>;
  avatarPreviewUrl: string | null;
  hasAvatarDraft: boolean;
  avatarError: string;
  isAvatarSaving: boolean;
  onTabChange: (tab: AvatarCustomizationTab) => void;
  onBorderSelectionChange: (border: AvatarBorderKey) => void;
  onApplyBorder: () => void;
  onChooseAvatar: (file: File | null) => void;
  onSaveAvatar: () => void;
  onCancelAvatar: () => void;
  onRemoveAvatar: () => void;
  onBack: () => void;
};

function BackIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true"><path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function AvatarCustomizationWorkspace({ profile, accountStatus, premiumAccess, activeTab, savedBorder, borderSelection, borderError, isBorderSaving, avatarInputRef, avatarPreviewUrl, hasAvatarDraft, avatarError, isAvatarSaving, onTabChange, onBorderSelectionChange, onApplyBorder, onChooseAvatar, onSaveAvatar, onCancelAvatar, onRemoveAvatar, onBack }: AvatarCustomizationWorkspaceProps) {
  const photoTabRef = useRef<HTMLButtonElement>(null);
  const borderTabRef = useRef<HTMLButtonElement>(null);
  const interactionsDisabled = isAvatarSaving || isBorderSaving;

  function selectTab(tab: AvatarCustomizationTab) {
    onTabChange(tab);
    window.requestAnimationFrame(() => (tab === "photo" ? photoTabRef.current : borderTabRef.current)?.focus());
  }

  function handleTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextTab = event.key === "Home" ? "photo" : event.key === "End" ? "border" : activeTab === "photo" ? "border" : "photo";
    selectTab(nextTab);
  }

  return (
    <section aria-labelledby="avatar-customization-heading" className="mt-5 rounded-3xl border border-border bg-background p-4 shadow-soft">
      <button type="button" onClick={onBack} disabled={interactionsDisabled} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold text-primary transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:opacity-50">
        <BackIcon />
        <span>Edit Profile</span>
      </button>
      <div className="px-1 pb-1 pt-3">
        <h2 id="avatar-customization-heading" className="text-xl font-bold tracking-tight text-heading">Avatar</h2>
        <p className="mt-2 text-sm leading-6 text-body">Customize your photo and avatar border.</p>
      </div>

      <div role="tablist" aria-label="Avatar customization" className="mt-5 grid grid-cols-2 rounded-2xl border border-border bg-surface p-1">
        <button ref={photoTabRef} id="avatar-photo-tab" type="button" role="tab" aria-selected={activeTab === "photo"} aria-controls="avatar-photo-panel" tabIndex={activeTab === "photo" ? 0 : -1} disabled={interactionsDisabled} onClick={() => onTabChange("photo")} onKeyDown={handleTabKeyDown} className={`min-h-11 min-w-0 rounded-xl px-2 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:opacity-50 ${activeTab === "photo" ? "bg-accent text-heading shadow-sm" : "text-body hover:bg-accent/70 hover:text-heading"}`}><span>Avatar Photo</span>{activeTab === "photo" && <span className="mx-auto mt-1 block h-0.5 w-8 rounded-full bg-primary" aria-hidden="true" />}</button>
        <button ref={borderTabRef} id="avatar-border-tab" type="button" role="tab" aria-selected={activeTab === "border"} aria-controls="avatar-border-panel" tabIndex={activeTab === "border" ? 0 : -1} disabled={interactionsDisabled} onClick={() => onTabChange("border")} onKeyDown={handleTabKeyDown} className={`min-h-11 min-w-0 rounded-xl px-2 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:opacity-50 ${activeTab === "border" ? "bg-accent text-heading shadow-sm" : "text-body hover:bg-accent/70 hover:text-heading"}`}><span>Avatar Border</span>{activeTab === "border" && <span className="mx-auto mt-1 block h-0.5 w-8 rounded-full bg-primary" aria-hidden="true" />}</button>
      </div>

      {activeTab === "photo" ? (
        <div id="avatar-photo-panel" role="tabpanel" aria-labelledby="avatar-photo-tab" className="pt-5">
          <div className="flex justify-center rounded-3xl border border-border bg-surface px-5 py-8">
            <UserIdentityAvatar profile={profile} accountStatus={accountStatus} avatarBorder={savedBorder} avatarOverride={avatarPreviewUrl ?? undefined} size="xl" />
          </div>
          <input ref={avatarInputRef} id="profile-avatar-input" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={interactionsDisabled} onChange={(event) => onChooseAvatar(event.target.files?.[0] ?? null)} />
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={interactionsDisabled} className="min-h-11 rounded-2xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-heading transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:opacity-50">Upload Avatar</button>
            {hasAvatarDraft && <button type="button" onClick={onSaveAvatar} disabled={interactionsDisabled} className="min-h-11 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:opacity-50">{isAvatarSaving ? "Saving…" : "Save Avatar"}</button>}
            {hasAvatarDraft && <button type="button" onClick={onCancelAvatar} disabled={isAvatarSaving} className="min-h-11 rounded-2xl px-4 py-2.5 text-sm font-semibold text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:opacity-50">Cancel</button>}
            {!hasAvatarDraft && profile.avatar_url && <button type="button" onClick={onRemoveAvatar} disabled={interactionsDisabled} className="min-h-11 rounded-2xl px-4 py-2.5 text-sm font-semibold text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:opacity-50">{isAvatarSaving ? "Removing…" : "Remove Avatar"}</button>}
          </div>
          {avatarError && <p role="alert" className="mt-4 rounded-2xl border border-primary/25 bg-accent px-3 py-2.5 text-xs leading-5 text-body">{avatarError}</p>}
        </div>
      ) : (
        <div id="avatar-border-panel" role="tabpanel" aria-labelledby="avatar-border-tab" className="pt-5">
          <AvatarBorderPicker profile={profile} accountStatus={accountStatus} premiumAccess={premiumAccess} selection={borderSelection} isSaving={isBorderSaving} error={borderError} onSelectionChange={onBorderSelectionChange} onApply={onApplyBorder} />
        </div>
      )}
    </section>
  );
}

export default AvatarCustomizationWorkspace;
