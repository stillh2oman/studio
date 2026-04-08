import { notFound } from "next/navigation";
import { ClientOnboardingInviteShell } from "@planport/components/client/ClientOnboardingInviteShell";
import { hasKevinPlanportBookingCalendarConfigured } from "@/lib/planport-calendar/google-calendar";

const SUB_TABS = new Set([
  "welcome",
  "questionnaire",
  "faqs",
  "design-process",
  "consultation",
]);

const DEFAULT_JEFF_CONTACT = "jeff@designersink.us";
const DEFAULT_KEVIN_CONTACT = "kevin@designersink.us";

/**
 * Prospective-client onboarding (no PlanPort project yet).
 * Not linked from the public site — open only with the full URL + key from Admin.
 *
 * Two secret keys (separate URLs): PLANPORT_CLIENT_ONBOARDING_KEY (Jeff) and
 * PLANPORT_CLIENT_ONBOARDING_KEY_KEVIN (Kevin).
 */
export default async function ClientOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string; tab?: string }>;
}) {
  const { key, tab } = await searchParams;
  const jeffKey = process.env.PLANPORT_CLIENT_ONBOARDING_KEY?.trim();
  const kevinKey = process.env.PLANPORT_CLIENT_ONBOARDING_KEY_KEVIN?.trim();

  let inviteLead: "jeff" | "kevin" | null = null;
  if (jeffKey && key === jeffKey) inviteLead = "jeff";
  else if (kevinKey && key === kevinKey) inviteLead = "kevin";

  if (!inviteLead) {
    notFound();
  }

  const initialSubTab = tab && SUB_TABS.has(tab) ? tab : "welcome";

  const inviteDesignerContactEmail =
    inviteLead === "kevin"
      ? process.env.KEVIN_DESIGNER_CONTACT_EMAIL?.trim() || DEFAULT_KEVIN_CONTACT
      : process.env.JEFF_DESIGNER_CONTACT_EMAIL?.trim() || DEFAULT_JEFF_CONTACT;

  const inviteCalendarEnabled =
    inviteLead === "jeff" ? true : hasKevinPlanportBookingCalendarConfigured();

  return (
    <ClientOnboardingInviteShell
      initialSubTab={initialSubTab}
      inviteLead={inviteLead}
      inviteDesignerContactEmail={inviteDesignerContactEmail}
      inviteCalendarEnabled={inviteCalendarEnabled}
    />
  );
}
