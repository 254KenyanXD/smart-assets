import { ThemeCorner } from "@/components/theme-toggle";
import { Card } from "@/components/ui/card";

import { SignInForm } from "./sign-in-form";

/** Email-first sign-in. The university is detected before a password is asked for. */
export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col items-center px-5 py-8">
      <ThemeCorner />
      <Card>
        <SignInForm />
      </Card>
    </main>
  );
}
