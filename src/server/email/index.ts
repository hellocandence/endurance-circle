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

/** Brevo or Resend when their key is set; the dev mailer otherwise. Production fails closed. */
export function getMailer(
  env: { BREVO_API_KEY?: string; RESEND_API_KEY?: string; EMAIL_FROM?: string; NODE_ENV?: string } = process.env,
): Mailer {
  if (env.BREVO_API_KEY) {
    if (!env.EMAIL_FROM) throw new Error("EMAIL_FROM is required when BREVO_API_KEY is set");
    return brevoMailer(env.BREVO_API_KEY, env.EMAIL_FROM);
  }
  if (env.RESEND_API_KEY) {
    if (!env.EMAIL_FROM) throw new Error("EMAIL_FROM is required when RESEND_API_KEY is set");
    return resendMailer(env.RESEND_API_KEY, env.EMAIL_FROM);
  }
  if (env.NODE_ENV === "production") throw new Error("BREVO_API_KEY (or RESEND_API_KEY) is required in production");
  return devMailer;
}
