"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

const DISMISS_KEY = "sa-install-dismissed";

interface InstallChoice {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ readonly outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [offer, setOffer] = useState<InstallChoice | null>(null);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      return;
    }
    const onPrompt = (incoming: Event) => {
      incoming.preventDefault();
      // SAFETY: beforeinstallprompt is not in the DOM lib. The listener only runs for that event, which has prompt() and userChoice.
      const choice = incoming as Event & InstallChoice;
      if (typeof choice.prompt !== "function") return;
      setOffer(choice);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (offer === null) return null;

  return (
    <div className="fixed inset-x-0 bottom-4 z-20 flex justify-center px-4">
      <div className="flex w-full max-w-[420px] flex-col gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm">
        <p className="text-sm text-ink">Install University Smart-Assets on this device.</p>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              void offer.prompt().then(() => {
                setOffer(null);
              });
            }}
          >
            Install
          </Button>
          <Button
            variant="quiet"
            onClick={() => {
              try {
                sessionStorage.setItem(DISMISS_KEY, "1");
              } catch {
              }
              setOffer(null);
            }}
          >
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}
