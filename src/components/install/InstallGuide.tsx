"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { GlassButton, GlassCard } from "@/components/ui";
import { detectPlatform, isIosSafari, type Platform } from "@/lib/platform";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

function Steps({ title, platform, children, first }: { title: string; platform: string; children: ReactNode; first: boolean }) {
  return (
    <GlassCard role="region" aria-label={title} data-platform={platform} className={`flex flex-col gap-3 p-5 ${first ? "ring-2 ring-accent/40" : ""}`}>
      <h2 className="text-lg font-semibold">{title}{first && <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent-strong">Your device</span>}</h2>
      <ol className="flex list-decimal flex-col gap-2 pl-5">{children}</ol>
    </GlassCard>
  );
}

export function InstallGuide() {
  const [platform, setPlatform] = useState<Platform>("other");
  const [iosSafari, setIosSafari] = useState(true);
  const [installed, setInstalled] = useState(false);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    const ua = navigator.userAgent;
    setPlatform(detectPlatform(ua, navigator.maxTouchPoints > 1));
    setIosSafari(isIosSafari(ua));
    setInstalled(window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as InstallPrompt); };
    const onInstalled = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    setResult(outcome === "accepted" ? "Installing…" : "No problem. You can install it later from this page.");
    setPrompt(null);
  }

  const ios = (
    <Steps key="ios" title="iPhone and iPad" platform="ios" first={platform === "ios"}>
      <li>Open Cadence in <strong>Safari</strong>. Other iPhone browsers can&apos;t install apps.</li>
      <li>Tap the <strong>Share</strong> button (the square with an arrow pointing up) in the toolbar.</li>
      <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
      <li>Tap <strong>Add</strong>. Cadence now opens from your home screen like any other app.</li>
    </Steps>
  );
  const android = (
    <Steps key="android" title="Android" platform="android" first={platform === "android"}>
      <li>Open Cadence in <strong>Chrome</strong>.</li>
      <li>Tap <strong>Install app</strong> below, or open the Chrome menu (three dots) and choose <strong>Install app</strong> (sometimes called <strong>Add to Home screen</strong>).</li>
      <li>Confirm. Cadence now opens from your home screen.</li>
    </Steps>
  );

  return (
    <div className="flex flex-col gap-4">
      {installed && <GlassCard role="status" className="bg-emerald-50/80 p-4 text-center font-semibold text-success">Cadence is installed on this device.</GlassCard>}

      {platform === "ios" && !iosSafari && !installed && (
        <GlassCard role="alert" className="bg-amber-50/80 p-4 text-sm font-medium text-amber-900">This browser can&apos;t install Cadence on iPhone. Open this page in Safari to continue.</GlassCard>
      )}

      {prompt && !installed && (
        <GlassCard className="flex flex-col gap-3 p-5">
          <p className="font-semibold">Install Cadence on this device</p>
          <GlassButton onClick={install} className="w-full">Install app</GlassButton>
        </GlassCard>
      )}
      {result && <p role="status" className="text-center text-sm text-ink-muted">{result}</p>}

      {platform === "android" ? [android, ios] : [ios, android]}

      <p className="text-center text-sm text-ink-muted">
        Installed apps open full screen and stay signed in. <Link href="/login" className="glass-focus rounded font-medium text-accent-strong underline-offset-4 hover:underline">Back to sign in</Link>
      </p>
    </div>
  );
}
