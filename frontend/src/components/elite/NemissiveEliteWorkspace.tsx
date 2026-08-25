import { useEffect, useRef, useState } from "react";
import {
  eliteComparisonPlans,
  type EliteComparisonPlan,
} from "./eliteFeatures";
import type { PremiumAccessState } from "../dashboard/premiumAccess";

type NemissiveEliteWorkspaceProps = {
  premiumAccess: PremiumAccessState;
  onBack: () => void;
};

function BackIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EliteMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      className={className}
      aria-hidden="true"
    >
      <path
        d="m12 3.5 7 5-2.7 8.2L12 20.5l-4.3-3.8L5 8.5l7-5Z"
        strokeLinejoin="round"
      />
      <path d="m5 8.5 7 3 7-3M12 11.5v9" strokeLinejoin="round" />
    </svg>
  );
}

function NemissiveMark() {
  return (
    <span
      className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent text-sm font-bold text-primary"
      aria-hidden="true"
    >
      N
    </span>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="m4 10 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlanCard({
  plan,
  eliteActive,
  billingMessage,
  onUpgrade,
}: {
  plan: EliteComparisonPlan;
  eliteActive: boolean;
  billingMessage: string;
  onUpgrade: () => void;
}) {
  const isElite = plan.id === "elite";

  return (
    <article
      className={`flex h-full min-w-0 flex-col rounded-[2rem] border p-5 sm:p-7 ${isElite ? "border-primary/40 bg-surface shadow-soft ring-1 ring-primary/10" : "border-border bg-card"}`}
      aria-labelledby={`${plan.id}-plan-title`}
    >
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2
            id={`${plan.id}-plan-title`}
            className="text-xl font-bold tracking-tight text-heading sm:text-2xl"
          >
            {plan.productName}
          </h2>
          <p className="mt-1 text-sm font-semibold text-primary">
            {plan.tierLabel}
          </p>
        </div>
        {isElite ? (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent text-primary">
            <EliteMark />
          </span>
        ) : (
          <NemissiveMark />
        )}
      </header>

      <p className="mt-5 text-sm leading-6 text-body">{plan.description}</p>

      <div className="mt-6 border-t border-border pt-5">
        <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-muted">
          {plan.benefitsHeading}
        </h3>
        <ul className="mt-4 space-y-3">
          {plan.benefits.map((benefit) => (
            <li
              key={benefit}
              className="flex items-start gap-3 text-sm leading-6 text-body"
            >
              <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                <CheckIcon />
              </span>
              <span>{benefit}</span>
            </li>
          ))}
        </ul>
      </div>

      <footer className="mt-auto pt-8">
        {isElite ? (
          eliteActive ? (
            <div className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-accent px-5 py-3 text-sm font-bold text-heading" role="status">
              <CheckIcon />
              Elite active
            </div>
          ) : (
            <button
              type="button"
              onClick={onUpgrade}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-white shadow-soft transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover"
            >
              Upgrade to Elite
            </button>
          )
        ) : (
          <div className="flex min-h-12 items-center justify-center rounded-2xl border border-border bg-background px-5 py-3 text-center text-sm font-semibold text-heading">
            Included with Nemissive
          </div>
        )}

        <p
          className="mt-3 min-h-1 text-center text-xs font-medium text-body"
          role={isElite && !eliteActive ? "status" : undefined}
          aria-live={isElite && !eliteActive ? "polite" : undefined}
          aria-hidden={!isElite || eliteActive}
        >
          {isElite && !eliteActive ? billingMessage : ""}
        </p>
      </footer>
    </article>
  );
}

function NemissiveEliteWorkspace({ premiumAccess, onBack }: NemissiveEliteWorkspaceProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [billingMessage, setBillingMessage] = useState("");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() =>
      headingRef.current?.focus(),
    );
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function handleUpgradeToElite() {
    setBillingMessage("Elite billing is coming soon.");
  }

  return (
    <main
      className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-background"
      aria-labelledby="nemissive-elite-title"
    >
      <header className="shrink-0 border-b border-border bg-surface pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-4 px-3 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl px-3 text-sm font-semibold text-heading transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover"
          >
            <BackIcon />
            <span>Back to Nemissive</span>
          </button>
          <div className="hidden items-center gap-2 text-sm font-bold text-heading sm:flex">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-accent text-primary">
              <EliteMark />
            </span>
            <span>Nemissive Elite</span>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain">
        <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col justify-center px-4 pb-[max(3rem,env(safe-area-inset-bottom))] pt-8 sm:px-6 sm:py-12 lg:px-8">
          <section
            className="text-center"
            aria-labelledby="nemissive-elite-title"
          >
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-primary">
              <EliteMark className="h-6 w-6" />
            </span>
            <h1
              ref={headingRef}
              id="nemissive-elite-title"
              tabIndex={-1}
              className="mt-5 text-xs font-bold uppercase tracking-[0.22em] text-primary outline-none"
            >
              Nemissive Elite
            </h1>
            <p className="mt-3 text-2xl font-bold tracking-tight text-heading sm:text-3xl">
              Choose your Nemissive experience.
            </p>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-body">
              Keep everything you value in Nemissive, with more ways to make it
              your own planned for Elite.
            </p>
          </section>

          <section
            className="mt-8 grid items-stretch gap-5 md:grid-cols-2"
            aria-label="Nemissive plan comparison"
          >
            {eliteComparisonPlans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                eliteActive={premiumAccess.eliteActive}
                billingMessage={billingMessage}
                onUpgrade={handleUpgradeToElite}
              />
            ))}
          </section>
        </div>
      </div>
    </main>
  );
}

export default NemissiveEliteWorkspace;
