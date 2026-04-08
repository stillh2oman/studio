
'use server';

/**
 * @fileOverview Resend email delivery service for automated firm notifications.
 */

import { Resend } from 'resend';

const resendApiKey =
  process.env.RESEND_API_KEY?.trim() || 're_iTftkq3s_KcGq6Dw9rZz9f6JY7vK2D11A';
const resend = new Resend(resendApiKey);

interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
}

/**
 * Sends a professional HTML email via the Resend API.
 */
export async function sendEmail({ to, subject, html }: SendEmailParams) {
  try {
    const { data, error } = await resend.emails.send({
      from: "Designer's Ink <onboarding@resend.dev>",
      to,
      subject,
      html,
    });

    if (error) {
      console.error('Resend Transmission Error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (err: any) {
    console.error('Email Infrastructure Failure:', err);
    return { success: false, error: err.message };
  }
}
