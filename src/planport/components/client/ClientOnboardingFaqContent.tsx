import Link from "next/link";
import {
  OnboardingSectionHeading,
  onboardingFaqSectionStackClass,
  onboardingJustifiedBodyClass,
} from "@planport/components/client/OnboardingPacketSectionTitle";
import {
  CLIENT_ONBOARDING_FAQ_SECTIONS,
  type FaqBodyBlock,
} from "@/lib/client-onboarding-faq-data";

function FaqBlockView({ block }: { block: FaqBodyBlock }) {
  if (block.kind === "plain") {
    return <p>{block.text}</p>;
  }
  if (block.kind === "rich") {
    return (
      <p>
        {block.segments.map((s, i) =>
          s.bold ? (
            <strong key={i} className="text-foreground">
              {s.text}
            </strong>
          ) : (
            <span key={i}>{s.text}</span>
          )
        )}
      </p>
    );
  }
  return (
    <p>
      {block.before}
      <Link
        href={block.href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent font-medium underline underline-offset-2 hover:text-accent/90"
      >
        {block.linkText}
      </Link>
      {block.after}
    </p>
  );
}

/** FAQ body copy below the PlanPort intro on the onboarding packet FAQs tab. */
export function ClientOnboardingFaqContent() {
  return (
    <div className={onboardingFaqSectionStackClass}>
      {CLIENT_ONBOARDING_FAQ_SECTIONS.map((sec) => (
        <div key={sec.heading}>
          <OnboardingSectionHeading>{sec.heading}</OnboardingSectionHeading>
          <div className={onboardingJustifiedBodyClass}>
            {sec.blocks.map((block, i) => (
              <FaqBlockView key={i} block={block} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
