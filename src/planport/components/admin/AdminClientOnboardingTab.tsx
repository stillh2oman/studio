"use client";

import { useState } from "react";
import { Sparkles, Link2, Copy, Check, Mail } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@planport/firebase";
import {
  getClientOnboardingInviteLink,
  type ClientOnboardingInviteVariant,
} from "@/ai/flows/get-client-onboarding-invite-link";
import { ClientOnboardingPanel } from "@planport/components/client/ClientOnboardingPanel";
import { OnboardingPacketContactBar } from "@planport/components/client/OnboardingPacketContactBar";
import { cn } from "@/lib/utils";

type InviteLinks = Record<ClientOnboardingInviteVariant, string | null>;

type SendFields = { to: string; clientName: string; projectName: string };

const EMPTY_LINKS: InviteLinks = { jeff: null, kevin: null };

const EMPTY_SEND: Record<ClientOnboardingInviteVariant, SendFields> = {
  jeff: { to: "", clientName: "", projectName: "" },
  kevin: { to: "", clientName: "", projectName: "" },
};

export function AdminClientOnboardingTab() {
  const auth = useAuth();
  const { toast } = useToast();
  const [inviteLinks, setInviteLinks] = useState<InviteLinks>(EMPTY_LINKS);
  const [loading, setLoading] = useState<ClientOnboardingInviteVariant | null>(null);
  const [sending, setSending] = useState<ClientOnboardingInviteVariant | null>(null);
  const [sendFields, setSendFields] =
    useState<Record<ClientOnboardingInviteVariant, SendFields>>(EMPTY_SEND);
  const [copied, setCopied] = useState<ClientOnboardingInviteVariant | null>(null);
  const [previewLead, setPreviewLead] = useState<ClientOnboardingInviteVariant>("jeff");

  const buildLink = async (inviteVariant: ClientOnboardingInviteVariant) => {
    setLoading(inviteVariant);
    setCopied(null);
    try {
      const user = auth.currentUser;
      if (!user) {
        toast({
          variant: "destructive",
          title: "Not signed in",
          description: "Sign in with your PlanPort administrator account, then try again.",
        });
        return;
      }
      const idToken = await user.getIdToken();
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const result = await getClientOnboardingInviteLink(idToken, origin, inviteVariant);
      if ("error" in result) {
        toast({
          variant: "destructive",
          title: "Could not build link",
          description: result.error,
        });
        setInviteLinks((s) => ({ ...s, [inviteVariant]: null }));
        return;
      }
      setInviteLinks((s) => ({ ...s, [inviteVariant]: result.link }));
      toast({
        title: "Invitation link ready",
        description: "Copy it below and send it only to the intended recipient.",
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not build link",
        description: e instanceof Error ? e.message : "Something went wrong. Try again.",
      });
      setInviteLinks((s) => ({ ...s, [inviteVariant]: null }));
    } finally {
      setLoading(null);
    }
  };

  const updateSendField = (
    inviteVariant: ClientOnboardingInviteVariant,
    field: keyof SendFields,
    value: string
  ) => {
    setSendFields((s) => ({
      ...s,
      [inviteVariant]: { ...s[inviteVariant], [field]: value },
    }));
  };

  const sendOnboardingPacket = async (inviteVariant: ClientOnboardingInviteVariant) => {
    const fields = sendFields[inviteVariant];
    const to = fields.to.trim();
    if (!to || !to.includes("@")) {
      toast({
        variant: "destructive",
        title: "Recipient required",
        description: "Enter the client’s email address before sending.",
      });
      return;
    }

    setSending(inviteVariant);
    setCopied(null);
    try {
      const user = auth.currentUser;
      if (!user) {
        toast({
          variant: "destructive",
          title: "Not signed in",
          description: "Sign in with your PlanPort administrator account, then try again.",
        });
        return;
      }
      const idToken = await user.getIdToken();
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch("/api/email/send-onboarding-packet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          to,
          clientName: fields.clientName.trim() || undefined,
          projectName: fields.projectName.trim() || undefined,
          inviteVariant,
          origin,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; link?: string; message?: string };
      if (!res.ok) {
        throw new Error(data.error || "Could not send email.");
      }
      if (data.link) {
        setInviteLinks((s) => ({ ...s, [inviteVariant]: data.link! }));
      }
      toast({
        title: "Onboarding email sent",
        description: data.message || "Onboarding email sent successfully.",
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Send failed",
        description: e instanceof Error ? e.message : "Check Resend configuration and try again.",
      });
    } finally {
      setSending(null);
    }
  };

  const copyLink = async (inviteVariant: ClientOnboardingInviteVariant) => {
    const link = inviteLinks[inviteVariant];
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(inviteVariant);
      toast({ title: "Copied to clipboard" });
      setTimeout(() => setCopied((c) => (c === inviteVariant ? null : c)), 2000);
    } catch {
      toast({
        variant: "destructive",
        title: "Copy failed",
        description: "Select the link and copy manually.",
      });
    }
  };

  const inviteRow = (inviteVariant: ClientOnboardingInviteVariant, title: string, envKey: string) => {
    const link = inviteLinks[inviteVariant];
    const busy = loading === inviteVariant;
    const sendBusy = sending === inviteVariant;
    const isCopied = copied === inviteVariant;
    const sf = sendFields[inviteVariant];
    return (
      <div className="rounded-md border border-border bg-secondary p-4 sm:p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <p className="font-semibold uppercase tracking-wide text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground mt-1 font-mono break-all">{envKey}</p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button
              type="button"
              onClick={() => buildLink(inviteVariant)}
              disabled={busy || sendBusy}
              size="lg"
              variant="outline"
              className="rounded-full border-border"
            >
              <Sparkles className="w-4 h-4 mr-2" strokeWidth={1.75} />
              {busy ? "Building…" : "Generate link"}
            </Button>
            {link ? (
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="rounded-full border-border"
                onClick={() => copyLink(inviteVariant)}
                disabled={sendBusy}
              >
                {isCopied ? (
                  <>
                    <Check className="w-4 h-4 mr-2 text-emerald-400" strokeWidth={1.75} />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" strokeWidth={1.75} />
                    Copy
                  </>
                )}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="rounded-md border border-border bg-card/80 p-4 space-y-4">
          <div className="flex items-center gap-2 text-foreground">
            <Mail className="w-4 h-4 text-ledger-yellow shrink-0" strokeWidth={1.75} />
            <p className="text-sm font-semibold uppercase tracking-wide">Send onboarding packet</p>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Sends a branded transactional email through Resend with a button to open the packet. Requires{" "}
            <code className="font-mono text-[11px]">RESEND_API_KEY</code> and a verified{" "}
            <code className="font-mono text-[11px]">RESEND_ONBOARDING_FROM</code> or{" "}
            <code className="font-mono text-[11px]">RESEND_FROM</code> on the server.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor={`onb-to-${inviteVariant}`} className="text-xs font-semibold uppercase tracking-wider">
                Recipient email <span className="text-destructive">*</span>
              </Label>
              <Input
                id={`onb-to-${inviteVariant}`}
                type="email"
                autoComplete="email"
                placeholder="client@example.com"
                value={sf.to}
                onChange={(e) => updateSendField(inviteVariant, "to", e.target.value)}
                className="h-10 rounded-md border-border bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`onb-client-${inviteVariant}`} className="text-xs font-semibold uppercase tracking-wider">
                Client name <span className="text-muted-foreground font-normal normal-case">(optional)</span>
              </Label>
              <Input
                id={`onb-client-${inviteVariant}`}
                placeholder="e.g. Jordan Lee"
                value={sf.clientName}
                onChange={(e) => updateSendField(inviteVariant, "clientName", e.target.value)}
                className="h-10 rounded-md border-border bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`onb-project-${inviteVariant}`} className="text-xs font-semibold uppercase tracking-wider">
                Project name <span className="text-muted-foreground font-normal normal-case">(optional)</span>
              </Label>
              <Input
                id={`onb-project-${inviteVariant}`}
                placeholder="e.g. Stillwater residence"
                value={sf.projectName}
                onChange={(e) => updateSendField(inviteVariant, "projectName", e.target.value)}
                className="h-10 rounded-md border-border bg-background"
              />
            </div>
          </div>
          <Button
            type="button"
            size="lg"
            className={cn("w-full sm:w-auto rounded-full px-6 font-semibold bg-primary text-primary-foreground hover:bg-primary/90")}
            disabled={sendBusy || busy}
            onClick={() => void sendOnboardingPacket(inviteVariant)}
          >
            <Mail className="w-4 h-4 mr-2" strokeWidth={1.75} />
            {sendBusy ? "Sending…" : "Send onboarding packet"}
          </Button>
        </div>

        {link ? (
          <div className="space-y-2">
            <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Full URL (secret key)
            </label>
            <Input
              readOnly
              value={link}
              className="font-mono text-xs h-11 rounded-md border-border bg-background"
              onClick={(e) => e.currentTarget.select()}
            />
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-10">
      <Card className={cn("overflow-hidden border-border bg-card")}>
        <div className="h-0.5 w-full bg-ledger-red/40" aria-hidden />
        <CardHeader className="space-y-3 pb-2">
          <CardTitle className="text-foreground flex items-center gap-3 text-xl sm:text-2xl tracking-wide">
            <span className="flex h-11 w-11 items-center justify-center rounded-md bg-secondary text-ledger-yellow border border-border">
              <Link2 className="w-5 h-5" strokeWidth={1.75} />
            </span>
            Invitation links
          </CardTitle>
          <CardDescription className="text-base text-foreground/85 leading-relaxed max-w-3xl">
            Two private URLs—one for Jeff Dillon and one for Kevin Walthall. Content is the same except team and
            scheduling: Kevin&apos;s link shows Kevin and Chris on the Welcome tab and uses Kevin&apos;s Google Calendar
            once <code className="text-xs font-mono">GOOGLE_CALENDAR_ID_KEVIN</code> is set. Treat each full URL like a
            password. Use <strong className="text-foreground">Send onboarding packet</strong> to email a polished
            invitation (Resend); use <strong className="text-foreground">Generate link</strong> if you only need the URL.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 pt-2">
          <p className="text-sm text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Local dev:</strong> define the keys in{" "}
            <code className="text-xs font-mono rounded bg-secondary border border-border px-1.5 py-0.5">
              .env.local
            </code>{" "}
            (see repo <code className="text-xs font-mono">.env.example</code>), then restart the dev server.{" "}
            <strong className="text-foreground">Production:</strong> set both keys in hosting env / secrets:{" "}
            <code className="rounded-md bg-secondary border border-border px-2 py-0.5 text-xs font-mono">
              PLANPORT_CLIENT_ONBOARDING_KEY
            </code>{" "}
            (Jeff) and{" "}
            <code className="rounded-md bg-secondary border border-border px-2 py-0.5 text-xs font-mono">
              PLANPORT_CLIENT_ONBOARDING_KEY_KEVIN
            </code>{" "}
            (Kevin). Optional:{" "}
            <code className="rounded-md bg-secondary border border-border px-1.5 py-0.5 text-[11px] font-mono">
              KEVIN_DESIGNER_CONTACT_EMAIL
            </code>
            ,{" "}
            <code className="rounded-md bg-secondary border border-border px-1.5 py-0.5 text-[11px] font-mono">
              PLANPORT_BOOKING_NOTIFY_EMAIL_KEVIN
            </code>
            .
          </p>
          <div className="space-y-4">
            {inviteRow("jeff", "Jeff Dillon — onboarding invite", "PLANPORT_CLIENT_ONBOARDING_KEY")}
            {inviteRow("kevin", "Kevin Walthall — onboarding invite", "PLANPORT_CLIENT_ONBOARDING_KEY_KEVIN")}
          </div>
        </CardContent>
      </Card>

      <section className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-ledger-yellow border border-border">
              <Sparkles className="w-5 h-5" strokeWidth={1.75} />
            </span>
            <div>
              <h3 className="text-lg sm:text-xl font-bold uppercase tracking-wide text-foreground">
                Live preview
              </h3>
              <p className="text-sm text-muted-foreground">
                Matches the prospect experience (without the invite URL bar).
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Preview as</span>
            <div className="flex rounded-full border border-border p-1 bg-secondary">
              {(["jeff", "kevin"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setPreviewLead(v)}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-sm font-semibold transition-colors",
                    previewLead === v
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {v === "jeff" ? "Jeff" : "Kevin"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={cn("rounded-md border border-border overflow-hidden bg-background")}>
          <div className="p-6 sm:p-8 md:p-10 pb-8">
            <ClientOnboardingPanel
              variant="invite"
              inviteLead={previewLead}
              inviteDesignerContactEmail={
                previewLead === "kevin" ? "kevin@designersink.us" : "jeff@designersink.us"
              }
              inviteCalendarEnabled={previewLead === "jeff"}
            />
          </div>
          <OnboardingPacketContactBar variant="inline" />
        </div>
        {previewLead === "kevin" ? (
          <p className="text-xs text-muted-foreground max-w-2xl">
            Kevin&apos;s preview hides the scheduling button unless you enable it; production turns it on automatically
            when <span className="font-mono">GOOGLE_CALENDAR_ID_KEVIN</span> is set on the server.
          </p>
        ) : null}
      </section>
    </div>
  );
}
