import { describe, expect, it } from "vitest";
import { buildRawMessage } from "@/server/email";
import { alreadyRegisteredEmail, inviteEmail, passwordChangedEmail, resetEmail, verifyEmailMessage } from "@/server/email/templates";

const URL = "https://endurance-circle.example/invite/abc_DEF-123";
const all = () => [
  inviteEmail({ inviterName: "Sandeep", email: "friend@example.com", url: URL }),
  verifyEmailMessage({ url: "https://endurance-circle.example/verify?token=t1" }),
  resetEmail({ url: "https://endurance-circle.example/reset?token=t2" }),
  alreadyRegisteredEmail({ loginUrl: "https://endurance-circle.example/login", forgotUrl: "https://endurance-circle.example/forgot" }),
  passwordChangedEmail({ forgotUrl: "https://endurance-circle.example/forgot" }),
];

describe("email templates", () => {
  it("every email has a subject, an HTML body and a plain-text twin", () => {
    for (const m of all()) {
      expect(m.subject.length).toBeGreaterThan(5);
      expect(m.html).toMatch(/^<!doctype html>/i);
      expect(m.text.length).toBeGreaterThan(40);
      expect(m.text).not.toMatch(/<[a-z][^>]*>/i); // plain text has no markup
    }
  });

  it("the link is a button in the HTML and a readable URL in the text", () => {
    const m = inviteEmail({ inviterName: "Sandeep", email: "friend@example.com", url: URL });
    expect(m.html).toContain(`href="${URL}"`);
    expect(m.html).toContain("Accept invite");
    expect(m.text).toContain(`Accept invite: ${URL}`);
    expect(m.text).toMatch(/friend@example\.com/);
    // the token still parses out of the text part, as the flows and tests expect
    expect(resetEmail({ url: "https://endurance-circle.example/reset?token=abc-123_x" }).text.match(/token=([\w-]+)/)![1]).toBe("abc-123_x");
  });

  it("escapes anything dynamic, so a hostile name cannot inject markup", () => {
    const m = inviteEmail({ inviterName: `<script>alert(1)</script> "Bob" & co`, email: "a@b.co", url: URL });
    expect(m.html).not.toContain("<script");
    expect(m.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(m.html).toContain("&quot;Bob&quot; &amp; co");
  });

  it("is email-safe: no scripts, remote images, forms or external stylesheets, and small enough for Gmail", () => {
    for (const m of all()) {
      expect(m.html).not.toMatch(/<script|<img|<form|<link|<iframe|<video|src=/i);
      expect(m.html).not.toMatch(/url\(\s*['"]?https?:/i); // no remote CSS images
      expect(m.html.length).toBeLessThan(20_000); // Gmail clips messages over ~102 KB
      expect(m.html).toContain('role="presentation"'); // table layout
      expect(m.html).toContain("prefers-color-scheme: dark");
    }
  });

  it("the security notice offers a way out", () => {
    const m = passwordChangedEmail({ forgotUrl: "https://endurance-circle.example/forgot" });
    expect(m.html).toContain("https://endurance-circle.example/forgot");
    expect(m.text).toMatch(/forgot/);
  });
});

describe("buildRawMessage with HTML", () => {
  const decode = (raw: string) => Buffer.from(raw, "base64url").toString("utf8");
  const partBody = (msg: string, type: string) => {
    const block = msg.split(/--endurance-circle-[0-9a-f]+/).find((b) => b.includes(`Content-Type: ${type}`))!;
    const b64 = block.split("\r\n\r\n")[1].replace(/\s+/g, "");
    return Buffer.from(b64, "base64").toString("utf8");
  };

  it("sends multipart/alternative: plain text first, HTML last, both intact (including non-ASCII)", () => {
    const m = resetEmail({ url: "https://endurance-circle.example/reset?token=t2" });
    const msg = decode(buildRawMessage("Endurance Circle <a@gmail.com>", { to: "f@example.com", subject: "Sandeep ने invite किया", text: m.text, html: m.html }));
    expect(msg).toMatch(/Content-Type: multipart\/alternative; boundary="endurance-circle-[0-9a-f]+"/);
    expect(msg.indexOf("text/plain")).toBeLessThan(msg.indexOf("text/html"));
    expect(partBody(msg, "text/plain")).toBe(m.text);
    expect(partBody(msg, "text/html")).toBe(m.html);
    expect(msg).toMatch(/Subject: =\?UTF-8\?B\?/);
  });

  it("stays plain text when there is no HTML", () => {
    const msg = decode(buildRawMessage("A <a@gmail.com>", { to: "f@example.com", subject: "Hi", text: "Body" }));
    expect(msg).toContain("Content-Type: text/plain");
    expect(msg).not.toContain("multipart");
  });
});
