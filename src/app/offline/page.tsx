import { CustodyMark } from "@/components/custody-mark";
import { ThemeCorner } from "@/components/theme-toggle";
import { Card } from "@/components/ui/card";

import { OfflineRetry } from "./offline-retry";

export const dynamic = "force-static";

/**
 * Shown when a document cannot be loaded.
 * The shell is on the device. A checkout is not.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center px-5 py-8">
      <ThemeCorner />
      <Card>
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <CustodyMark />
            <div>
              <p className="font-mono text-[11px] font-semibold tracking-[0.14em] text-ink3">UNIVERSITY SMART-ASSETS</p>
              <p className="text-xs text-ink2">Offline</p>
            </div>
          </div>
          <div>
            <h1 className="font-display text-[32px] font-semibold tracking-tight text-ink">You are offline</h1>
            <p className="mt-2 text-sm leading-relaxed text-ink2">The app shell is on this device.</p>
            <p className="mt-2 text-sm leading-relaxed text-ink2">
              A checkout, a check-in, and a report stay on the server. This page does not record a loan.
            </p>
          </div>
          <OfflineRetry />
        </div>
      </Card>
    </main>
  );
}
