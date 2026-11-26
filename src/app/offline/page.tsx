import { CustodyMark } from "@/components/custody-mark";
import { ThemeCorner } from "@/components/theme-toggle";
import { Card } from "@/components/ui/card";

import { OfflineRetry } from "./offline-retry";

export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center px-5 py-8">
      <ThemeCorner />
      <Card>
        <div className="flex flex-col gap-6">
          <CustodyMark size={56} />
          <div>
            <h1 className="font-display text-[32px] font-semibold tracking-tight text-ink">You are offline</h1>
            <p className="mt-2 text-sm leading-relaxed text-ink2">
              The shell is on this device. Nothing is recorded until the server is back.
            </p>
          </div>
          <OfflineRetry />
        </div>
      </Card>
    </main>
  );
}
