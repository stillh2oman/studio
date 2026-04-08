import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertPlanportAdmin } from "@/lib/firebase-admin-app";
import { buildClientOnboardingInviteUrl } from "@/lib/client-onboarding-invite-url";
import { sendOnboardingInvitationEmail } from "@/lib/email/send-onboarding-invitation-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearer(req: NextRequest): string | null {
  const h = req.headers.get("authorization")?.trim();
  if (!h?.toLowerCase().startsWith("bearer ")) return null;
  return h.slice(7).trim() || null;
}

const bodySchema = z.object({
  to: z.string().email("Enter a valid recipient email."),
  clientName: z.string().max(200).optional(),
  projectName: z.string().max(200).optional(),
  inviteVariant: z.enum(["jeff", "kevin"]),
  origin: z
    .string()
    .min(1)
    .refine(
      (s) => {
        try {
          const u = new URL(s);
          return u.protocol === "http:" || u.protocol === "https:";
        } catch {
          return false;
        }
      },
      { message: "Invalid origin URL." }
    ),
});

export async function POST(req: NextRequest) {
  try {
    const idToken = bearer(req);
    try {
      await assertPlanportAdmin(idToken);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "Forbidden") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.flatten().fieldErrors;
      const msg =
        Object.values(first).flat()[0] ||
        parsed.error.flatten().formErrors[0] ||
        "Invalid request.";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const { to, clientName, projectName, inviteVariant, origin } =
      parsed.data;

    const built = buildClientOnboardingInviteUrl(origin, inviteVariant);
    if (!built.ok) {
      return NextResponse.json({ error: built.error }, { status: 503 });
    }

    const send = await sendOnboardingInvitationEmail({
      to,
      params: {
        onboardingUrl: built.url,
        inviteVariant,
        clientName: clientName?.trim() || undefined,
        projectName: projectName?.trim() || undefined,
      },
    });

    if (!send.ok) {
      return NextResponse.json({ error: send.message }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      link: built.url,
      message: "Onboarding email sent successfully.",
    });
  } catch (e: unknown) {
    console.error("[send-onboarding-packet]", e);
    const message = e instanceof Error ? e.message : "Send failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
