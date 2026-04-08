import {
  OnboardingSectionHeading,
  onboardingDesignProcessStackClass,
  onboardingJustifiedBodyClass,
} from "@planport/components/client/OnboardingPacketSectionTitle";

/** Design process narrative for the client onboarding packet. */
export function ClientOnboardingDesignProcessContent() {
  return (
    <div className={onboardingDesignProcessStackClass}>
      <div>
        <h2 className="text-3xl sm:text-4xl font-bold uppercase tracking-wide text-primary mb-3">
          Process
        </h2>
        <div className="h-px w-full bg-primary/25 mb-6" aria-hidden />
        <div className={onboardingJustifiedBodyClass}>
          <p>
            Thank you for reading through this onboarding package. In the future, you can revisit this for reference in
            your Client Portal. If you have any questions, don&apos;t hesitate to reach out.
          </p>
          <p>
            Our next steps will be to meet for our initial consultation. We would then prepare and sign a contract for
            your project and get started.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <OnboardingSectionHeading>Initial Design</OnboardingSectionHeading>
        <div className={onboardingJustifiedBodyClass}>
          <p>
            The design process begins with the initial layout based on information you provide during our initial
            consultation. This initial layout is just a starting place for the design process. We may go through many
            revisions and explore several different options to ensure we are getting the best design to fit your needs.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <OnboardingSectionHeading>3D Modeling</OnboardingSectionHeading>
        <div className={onboardingJustifiedBodyClass}>
          <p>
            As we get the layout like you want it, we will start working on some 3D modeling so that you can move
            around inside and outside of the space. This really helps you to visualize what the final product might look
            like. We can still make changes to the design after you get to see everything.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <OnboardingSectionHeading>Construction Documents</OnboardingSectionHeading>
        <div className={onboardingJustifiedBodyClass}>
          <p>
            Once you make any final revisions to the design, we will begin working on the construction documents. This
            typically includes a floor plan, a foundation layout, roof plan, electrical plan, plot plan, exterior
            elevations, area calculations and door / window / cabinet schedules. In some cases, a builder might request
            additional drawing details such as interior elevations, cross-sections, etc. We customize each set of
            construction documents to fit the needs of the client, the builder and the permitting agency. The goal is to
            have everything in the plan set that is needed without spending time drawing up details which may not be
            needed.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <OnboardingSectionHeading>Pricing and Bids</OnboardingSectionHeading>
        <div className={onboardingJustifiedBodyClass}>
          <p>
            Once the construction documents are completed, you will start working on getting pricing to build the
            project. If you have a builder already, they will get pricing for materials and labor so that you have a
            solid quote for your specific house and not just a &quot;ballpark&quot; price per square foot. If you do
            not already have a builder, you may send the plans to multiple builders to get bids.
          </p>
          <p>
            At this point, the design process may be completed, but in some cases you may decide to make additional
            changes based on your bids to stay within your budget. We can still make changes at this point in the process,
            so we would assist you in finding ways to cut costs.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <OnboardingSectionHeading>Final Review</OnboardingSectionHeading>
        <div className={onboardingJustifiedBodyClass}>
          <p>
            Building a new home is really a team effort between the client, the designer, the builder and all of their
            subcontractors. With that in mind, we offer a free consultation meeting with the builder you select to do a
            final review of the plans to ensure everyone is on the same page, and they do not require anything else in
            the final plan set.
          </p>
          <p>
            Thank you once more for your interest in working with us on your project. We are eagerly looking forward to{" "}
            <strong className="text-foreground font-semibold">EXCEEDING</strong> your expectations!
          </p>
        </div>
      </div>
    </div>
  );
}
