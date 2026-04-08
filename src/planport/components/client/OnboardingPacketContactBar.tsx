"use client";

import { cn } from "@/lib/utils";

export const DESIGNERS_INK_WEB_URL = "https://www.designersink.us";
export const DESIGNERS_INK_OFFICE_MAPS_URL =
  "https://www.google.com/maps/search/?api=1&query=" +
  encodeURIComponent("2324 West 7th Place, Suite #1, Stillwater, Oklahoma");
export const DESIGNERS_INK_PHONE_DISPLAY = "405-293-5515";
export const DESIGNERS_INK_PHONE_TEL = "tel:+14052935515";

const sep = <span className="text-border select-none" aria-hidden>·</span>;

/**
 * Slim contact strip for the onboarding packet. Use `fixed` on the invite page;
 * `inline` for embedded previews (e.g. admin).
 */
export function OnboardingPacketContactBar({
  variant = "fixed",
  className,
}: {
  variant?: "fixed" | "inline";
  className?: string;
}) {
  const inner = (
    <div
      className={cn(
        "max-w-3xl mx-auto flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-4 sm:px-6",
        "text-[11px] sm:text-xs text-muted-foreground text-center leading-snug"
      )}
    >
      <a
        href={DESIGNERS_INK_WEB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-ledger-yellow shrink-0 hover:underline underline-offset-2"
      >
        www.designersink.us
      </a>
      {sep}
      <a
        href={DESIGNERS_INK_OFFICE_MAPS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted-foreground hover:text-foreground hover:underline underline-offset-2 min-w-0"
        title="Open in Google Maps"
      >
        <span className="whitespace-normal sm:whitespace-nowrap">
          2324 West 7th Place, Suite #1, Stillwater, Oklahoma
        </span>
      </a>
      {sep}
      <a
        href={DESIGNERS_INK_PHONE_TEL}
        className="font-semibold text-foreground shrink-0 hover:underline underline-offset-2"
      >
        {DESIGNERS_INK_PHONE_DISPLAY}
      </a>
    </div>
  );

  if (variant === "inline") {
    return (
      <div
        className={cn(
          "w-full border-t border-border bg-card py-2.5 text-center",
          className
        )}
      >
        {inner}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border",
        "bg-card py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]",
        className
      )}
      role="contentinfo"
      aria-label="Designer's Ink contact"
    >
      {inner}
    </div>
  );
}
