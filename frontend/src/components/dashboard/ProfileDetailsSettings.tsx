import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { supabase } from "../../lib/supabase";
import type { BirthdayVisibility, EditableProfileDetails } from "../../types/conversations";
import InterestIcon from "./InterestIcon";
import InterestPickerDialog from "./InterestPickerDialog";
import { getInterestOption, normalizeInterestKeys, type InterestKey } from "./profileInterests";

const emptyDetails: EditableProfileDetails = { bio: "", locationText: "", birthDate: "", birthdayVisibility: "hidden", showAge: false, interests: [] };
const profileSuccessToastDurationMs = 3000;
function characterCount(value: string) {
  return Array.from(value).length;
}

function currentLocalDate() {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function hasControlCharacters(value: string) {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });
}

function parseDetails(value: unknown): EditableProfileDetails {
  if (!value || typeof value !== "object") return emptyDetails;
  const row = value as Record<string, unknown>;
  const visibility = row.birthday_visibility === "month_day" || row.birthday_visibility === "full" ? row.birthday_visibility : "hidden";
  return {
    bio: typeof row.bio === "string" ? row.bio : "",
    locationText: typeof row.location_text === "string" ? row.location_text : "",
    birthDate: typeof row.birth_date === "string" ? row.birth_date : "",
    birthdayVisibility: visibility,
    showAge: row.show_age === true,
    interests: normalizeInterestKeys(row.interests),
  };
}

function ProfileDetailsSettings() {
  const shouldReduceMotion = useReducedMotion();
  const interestPickerTriggerRef = useRef<HTMLButtonElement>(null);
  const successToastTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const successToastSequenceRef = useRef(0);
  const [draft, setDraft] = useState<EditableProfileDetails>(emptyDetails);
  const [isInterestPickerOpen, setIsInterestPickerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [successToastId, setSuccessToastId] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setHasLoaded(false);
      setError("");
      const { data, error: loadError } = await supabase.rpc("get_my_profile_details");
      if (cancelled) return;
      setIsLoading(false);
      if (loadError) {
        setError("We couldn’t load your profile details. Please try again.");
        if (import.meta.env.DEV) console.warn("Loading profile details failed", { code: loadError.code });
        return;
      }
      setDraft(parseDetails(data));
      setHasLoaded(true);
    }
    void load();
    return () => { cancelled = true; };
  }, [reloadKey]);

  useEffect(() => () => {
    if (successToastTimerRef.current !== null) window.clearTimeout(successToastTimerRef.current);
  }, []);

  function dismissSuccessToast() {
    if (successToastTimerRef.current !== null) window.clearTimeout(successToastTimerRef.current);
    successToastTimerRef.current = null;
    setSuccessToastId(null);
  }

  function showSuccessToast() {
    if (successToastTimerRef.current !== null) window.clearTimeout(successToastTimerRef.current);
    successToastSequenceRef.current += 1;
    setSuccessToastId(successToastSequenceRef.current);
    successToastTimerRef.current = window.setTimeout(() => {
      setSuccessToastId(null);
      successToastTimerRef.current = null;
    }, profileSuccessToastDurationMs);
  }

  function applyInterestDraft(interests: InterestKey[]) {
    setDraft((current) => ({ ...current, interests }));
    setError("");
    setIsInterestPickerOpen(false);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving || isLoading) return;
    dismissSuccessToast();
    const bio = draft.bio.trim();
    const location = draft.locationText.trim();
    setError("");
    if (characterCount(bio) > 150 || hasControlCharacters(bio)) { setError("Bio must be plain text containing no more than 150 characters."); return; }
    if (characterCount(location) > 80 || hasControlCharacters(location)) { setError("Location must be plain text containing no more than 80 characters."); return; }
    if (draft.birthDate) {
      const minimum = "1900-01-01";
      const today = currentLocalDate();
      if (draft.birthDate < minimum || draft.birthDate > today) { setError("Choose a birthday between January 1, 1900 and today."); return; }
    }
    setIsSaving(true);
    const { data, error: saveError } = await supabase.rpc("set_profile_details", {
      candidate_bio: bio || null,
      candidate_location: location || null,
      candidate_birth_date: draft.birthDate || null,
      candidate_birthday_visibility: draft.birthDate ? draft.birthdayVisibility : "hidden",
      candidate_show_age: draft.birthDate ? draft.showAge : false,
      candidate_interests: draft.interests,
    });
    setIsSaving(false);
    if (saveError) {
      setError("We couldn’t save your profile details. Review the fields and try again.");
      if (import.meta.env.DEV) console.warn("Saving profile details failed", { code: saveError.code });
      return;
    }
    setDraft(parseDetails(data));
    showSuccessToast();
  }

  return <section aria-labelledby="profile-details-settings-heading" className="mt-5 rounded-3xl border border-border bg-background p-4 shadow-soft">
    <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent text-primary"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></svg></span><div><h2 id="profile-details-settings-heading" className="font-bold text-heading">Edit profile</h2><p className="mt-1 text-xs leading-5 text-body">Choose the details accepted contacts can see.</p></div></div>
    {isLoading ? <div role="status" aria-live="polite" className="mt-4 rounded-2xl bg-surface px-4 py-5 text-sm text-body">Loading profile details…</div> : !hasLoaded ? <div role="alert" className="mt-4 rounded-2xl border border-border bg-surface px-4 py-4 text-sm leading-6 text-body"><p>{error || "We couldn’t load your profile details."}</p><button type="button" onClick={() => setReloadKey((key) => key + 1)} className="mt-3 min-h-10 rounded-xl px-3 font-semibold text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">Retry</button></div> : <form onSubmit={(event) => void save(event)} className="mt-5 space-y-5">
      <div><div className="flex items-center justify-between gap-3"><label htmlFor="profile-bio" className="text-sm font-semibold text-heading">Bio</label><span className="text-xs text-muted" aria-label={`${characterCount(draft.bio)} of 150 characters`}>{characterCount(draft.bio)} / 150</span></div><textarea id="profile-bio" value={draft.bio} onChange={(event) => { setDraft((current) => ({ ...current, bio: event.target.value })); setError(""); }} rows={3} disabled={isSaving} placeholder="A little about you" className="mt-2 min-h-24 w-full resize-y rounded-2xl border border-border bg-surface px-3 py-3 text-sm leading-6 text-heading outline-none placeholder:text-muted focus:border-primary focus:ring-4 focus:ring-accent-hover disabled:opacity-60" /></div>
      <div><div className="flex items-center justify-between gap-3"><label htmlFor="profile-location" className="text-sm font-semibold text-heading">General location</label><span className="text-xs text-muted" aria-label={`${characterCount(draft.locationText)} of 80 characters`}>{characterCount(draft.locationText)} / 80</span></div><input id="profile-location" type="text" value={draft.locationText} onChange={(event) => { setDraft((current) => ({ ...current, locationText: event.target.value })); setError(""); }} disabled={isSaving} placeholder="Vigan City, Philippines" className="mt-2 min-h-11 w-full rounded-2xl border border-border bg-surface px-3 text-sm text-heading outline-none placeholder:text-muted focus:border-primary focus:ring-4 focus:ring-accent-hover disabled:opacity-60" /></div>
      <fieldset className="rounded-2xl border border-border p-3"><legend className="px-1 text-sm font-semibold text-heading">Birthday privacy</legend><label htmlFor="profile-birthday" className="mt-2 block text-xs font-semibold text-body">Birthday</label><input id="profile-birthday" type="date" min="1900-01-01" max={currentLocalDate()} value={draft.birthDate} onChange={(event) => setDraft((current) => ({ ...current, birthDate: event.target.value, birthdayVisibility: event.target.value ? current.birthdayVisibility : "hidden", showAge: event.target.value ? current.showAge : false }))} disabled={isSaving} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-heading outline-none focus:border-primary focus:ring-4 focus:ring-accent-hover disabled:opacity-60" /><label htmlFor="profile-birthday-visibility" className="mt-4 block text-xs font-semibold text-body">Show birthday</label><select id="profile-birthday-visibility" value={draft.birthdayVisibility} onChange={(event) => setDraft((current) => ({ ...current, birthdayVisibility: event.target.value as BirthdayVisibility }))} disabled={isSaving || !draft.birthDate} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-heading outline-none focus:border-primary focus:ring-4 focus:ring-accent-hover disabled:opacity-50"><option value="hidden">Hidden</option><option value="month_day">Month & day</option><option value="full">Full birthday</option></select><div className="mt-3 flex items-center gap-3"><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-heading">Show age</p><p className="mt-1 text-xs leading-5 text-body">Age is calculated from your birthday; the date stays hidden unless enabled above.</p></div><button type="button" role="switch" aria-checked={draft.showAge} aria-label="Show age" disabled={isSaving || !draft.birthDate} onClick={() => setDraft((current) => ({ ...current, showAge: !current.showAge }))} className={`relative h-7 w-12 shrink-0 rounded-full border transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:opacity-50 ${draft.showAge ? "border-primary bg-primary" : "border-border bg-card"}`}><span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-soft transition-transform ${draft.showAge ? "translate-x-5" : "translate-x-0"}`} /></button></div></fieldset>
      <section aria-labelledby="profile-interests-settings-heading"><h3 id="profile-interests-settings-heading" className="text-sm font-semibold text-heading">Interests</h3>{draft.interests.length === 0 ? <p className="mt-1 text-xs leading-5 text-body">Tell people what you’re into.</p> : <ul aria-label="Selected interests" className="mt-3 flex flex-wrap gap-2">{draft.interests.map((interestKey) => { const option = getInterestOption(interestKey); if (!option) return null; return <li key={option.key} className="inline-flex max-w-full items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-heading"><InterestIcon icon={option.icon} className="h-3.5 w-3.5 shrink-0 text-primary" /><span className="break-words">{option.label}</span></li>; })}</ul>}<button ref={interestPickerTriggerRef} type="button" onClick={() => setIsInterestPickerOpen(true)} disabled={isSaving} aria-haspopup="dialog" aria-expanded={isInterestPickerOpen} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-heading transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:opacity-50"><span>{draft.interests.length === 0 ? "Choose interests" : "Change interests"}</span><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-primary" aria-hidden="true"><path d="m7 4 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg></button></section>
      {error && <div role="alert" className="rounded-2xl border border-primary/25 bg-accent px-3 py-2.5 text-xs leading-5 text-body">{error}</div>}
      <button type="submit" disabled={isSaving} className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:opacity-60">{isSaving ? "Saving…" : "Save changes"}</button>
    </form>}
    {isInterestPickerOpen && <InterestPickerDialog initialInterests={draft.interests} returnFocusRef={interestPickerTriggerRef} onClose={() => setIsInterestPickerOpen(false)} onSave={applyInterestDraft} />}
    <div className="pointer-events-none fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-[120] w-[min(calc(100%-2rem),22rem)] -translate-x-1/2"><AnimatePresence initial={false}>{successToastId !== null && <motion.div key={successToastId} role="status" aria-live="polite" aria-atomic="true" initial={shouldReduceMotion ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }} transition={{ duration: shouldReduceMotion ? 0 : 0.16 }} className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 text-center text-sm font-semibold text-heading shadow-soft"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-primary"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true"><path d="m4 10 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" /></svg></span><span>Profile updated successfully</span></motion.div>}</AnimatePresence></div>
  </section>;
}

export default ProfileDetailsSettings;
