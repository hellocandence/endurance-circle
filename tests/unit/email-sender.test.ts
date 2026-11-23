import { describe, expect, it } from "vitest";
import { buildRawMessage, getMailer, parseSender } from "@/server/email";

describe("parseSender", () => {
  it("splits name and address", () => {
    expect(parseSender("Endurance Circle <hello@example.com>")).toEqual({ name: "Endurance Circle", email: "hello@example.com" });
    expect(parseSender('"Endurance Circle App" <hello@example.com>')).toEqual({ name: "Endurance Circle App", email: "hello@example.com" });
  });
  it("accepts a bare address", () => {
    expect(parseSender("hello@example.com")).toEqual({ email: "hello@example.com" });
  });
});

describe("getMailer", () => {
  it("requires EMAIL_FROM with a Brevo key", () => {
    expect(() => getMailer({ BREVO_API_KEY: "k" })).toThrow(/EMAIL_FROM/);
  });
  it("fails closed in production without a key", () => {
    expect(() => getMailer({ NODE_ENV: "production" })).toThrow(/BREVO_API_KEY/);
  });
});

describe("getMailer SMTP", () => {
  it("requires EMAIL_FROM with SMTP credentials", () => {
    expect(() => getMailer({ SMTP_USER: "a@gmail.com", SMTP_PASS: "p" })).toThrow(/EMAIL_FROM/);
  });
  it("builds a mailer and wins over Brevo/Resend", () => {
    const m = getMailer({ SMTP_USER: "a@gmail.com", SMTP_PASS: "p", EMAIL_FROM: "A <a@gmail.com>", BREVO_API_KEY: "k" });
    expect(typeof m.send).toBe("function");
  });
});

describe("Gmail API mailer", () => {
  const decode = (raw: string) => Buffer.from(raw, "base64url").toString("utf8");
  const gmail = { GMAIL_CLIENT_ID: "id", GMAIL_CLIENT_SECRET: "secret", GMAIL_REFRESH_TOKEN: "refresh" };

  it("needs EMAIL_FROM and wins over SMTP", () => {
    expect(() => getMailer(gmail)).toThrow(/EMAIL_FROM/);
    expect(typeof getMailer({ ...gmail, EMAIL_FROM: "A <a@gmail.com>", SMTP_USER: "a", SMTP_PASS: "b" }).send).toBe("function");
  });

  it("builds a base64 plain-text message with encoded non-ASCII subjects", () => {
    const msg = decode(buildRawMessage("Endurance Circle <a@gmail.com>", { to: "f@example.com", subject: "Sandeep invited you — welcome", text: "Hello दोस्त\nline two" }));
    expect(msg).toContain("From: Endurance Circle <a@gmail.com>");
    expect(msg).toContain("To: f@example.com");
    expect(msg).toMatch(/Subject: =\?UTF-8\?B\?.+\?=/);
    const body = msg.split("\r\n\r\n")[1].replace(/\r\n/g, "");
    expect(Buffer.from(body, "base64").toString("utf8")).toBe("Hello दोस्त\nline two");
  });

  it("cannot be used to inject headers", () => {
    const msg = decode(buildRawMessage("A <a@gmail.com>", { to: "f@example.com\r\nBcc: evil@example.com", subject: "Hi\r\nBcc: evil@example.com", text: "x" }));
    expect(msg.split("\r\n").some((l) => l.startsWith("Bcc:"))).toBe(false);
  });

  it("gets an access token, then posts the raw message to Gmail", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(url.includes("oauth2") ? { access_token: "tok", expires_in: 3600 } : { id: "m1" }), { status: 200 });
    }) as typeof fetch;
    try {
      await getMailer({ ...gmail, EMAIL_FROM: "A <a@gmail.com>" }).send({ to: "f@example.com", subject: "Hi", text: "Body" });
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(calls.map((c) => c.url)).toEqual(["https://oauth2.googleapis.com/token", "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"]);
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });
});

describe("contactEmail", () => {
  it("is the address the app sends from, and nothing when none is set", async () => {
    const { contactEmail } = await import("@/server/email/contact");
    expect(contactEmail({ EMAIL_FROM: "Endurance Circle <hello@example.com>" })).toBe("hello@example.com");
    expect(contactEmail({ EMAIL_FROM: "plain@example.com" })).toBe("plain@example.com");
    expect(contactEmail({ EMAIL_FROM: "not an address" })).toBeNull();
    expect(contactEmail({})).toBeNull();
  });
});
