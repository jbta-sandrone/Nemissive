import { useEffect, useState } from "react";
import { AnimatePresence, MotionConfig, motion, type Transition } from "motion/react";
import { useLocation, useOutlet } from "react-router-dom";
import AuthVisualPanel from "./AuthVisualPanel";

const formTransition: Transition = {
  duration: 0.32,
  ease: [0.22, 1, 0.36, 1],
};

function useDesktopVisual() {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia("(min-width: 1024px)").matches);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const updateDesktopState = (event: MediaQueryListEvent) => setIsDesktop(event.matches);

    mediaQuery.addEventListener("change", updateDesktopState);

    return () => mediaQuery.removeEventListener("change", updateDesktopState);
  }, []);

  return isDesktop;
}

function AuthLayout() {
  const location = useLocation();
  const authPage = useOutlet();
  const isDesktop = useDesktopVisual();

  return (
    <MotionConfig reducedMotion="user">
      <main className="flex min-h-screen w-full flex-col overflow-x-hidden bg-surface lg:grid lg:h-screen lg:grid-cols-[minmax(0,43fr)_minmax(0,57fr)] lg:overflow-hidden">
        <section className="flex min-h-screen min-w-0 flex-col bg-surface px-5 py-6 sm:px-8 sm:py-8 md:px-12 md:py-10 lg:h-screen lg:overflow-y-auto lg:px-10 lg:py-8 xl:px-14 2xl:px-20">
          <header className="shrink-0">
            <div className="inline-flex items-center gap-3" aria-label="Nemissive">
              <span className="relative block h-9 w-10 shrink-0" aria-hidden="true">
                <span className="absolute left-0 top-0 h-7 w-8 rounded-2xl bg-primary shadow-soft" />
                <span className="absolute bottom-0 right-0 h-6 w-7 rounded-2xl border-2 border-surface bg-accent" />
              </span>
              <span className="text-xl font-bold tracking-tight text-heading">Nemissive</span>
            </div>
          </header>

          <div className="flex w-full flex-1 items-center justify-center py-10 sm:py-12 md:py-14 lg:py-10">
            <div className="w-full max-w-md">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={location.pathname} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={formTransition}>
                  {authPage}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </section>

        {isDesktop && <AuthVisualPanel />}
      </main>
    </MotionConfig>
  );
}

export default AuthLayout;
