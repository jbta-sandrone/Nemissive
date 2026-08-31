import type { AccountStatus } from "../../types/account";
import type { AvatarBorderKey } from "../../types/avatarBorders";
import type { ProfileSearchResult } from "../../types/conversations";
import UserIdentityAvatar from "./UserIdentityAvatar";
import { avatarBorderCatalog } from "./avatarBorders";

type AvatarBorderPickerProps = {
  profile: ProfileSearchResult;
  accountStatus: AccountStatus;
  selection: AvatarBorderKey;
  isSaving: boolean;
  error: string;
  onSelectionChange: (border: AvatarBorderKey) => void;
  onApply: () => void;
};

function SelectedIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-3.5 w-3.5" aria-hidden="true"><path d="m4 10 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function AvatarBorderPicker({ profile, accountStatus, selection, isSaving, error, onSelectionChange, onApply }: AvatarBorderPickerProps) {
  return (
    <div>
      <div className="flex justify-center rounded-3xl border border-border bg-surface px-5 py-8">
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
                onClick={() => onSelectionChange(border.key)}
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
      <div className="mt-6 flex justify-end">
        <button type="button" onClick={onApply} disabled={isSaving} className="min-h-11 w-full rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:opacity-60 sm:w-auto">{isSaving ? "Applying…" : "Apply border"}</button>
      </div>
    </div>
  );
}

export default AvatarBorderPicker;
