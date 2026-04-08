import { cn } from "@/lib/utils";

/** Section titles — navy caps with a simple rule, aligned with designersink.us brochure style. */
export function OnboardingSectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className={cn(
        "text-xs sm:text-sm font-bold uppercase tracking-[0.2em] text-primary",
        "border-b border-primary/20 pb-2 mb-0"
      )}
    >
      {children}
    </h3>
  );
}

export const onboardingJustifiedBodyClass = "space-y-4 [&_p]:text-justify";

/** Below intro copy inside FAQs tab */
export const onboardingFaqSectionStackClass =
  "mt-10 pt-8 border-t border-primary/10 max-w-2xl flex flex-col gap-7 sm:gap-8 text-[15px] sm:text-base leading-[1.75] text-foreground/88";

/** Main column for Design process tab body */
export const onboardingDesignProcessStackClass =
  "max-w-2xl flex flex-col gap-7 sm:gap-8 text-[15px] sm:text-base leading-[1.75] text-foreground/88";
