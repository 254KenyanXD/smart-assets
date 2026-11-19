import { CustodyMark } from "@/components/custody-mark";
import { ThemeCorner } from "@/components/theme-toggle";
import { Card } from "@/components/ui/card";

import { SignInForm } from "./sign-in-form";

/** Email-first sign-in. The university is detected before a password is asked for. */
export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col items-center px-5 py-8 sm:px-8 lg:px-12 xl:px-16">
      <ThemeCorner />
      <div className="my-auto flex w-full max-w-[420px] flex-col lg:grid lg:max-w-[90rem] lg:grid-cols-[minmax(0,1fr)_minmax(22rem,32rem)] lg:items-center lg:gap-x-16 xl:gap-x-24">
        <div className="hidden max-w-xl flex-col lg:flex">
          <CustodyMark />
          <p className="mt-8 font-mono text-[11px] font-semibold tracking-[0.16em] text-ink3">UNIVERSITY SMART-ASSETS</p>
          <p className="mt-4 font-display text-4xl font-semibold tracking-tight text-ink xl:text-5xl">
            The desk records who has the asset.
          </p>
          <p className="mt-4 text-base leading-relaxed text-ink2">Sign in with your university email.</p>
        </div>
        <Card className="lg:max-w-none">
          <SignInForm />
        </Card>
      </div>
    </main>
  );
}
