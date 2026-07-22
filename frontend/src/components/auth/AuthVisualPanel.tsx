import { motion, useReducedMotion, type Transition } from "motion/react";
import AnimatedConversation from "./AnimatedConversation";

const slowFloat: Transition = {
  duration: 6.8,
  repeat: Infinity,
  repeatType: "mirror",
  ease: "easeInOut",
};

const slowerFloat: Transition = {
  duration: 8.4,
  repeat: Infinity,
  repeatType: "mirror",
  ease: "easeInOut",
};

function AuthVisualPanel() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <aside aria-label="About Nemissive" className="group relative hidden min-w-0 overflow-hidden bg-accent lg:flex lg:h-screen lg:min-h-0 lg:items-center lg:px-10 xl:px-16 xl:py-12">
      <div className="absolute -left-16 -top-20 h-56 w-56 rounded-full border border-border bg-surface/50" aria-hidden="true" />
      <div className="absolute -bottom-24 right-10 h-64 w-64 rounded-full border border-border bg-surface/40" aria-hidden="true" />
      <motion.div animate={shouldReduceMotion ? undefined : { x: [0, 8, 0], y: [0, -5, 0], opacity: [0.5, 0.8, 0.5] }} transition={slowerFloat} className="absolute right-12 top-10 h-4 w-4 rounded-full bg-primary/20" aria-hidden="true" />
      <motion.div animate={shouldReduceMotion ? undefined : { x: [0, -6, 0], y: [0, 7, 0], opacity: [0.55, 0.85, 0.55] }} transition={slowFloat} className="absolute bottom-16 left-16 h-7 w-7 rounded-full border border-primary/20" aria-hidden="true" />

      <div className="relative z-10 mx-auto flex h-full w-full max-w-2xl flex-col-reverse items-center justify-center gap-6 xl:gap-10">
        <div className="max-w-lg shrink-0 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">A quieter place to connect</p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-heading xl:text-4xl">Made for meaningful conversations.</h2>
          <p className="mt-4 text-base leading-7 text-body">Simple, personal messaging for the people who matter.</p>
        </div>

        <div className="relative h-[280px] w-full max-w-lg shrink-0 xl:h-[360px]" aria-hidden="true">
          <motion.div animate={shouldReduceMotion ? undefined : { scale: [1, 1.025, 1], opacity: [0.55, 0.72, 0.55] }} transition={{ duration: 9, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }} className="absolute left-1/2 top-1/2 h-52 w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface/60 xl:h-64 xl:w-[420px]" />

          <div className="absolute left-1/2 top-1/2 w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-border bg-card p-4 shadow-soft transition-transform duration-500 group-hover:scale-[1.01] xl:w-[360px] xl:p-5">
            <div className="flex items-center gap-3 border-b border-border pb-4">
              <motion.div animate={shouldReduceMotion ? undefined : { y: [0, -5, 0] }} transition={slowerFloat} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-white">A</motion.div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-heading">Alex Rivera</p>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-online" />
                  <span className="text-xs text-muted">Here with you</span>
                </div>
              </div>
              <div className="flex gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-muted/50" />
                <span className="h-1.5 w-1.5 rounded-full bg-muted/50" />
                <span className="h-1.5 w-1.5 rounded-full bg-muted/50" />
              </div>
            </div>

            <AnimatedConversation />

            <div className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3">
              <span className="flex-1 text-sm text-muted">Write a message</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-white">→</span>
            </div>
          </div>

          <motion.div animate={shouldReduceMotion ? undefined : { x: [0, 5, 0], y: [0, -8, 0] }} transition={slowFloat} className="absolute -left-1 top-8 flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 shadow-soft">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-xs font-semibold text-white">J</div>
            <div>
              <p className="text-xs font-semibold text-heading">Jonel</p>
              <p className="text-xs text-muted">Thinking of you</p>
            </div>
          </motion.div>

          <motion.div animate={shouldReduceMotion ? undefined : { x: [0, -4, 0], y: [0, 7, 0] }} transition={slowerFloat} className="absolute -right-1 bottom-8 flex max-w-44 items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 shadow-soft xl:bottom-12">
            <span className="h-2 w-2 shrink-0 rounded-full bg-online" />
            <p className="truncate text-xs font-medium text-body">A new message is waiting</p>
          </motion.div>
        </div>
      </div>
    </aside>
  );
}

export default AuthVisualPanel;
