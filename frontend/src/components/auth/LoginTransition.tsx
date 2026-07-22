import { useEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform, type Transition } from "motion/react";

type LoginTransitionProps = {
  onComplete: () => void;
};

const flightDurationSeconds = 3.5;
const mailboxReactionSeconds = 0.35;
const screenFadeSeconds = 0.25;
const reducedFlightSeconds = 1.35;
const reducedReactionSeconds = 0.25;

const flightTransition: Transition = {
  duration: flightDurationSeconds,
  ease: [0.22, 1, 0.36, 1],
};

function PaperAirplane() {
  return (
    <svg viewBox="0 0 96 96" fill="none" className="h-14 w-14 text-primary sm:h-[72px] sm:w-[72px]" aria-hidden="true">
      <path d="M11 43.5 82 15 62.5 80 44 57.5 28 69l4.5-18.5L11 43.5Z" fill="currentColor" />
      <path d="m32.5 50.5 49.5-35.5-38 42.5L28 69l4.5-18.5Z" fill="currentColor" className="text-primary-hover" />
      <path d="m32.5 50.5 30 29.5L44 57.5 82 15 32.5 50.5Z" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-surface" />
    </svg>
  );
}

function Mailbox({ hasArrived, reactionDuration }: { hasArrived: boolean; reactionDuration: number }) {
  return (
    <motion.div animate={hasArrived ? { scale: [1, 1.07, 0.98, 1], y: [0, -4, 1, 0] } : { scale: 1, y: 0 }} transition={{ duration: reactionDuration, ease: "easeOut" }} className="relative h-[76px] w-[72px] origin-bottom sm:h-[102px] sm:w-24">
      <svg viewBox="0 0 120 128" fill="none" className="h-full w-full" aria-hidden="true">
        <path d="M54 73h16v48H54z" fill="currentColor" className="text-primary-hover" />
        <path d="M18 72V46c0-18 14-32 32-32h27c15 0 27 12 27 27v31H18Z" fill="currentColor" className="text-primary" />
        <path d="M70 72V42c0-15 11-27 25-29 6 6 9 15 9 28v31H70Z" fill="currentColor" className="text-primary-hover" />
        <path d="M76 53h27v19H76z" fill="currentColor" className="text-heading/15" />
        <path d="M18 72h86" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="text-heading/20" />
        <motion.g animate={hasArrived ? { y: [12, 0, 0] } : { y: 12 }} transition={{ duration: reactionDuration, ease: "easeOut" }}>
          <path d="M58 19v35" stroke="currentColor" strokeWidth="5" strokeLinecap="round" className="text-heading" />
          <path d="M60 19h24v14H60z" fill="currentColor" className="text-primary" />
        </motion.g>
      </svg>
    </motion.div>
  );
}

function LoginTransition({ onComplete }: LoginTransitionProps) {
  const shouldReduceMotion = useReducedMotion();
  const sceneRef = useRef<HTMLDivElement>(null);
  const airplaneRef = useRef<HTMLDivElement>(null);
  const mailboxRef = useRef<HTMLDivElement>(null);
  const hasCompletedRef = useRef(false);
  const [hasArrived, setHasArrived] = useState(false);
  const flightProgress = useMotionValue(shouldReduceMotion ? 0.92 : 0);
  const flightDistance = useMotionValue(0);
  const airplaneX = useTransform(() => flightProgress.get() * flightDistance.get());
  const airplaneY = useTransform(flightProgress, [0, 0.2, 0.48, 0.72, 0.9, 1], [0, -8, -20, -11, 3, 0]);
  const airplaneRotate = useTransform(flightProgress, [0, 0.25, 0.52, 0.78, 1], [-2, -1, 2, -1, 0]);
  const airplaneOpacity = useTransform(flightProgress, [0, 0.9, 1], [1, 1, 0]);
  const trailOpacity = useTransform(flightProgress, [0, 0.12, 0.88, 1], [0, 0.45, 0.35, 0]);
  const activeFlightDuration = shouldReduceMotion ? reducedFlightSeconds : flightDurationSeconds;
  const activeReactionDuration = shouldReduceMotion ? reducedReactionSeconds : mailboxReactionSeconds;
  const arrivalPhaseDuration = activeReactionDuration + screenFadeSeconds;
  const fadeStart = activeReactionDuration / arrivalPhaseDuration;

  useEffect(() => {
    const scene = sceneRef.current;
    const airplane = airplaneRef.current;
    const mailbox = mailboxRef.current;

    if (!scene || !airplane || !mailbox) return;

    const measuredScene = scene;
    const measuredAirplane = airplane;
    const measuredMailbox = mailbox;

    function updateFlightDistance() {
      const sceneWidth = measuredScene.getBoundingClientRect().width;
      const airplaneWidth = measuredAirplane.getBoundingClientRect().width;
      const mailboxWidth = measuredMailbox.getBoundingClientRect().width;

      flightDistance.set(Math.max(0, sceneWidth - mailboxWidth - airplaneWidth * 0.55));
    }

    updateFlightDistance();

    const resizeObserver = new ResizeObserver(updateFlightDistance);
    resizeObserver.observe(scene);

    return () => resizeObserver.disconnect();
  }, [flightDistance]);

  useEffect(() => {
    flightProgress.set(shouldReduceMotion ? 0.92 : 0);

    const flightAnimation = animate(flightProgress, 1, {
      ...(shouldReduceMotion ? { duration: activeFlightDuration, ease: "easeOut" } : flightTransition),
      onComplete: () => setHasArrived(true),
    });

    return () => {
      flightAnimation.stop();
    };
  }, [activeFlightDuration, flightProgress, shouldReduceMotion]);

  useEffect(() => {
    if (!hasArrived) return;

    const navigationTimer = window.setTimeout(() => {
      if (hasCompletedRef.current) return;

      hasCompletedRef.current = true;
      onComplete();
    }, arrivalPhaseDuration * 1000);

    return () => window.clearTimeout(navigationTimer);
  }, [arrivalPhaseDuration, hasArrived, onComplete]);

  return (
    <motion.div initial={{ opacity: 1 }} animate={hasArrived ? { opacity: [1, 1, 0] } : { opacity: 1 }} transition={hasArrived ? { duration: arrivalPhaseDuration, times: [0, fadeStart, 1], ease: "easeInOut" } : { duration: 0 }} className="fixed inset-0 z-[100] flex min-h-screen w-full items-center justify-center overflow-hidden bg-background px-4 py-5 sm:px-6 sm:py-8">
      <div className="absolute -left-16 top-8 h-40 w-40 rounded-full border border-border bg-accent/50 sm:h-56 sm:w-56" aria-hidden="true" />
      <div className="absolute -bottom-24 -right-16 h-52 w-52 rounded-full border border-border bg-surface sm:h-64 sm:w-64" aria-hidden="true" />

      <div role="status" aria-live="polite" className="relative z-10 w-full max-w-2xl text-center">
        <div ref={sceneRef} className="relative mx-auto h-32 w-full sm:h-40">
          <motion.svg viewBox="0 0 640 130" preserveAspectRatio="none" className="absolute inset-x-6 top-7 h-20 w-[calc(100%-3rem)] text-primary/40 sm:inset-x-10 sm:top-8 sm:h-24 sm:w-[calc(100%-5rem)]" aria-hidden="true">
            <motion.path d="M18 88 C150 20 286 20 400 68 C482 103 550 88 622 53" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="3 11" style={{ pathLength: flightProgress, opacity: trailOpacity }} />
          </motion.svg>

          <motion.div ref={airplaneRef} style={{ x: airplaneX, y: shouldReduceMotion ? 0 : airplaneY, rotate: shouldReduceMotion ? 0 : airplaneRotate, opacity: airplaneOpacity }} className="absolute left-0 top-8 z-20 h-14 w-14 drop-shadow-sm sm:top-9 sm:h-[72px] sm:w-[72px]">
            <PaperAirplane />
          </motion.div>

          <div ref={mailboxRef} className="absolute bottom-0 right-0 z-10">
            <Mailbox hasArrived={hasArrived} reactionDuration={activeReactionDuration} />
          </div>
        </div>

        <div className="mx-auto mt-4 w-[calc(100%-1rem)] sm:mt-6 sm:w-[calc(100%-3rem)]" aria-hidden="true">
          <div className="h-2 overflow-hidden rounded-full bg-border sm:h-2.5">
            <motion.div style={{ scaleX: flightProgress, transformOrigin: "left center" }} className="h-full w-full rounded-full bg-primary shadow-soft" />
          </div>
        </div>

        <div className="mt-7 sm:mt-9">
          <h1 className="text-2xl font-bold tracking-tight text-heading sm:text-3xl">Your conversations are ready</h1>
          <p className="mt-2 text-sm leading-6 text-body sm:text-base">Delivering you to Nemissive…</p>
        </div>
      </div>
    </motion.div>
  );
}

export default LoginTransition;
