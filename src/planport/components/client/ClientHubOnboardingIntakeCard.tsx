"use client";

import { ClipboardList } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProjectOnboardingIntake } from "@/lib/onboarding-submission-types";

const PROJECT_TYPE_LABELS: Record<string, string> = {
  new_construction: "New construction — residential",
  remodel: "Remodel — residential",
  addition: "Addition — residential",
  other: "Other",
};

function formatTypes(types: string[]): string {
  return types.map((t) => PROJECT_TYPE_LABELS[t] ?? t).join(", ");
}

export function ClientHubOnboardingIntakeCard({ intake }: { intake: ProjectOnboardingIntake }) {
  const submitted = intake.questionnaireSubmittedAt
    ? new Date(intake.questionnaireSubmittedAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  return (
    <Card className="border-border bg-secondary">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-primary">
          <ClipboardList className="h-4 w-4 text-accent shrink-0" />
          Onboarding questionnaire
        </CardTitle>
        {submitted ? (
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
            Submitted {submitted}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3 text-xs text-muted-foreground leading-relaxed pt-0">
        <div>
          <p className="font-semibold text-foreground/90 mb-0.5">Project types</p>
          <p>{formatTypes(intake.projectTypes)}</p>
        </div>
        <div>
          <p className="font-semibold text-foreground/90 mb-0.5">Description</p>
          <p className="whitespace-pre-wrap">{intake.projectDescription}</p>
        </div>
        {intake.otherElaboration ? (
          <div>
            <p className="font-semibold text-foreground/90 mb-0.5">Other details</p>
            <p className="whitespace-pre-wrap">{intake.otherElaboration}</p>
          </div>
        ) : null}
        {intake.generalContractor ? (
          <div>
            <p className="font-semibold text-foreground/90 mb-0.5">General contractor</p>
            <p>{intake.generalContractor}</p>
          </div>
        ) : null}
        {(intake.projectStreetAddress ||
          intake.projectCity ||
          intake.projectState ||
          intake.subdivisionName ||
          intake.permittingAgency ||
          intake.siteDescription) && (
          <div>
            <p className="font-semibold text-foreground/90 mb-0.5">Site / location (from questionnaire)</p>
            <div className="space-y-1 whitespace-pre-wrap">
              {intake.projectStreetAddress ? <p>{intake.projectStreetAddress}</p> : null}
              {intake.projectCity || intake.projectState ? (
                <p>
                  {[intake.projectCity, intake.projectState].filter(Boolean).join(", ")}
                </p>
              ) : null}
              {intake.subdivisionName ? <p>Subdivision: {intake.subdivisionName}</p> : null}
              {intake.permittingAgency ? <p>Permitting: {intake.permittingAgency}</p> : null}
              {intake.siteDescription ? <p>{intake.siteDescription}</p> : null}
            </div>
          </div>
        )}
        {intake.attachmentNames.length > 0 ? (
          <div>
            <p className="font-semibold text-foreground/90 mb-0.5">Attachments (from questionnaire)</p>
            <ul className="list-disc pl-4 space-y-0.5">
              {intake.attachmentNames.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
