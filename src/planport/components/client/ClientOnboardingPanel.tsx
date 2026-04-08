"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import dynamic from "next/dynamic";
import type { LucideIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { ProjectMeetingStatus } from "@planport/components/scheduling/ProjectMeetingStatus";
import {
  Sparkles,
  ClipboardList,
  HelpCircle,
  MessageCircleQuestion,
  Route,
  CalendarClock,
  MessageSquareText,
  Loader2,
  SendHorizontal,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  clientOnboardingTeamMembersJeff,
  clientOnboardingTeamMembersKevin,
} from "@/data/client-onboarding-team";
import { ClientOnboardingTeamSection } from "@planport/components/client/ClientOnboardingTeamSection";
import {
  ClientOnboardingQuestionnaireForm,
  type QuestionnaireFileEntry,
} from "@planport/components/client/ClientOnboardingQuestionnaireForm";
import { ClientOnboardingFaqContent } from "@planport/components/client/ClientOnboardingFaqContent";
import { ClientOnboardingDesignProcessContent } from "@planport/components/client/ClientOnboardingDesignProcessContent";
import { onboardingJustifiedBodyClass } from "@planport/components/client/OnboardingPacketSectionTitle";
import { useToast } from "@/hooks/use-toast";
import {
  clientOnboardingQuestionnaireFormSchema,
  clientOnboardingQuestionnaireDefaultValues,
  type ClientOnboardingQuestionnaireFormValues,
} from "@/lib/client-onboarding-questionnaire-schema";
import { submitClientOnboardingQuestionnaire } from "@/ai/flows/submit-client-onboarding-questionnaire";

function OnboardingPacketSubmitFooter({
  placement,
  packetSubmitting,
  onSubmit,
}: {
  placement: "questionnaire" | "consultation";
  packetSubmitting: boolean;
  onSubmit: () => void;
}) {
  const hint =
    placement === "questionnaire"
      ? "When you are ready, submit your onboarding packet once from here or from the Consultation tab. If anything is missing, we'll highlight the fields to fix."
      : "When you are ready, submit your onboarding packet once from here or from the Questionnaire tab. If anything is missing, we'll highlight the fields to fix.";

  return (
    <div className="mt-10 pt-10 border-t border-border space-y-6">
      <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">{hint}</p>
      <Button
        type="button"
        disabled={packetSubmitting}
        size="lg"
        onClick={() => void onSubmit()}
        className={cn(
          "rounded-md px-10 sm:px-12 font-semibold tracking-wide",
          "bg-primary text-primary-foreground hover:bg-primary/90"
        )}
      >
        {packetSubmitting ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Sending…
          </>
        ) : (
          <>
            <SendHorizontal className="mr-2 h-5 w-5" strokeWidth={1.75} />
            Submit Onboarding Packet
          </>
        )}
      </Button>
    </div>
  );
}

function FaqHelpCallout() {
  return (
    <div
      className="rounded-md border border-border bg-secondary px-4 py-3 sm:px-5 sm:py-4 text-sm sm:text-[15px] text-foreground flex gap-3 items-start max-w-2xl"
      role="note"
    >
      <MessageCircleQuestion className="w-5 h-5 text-ledger-yellow shrink-0 mt-0.5" aria-hidden />
      <p className="leading-relaxed">
        Have a question that isn&apos;t answered here? Click the{" "}
        <span className="font-semibold text-foreground">Help</span> button in the lower-right corner anytime to ask the
        PlanPort assistant—it draws from these FAQs, PlanPort how-tos, and Designer's Ink&apos;s public information.
      </p>
    </div>
  );
}

const ScheduleMeetingDialog = dynamic(
  () =>
    import("@planport/components/scheduling/ScheduleMeetingDialog").then((m) => ({
      default: m.ScheduleMeetingDialog,
    })),
  { ssr: false }
);

const INVITE_CONSULT_PROJECT_LABEL = "Initial consultation (prospective client)";
const DEFAULT_DESIGNER_EMAIL = "jeff@designersink.us";

const DESIGNERS_INK_WELCOME_LOGO = {
  src: "/branding/designers-ink-welcome-logo.png",
  alt: "Designer's Ink",
} as const;

const TAB_ITEMS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "welcome", label: "Welcome", icon: Sparkles },
  { value: "questionnaire", label: "Questionnaire", icon: ClipboardList },
  { value: "faqs", label: "FAQs", icon: HelpCircle },
  { value: "design-process", label: "Design Process", icon: Route },
  { value: "consultation", label: "Consultation", icon: CalendarClock },
];

type SectionPanelProps = {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  variant?: "default" | "welcome";
} & (
  | { icon: LucideIcon; titleImage?: never }
  | { titleImage: { src: string; alt: string }; icon?: never }
);

function SectionPanel({
  title,
  subtitle,
  children,
  variant = "default",
  ...mark
}: SectionPanelProps) {
  const hasLogo = "titleImage" in mark && mark.titleImage;
  const Icon = "icon" in mark ? mark.icon : null;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md border border-border bg-card",
        "shadow-sm"
      )}
    >
      <div
        className="absolute left-0 top-0 h-full w-1 bg-ledger-red"
        aria-hidden
      />

      <div className="relative px-6 py-8 sm:px-10 sm:py-10 md:px-12 md:py-12 pl-7 sm:pl-11 md:pl-14">
        <div
          className={cn(
            "flex flex-col gap-6",
            variant === "welcome" ? "md:flex-row md:items-start" : "sm:flex-row sm:items-start"
          )}
        >
          <div
            className={cn(
              "flex shrink-0 items-center justify-center rounded-2xl overflow-hidden",
              hasLogo
                ? "min-h-[4.5rem] px-3 py-2.5 bg-secondary border border-border"
                : "h-14 w-14 bg-secondary text-foreground border border-border"
            )}
          >
            {hasLogo ? (
              <img
                src={mark.titleImage.src}
                alt={mark.titleImage.alt}
                className="max-h-[5.5rem] w-auto max-w-[min(100%,260px)] object-contain object-left"
              />
            ) : Icon ? (
              <Icon className="h-7 w-7 text-accent" strokeWidth={1.5} />
            ) : null}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <h2 className="text-2xl sm:text-3xl font-bold uppercase tracking-wide text-foreground">
              {title}
            </h2>
            {subtitle ? (
              <div className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-2xl">
                {subtitle}
              </div>
            ) : null}
          </div>
        </div>

        <div className={cn("mt-8", variant === "welcome" && "mt-10")}>{children}</div>
      </div>
    </div>
  );
}

export type ClientOnboardingPanelProps =
  | {
      variant: "invite";
      initialSubTab?: string;
      /** Which designer’s secret invite link opened the packet (default Jeff). */
      inviteLead?: "jeff" | "kevin";
      /** Mailto / fallback contact for scheduling when calendar is off. */
      inviteDesignerContactEmail?: string;
      /** Kevin’s invite: true once GOOGLE_CALENDAR_ID_KEVIN is set on the server. */
      inviteCalendarEnabled?: boolean;
    }
  | {
      variant: "project";
      clientHubDisplayName: string;
      projectName: string;
      projectAddress?: string;
      hubLabel?: string;
      designerName?: string;
      clientId: string;
      projectId: string;
      scheduledMeetingStatus?: string;
      scheduledMeetingStartIso?: string;
      designerEmail?: string;
    };

export function ClientOnboardingPanel(props: ClientOnboardingPanelProps) {
  const { toast } = useToast();
  const isInvite = props.variant === "invite";
  const [onboardingTab, setOnboardingTab] = useState(
    isInvite && props.initialSubTab ? props.initialSubTab : "welcome"
  );
  const [packetFiles, setPacketFiles] = useState<QuestionnaireFileEntry[]>([]);
  const [packetSubmitting, setPacketSubmitting] = useState(false);

  const questionnaireForm = useForm<ClientOnboardingQuestionnaireFormValues>({
    resolver: zodResolver(clientOnboardingQuestionnaireFormSchema),
    defaultValues: { ...clientOnboardingQuestionnaireDefaultValues },
  });

  const submitPacket = questionnaireForm.handleSubmit(
    async (values) => {
      setPacketSubmitting(true);
      try {
        const attachments = packetFiles.map((f) => ({ name: f.file.name, dataUri: f.dataUri }));
        const result = await submitClientOnboardingQuestionnaire({
          clientNames: values.clientNames.trim(),
          phone: values.phone.trim(),
          emails: values.emails.trim(),
          projectTypes: values.projectTypes,
          otherElaboration: values.otherElaboration?.trim() || undefined,
          projectStreetAddress: values.projectStreetAddress.trim(),
          projectCity: values.projectCity.trim(),
          projectState: values.projectState.trim(),
          subdivisionName: values.subdivisionName?.trim() ?? "",
          permittingAgency: values.permittingAgency?.trim() ?? "",
          siteDescription: values.siteDescription.trim(),
          generalContractor: values.generalContractor.trim(),
          projectDescription: values.projectDescription.trim(),
          attachments: attachments.length > 0 ? attachments : undefined,
        });

        if (result.success) {
          toast({ title: "Sent", description: result.message });
          questionnaireForm.reset({ ...clientOnboardingQuestionnaireDefaultValues });
          setPacketFiles([]);
        } else {
          toast({ variant: "destructive", title: "Could not send", description: result.message });
        }
      } catch {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Something went wrong. Please try again.",
        });
      } finally {
        setPacketSubmitting(false);
      }
    },
    () => {
      setOnboardingTab("questionnaire");
      toast({
        variant: "destructive",
        title: "Questionnaire incomplete",
        description: "Open the Questionnaire tab and correct any fields marked in red, then try again.",
      });
    }
  );

  const projectName = isInvite ? "your upcoming design project" : props.projectName;
  const clientHubDisplayName = isInvite ? "" : props.clientHubDisplayName;
  const projectAddress = isInvite ? undefined : props.projectAddress;
  const hubLabel = isInvite ? "Prospective client" : props.hubLabel;

  const inviteLead: "jeff" | "kevin" =
    isInvite && props.variant === "invite" ? props.inviteLead ?? "jeff" : "jeff";

  const designerName = isInvite
    ? inviteLead === "kevin"
      ? "Kevin Walthall"
      : "Jeff Dillon"
    : props.designerName;

  const designerEmail = isInvite
    ? props.inviteDesignerContactEmail?.trim() || DEFAULT_DESIGNER_EMAIL
    : props.designerEmail ?? DEFAULT_DESIGNER_EMAIL;

  const onboardingTeamMembers = isInvite
    ? inviteLead === "kevin"
      ? clientOnboardingTeamMembersKevin
      : clientOnboardingTeamMembersJeff
    : clientOnboardingTeamMembersJeff;

  const showSchedulingCalendar = isInvite
    ? inviteLead === "jeff" || props.inviteCalendarEnabled === true
    : designerName === "Jeff Dillon";
  const scheduledMeetingStatus = isInvite ? undefined : props.scheduledMeetingStatus;
  const scheduledMeetingStartIso = isInvite ? undefined : props.scheduledMeetingStartIso;
  const clientId = isInvite ? "" : props.clientId;
  const projectId = isInvite ? "" : props.projectId;

  const welcomeSubtitle = isInvite ? (
    <>
      Start your journey with Designer&apos;s Ink—before a project is set up in PlanPort.
    </>
  ) : (
    <>
      {clientHubDisplayName && clientHubDisplayName !== "Client" ? (
        <span className="block text-foreground/90 mb-2">
          We&apos;re glad you&apos;re here,{" "}
          <span className="font-medium text-foreground">{clientHubDisplayName}</span>.
        </span>
      ) : null}
      <span>
        Your project hub for{" "}
        <span className="font-medium text-foreground">{props.projectName}</span>.
      </span>
    </>
  );

  return (
    <Form {...questionnaireForm}>
      <div className="w-full space-y-10 md:space-y-12">
      <header className="text-center sm:text-left space-y-4">
        <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Designer&apos;s Ink Graphic &amp; Building Designs, LLC
        </p>
        <div className="space-y-3">
          <h1 className="text-3xl sm:text-4xl md:text-[2.5rem] font-bold uppercase tracking-wide text-foreground leading-[1.15]">
            Client Onboarding Packet
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base max-w-xl mx-auto sm:mx-0 leading-relaxed">
            A curated guide to our process—so you can move forward with clarity and confidence.
          </p>
        </div>
      </header>

      <Tabs value={onboardingTab} onValueChange={setOnboardingTab} className="w-full space-y-8">
        <div className="relative -mx-1">
          <div className="overflow-x-auto pb-0 [scrollbar-width:thin]">
            <TabsList
              className={cn(
                "inline-flex w-max min-w-full sm:w-full h-auto p-0 gap-0 rounded-none",
                "bg-transparent border-b border-border"
              )}
            >
              {TAB_ITEMS.map(({ value, label, icon: TabIcon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className={cn(
                    "shrink-0 rounded-none px-3 py-3 sm:px-4 sm:flex-1 sm:justify-center gap-2",
                    "text-xs sm:text-sm font-semibold text-muted-foreground transition-colors",
                    "border-b-2 border-transparent -mb-px",
                    "data-[state=active]:text-foreground data-[state=active]:border-ledger-yellow data-[state=active]:bg-transparent",
                    "data-[state=active]:shadow-none",
                    "hover:text-foreground/85"
                  )}
                >
                  <TabIcon className="h-4 w-4 shrink-0 opacity-75" strokeWidth={1.75} />
                  <span className="whitespace-nowrap">{label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>

        <TabsContent value="welcome" className="mt-0 outline-none focus-visible:ring-0">
          <SectionPanel titleImage={DESIGNERS_INK_WELCOME_LOGO} title="Welcome" subtitle={welcomeSubtitle} variant="welcome">
            <div className="space-y-6 text-[15px] sm:text-base leading-[1.75] text-foreground/88 max-w-2xl">
              <p>
                We are absolutely thrilled about your interest in working with us on your upcoming design project. We
                have worked with clients on projects in 43 different states as well as Canada, Belize, Japan, Angola,
                Ireland and the Bahamas.
              </p>
              <p>
                We are excited to use our experience to ensure our work together not only meets, but exceeds your
                expectations, ensuring you are delighted with the results.
              </p>
              <p>
                We&apos;ve prepared a comprehensive information packet to kick off our journey together. It&apos;s packed
                with valuable insights to help you dive into our process and ensure we maximize our time together. In
                this packet, you&apos;ll find:
              </p>
            </div>

            <div className="grid sm:grid-cols-3 gap-4 my-10">
              {(
                [
                  {
                    Icon: ClipboardList,
                    t: "Initial Questionnaire",
                    d: "Share goals, scope, and vision.",
                    tab: "questionnaire",
                  },
                  {
                    Icon: HelpCircle,
                    t: "Frequently Asked Questions",
                    d: "Clarity on how we work together.",
                    tab: "faqs",
                  },
                  {
                    Icon: CalendarClock,
                    t: "Initial Meeting",
                    d: "Schedule time when you are ready.",
                    tab: "consultation",
                  },
                ] as const
              ).map(({ Icon: ItemIcon, t, d, tab }) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setOnboardingTab(tab)}
                  className={cn(
                    "group rounded-md border border-border bg-card p-5 text-left transition-colors",
                    "hover:border-muted-foreground/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    "w-full h-full min-h-0"
                  )}
                  aria-label={`Open ${t}`}
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-foreground border border-border">
                    <ItemIcon className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <p className="text-sm font-semibold text-foreground leading-snug group-hover:underline underline-offset-2">
                    {t}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{d}</p>
                </button>
              ))}
            </div>

            <div className="space-y-6 text-[15px] sm:text-base leading-[1.75] text-foreground/88 max-w-2xl">
              <p>
                If any questions arise, don&apos;t hesitate to reach out. We are here to provide guidance every step of
                the way.
              </p>
              <p>
                We are grateful you are considering entrusting us to help you on this journey. We don&apos;t take the
                responsibility lightly. We&apos;re excited to begin the design process with you.
              </p>
            </div>

            <ClientOnboardingTeamSection members={onboardingTeamMembers} />

            <div className="mt-10 rounded-md border border-border bg-secondary px-6 py-6 sm:px-8 sm:py-7 text-center">
              <p className="text-lg sm:text-xl font-semibold text-foreground tracking-tight uppercase">
                Now, let&apos;s embark on this exciting journey together.
              </p>
            </div>
          </SectionPanel>
        </TabsContent>

        <TabsContent value="questionnaire" className="mt-0 outline-none focus-visible:ring-0">
          <SectionPanel
            icon={ClipboardList}
            title="Questionnaire"
            subtitle={`Tell us about your goals, lifestyle, and priorities for ${projectName}.`}
          >
            <div className="space-y-5 text-[15px] leading-relaxed max-w-2xl">
              <p className="text-foreground/88 leading-[1.75]">
                As we embark on the next stage of our partnership, we&apos;re excited to delve deeper into your
                aspirations and expectations. This client questionnaire will help us gain a more in-depth understanding
                of your specific goals, challenges, and expectations, ensuring that our collaboration is precisely
                tailored to your objectives.
              </p>
            </div>

            <div className="mt-10 pt-10 border-t border-border">
              <ClientOnboardingQuestionnaireForm files={packetFiles} setFiles={setPacketFiles} />
            </div>
            <OnboardingPacketSubmitFooter
              placement="questionnaire"
              packetSubmitting={packetSubmitting}
              onSubmit={() => void submitPacket()}
            />
          </SectionPanel>
        </TabsContent>

        <TabsContent value="faqs" className="mt-0 outline-none focus-visible:ring-0">
          <SectionPanel
            icon={HelpCircle}
            title="FAQs"
            subtitle="How we use PlanPort to keep your project organized—and make communication effortless."
          >
            <div className="space-y-6 text-[15px] sm:text-base leading-[1.75] text-foreground/88 max-w-2xl">
              <p>
                Our priority is to ensure clear communication and seamless execution of our work together. To
                facilitate this, we&apos;ve implemented tools that make it easy for you to track the progress
                of your project, share files, schedule meetings, and send us messages.
              </p>
              <p>
                As you can imagine, tracking emails, phone calls, and text messages from clients for around 100 active
                projects at one time can be difficult. Using your customized PlanPort Client Portal will allow us to
                better serve you by keeping all files and communications related to your project in one place.
              </p>
              <p>
                PlanPort will allow you to share ideas, files, and comments with us. It will also act as an
                accessible library for organizing renderings, floor plans, and construction documents we create
                throughout the design process—available for you to view and share at any time.
              </p>
            </div>
            <div className="mt-8">
              <FaqHelpCallout />
            </div>
            <ClientOnboardingFaqContent />
            <div className="mt-10 max-w-2xl">
              <FaqHelpCallout />
            </div>
          </SectionPanel>
        </TabsContent>

        <TabsContent value="design-process" className="mt-0 outline-none focus-visible:ring-0">
          <SectionPanel
            icon={Route}
            title="Design Process"
            subtitle="From initial layout through construction documents, pricing, and a final review with your builder."
          >
            <ClientOnboardingDesignProcessContent />
          </SectionPanel>
        </TabsContent>

        <TabsContent value="consultation" className="mt-0 outline-none focus-visible:ring-0">
          <SectionPanel
            icon={CalendarClock}
            title="Schedule a Consultation"
            subtitle={
              isInvite ? (
                <>Book an initial conversation about your project—no PlanPort project is required yet.</>
              ) : (
                <>
                  Reserve time to discuss{" "}
                  <span className="font-medium text-foreground">{props.projectName}</span>
                  {projectAddress ? (
                    <>
                      {" "}
                      <span className="text-muted-foreground">({projectAddress})</span>
                    </>
                  ) : null}
                  .
                </>
              )
            }
          >
            <div className="space-y-8 max-w-2xl text-[15px] sm:text-base leading-[1.75] text-foreground/88">
              <div className={onboardingJustifiedBodyClass}>
                <p>
                  The next step in the process will be to schedule a free, no-obligation consultation meeting. This
                  meeting can be done either in person in our offices in Stillwater or online.
                </p>
                {showSchedulingCalendar ? (
                  <p>
                    Simply click the Open scheduling calendar button and select the date and time most convenient for
                    you from the available options. We will confirm your meeting time and finalize the appointment.
                  </p>
                ) : (
                  <p>
                    To schedule your consultation, please use the email option below to reach your designer—we will
                    confirm your meeting time and get it finalized.
                  </p>
                )}
                <p>
                  In this meeting, you will get a chance to speak with your lead designer, ask any questions you might
                  have, and start the process of defining the scope of your project. If after this meeting you are ready
                  to proceed, we will send you a copy of our Design Agreement for you to sign so we can get started.
                </p>
              </div>

              {!isInvite && (
                <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-secondary px-4 py-3 text-sm">
                  <span className="text-muted-foreground font-medium">Meeting Status</span>
                  <ProjectMeetingStatus
                    status={scheduledMeetingStatus}
                    startIso={scheduledMeetingStartIso}
                  />
                </div>
              )}

              {showSchedulingCalendar ? (
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <ScheduleMeetingDialog
                    projectName={isInvite ? INVITE_CONSULT_PROJECT_LABEL : props.projectName}
                    projectAddress={projectAddress}
                    hubLabel={hubLabel}
                    bookingCalendarOwner={inviteLead === "kevin" ? "kevin" : "jeff"}
                    schedulerDisplayName={inviteLead === "kevin" ? "Kevin" : "Jeff"}
                    {...(!isInvite && clientId && projectId
                      ? {
                          planportHubKind: "client" as const,
                          planportHubId: clientId,
                          planportProjectId: projectId,
                        }
                      : {})}
                    trigger={
                      <Button
                        type="button"
                        size="lg"
                        className={cn(
                          "h-12 px-8 rounded-md font-semibold tracking-wide",
                          "bg-primary text-primary-foreground",
                          "hover:bg-primary/90 transition-colors"
                        )}
                      >
                        <CalendarClock className="w-5 h-5 mr-2" strokeWidth={1.75} />
                        Open scheduling calendar
                      </Button>
                    }
                  />
                </div>
              ) : (
                <div className="rounded-md border border-border bg-secondary px-5 py-5 text-sm text-muted-foreground space-y-4 leading-relaxed">
                  <p>
                    {isInvite && inviteLead === "kevin" ? (
                      <>
                        Online scheduling will be available here once Kevin&apos;s calendar is connected. Until then,
                        please email us to arrange a consultation.
                      </>
                    ) : (
                      <>
                        Online scheduling is available for projects assigned to{" "}
                        <strong className="text-foreground font-medium">Jeff Dillon</strong>. For other designers, reach
                        out directly to arrange a consultation.
                      </>
                    )}
                  </p>
                  {designerEmail ? (
                    <Button variant="outline" size="lg" className="rounded-md border-border" asChild>
                      <a
                        href={`mailto:${designerEmail}?subject=${encodeURIComponent(
                          `Consultation — ${isInvite ? "New prospect" : props.projectName}`
                        )}`}
                      >
                        <MessageSquareText className="w-4 h-4 mr-2" />
                        Email your designer
                      </a>
                    </Button>
                  ) : (
                    <Button variant="outline" size="lg" className="rounded-md" asChild>
                      <Link href="/portal">Contact via PlanPort</Link>
                    </Button>
                  )}
                </div>
              )}
            </div>
            <OnboardingPacketSubmitFooter
              placement="consultation"
              packetSubmitting={packetSubmitting}
              onSubmit={() => void submitPacket()}
            />
          </SectionPanel>
        </TabsContent>
      </Tabs>
      </div>
    </Form>
  );
}
