import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type Transition } from "motion/react";

type ConversationStep = "firstTyping" | "firstMessage" | "secondTyping" | "secondMessage" | "resetting";

const bubbleTransition: Transition = {
  duration: 0.32,
  ease: [0.22, 1, 0.36, 1],
};

function TypingIndicator({ align = "left" }: { align?: "left" | "right" }) {
  return (
    <motion.div initial={{ opacity: 0, y: 4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -3, scale: 0.98 }} transition={bubbleTransition} className={`flex items-center gap-1 rounded-2xl bg-accent px-3 py-2.5 ${align === "right" ? "ml-auto rounded-br-md" : "rounded-bl-md"}`}>
      {[0, 1, 2].map((dot) => (
        <motion.span key={dot} animate={{ opacity: [0.35, 1, 0.35], y: [0, -2, 0] }} transition={{ duration: 0.9, delay: dot * 0.14, repeat: Infinity, ease: "easeInOut" }} className="h-1.5 w-1.5 rounded-full bg-muted" />
      ))}
    </motion.div>
  );
}

function AnimatedConversation() {
  const shouldReduceMotion = useReducedMotion();
  const [step, setStep] = useState<ConversationStep>("firstTyping");

  useEffect(() => {
    if (shouldReduceMotion) {
      return;
    }

    let isCancelled = false;
    const timerIds = new Set<number>();

    function wait(duration: number) {
      return new Promise<void>((resolve) => {
        const timerId = window.setTimeout(() => {
          timerIds.delete(timerId);
          resolve();
        }, duration);

        timerIds.add(timerId);
      });
    }

    async function runConversation() {
      while (!isCancelled) {
        setStep("firstTyping");
        await wait(1300);
        if (isCancelled) break;

        setStep("firstMessage");
        await wait(850);
        if (isCancelled) break;

        setStep("secondTyping");
        await wait(1250);
        if (isCancelled) break;

        setStep("secondMessage");
        await wait(2600);
        if (isCancelled) break;

        setStep("resetting");
        await wait(500);
      }
    }

    void runConversation();

    return () => {
      isCancelled = true;
      timerIds.forEach((timerId) => window.clearTimeout(timerId));
      timerIds.clear();
    };
  }, [shouldReduceMotion]);

  const visibleStep = shouldReduceMotion ? "secondMessage" : step;
  const showFirstMessage = visibleStep === "firstMessage" || visibleStep === "secondTyping" || visibleStep === "secondMessage";
  const showSecondMessage = visibleStep === "secondMessage";

  return (
    <div className="min-h-36 space-y-3 py-3 lg:min-h-44 lg:py-4 xl:py-5">
      <div className="flex items-end gap-2">
        <motion.div animate={shouldReduceMotion ? undefined : { y: [0, -4, 0] }} transition={{ duration: 7.4, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-accent text-[10px] font-semibold text-primary lg:h-8 lg:w-8">A</motion.div>
        <AnimatePresence mode="wait" initial={false}>
          {visibleStep === "firstTyping" && <TypingIndicator key="first-typing" />}
          {showFirstMessage && (
            <motion.div key="first-message" initial={{ opacity: 0, y: 6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={bubbleTransition} className="max-w-[82%] rounded-2xl rounded-bl-md bg-accent px-3 py-2 text-xs leading-5 text-body lg:px-4 lg:py-2.5 lg:text-sm">Hey, how did your presentation go?</motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex min-h-10 items-end justify-end gap-2">
        <AnimatePresence mode="wait" initial={false}>
          {visibleStep === "secondTyping" && <TypingIndicator key="second-typing" align="right" />}
          {showSecondMessage && (
            <motion.div key="second-message" initial={{ opacity: 0, y: 6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={bubbleTransition} className="ml-auto max-w-[78%] rounded-2xl rounded-br-md bg-primary px-3 py-2 text-xs leading-5 text-white lg:px-4 lg:py-2.5 lg:text-sm">It went well. Thanks for checking in!</motion.div>
          )}
        </AnimatePresence>
        <motion.div animate={shouldReduceMotion ? undefined : { y: [0, 4, 0] }} transition={{ duration: 8.6, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-primary text-[10px] font-semibold text-white lg:h-8 lg:w-8">J</motion.div>
      </div>
    </div>
  );
}

export default AnimatedConversation;
