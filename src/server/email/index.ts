import { randomBytes } from "node:crypto";
import nodemailer from "nodemailer";

export type Email = { to: string; subject: string; text: string; html?: string };
export type Mailer = { send(message: Email): Promise<void> };

/** Dev/test mailer: logs and keeps messages in memory. Never used in production. */
export const outbox: Email[] = [];
const devMailer: Mailer = {
  async send(message) {
    outbox.push(message);
    console.log(`[email:dev] to=${message.to} subject="${message.subject}"\n${message.text}`);
  },
};

function resendMailer(apiKey: string, from: string): Mailer {
  return {
    async send({ to, subject, text, html }) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, subject, text, ...(html && { html }) }),
      });
      if (!res.ok) throw new Error(`Resend responded ${res.status}`);
    },
  };
}

/** Splits `Name <a@b.c>` (or a bare address) into Brevo's sender shape. */
export function parseSender(from: string): { name?: string; email: string } {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (!m) return { email: from.trim() };
  const name = m[1].trim();
  return name ? { name, email: m[2].trim() } : { email: m[2].trim() };
}

function brevoMailer(apiKey: string, from: string): Mailer {
  const sender = parseSender(from);
  return {
    async send({ to, subject, text, html }) {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ sender, to: [{ email: to }], subject, textContent: text, ...(html && { htmlContent: html }) }),
      });
      if (!res.ok) throw new Error(`Brevo responded ${res.status}`);
    },
  };
}

type MailEnv = {
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
  GMAIL_REFRESH_TOKEN?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  BREVO_API_KEY?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  NODE_ENV?: string;
};

const base64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim(); // no header injection through subject/address
const encodeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${base64(s)}?=`);

const wrap76 = (b64: string) => b64.replace(/.{1,76}/g, "$&\r\n");

/** RFC 822 message for the Gmail API (base64url of the whole thing). With `html` it is multipart/alternative. */
export function buildRawMessage(from: string, { to, subject, text, html }: Email): string {
  const head = [`From: ${oneLine(from)}`, `To: ${oneLine(to)}`, `Subject: ${encodeHeader(oneLine(subject))}`, "MIME-Version: 1.0"];
  let message: string;
  if (html) {
    const boundary = `endurance-circle-${randomBytes(12).toString("hex")}`;
    const part = (type: string, content: string) =>
      [`--${boundary}`, `Content-Type: ${type}; charset=UTF-8`, "Content-Transfer-Encoding: base64", "", wrap76(base64(content))].join("\r\n");
    message = [...head, `Content-Type: multipart/alternative; boundary="${boundary}"`, "", part("text/plain", text), part("text/html", html), `--${boundary}--`, ""].join("\r\n");
  } else {
    message = [...head, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrap76(base64(text))].join("\r\n");
  }
  return Buffer.from(message, "utf8").toString("base64url");
}

/**
 * Gmail API over HTTPS (port 443): works where SMTP ports are blocked, such as Render's free tier.
 * Sends as the Google account that granted the refresh token (scope gmail.send).
 */
function gmailApiMailer(env: { GMAIL_CLIENT_ID: string; GMAIL_CLIENT_SECRET: string; GMAIL_REFRESH_TOKEN: string; EMAIL_FROM: string }): Mailer {
  let cached: { token: string; expiresAt: number } | null = null;
  async function accessToken(): Promise<string> {
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GMAIL_CLIENT_ID,
        client_secret: env.GMAIL_CLIENT_SECRET,
        refresh_token: env.GMAIL_REFRESH_TOKEN,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) throw new Error(`Google token endpoint responded ${res.status}`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    cached = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return cached.token;
  }
  return {
    async send(message) {
      const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw: buildRawMessage(env.EMAIL_FROM, message) }),
      });
      if (!res.ok) throw new Error(`Gmail API responded ${res.status}`);
    },
  };
}

/** Gmail (or any SMTP) with an app password. Port 465 is implicit TLS; 587 uses STARTTLS. */
function smtpMailer(env: MailEnv & { SMTP_USER: string; SMTP_PASS: string; EMAIL_FROM: string }): Mailer {
  const port = Number(env.SMTP_PORT) || 465;
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS.replace(/\s/g, "") }, // Google shows app passwords in groups of four
  });
  return {
    async send({ to, subject, text, html }) {
      await transport.sendMail({ from: env.EMAIL_FROM, to, subject, text, html });
    },
  };
}

/** Gmail API, SMTP, Brevo or Resend when configured (in that order); the dev mailer otherwise. Production fails closed. */
export function getMailer(env: MailEnv = process.env): Mailer {
  if (env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN) {
    if (!env.EMAIL_FROM) throw new Error("EMAIL_FROM is required when the Gmail API is configured");
    return gmailApiMailer({ GMAIL_CLIENT_ID: env.GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET: env.GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN: env.GMAIL_REFRESH_TOKEN, EMAIL_FROM: env.EMAIL_FROM });
  }
  if (env.SMTP_USER && env.SMTP_PASS) {
    if (!env.EMAIL_FROM) throw new Error("EMAIL_FROM is required when SMTP_USER is set");
    return smtpMailer({ ...env, SMTP_USER: env.SMTP_USER, SMTP_PASS: env.SMTP_PASS, EMAIL_FROM: env.EMAIL_FROM });
  }
  if (env.BREVO_API_KEY) {
    if (!env.EMAIL_FROM) throw new Error("EMAIL_FROM is required when BREVO_API_KEY is set");
    return brevoMailer(env.BREVO_API_KEY, env.EMAIL_FROM);
  }
  if (env.RESEND_API_KEY) {
    if (!env.EMAIL_FROM) throw new Error("EMAIL_FROM is required when RESEND_API_KEY is set");
    return resendMailer(env.RESEND_API_KEY, env.EMAIL_FROM);
  }
  if (env.NODE_ENV === "production") throw new Error("Email is not configured: set GMAIL_* (Gmail API), SMTP_*, BREVO_API_KEY or RESEND_API_KEY");
  return devMailer;
}
