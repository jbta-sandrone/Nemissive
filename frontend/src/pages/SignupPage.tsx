import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { PASSWORD_REQUIREMENTS, validatePassword } from "../lib/passwordPolicy";
import { supabase } from "../lib/supabase";

function SignUp() {
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const isSubmittingRef = useRef(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);

  const passwordPolicy = validatePassword(password);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const passwordMismatch = confirmPassword.length > 0 && !passwordsMatch;
  const canSubmit = email.length > 0 && password.length > 0 && confirmPassword.length > 0 && passwordPolicy.valid && passwordsMatch && !isLoading;

  function handlePasswordChange(value: string) {
    setPassword(value);
    setPasswordError("");
  }

  function handleConfirmPasswordChange(value: string) {
    setConfirmPassword(value);
  }

  function normalizeSignUpError(error: { code?: string; message: string }) {
    const message = error.message.toLocaleLowerCase();
    if (error.code === "weak_password" || message.includes("weak password") || message.includes("password should")) return "Supabase rejected this password as too weak. Choose a stronger password.";
    return error.message;
  }

  async function handleSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmittingRef.current) return;

    setMessage("");
    setIsError(false);

    const submittedPolicy = validatePassword(password);
    if (!submittedPolicy.valid) {
      setPasswordError("Password does not meet all Nemissive requirements.");
      passwordRef.current?.focus();
      return;
    }

    if (!passwordsMatch) {
      confirmPasswordRef.current?.focus();
      return;
    }

    setPasswordError("");
    isSubmittingRef.current = true;
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setIsError(true);
        setMessage(normalizeSignUpError(error));
        return;
      }

      setMessage("Account created! Please check your email to verify your account.");
    } finally {
      isSubmittingRef.current = false;
      setIsLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-8">
        <p className="text-sm font-semibold text-primary">Your conversations, your space</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-heading sm:text-4xl">Create your account</h1>
        <p className="mt-3 text-base leading-7 text-body">Start meaningful conversations in a space that feels personal.</p>
      </div>

      {message && isError && (
        <div role="alert" aria-live="polite" className="mb-6 rounded-2xl border border-primary/25 bg-accent px-4 py-3 text-sm leading-6 text-body">
          <p className="font-semibold text-heading">We couldn’t create your account</p>
          <p className="mt-1">{message}</p>
        </div>
      )}

      {message && !isError && (
        <div role="status" aria-live="polite" className="mb-6 rounded-2xl border border-online/40 bg-background px-4 py-3 text-sm leading-6 text-body">
          <p className="font-semibold text-heading">Check your inbox</p>
          <p className="mt-1">{message}</p>
        </div>
      )}

      <form onSubmit={handleSignUp} aria-busy={isLoading} className="space-y-5">
        <div>
          <label htmlFor="signup-email" className="mb-2 block text-sm font-semibold text-heading">Email address</label>
          <input id="signup-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required disabled={isLoading} className="min-h-12 w-full rounded-2xl border border-border bg-background px-4 py-3.5 text-base text-heading outline-none transition placeholder:text-muted focus:border-primary focus:bg-card focus:ring-4 focus:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-60" />
        </div>

        <div>
          <label htmlFor="signup-password" className="mb-2 block text-sm font-semibold text-heading">Password</label>
          <div className="relative">
            <input ref={passwordRef} id="signup-password" type={isPasswordVisible ? "text" : "password"} autoComplete="new-password" value={password} onChange={(event) => handlePasswordChange(event.target.value)} required disabled={isLoading} aria-invalid={Boolean(passwordError) || (password.length > 0 && !passwordPolicy.valid)} aria-describedby={`signup-password-strength signup-password-requirements${passwordError ? " signup-password-error" : ""}`} className="min-h-12 w-full rounded-2xl border border-border bg-background py-3.5 pl-4 pr-20 text-base text-heading outline-none transition focus:border-primary focus:bg-card focus:ring-4 focus:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-60" />
            <button type="button" onClick={() => setIsPasswordVisible((isVisible) => !isVisible)} aria-label={isPasswordVisible ? "Hide password" : "Show password"} aria-controls="signup-password" className="absolute right-2 top-1/2 min-h-10 -translate-y-1/2 rounded-xl px-3 text-sm font-semibold text-primary outline-none transition hover:bg-accent hover:text-primary-hover focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-60" disabled={isLoading}>{isPasswordVisible ? "Hide" : "Show"}</button>
          </div>
          <div id="signup-password-strength" role="status" aria-live="polite" aria-atomic="true" className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-background px-3 py-2.5"><span className="text-xs font-semibold text-body">Password strength</span><span className="text-xs font-bold text-heading">{password ? passwordPolicy.strength : "Not entered"}</span></div>
          <div id="signup-password-requirements" className="mt-3"><p className="text-xs font-semibold text-heading">Password must include:</p><ul className="mt-2 grid gap-2 sm:grid-cols-2">{PASSWORD_REQUIREMENTS.map((requirement) => { const met = passwordPolicy.rules[requirement.key]; return <li key={requirement.key} className="flex min-w-0 items-center gap-2 text-xs leading-5 text-body"><span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${met ? "border-primary bg-accent text-primary" : "border-border text-muted"}`} aria-hidden="true">{met ? <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3"><path d="m3 8 3 3 7-7" strokeLinecap="round" strokeLinejoin="round" /></svg> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}</span><span><span className="sr-only">{met ? "Requirement met: " : "Requirement not met: "}</span>{requirement.label}</span></li>; })}</ul></div>
          {passwordError && <p id="signup-password-error" role="alert" className="mt-2 text-sm font-medium text-primary">{passwordError}</p>}
        </div>

        <div>
          <label htmlFor="signup-confirm-password" className="mb-2 block text-sm font-semibold text-heading">Confirm password</label>
          <div className="relative"><input ref={confirmPasswordRef} id="signup-confirm-password" type={isConfirmPasswordVisible ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(event) => handleConfirmPasswordChange(event.target.value)} required disabled={isLoading} aria-invalid={passwordMismatch || undefined} aria-describedby={passwordMismatch ? "signup-confirm-password-error" : undefined} className="min-h-12 w-full rounded-2xl border border-border bg-background py-3.5 pl-4 pr-20 text-base text-heading outline-none transition focus:border-primary focus:bg-card focus:ring-4 focus:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-60" /><button type="button" onClick={() => setIsConfirmPasswordVisible((isVisible) => !isVisible)} aria-label={isConfirmPasswordVisible ? "Hide confirm password" : "Show confirm password"} aria-controls="signup-confirm-password" className="absolute right-2 top-1/2 min-h-10 -translate-y-1/2 rounded-xl px-3 text-sm font-semibold text-primary outline-none transition hover:bg-accent hover:text-primary-hover focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-60" disabled={isLoading}>{isConfirmPasswordVisible ? "Hide" : "Show"}</button></div>
          {passwordMismatch && <p id="signup-confirm-password-error" role="alert" className="mt-2 text-sm font-medium text-primary">Passwords do not match.</p>}
        </div>

        <button type="submit" disabled={!canSubmit} className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-primary px-5 py-3.5 text-sm font-semibold text-white shadow-soft outline-none transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-lg focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60 disabled:shadow-soft">{isLoading ? "Creating account..." : "Create account"}</button>
      </form>

      <p className="mt-8 text-center text-sm text-body">Already have an account? <Link to="/login" className="font-semibold text-primary outline-none transition hover:text-primary-hover hover:underline focus-visible:rounded-md focus-visible:ring-4 focus-visible:ring-accent-hover">Sign in</Link></p>
    </div>
  );
}

export default SignUp;
