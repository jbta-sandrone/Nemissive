import { useState } from "react";
import type { AccountStatus } from "../../types/account";
import type { AvatarBorderKey } from "../../types/avatarBorders";
import type { ProfileSearchResult } from "../../types/conversations";
import UserIdentityAvatar from "./UserIdentityAvatar";
import { avatarBorderCatalog } from "./avatarBorders";

type AvatarBorderPickerProps = {
  profile: ProfileSearchResult;
  accountStatus: AccountStatus;
  savedBorder: AvatarBorderKey;
  onApply: (border: AvatarBorderKey) => Promise<string | null>;
  onBack: () => void;
};

function BackIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true"><path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function SelectedIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-3.5 w-3.5" aria-hidden="true"><path d="m4 10 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function AvatarBorderPicker({ profile, accountStatus, savedBorder, onApply, onBack }: AvatarBorderPickerProps) {
  const [selection, setSelection] = useState<AvatarBorderKey>(savedBorder);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  async function applySelection() {
    if (isSaving) return;
    setIsSaving(true);
    setError("");
    const saveError = await onApply(selection);
    setIsSaving(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    onBack();
  }

  return (
    <section aria-labelledby="avatar-border-picker-heading" className="mt-5 rounded-3xl border border-border bg-background p-4 shadow-soft">
      <button type="button" onClick={onBack} disabled={isSaving} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold text-primary transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:opacity-50">
        <BackIcon />
        <span>Avatar Border</span>
      </button>
      <div className="px-1 pb-1 pt-3">
        <h2 id="avatar-border-picker-heading" className="text-xl font-bold tracking-tight text-heading">Avatar Border</h2>
        <p className="mt-2 text-sm leading-6 text-body">Choose how your avatar appears across Nemissive.</p>
      </div>

      <div className="mt-5 flex justify-center rounded-3xl border border-border bg-surface px-5 py-8">
        <UserIdentityAvatar profile={profile} accountStatus={accountStatus} avatarBorder={selection} size="xl" />
      </div>

      <fieldset className="mt-6">
        <legend className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Free borders</legend>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {avatarBorderCatalog.map((border) => {
            const selected = selection === border.key;
            return (
              <button
                key={border.key}
                type="button"
                aria-pressed={selected}
                onClick={() => { setSelection(border.key); setError(""); }}
                disabled={isSaving}
                className={`relative flex min-h-28 min-w-0 flex-col items-center justify-center rounded-2xl border px-2 py-3 text-center transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:opacity-60 ${selected ? "border-primary bg-accent shadow-soft" : "border-border bg-surface hover:bg-accent"}`}
              >
                <UserIdentityAvatar profile={profile} avatarBorder={border.key} size="md" />
                <span className="mt-2 truncate text-xs font-semibold text-heading">{border.name}</span>
                {selected && <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white" aria-hidden="true"><SelectedIcon /></span>}
              </button>
            );
          })}
        </div>
      </fieldset>

      {error && <p role="alert" className="mt-4 rounded-2xl border border-primary/25 bg-accent px-3 py-2.5 text-xs leading-5 text-body">{error}</p>}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onBack} disabled={isSaving} className="min-h-11 rounded-2xl px-4 py-2.5 text-sm font-semibold text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:opacity-50">Back without applying</button>
        <button type="button" onClick={() => void applySelection()} disabled={isSaving} className="min-h-11 rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:opacity-60">{isSaving ? "Applying…" : "Apply border"}</button>
      </div>
    </section>
  );
}

export default AvatarBorderPicker;
