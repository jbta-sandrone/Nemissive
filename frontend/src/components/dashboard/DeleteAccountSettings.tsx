import { AnimatePresence } from "motion/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";
import ConfirmationDialog from "./ConfirmationDialog";

type CredentialState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "provider-only"; provider: string }
  | { status: "password"; email: string; userId: string };

type Props = {
  onDeleted: () => void;
};

function providerLabel(provider: string) {
  const labels: Record<string, string> = { google: "Google", github: "GitHub", azure: "Microsoft", apple: "Apple" };
  return labels[provider] ?? provider.charAt(0).toLocaleUpperCase() + provider.slice(1);
}

function DeleteIcon({ className = "h-5 w-5" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" strokeLinecap="round" strokeLinejoin="round" /><path d="M10 11v5M14 11v5" strokeLinecap="round" /></svg>;
}

async function getFunctionErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "context" in error) {
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === "function") {
      try {
        const body = await context.json() as { error?: unknown };
        if (typeof body.error === "string" && body.error) return body.error;
      } catch {
        // Fall through to the intentionally generic lifecycle error.
      }
    }
  }
  return "We couldn’t delete your account. Please try again.";
}

function DeleteAccountSettings({ onDeleted }: Props) {
  const [credential, setCredential] = useState<CredentialState>({ status: "loading" });
  const [currentPassword, setCurrentPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState("");
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const submissionRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data, error: userError }) => {
      if (cancelled) return;
      const user = data.user;
      if (userError || !user) { setCredential({ status: "error" }); return; }
      const identityProviders = (user.identities ?? []).map((identity) => identity.provider);
      const configuredProviders = Array.isArray(user.app_metadata.providers) ? user.app_metadata.providers.filter((provider): provider is string => typeof provider === "string") : [];
      const providers = [...new Set([...identityProviders, ...configuredProviders, typeof user.app_metadata.provider === "string" ? user.app_metadata.provider : ""].filter(Boolean))];
      if (!providers.includes("email") || !user.email) {
        setCredential({ status: "provider-only", provider: providerLabel(providers.find((provider) => provider !== "email") ?? "provider") });
        return;
      }
      setCredential({ status: "password", email: user.email, userId: user.id });
    });
    return () => { cancelled = true; };
  }, []);

  async function verifyAndOpenConfirmation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (credential.status !== "password" || !currentPassword || !acknowledged || isVerifying || isDeleting) return;
    setIsVerifying(true);
    setError("");
    const { data, error: reauthenticationError } = await supabase.auth.signInWithPassword({ email: credential.email, password: currentPassword });
    setIsVerifying(false);
    if (reauthenticationError || data.user?.id !== credential.userId) {
      const authMessage = (reauthenticationError?.message ?? "").toLocaleLowerCase();
      setError(authMessage.includes("invalid login") || authMessage.includes("invalid credentials") ? "Current password is incorrect." : "We couldn’t verify your password. Check your connection and try again.");
      return;
    }
    setDialogOpen(true);
  }

  async function confirmDeletion() {
    if (submissionRef.current || credential.status !== "password") return;
    submissionRef.current = true;
    setIsDeleting(true);
    setError("");

    const { data, error: deletionError } = await supabase.functions.invoke("delete-account", { body: { current_password: currentPassword } });
    if (deletionError || !data || data.deleted !== true) {
      const message = deletionError ? await getFunctionErrorMessage(deletionError) : "We couldn’t delete your account. Please try again.";
      submissionRef.current = false;
      setIsDeleting(false);
      setError(message);
      return;
    }

    await supabase.auth.signOut({ scope: "local" });
    onDeleted();
  }

  if (credential.status === "loading") return <div role="status" aria-live="polite" className="rounded-3xl border border-border bg-background px-4 py-6 text-sm text-body shadow-soft">Checking your sign-in method…</div>;
  if (credential.status === "error") return <div role="alert" className="rounded-3xl border border-border bg-background px-4 py-6 text-sm leading-6 text-body shadow-soft">We couldn’t verify your account’s sign-in method. Refresh and try again.</div>;
  if (credential.status === "provider-only") return <div className="rounded-3xl border border-border bg-background p-4 shadow-soft"><h2 className="font-semibold text-heading">Account deletion unavailable</h2><p className="mt-2 text-sm leading-6 text-body">This account uses {credential.provider} sign-in. Secure provider reauthentication for permanent account deletion isn’t available yet.</p></div>;

  return <>
    <form onSubmit={verifyAndOpenConfirmation} aria-busy={isVerifying || isDeleting} className="space-y-5">
      <section aria-labelledby="delete-account-warning-heading" className="rounded-3xl border border-primary/30 bg-background p-4 shadow-soft sm:p-5">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-primary"><DeleteIcon /></div>
        <h2 id="delete-account-warning-heading" className="mt-4 text-lg font-semibold text-heading">Deleting your Nemissive account is permanent.</h2>
        <p className="mt-2 text-sm leading-6 text-body">Your profile and account information will be removed. People you’ve messaged may still retain the conversation history and messages you shared with them.</p>
        <ul className="mt-4 space-y-2 text-sm leading-6 text-body"><li>• You won’t be able to sign in again.</li><li>• Your profile, details, preferences, and avatar will be removed.</li><li>• Shared conversation history may remain visible to other participants.</li></ul>
      </section>

      <section className="rounded-3xl border border-border bg-background p-4 shadow-soft sm:p-5">
        <label htmlFor="delete-account-current-password" className="mb-2 block text-sm font-semibold text-heading">Current password</label>
        <div className="relative">
          <input id="delete-account-current-password" type={passwordVisible ? "text" : "password"} autoComplete="current-password" value={currentPassword} onChange={(event) => { setCurrentPassword(event.target.value); setError(""); }} disabled={isVerifying || isDeleting} required aria-invalid={error === "Current password is incorrect."} aria-describedby={error ? "delete-account-error" : "delete-account-password-help"} className="min-h-12 w-full rounded-2xl border border-border bg-surface py-3 pl-4 pr-20 text-base text-heading outline-none transition focus:border-primary focus:ring-4 focus:ring-accent-hover disabled:cursor-wait disabled:opacity-60" />
          <button type="button" onClick={() => setPasswordVisible((visible) => !visible)} aria-label={passwordVisible ? "Hide current password" : "Show current password"} aria-controls="delete-account-current-password" disabled={isVerifying || isDeleting} className="absolute right-2 top-1/2 min-h-10 -translate-y-1/2 rounded-xl px-3 text-sm font-semibold text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:opacity-60">{passwordVisible ? "Hide" : "Show"}</button>
        </div>
        <p id="delete-account-password-help" className="mt-2 text-xs leading-5 text-muted">Your password is verified through Supabase Auth and is never stored by Nemissive.</p>

        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-surface px-4 py-3 focus-within:ring-4 focus-within:ring-accent-hover">
          <input type="checkbox" checked={acknowledged} onChange={(event) => { setAcknowledged(event.target.checked); setError(""); }} disabled={isVerifying || isDeleting} className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-primary)]" />
          <span className="text-sm font-medium leading-6 text-heading">I understand that account deletion is permanent.</span>
        </label>

        {error && <p id="delete-account-error" role="alert" aria-live="assertive" className="mt-4 rounded-2xl border border-primary/25 bg-accent px-3 py-2.5 text-sm leading-6 text-heading">{error}</p>}
      </section>

      <button ref={deleteButtonRef} type="submit" disabled={!currentPassword || !acknowledged || isVerifying || isDeleting} className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-50">{isVerifying ? "Verifying password…" : "Delete my account"}</button>
    </form>

    <AnimatePresence>{dialogOpen && <ConfirmationDialog dialogId="delete-account" title="Delete your Nemissive account?" description="This cannot be undone. Your profile will be removed, but people you’ve messaged may still retain shared conversation history." confirmLabel="Delete account" pendingLabel="Deleting account…" pendingAnnouncement="Permanently deleting your Nemissive account." icon={<DeleteIcon />} error={error} isPending={isDeleting} returnFocusRef={deleteButtonRef} onCancel={() => { if (!isDeleting) { setDialogOpen(false); setError(""); } }} onConfirm={() => void confirmDeletion()} />}</AnimatePresence>
  </>;
}

export default DeleteAccountSettings;
