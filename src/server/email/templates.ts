/*
 * Branded emails. Email clients are not browsers, so these use what every client supports: table layout,
 * inline styles, system fonts, a CSS-drawn logo (no remote images, which are blocked by default) and a
 * "bulletproof" button. A plain-text twin is always generated, which mail providers like and which keeps
 * the link readable anywhere. All dynamic values are HTML-escaped.
 */

export type Rendered = { subject: string; text: string; html: string };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
const C = { accent: "#4f46e5", accent2: "#8b5cf6", ink: "#0f172a", body: "#334155", muted: "#64748b", page: "#eef2ff", card: "#ffffff", line: "#e0e7ff" };

type Layout = {
  subject: string;
  preheader: string;
  heading: string;
  paragraphs: string[];
  button?: { label: string; url: string };
  secondary?: { label: string; url: string };
  notes?: string[]; // small print under the button
  footer: string; // why they are getting this
};

function layout(o: Layout): Rendered {
  const paragraphs = o.paragraphs
    .map((p) => `<p class="body" style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${C.body};">${esc(p)}</p>`)
    .join("");
  const button = o.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;"><tr>
        <td align="center" bgcolor="${C.accent}" style="border-radius:999px;background:${C.accent};">
          <a href="${esc(o.button.url)}" target="_blank" style="display:inline-block;padding:15px 32px;font-family:${FONT};font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">${esc(o.button.label)}</a>
        </td></tr></table>
       <p class="muted" style="margin:0 0 6px;font-size:13px;line-height:1.5;color:${C.muted};">Button not working? Copy this link into your browser:</p>
       <p style="margin:0 0 20px;font-size:13px;line-height:1.5;word-break:break-all;"><a class="link" href="${esc(o.button.url)}" target="_blank" style="color:${C.accent};text-decoration:underline;">${esc(o.button.url)}</a></p>`
    : "";
  const secondary = o.secondary
    ? `<p style="margin:0 0 20px;font-size:15px;"><a class="link" href="${esc(o.secondary.url)}" target="_blank" style="color:${C.accent};font-weight:600;text-decoration:underline;">${esc(o.secondary.label)}</a></p>`
    : "";
  const notes = (o.notes ?? [])
    .map((n) => `<p class="muted" style="margin:0 0 6px;font-size:13px;line-height:1.5;color:${C.muted};">${esc(n)}</p>`)
    .join("");

  const html = `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(o.subject)}</title>
<style>
  @media (prefers-color-scheme: dark) {
    .bg { background: #0b1020 !important; }
    .card { background: #151a33 !important; border-color: #2a3050 !important; }
    .ink { color: #f8fafc !important; }
    .body { color: #cbd5e1 !important; }
    .muted { color: #94a3b8 !important; }
    .rule { border-color: #2a3050 !important; }
    a.link { color: #a5b4fc !important; }
  }
  @media only screen and (max-width: 600px) {
    .container { width: 100% !important; }
    .px { padding-left: 24px !important; padding-right: 24px !important; }
    .h1 { font-size: 24px !important; }
  }
</style>
</head>
<body class="bg" style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${esc(o.preheader)}${"&nbsp;&zwnj;".repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="bg" style="background:${C.page};">
<tr><td align="center" style="padding:32px 16px;font-family:${FONT};">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" class="container" style="width:560px;max-width:100%;">
    <tr><td style="padding:0 6px 18px;font-family:${FONT};">
      <span style="display:inline-block;width:14px;height:14px;border:4px solid ${C.accent};border-right-color:transparent;border-radius:50%;vertical-align:-4px;margin-right:10px;"></span><span style="font-size:24px;font-weight:700;letter-spacing:-0.5px;color:${C.accent};">cadence</span>
    </td></tr>
    <tr><td class="card" style="background:${C.card};border:1px solid ${C.line};border-radius:24px;overflow:hidden;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td height="6" bgcolor="${C.accent}" style="height:6px;line-height:6px;font-size:0;background:${C.accent};background-image:linear-gradient(90deg,${C.accent},${C.accent2});">&nbsp;</td></tr>
        <tr><td class="px" style="padding:36px 40px 32px;font-family:${FONT};">
          <h1 class="ink h1" style="margin:0 0 16px;font-size:28px;line-height:1.2;font-weight:700;letter-spacing:-0.5px;color:${C.ink};">${esc(o.heading)}</h1>
          ${paragraphs}
          ${button}
          ${secondary}
          ${notes}
        </td></tr>
      </table>
    </td></tr>
    <tr><td class="px" style="padding:22px 12px 0;font-family:${FONT};">
      <p class="muted" style="margin:0 0 4px;font-size:12px;line-height:1.6;color:${C.muted};">${esc(o.footer)}</p>
      <p class="muted" style="margin:0;font-size:12px;line-height:1.6;color:${C.muted};">Cadence &middot; a private circle for building daily habits together.</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    o.heading,
    "",
    ...o.paragraphs.flatMap((p) => [p, ""]),
    ...(o.button ? [`${o.button.label}: ${o.button.url}`, ""] : []),
    ...(o.secondary ? [`${o.secondary.label}: ${o.secondary.url}`, ""] : []),
    ...(o.notes ?? []).map((n) => n),
    "",
    o.footer,
    "Cadence - a private circle for building daily habits together.",
  ].join("\n");

  return { subject: o.subject, text, html };
}

export function inviteEmail(p: { inviterName: string; email: string; url: string }): Rendered {
  return layout({
    subject: `${p.inviterName} invited you to Cadence`,
    preheader: `${p.inviterName} invited you to join their circle.`,
    heading: "You're invited",
    paragraphs: [`${p.inviterName} invited you to join their circle on Cadence, a private space to build daily habits together.`, "Tap the button to create your account. You can sign up with a password or with Google."],
    button: { label: "Accept invite", url: p.url },
    notes: [`This link works only for ${p.email}, once, and expires in 7 days.`],
    footer: `You got this because ${p.inviterName} entered your email address on Cadence.`,
  });
}

export function verifyEmailMessage(p: { url: string }): Rendered {
  return layout({
    subject: "Verify your Cadence email",
    preheader: "Confirm your email to finish setting up Cadence.",
    heading: "Confirm your email",
    paragraphs: ["Welcome to Cadence. Confirm your email address to finish setting up your account."],
    button: { label: "Confirm email", url: p.url },
    notes: ["This link works once and expires in 24 hours."],
    footer: "You got this because someone signed up to Cadence with this address.",
  });
}

export function resetEmail(p: { url: string }): Rendered {
  return layout({
    subject: "Reset your Cadence password",
    preheader: "Choose a new password for your Cadence account.",
    heading: "Reset your password",
    paragraphs: ["We got a request to reset the password for your Cadence account. Tap the button to choose a new one."],
    button: { label: "Choose a new password", url: p.url },
    notes: ["This link works once and expires in 30 minutes.", "If you did not ask for this, ignore this email. Your password stays the same."],
    footer: "You got this because a password reset was requested for this address.",
  });
}

export function alreadyRegisteredEmail(p: { loginUrl: string; forgotUrl: string }): Rendered {
  return layout({
    subject: "You already have a Cadence account",
    preheader: "This email already has an account. Sign in or reset your password.",
    heading: "You already have an account",
    paragraphs: ["Someone used an invite to sign up with this email, but it already has a Cadence account.", "You can just sign in."],
    button: { label: "Sign in", url: p.loginUrl },
    secondary: { label: "Forgot your password?", url: p.forgotUrl },
    notes: ["If this was not you, you can ignore this email."],
    footer: "You got this because an invite was used with this address.",
  });
}

export function passwordChangedEmail(p: { forgotUrl: string }): Rendered {
  return layout({
    subject: "Your Cadence password was changed",
    preheader: "Your password was just changed and your other devices were signed out.",
    heading: "Your password was changed",
    paragraphs: ["Your Cadence password was just changed, and your other devices were signed out.", "If this was you, there is nothing to do."],
    button: { label: "This wasn't me: reset password", url: p.forgotUrl },
    footer: "You got this security notice because the password on your Cadence account changed.",
  });
}
