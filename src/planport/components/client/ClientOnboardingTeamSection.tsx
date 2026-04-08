"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ClientOnboardingTeamMember } from "@/data/client-onboarding-team";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

const DESIGNERS_INK_EMAIL_SPLIT_RE = /([\w.%+-]+@designersink\.us)/gi;

function isDesignersInkEmail(s: string): boolean {
  return /^[\w.%+-]+@designersink\.us$/i.test(s);
}

/** Biography paragraph; linkifies @designersink.us addresses. */
function BioParagraph({ text }: { text: string }) {
  const parts = text.split(DESIGNERS_INK_EMAIL_SPLIT_RE);
  if (parts.length === 1) {
    return <p className="text-[15px] sm:text-base leading-[1.75] text-foreground/90">{text}</p>;
  }
  return (
    <p className="text-[15px] sm:text-base leading-[1.75] text-foreground/90">
      {parts.map((part, i) =>
        isDesignersInkEmail(part) ? (
          <a
            key={i}
            href={`mailto:${part}`}
            className="font-medium text-accent underline underline-offset-2 hover:text-accent/90"
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </p>
  );
}

/**
 * Plain <img> (not next/image fill) so object-position is reliable and failed loads can fall back to initials.
 */
function TeamMemberPortrait({
  member,
  interactive,
}: {
  member: ClientOnboardingTeamMember;
  interactive?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const src = member.imageSrc?.trim();

  const inner =
    !src || failed ? (
      <div
        className="absolute inset-0 flex items-center justify-center bg-muted"
        aria-hidden
      >
        <span className="text-4xl sm:text-5xl font-bold text-primary/30 select-none">
          {initialsFromName(member.name)}
        </span>
      </div>
    ) : (
      // eslint-disable-next-line @next/next/no-img-element -- intentional: next/image fill overrides object-position; need reliable crop + onError fallback
      <img
        src={src}
        alt=""
        width={480}
        height={640}
        decoding="async"
        loading={member.id === "jeff" ? "eager" : "lazy"}
        fetchPriority={member.id === "jeff" ? "high" : undefined}
        className={cn(
          "absolute inset-0 h-full w-full object-cover",
          interactive && "pointer-events-none"
        )}
        style={{ objectPosition: member.imageObjectPosition ?? "center center" }}
        onError={() => setFailed(true)}
      />
    );

  return inner;
}

export function ClientOnboardingTeamSection({
  members,
  className,
}: {
  members: ClientOnboardingTeamMember[];
  className?: string;
}) {
  const [bioMember, setBioMember] = useState<ClientOnboardingTeamMember | null>(null);

  if (!members.length) return null;

  return (
    <section
      className={cn(
        "mt-12 border-t border-primary/10 pt-10 sm:pt-12",
        className
      )}
      aria-labelledby="onboarding-team-heading"
    >
      <h3
        id="onboarding-team-heading"
        className="text-center text-xs sm:text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground mb-8 sm:mb-10"
      >
        Meet the Team
      </h3>
      <div
        className={cn(
          "grid grid-cols-1 sm:grid-cols-2 gap-12 sm:gap-8 lg:gap-6 xl:gap-10",
          members.length >= 3 ? "lg:grid-cols-4" : "lg:grid-cols-2 max-w-4xl mx-auto"
        )}
      >
        {members.map((m) => {
          const hasBio = Boolean(m.biography?.trim());
          return (
            <article
              key={m.id}
              className="flex flex-col items-center text-center gap-4 sm:gap-5"
            >
              {hasBio ? (
                <button
                  type="button"
                  onClick={() => setBioMember(m)}
                  className={cn(
                    "relative w-full max-w-[240px] aspect-[3/4] rounded-lg overflow-hidden",
                    "bg-muted border border-primary/15 shadow-sm",
                    "cursor-pointer text-left transition-[box-shadow,ring] hover:shadow-md hover:ring-2 hover:ring-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  )}
                  aria-label={`About ${m.name}`}
                >
                  <TeamMemberPortrait member={m} interactive />
                </button>
              ) : (
                <div
                  className={cn(
                    "relative w-full max-w-[240px] aspect-[3/4] rounded-lg overflow-hidden",
                    "bg-muted border border-primary/15 shadow-sm"
                  )}
                >
                  <TeamMemberPortrait member={m} />
                </div>
              )}
              <div className="space-y-2 max-w-[260px] mx-auto">
                {hasBio ? (
                  <button
                    type="button"
                    onClick={() => setBioMember(m)}
                    className="text-xl sm:text-2xl font-bold text-primary tracking-tight leading-tight w-full hover:underline underline-offset-2 decoration-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
                  >
                    {m.name}
                  </button>
                ) : (
                  <p className="text-xl sm:text-2xl font-bold text-primary tracking-tight leading-tight">
                    {m.name}
                  </p>
                )}
                <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {m.title}
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed pt-0.5">
                  {m.description}
                </p>
              </div>
            </article>
          );
        })}
      </div>

      <Dialog open={bioMember !== null} onOpenChange={(open) => !open && setBioMember(null)}>
        <DialogContent className="max-h-[min(90vh,720px)] overflow-y-auto sm:max-w-lg">
          {bioMember ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl text-primary pr-8">
                  {bioMember.name}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-1">
                {bioMember.biography!
                  .split(/\n\n+/)
                  .map((p) => p.trim())
                  .filter(Boolean)
                  .map((para, i) => (
                    <BioParagraph key={i} text={para} />
                  ))}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
