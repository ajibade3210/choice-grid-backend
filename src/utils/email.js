import { Resend } from 'resend';
import pug from 'pug';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templatePath = path.join(__dirname, '../templates/welcome.pug');

let resendClient = null;

const getResendClient = () => {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn('[Email] NOTICE: RESEND_API_KEY is not set. Welcome email will be simulated in development.');
      return null;
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
};

/**
 * Sends a welcome email using Resend + Pug template
 * Non-blocking: returns promise, handles errors gracefully
 */
export const sendWelcomeEmail = async (toEmail, name) => {
  try {
    const html = pug.renderFile(templatePath, { name });
    const resend = getResendClient();

    if (!resend) {
      console.log(`[Email] Simulated welcome email sent to ${toEmail} (${name})`);
      return { id: `simulated-${Date.now()}` };
    }

    const fromAddress = process.env.EMAIL_FROM || 'Choice Grid <hello@accessa-backend.online>';
    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: toEmail,
      subject: 'Welcome to Choice Grid!',
      html,
    });

    if (error) {
      console.error('[Email] Resend API error:', error.message || error);
      return null;
    }

    console.log(`[Email] Welcome email sent to ${toEmail} via Resend (ID: ${data?.id})`);
    return data;
  } catch (error) {
    console.error('[Email] Failed to send welcome email:', error.message);
    return null;
  }
};
