// One-off: get a Gmail API refresh token for the sending account and save it to .env.local (never printed).
// Needs GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET (a Google "Desktop app" OAuth client) in .env.local.
// Run: pnpm gmail:token, open the printed URL, sign in as the sending Gmail account and allow "send email".
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";

const PORT = 53682;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;

function saveEnv(key: string, value: string) {
  const file = ".env.local";
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  writeFileSync(file, re.test(text) ? text.replace(re, line) : `${text.replace(/\n*$/, "\n")}${line}\n`);
}

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env.local first");

  const state = randomBytes(16).toString("hex");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/gmail.send",
    access_type: "offline",
    prompt: "consent",
    state,
  }).toString();
  console.log(`Open this URL in your browser and approve:\n\n${url}\n`);

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const u = new URL(req.url ?? "/", REDIRECT);
      if (u.pathname !== "/callback") return void res.writeHead(404).end();
      const ok = u.searchParams.get("state") === state && u.searchParams.get("code");
      res.writeHead(ok ? 200 : 400, { "Content-Type": "text/plain" }).end(ok ? "Done. You can close this tab and go back to the terminal." : "Something went wrong. Run the command again.");
      server.close();
      if (ok) resolve(u.searchParams.get("code")!);
      else reject(new Error(u.searchParams.get("error") ?? "state mismatch"));
    });
    server.listen(PORT, "127.0.0.1");
    setTimeout(() => reject(new Error("Timed out after 5 minutes")), 5 * 60_000).unref();
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: REDIRECT, grant_type: "authorization_code" }),
  });
  const json = (await res.json()) as { refresh_token?: string; error?: string };
  if (!res.ok || !json.refresh_token) throw new Error(`Google refused the code: ${json.error ?? res.status}`);
  saveEnv("GMAIL_REFRESH_TOKEN", json.refresh_token);
  console.log("GMAIL_REFRESH_TOKEN saved to .env.local.");
}

main().catch((err) => {
  console.error(String(err instanceof Error ? err.message : err));
  process.exit(1);
});
