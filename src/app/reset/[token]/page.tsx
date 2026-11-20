import { CustodyMark } from "@/components/custody-mark";
import { Card } from "@/components/ui/card";
import { ThemeCorner } from "@/components/theme-toggle";
import { RESET_INVALID_MESSAGE } from "@/domain/password-reset";
import { orm } from "@/lib/auth-server";
import { readPasswordReset } from "@/lib/password-reset-store";

import { AcceptResetForm } from "./accept-form";

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const reset = readPasswordReset(orm, token, new Date());

  return (
    <main className="flex min-h-screen flex-col items-center px-5 py-8">
      <ThemeCorner />
      <Card>
        <div className="flex items-center gap-3">
          <CustodyMark />
          <p className="font-mono text-[11px] font-semibold tracking-[0.14em] text-ink3">UNIVERSITY SMART-ASSETS</p>
        </div>
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-ink">Reset password</h1>
        {reset === null ? (
          <>
            <p className="mt-4 text-sm text-ink2">{RESET_INVALID_MESSAGE}</p>
            <a href="/sign-in" className="mt-4 inline-block text-sm font-semibold text-accent">
              Back to sign in
            </a>
          </>
        ) : (
          <AcceptResetForm token={token} reset={reset} />
        )}
      </Card>
    </main>
  );
}
