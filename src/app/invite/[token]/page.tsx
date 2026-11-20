import { CustodyMark } from "@/components/custody-mark";
import { Card } from "@/components/ui/card";
import { ThemeCorner } from "@/components/theme-toggle";
import { INVITE_INVALID_MESSAGE } from "@/domain/staff-invite";
import { orm } from "@/lib/auth-server";
import { readStaffInvite } from "@/lib/staff-invite-store";

import { AcceptInviteForm } from "./accept-form";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = readStaffInvite(orm, token, new Date());

  return (
    <main className="flex min-h-screen flex-col items-center px-5 py-8">
      <ThemeCorner />
      <Card>
        <div className="flex items-center gap-3">
          <CustodyMark />
          <p className="font-mono text-[11px] font-semibold tracking-[0.14em] text-ink3">UNIVERSITY SMART-ASSETS</p>
        </div>
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-ink">Staff invite</h1>
        {invite === null ? (
          <>
            <p className="mt-4 text-sm text-ink2">{INVITE_INVALID_MESSAGE}</p>
            <a href="/sign-in" className="mt-4 inline-block text-sm font-semibold text-accent">
              Back to sign in
            </a>
          </>
        ) : (
          <AcceptInviteForm token={token} invite={invite} />
        )}
      </Card>
    </main>
  );
}
