
'use server';
/**
 * @fileOverview Sends print orders via Resend.
 *
 * - sendPrintOrder - A function that handles the print order submission.
 * - PrintOrderInput - The input type for the print order.
 */

import { z } from "zod";
import { Resend } from "resend";

const PrintOrderInputSchema = z.object({
  blueprintName: z.string(),
  gcName: z.string(),
  projectName: z.string(),
  requesterName: z.string().min(1, "Requester name is required").trim(),
  requesterEmail: z.string().email("Invalid requester email").trim(),
  paperSize: z.enum(['36x24', '48x36']),
  quantity: z.number().min(1),
  pageOption: z.enum(['all', 'range', 'selection', 'custom']),
  pageRange: z.string().optional(),
  specificPages: z.string().optional(),
  customSelection: z.string().optional(),
  specialInstructions: z.string().optional(),
  totalSheets: z.number(),
  estimatedTotal: z.number(),
});

export type PrintOrderInput = z.infer<typeof PrintOrderInputSchema>;

export async function sendPrintOrder(input: PrintOrderInput) {
  const parsed = PrintOrderInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Invalid print order data." };
  }

  const data = parsed.data;
  const safeProject = data.projectName?.trim() || "(unknown project)";
  const escapeHtml = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const safeRequesterName = escapeHtml(data.requesterName);
  const safeRequesterEmail = escapeHtml(data.requesterEmail);
  const emailHtml = `
    <div style="font-family: sans-serif; max-width: 600px; border: 1px solid #eee; padding: 20px;">
      <h2 style="color: #2E4B66;">New Print Order Received</h2>
      <div style="margin-bottom: 16px; padding: 12px; background: #f0f7fa; border-radius: 8px; border: 1px solid #d0e4ec;">
        <h3 style="margin: 0 0 8px 0; font-size: 14px; color: #2E4B66;">Person requesting prints</h3>
        <p style="margin: 4px 0;"><strong>Name:</strong> ${safeRequesterName}</p>
        <p style="margin: 4px 0;"><strong>Email:</strong> <a href="mailto:${safeRequesterEmail}">${safeRequesterEmail}</a></p>
      </div>
      <p><strong>Project contractor (hub):</strong> ${escapeHtml(data.gcName)}</p>
      <p><strong>Project:</strong> ${escapeHtml(safeProject)}</p>
      <p><strong>Project Blueprint:</strong> ${escapeHtml(data.blueprintName)}</p>
      <hr style="border: none; border-top: 1px solid #eee;" />
      
      <h3>Order Details:</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 5px 0;"><strong>Paper Size:</strong></td><td>${data.paperSize === "36x24" ? '36" x 24" ($4.25/sheet)' : '48" x 36" ($6.25/sheet)'}</td></tr>
        <tr><td style="padding: 5px 0;"><strong>Sets Quantity:</strong></td><td>${data.quantity}</td></tr>
        <tr><td style="padding: 5px 0;"><strong>Selection:</strong></td><td>${data.pageOption}</td></tr>
        ${data.pageOption === "range" ? `<tr><td style="padding: 5px 0;"><strong>Range:</strong></td><td>${data.pageRange}</td></tr>` : ""}
        ${data.pageOption === "selection" ? `<tr><td style="padding: 5px 0;"><strong>Specific Pages:</strong></td><td>${data.specificPages}</td></tr>` : ""}
        ${data.pageOption === "custom" ? `<tr><td style="padding: 5px 0;"><strong>Custom Request:</strong></td><td>${data.customSelection}</td></tr>` : ""}
      </table>
      
      <div style="margin-top: 20px; padding: 15px; background: #f9f9f9; border-radius: 8px;">
        <h4 style="margin: 0 0 10px 0;">Special Instructions:</h4>
        <p style="margin: 0; font-style: italic;">${data.specialInstructions || "None provided."}</p>
      </div>
      
      <hr style="border: none; border-top: 1px solid #eee; margin-top: 20px;" />
      <p><strong>Total Sheets:</strong> ${data.totalSheets}</p>
      <p style="font-size: 18px; color: #52DBDB;"><strong>Estimated Total: $${data.estimatedTotal.toFixed(2)}</strong></p>
      
      <p style="font-size: 10px; color: #999; margin-top: 30px;">This order was generated via PlanPort.</p>
    </div>
  `;

  try {
    const resendKey = process.env.RESEND_API_KEY?.trim();
    if (!resendKey) {
      console.warn("[sendPrintOrder] RESEND_API_KEY is missing. Falling back to simulation.");
      return { success: true, message: "Simulation: Order logged (No API Key)." };
    }

    const resend = new Resend(resendKey);
    await resend.emails.send({
      from: "PlanPort <onboarding@resend.dev>",
      to: "jeff@designersink.us",
      reply_to: data.requesterEmail,
      subject: `NEW PRINT ORDER: ${data.requesterName} — ${data.gcName} / ${safeProject} — ${data.blueprintName}`,
      html: emailHtml,
    });

    return {
      success: true,
      message: "Order request sent successfully to jeff@designersink.us.",
    };
  } catch (error: unknown) {
    console.error("[sendPrintOrder] Failed to send print order email:", error);
    return {
      success: false,
      message: "Unable to send email. Please try again or contact Jeff directly.",
    };
  }
}
