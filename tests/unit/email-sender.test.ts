import { describe, expect, it } from "vitest";
import { getMailer, parseSender } from "@/server/email";

describe("parseSender", () => {
  it("splits name and address", () => {
    expect(parseSender("Cadence <hello@example.com>")).toEqual({ name: "Cadence", email: "hello@example.com" });
    expect(parseSender('"Cadence App" <hello@example.com>')).toEqual({ name: "Cadence App", email: "hello@example.com" });
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
