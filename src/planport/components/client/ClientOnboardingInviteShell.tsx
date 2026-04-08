"use client";

import { Header } from "@planport/components/layout/Header";
import { ClientOnboardingPanel } from "@planport/components/client/ClientOnboardingPanel";
import { OnboardingPacketContactBar } from "@planport/components/client/OnboardingPacketContactBar";

export function ClientOnboardingInviteShell({
  initialSubTab,
  inviteLead,
  inviteDesignerContactEmail,
  inviteCalendarEnabled,
}: {
  initialSubTab?: string;
  inviteLead: "jeff" | "kevin";
  inviteDesignerContactEmail: string;
  inviteCalendarEnabled: boolean;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="relative flex-1 w-full max-w-3xl mx-auto px-5 sm:px-8 pt-10 md:pt-14 pb-24 sm:pb-28">
        <ClientOnboardingPanel
          variant="invite"
          initialSubTab={initialSubTab}
          inviteLead={inviteLead}
          inviteDesignerContactEmail={inviteDesignerContactEmail}
          inviteCalendarEnabled={inviteCalendarEnabled}
        />
      </main>
      <OnboardingPacketContactBar variant="fixed" />
    </div>
  );
}
