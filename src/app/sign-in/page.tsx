import { CustodyMark } from "@/components/custody-mark";
import { ThemeCorner } from "@/components/theme-toggle";
import { Card } from "@/components/ui/card";

import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col px-5 py-8 sm:px-8 lg:px-12 xl:px-16">
      <ThemeCorner />
      <div className="my-auto flex w-full flex-col items-center gap-8 lg:grid lg:max-w-[90rem] lg:grid-cols-[minmax(0,1fr)_minmax(22rem,32rem)] lg:items-center lg:gap-x-16 xl:gap-x-24">
        <div className="flex justify-center lg:justify-start">
          <CustodyMark size={132} />
        </div>
        <Card className="w-full max-w-[420px] lg:max-w-none">
          <SignInForm />
        </Card>
      </div>
    </main>
  );
}
