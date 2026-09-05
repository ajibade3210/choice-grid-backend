import nodemailer from 'nodemailer';
import pug from 'pug';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templatePath = path.join(__dirname, '../templates/welcome.pug');

let transporterPromise = null;

// Initialize email transporter with fallback to Ethereal test account
const getTransporter = async () => {
  if (transporterPromise) return transporterPromise;

  transporterPromise = (async () => {
    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
      return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_PORT === '465',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    }

    // Fallback: Create ephemeral Ethereal test account
    try {
      const testAccount = await nodemailer.createTestAccount();
      console.log('[Email] Created Ethereal test account:', testAccount.user);
      return nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
    } catch (err) {
      console.warn('[Email] Could not create Ethereal account, falling back to jsonTransport:', err.message);
      return nodemailer.createTransport({ jsonTransport: true });
    }
  })();

  return transporterPromise;
};

/**
 * Sends a welcome email using Nodemailer + Pug
 * Non-blocking: returns promise and logs output/preview URL
 */
export const sendWelcomeEmail = async (toEmail, name) => {
  try {
    const transporter = await getTransporter();

    // Compile Pug template with dynamic name
    const html = pug.renderFile(templatePath, { name });

    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"Choice Grid" <hello@choicegrid.app>',
      to: toEmail,
      subject: 'Welcome to Choice Grid!',
      html,
    });

    console.log(`[Email] Welcome email sent to ${toEmail} (ID: ${info.messageId})`);
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`[Email] Preview URL: ${previewUrl}`);
    }

    return info;
  } catch (error) {
    console.error('[Email] Failed to send welcome email:', error.message);
    return null;
  }
};

export default sendWelcomeEmail;
