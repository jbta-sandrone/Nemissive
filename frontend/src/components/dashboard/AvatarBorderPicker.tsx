import type { AccountStatus } from "../../types/account";
import type { AvatarBorderKey } from "../../types/avatarBorders";
import type { ProfileSearchResult } from "../../types/conversations";
import UserIdentityAvatar from "./UserIdentityAvatar";
import { canUseAvatarBorder, freeAvatarBorderCatalog, getAvatarBorderDefinition, premiumAvatarBorderCatalog, type AvatarBorderDefinition } from "./avatarBorders";
import { resolvePremiumProductAccessSource, type PremiumAccessState } from "./premiumAccess";
import { premiumThemeAccessLabels } from "./premiumPresentation";

type AvatarBorderPickerProps = {
  profile: ProfileSearchResult;
  accountStatus: AccountStatus;
  premiumAccess: PremiumAccessState;
  selection: AvatarBorderKey;
  isSaving: boolean;
  error: string;
  onSelectionChange: (border: AvatarBorderKey) => void;
  onApply: () => void;
};

function SelectedIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-3.5 w-3.5" aria-hidden="true"><path d="m4 10 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function LockIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3 w-3" aria-hidden="true"><rect x="4.5" y="8.5" width="11" height="8" rx="2" /><path d="M7 8.5V6.75a3 3 0 0 1 6 0V8.5" strokeLinecap="round" /></svg>;
}

function formatPrice(amountMinor: number, currency: "PHP") {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amountMinor / 100);
}

function AvatarBorderPicker({ profile, accountStatus, premiumAccess, selection, isSaving, error, onSelectionChange, onApply }: AvatarBorderPickerProps) {
  const selectedDefinition = getAvatarBorderDefinition(selection);
  const selectionAvailable = canUseAvatarBorder(selection, premiumAccess);
  const selectedAccessSource = selectedDefinition.premiumProductId
    ? resolvePremiumProductAccessSource(premiumAccess, selectedDefinition.premiumProductId)
    : null;

  function renderBorderOption(border: AvatarBorderDefinition) {
    const selected = selection === border.key;
    const accessSource = border.premiumProductId
      ? resolvePremiumProductAccessSource(premiumAccess, border.premiumProductId)
      : null;
    const stateLabel = accessSource ? premiumThemeAccessLabels[accessSource] : "Free";

    return (
      <button
        key={border.key}
        type="button"
        aria-pressed={selected}
        aria-label={`${border.name}, ${border.access === "premium" ? "Elite avatar border" : "free avatar border"}, ${stateLabel}${selected ? ", selected" : ""}`}
        onClick={() => onSelectionChange(border.key)}
        disabled={isSaving}
        className={`relative flex min-h-28 min-w-0 flex-col items-center justify-center rounded-2xl border px-2 py-3 text-center transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:opacity-60 ${selected ? "border-primary bg-accent shadow-soft" : "border-border bg-surface hover:bg-accent"}`}
      >
        <UserIdentityAvatar profile={profile} avatarBorder={border.key} size="md" />
        <span className="mt-2 truncate text-xs font-semibold text-heading">{border.name}</span>
        {border.access === "premium" && <span className="mt-1 text-[0.62rem] font-bold uppercase tracking-wide text-primary">Elite</span>}
        {accessSource === "locked" && <span className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-muted" aria-hidden="true"><LockIcon /></span>}
        {selected && <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white" aria-hidden="true"><SelectedIcon /></span>}
      </button>
    );
  }

  return (
    <div>
      <div className="flex justify-center rounded-3xl border border-border bg-surface px-5 py-10">
        <UserIdentityAvatar profile={profile} accountStatus={accountStatus} avatarBorder={selection} size="xl" />
      </div>

      {selectedDefinition.access === "premium" && selectedAccessSource && (
        <div className="mt-4 rounded-2xl border border-border bg-surface px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-bold text-heading">Aurelia</p><p className="mt-1 text-xs text-body">Elite Avatar Border · 1 of 8</p></div><span className="rounded-full bg-accent px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wide text-primary">{premiumThemeAccessLabels[selectedAccessSource]}</span></div>
          {selectedDefinition.amountMinor !== null && selectedDefinition.currency && <p className="mt-3 text-sm font-semibold text-heading">{formatPrice(selectedDefinition.amountMinor, selectedDefinition.currency)} <span className="font-normal text-body">· Pay once · Own forever</span></p>}
          {selectedAccessSource === "locked" && <p className="mt-2 text-xs leading-5 text-body">Permanent purchase is coming soon. Aurelia is available now with active Nemissive Elite or authoritative permanent ownership.</p>}
        </div>
      )}

      <fieldset className="mt-6">
        <legend className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Free borders</legend>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {freeAvatarBorderCatalog.map(renderBorderOption)}
        </div>
      </fieldset>

      <fieldset className="mt-6">
        <legend className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Elite borders</legend>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {premiumAvatarBorderCatalog.map(renderBorderOption)}
        </div>
      </fieldset>

      {error && <p role="alert" className="mt-4 rounded-2xl border border-primary/25 bg-accent px-3 py-2.5 text-xs leading-5 text-body">{error}</p>}
      <div className="mt-6 flex justify-end">
        <button type="button" onClick={onApply} disabled={isSaving || !selectionAvailable} className="min-h-11 w-full rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">{isSaving ? "Applying…" : selectedAccessSource === "preview" ? "Apply development preview" : "Apply border"}</button>
      </div>
    </div>
  );
}

export default AvatarBorderPicker;
