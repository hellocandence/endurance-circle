import nodemailer from "nodemailer";

export type Email = { to: string; subject: string; text: string };
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
    async send({ to, subject, text }) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, subject, text }),
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
    async send({ to, subject, text }) {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ sender, to: [{ email: to }], subject, textContent: text }),
      });
      if (!res.ok) throw new Error(`Brevo responded ${res.status}`);
    },
  };
}

type MailEnv = {
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  BREVO_API_KEY?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  NODE_ENV?: string;
};

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
    async send({ to, subject, text }) {
      await transport.sendMail({ from: env.EMAIL_FROM, to, subject, text });
    },
  };
}

/** SMTP, Brevo or Resend when configured (in that order); the dev mailer otherwise. Production fails closed. */
export function getMailer(env: MailEnv = process.env): Mailer {
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
  if (env.NODE_ENV === "production") throw new Error("SMTP_USER and SMTP_PASS (or BREVO_API_KEY / RESEND_API_KEY) are required in production");
  return devMailer;
}
